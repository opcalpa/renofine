import type { RecipeRoom } from "@/lib/materialRecipes";

export interface ChecklistItem {
  id: string;
  title: string;
  completed: boolean;
}

export interface Checklist {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export interface MaterialItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  amount: number; // computed: quantity × unit_price (kept for backward compat)
  markup_percent: number | null; // null = use group markup
}

export function normalizeMaterialItem(item: Partial<MaterialItem> & { id: string; name: string }): MaterialItem {
  const quantity = item.quantity ?? 1;
  const unit = item.unit ?? "st";
  const unit_price = item.unit_price ?? (item.amount ?? 0);
  return {
    ...item,
    quantity,
    unit,
    unit_price,
    amount: Math.round(quantity * unit_price),
    markup_percent: item.markup_percent ?? null,
  };
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  internal_notes?: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  start_date: string | null;
  finish_date: string | null;
  progress: number;
  assigned_to_stakeholder_id: string | null;
  room_id: string | null;
  room_ids?: string[] | null;
  budget: number | null;
  ordered_amount: number | null;
  payment_status: string | null;
  paid_amount: number | null;
  cost_center: string | null;
  cost_centers?: string[] | null;
  checklists?: Checklist[];
  material_items?: MaterialItem[];
  project_id: string;
  task_cost_type: string | null;
  estimated_hours: number | null;
  hourly_rate: number | null;
  subcontractor_cost: number | null;
  markup_percent: number | null;
  material_estimate: number | null;
  material_markup_percent: number | null;
  labor_cost_percent: number | null;
  is_ata: boolean;
  rot_eligible: boolean;
  rot_amount: number | null;
  supplier_id: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface TaskRoom {
  id: string;
  name: string;
  dimensions?: RecipeRoom["dimensions"];
  ceiling_height_mm?: number | null;
}

/** Task room ids with the room_ids-first convention (empty array falls back to room_id). */
export function taskRoomIdList(task: Pick<Task, "room_id" | "room_ids">): string[] {
  return task.room_ids?.length ? task.room_ids : task.room_id ? [task.room_id] : [];
}
