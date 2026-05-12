import { supabase } from "@/integrations/supabase/client";

export interface RequestPurchaseMaterial {
  name: string;
  price_total: number;
  quantity?: number | null;
  unit?: string | null;
  price_per_unit?: number | null;
  room_id?: string | null;
  task_id?: string | null;
  vendor_name?: string | null;
  vendor_link?: string | null;
  description?: string | null;
  exclude_from_budget?: boolean | null;
  source_material_id?: string | null;
  status?: string;
}

export interface CreateRequestPurchaseInput {
  projectId: string;
  createdByUserId: string;
  material: RequestPurchaseMaterial;
}

export interface CreateRequestPurchaseResult {
  purchaseOrderId: string;
  materialId: string;
}

/**
 * Atomärt: skapa en "request-PO" (status='requested', vendor_name=null)
 * plus ett material kopplat till den. Eliminerar orphan-materials från
 * budget/önskemål-flöden.
 *
 * Roll-back: om material-insert failar tas PO:n bort så ingen tom request-PO
 * hamnar i Inköp.
 */
export async function createRequestPurchase(
  input: CreateRequestPurchaseInput
): Promise<CreateRequestPurchaseResult> {
  const { projectId, createdByUserId, material } = input;

  const vendor = material.vendor_name ?? null;
  const total = material.price_total ?? 0;

  const { data: po, error: poError } = await supabase
    .from("purchase_orders")
    .insert({
      project_id: projectId,
      vendor_name: vendor,
      total,
      status: "requested",
      source: "manual",
      created_by_user_id: createdByUserId,
    })
    .select("id")
    .single();

  if (poError || !po) {
    throw poError ?? new Error("Failed to create request PO");
  }

  const materialStatus = material.status ?? "submitted";

  const { data: mat, error: matError } = await supabase
    .from("materials")
    .insert({
      project_id: projectId,
      purchase_order_id: po.id,
      name: material.name,
      price_total: total,
      quantity: material.quantity ?? 1,
      unit: material.unit ?? "st",
      price_per_unit: material.price_per_unit ?? null,
      room_id: material.room_id ?? null,
      task_id: material.task_id ?? null,
      vendor_name: vendor,
      vendor_link: material.vendor_link ?? null,
      description: material.description ?? null,
      exclude_from_budget: material.exclude_from_budget ?? false,
      source_material_id: material.source_material_id ?? null,
      status: materialStatus,
      created_by_user_id: createdByUserId,
    })
    .select("id")
    .single();

  if (matError || !mat) {
    await supabase.from("purchase_orders").delete().eq("id", po.id);
    throw matError ?? new Error("Failed to create material for request PO");
  }

  return { purchaseOrderId: po.id, materialId: mat.id };
}
