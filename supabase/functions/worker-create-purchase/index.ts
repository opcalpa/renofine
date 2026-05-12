import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
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

interface CreatePurchaseBody {
  token: string;
  name: string;
  quantity?: number;
  unit?: string;
  pricePerUnit?: number | null;
  priceTotal?: number;
  vendorName?: string | null;
  taskId?: string | null;
  description?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const body = (await req.json()) as CreatePurchaseBody;
    const { token, name } = body;

    if (!token || !name?.trim()) {
      return jsonResponse({ error: "token and name are required" }, 400, req);
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Validate token + behörighet
    const { data: tokenRecord } = await sb
      .from("worker_access_tokens")
      .select("id, project_id, assigned_task_ids, created_by_user_id, can_create_purchases")
      .eq("token", token)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (!tokenRecord) {
      return jsonResponse({ error: "Invalid or expired token" }, 403, req);
    }

    if (!tokenRecord.can_create_purchases) {
      return jsonResponse({ error: "Worker does not have purchase permission" }, 403, req);
    }

    // Validera task_id om angivet — måste finnas i assigned_task_ids
    const assignedTaskIds: string[] = tokenRecord.assigned_task_ids || [];
    const safeTaskId = body.taskId && assignedTaskIds.includes(body.taskId) ? body.taskId : null;

    const quantity = body.quantity && body.quantity > 0 ? body.quantity : 1;
    const unit = body.unit?.trim() || "st";
    const priceTotal = body.priceTotal && body.priceTotal >= 0 ? body.priceTotal : 0;
    const pricePerUnit = body.pricePerUnit && body.pricePerUnit >= 0 ? body.pricePerUnit : null;
    const vendor = body.vendorName?.trim() || null;

    // Skapa request-PO
    const { data: po, error: poError } = await sb
      .from("purchase_orders")
      .insert({
        project_id: tokenRecord.project_id,
        vendor_name: vendor,
        total: priceTotal,
        status: "requested",
        source: "manual",
        created_by_user_id: tokenRecord.created_by_user_id,
      })
      .select("id")
      .single();

    if (poError || !po) {
      console.error("Failed to create PO:", poError);
      return jsonResponse({ error: "Failed to create purchase order" }, 500, req);
    }

    // Skapa material länkat till PO:n
    const { data: mat, error: matError } = await sb
      .from("materials")
      .insert({
        project_id: tokenRecord.project_id,
        purchase_order_id: po.id,
        task_id: safeTaskId,
        name: name.trim(),
        quantity,
        unit,
        price_total: priceTotal,
        price_per_unit: pricePerUnit,
        vendor_name: vendor,
        description: body.description?.trim() || null,
        status: "submitted",
        created_by_user_id: tokenRecord.created_by_user_id,
        submitted_by_worker_token_id: tokenRecord.id,
        exclude_from_budget: false,
      })
      .select("id")
      .single();

    if (matError || !mat) {
      console.error("Failed to create material:", matError);
      // Rulla tillbaka PO:n så ingen tom hänger kvar
      await sb.from("purchase_orders").delete().eq("id", po.id);
      return jsonResponse({ error: "Failed to create material" }, 500, req);
    }

    return jsonResponse(
      {
        purchaseOrderId: po.id,
        materialId: mat.id,
      },
      201,
      req,
    );
  } catch (err) {
    console.error("worker-create-purchase error:", err);
    return jsonResponse({ error: "Server error" }, 500, req);
  }
});
