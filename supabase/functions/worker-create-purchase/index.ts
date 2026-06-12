import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5002",
  "http://localhost:3000",
  "https://app.renofine.com",
  "https://renofine.com",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(data: unknown, status: number, req: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

type Mode = "request" | "receipt";

interface PayloadFields {
  token: string;
  name: string;
  mode: Mode;
  quantity: number;
  unit: string;
  pricePerUnit: number | null;
  priceTotal: number;
  vendorName: string | null;
  taskId: string | null;
  description: string | null;
  purchasedDate: string | null;
  paymentMethod: string | null;
}

function clampNumber(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function clampPositive(v: unknown, fallback: number): number {
  const n = clampNumber(v, fallback);
  return n > 0 ? n : fallback;
}

async function parsePayload(req: Request): Promise<{ fields: PayloadFields; file: File | null }> {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const fd = await req.formData();
    const file = fd.get("receiptFile");
    return {
      file: file instanceof File ? file : null,
      fields: {
        token: String(fd.get("token") ?? ""),
        name: String(fd.get("name") ?? ""),
        mode: (String(fd.get("mode") ?? "request") as Mode),
        quantity: clampPositive(fd.get("quantity"), 1),
        unit: String(fd.get("unit") ?? "st").trim() || "st",
        pricePerUnit: fd.get("pricePerUnit") ? clampNumber(fd.get("pricePerUnit"), 0) : null,
        priceTotal: clampNumber(fd.get("priceTotal"), 0),
        vendorName: (String(fd.get("vendorName") ?? "").trim() || null),
        taskId: (String(fd.get("taskId") ?? "").trim() || null),
        description: (String(fd.get("description") ?? "").trim() || null),
        purchasedDate: (String(fd.get("purchasedDate") ?? "").trim() || null),
        paymentMethod: (String(fd.get("paymentMethod") ?? "").trim() || null),
      },
    };
  }
  const body = await req.json();
  return {
    file: null,
    fields: {
      token: body.token ?? "",
      name: body.name ?? "",
      mode: (body.mode ?? "request") as Mode,
      quantity: clampPositive(body.quantity, 1),
      unit: (body.unit ?? "st").trim() || "st",
      pricePerUnit: body.pricePerUnit != null ? clampNumber(body.pricePerUnit, 0) : null,
      priceTotal: clampNumber(body.priceTotal, 0),
      vendorName: body.vendorName?.trim() || null,
      taskId: body.taskId?.trim() || null,
      description: body.description?.trim() || null,
      purchasedDate: body.purchasedDate?.trim() || null,
      paymentMethod: body.paymentMethod?.trim() || null,
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const { fields, file } = await parsePayload(req);

    if (!fields.token || !fields.name?.trim()) {
      return jsonResponse({ error: "token and name are required" }, 400, req);
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Validate token + behörighet
    const { data: tokenRecord } = await sb
      .from("worker_access_tokens")
      .select("id, project_id, assigned_task_ids, created_by_user_id, can_create_purchases, can_log_receipts")
      .eq("token", fields.token)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (!tokenRecord) {
      return jsonResponse({ error: "Invalid or expired token" }, 403, req);
    }

    if (fields.mode === "request" && !tokenRecord.can_create_purchases) {
      return jsonResponse({ error: "Worker does not have purchase permission" }, 403, req);
    }

    if (fields.mode === "receipt" && !tokenRecord.can_log_receipts) {
      return jsonResponse({ error: "Worker does not have receipt logging permission" }, 403, req);
    }

    // Validera task_id om angivet — måste finnas i assigned_task_ids
    const assignedTaskIds: string[] = tokenRecord.assigned_task_ids || [];
    const safeTaskId = fields.taskId && assignedTaskIds.includes(fields.taskId) ? fields.taskId : null;

    // Upload kvitto-fil till storage om mode=receipt och fil bifogad
    let receiptFilePath: string | null = null;
    let receiptPublicUrl: string | null = null;
    if (fields.mode === "receipt" && file) {
      const ext = file.name?.split(".").pop() || "jpg";
      const uniqueName = `${crypto.randomUUID()}.${ext}`;
      const path = `projects/${tokenRecord.project_id}/receipts/worker/${uniqueName}`;
      const buf = await file.arrayBuffer();
      const { error: upErr } = await sb.storage.from("project-files").upload(path, buf, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
      if (upErr) {
        console.error("Receipt upload failed:", upErr);
        return jsonResponse({ error: "Failed to upload receipt" }, 500, req);
      }
      receiptFilePath = path;
      const { data: urlData } = sb.storage.from("project-files").getPublicUrl(path);
      receiptPublicUrl = urlData?.publicUrl ?? null;
    }

    const isReceipt = fields.mode === "receipt";
    const poStatus = isReceipt ? "delivered" : "requested";
    const materialStatus = isReceipt ? "paid" : "submitted";

    // Skapa PO
    const poInsert: Record<string, unknown> = {
      project_id: tokenRecord.project_id,
      vendor_name: fields.vendorName,
      total: fields.priceTotal,
      status: poStatus,
      source: "manual",
      created_by_user_id: tokenRecord.created_by_user_id,
      notes: fields.description,
    };

    if (isReceipt) {
      const purchasedAt = fields.purchasedDate || new Date().toISOString();
      poInsert.ordered_at = purchasedAt;
      poInsert.delivered_at = purchasedAt;
      poInsert.paid_at = purchasedAt;
      poInsert.receipt_total = fields.priceTotal;
      if (receiptFilePath) poInsert.receipt_file_path = receiptFilePath;
    }

    const { data: po, error: poError } = await sb
      .from("purchase_orders")
      .insert(poInsert)
      .select("id")
      .single();

    if (poError || !po) {
      console.error("Failed to create PO:", poError);
      return jsonResponse({ error: "Failed to create purchase order" }, 500, req);
    }

    // Skapa material länkat till PO:n
    const matInsert: Record<string, unknown> = {
      project_id: tokenRecord.project_id,
      purchase_order_id: po.id,
      task_id: safeTaskId,
      name: fields.name.trim(),
      quantity: fields.quantity,
      unit: fields.unit,
      price_total: fields.priceTotal,
      price_per_unit: fields.pricePerUnit,
      vendor_name: fields.vendorName,
      description: fields.description,
      status: materialStatus,
      created_by_user_id: tokenRecord.created_by_user_id,
      submitted_by_worker_token_id: tokenRecord.id,
      exclude_from_budget: false,
    };

    if (isReceipt) {
      matInsert.paid_amount = fields.priceTotal;
      matInsert.ordered_amount = fields.priceTotal;
    }

    const { data: mat, error: matError } = await sb
      .from("materials")
      .insert(matInsert)
      .select("id")
      .single();

    if (matError || !mat) {
      console.error("Failed to create material:", matError);
      // Rulla tillbaka PO:n så ingen tom hänger kvar
      await sb.from("purchase_orders").delete().eq("id", po.id);
      if (receiptFilePath) {
        await sb.storage.from("project-files").remove([receiptFilePath]);
      }
      return jsonResponse({ error: "Failed to create material" }, 500, req);
    }

    return jsonResponse(
      {
        purchaseOrderId: po.id,
        materialId: mat.id,
        receiptFilePath,
        receiptUrl: receiptPublicUrl,
      },
      201,
      req,
    );
  } catch (err) {
    console.error("worker-create-purchase error:", err);
    return jsonResponse({ error: "Server error" }, 500, req);
  }
});
