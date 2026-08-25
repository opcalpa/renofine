import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  createInvoice,
  addInvoiceItem,
  recalculateInvoiceTotals,
} from "./invoiceService";
import { TASK_COSTS_EMBED, flattenTaskCostRows } from "@/lib/taskCosts";

// --- Types ---

export interface ProjectInvoicingSummary {
  acceptedQuoteTotal: number;
  totalInvoicedAmount: number;
  totalInvoicedPercent: number;
  remainingAmount: number;
}

export interface InvoiceableTask {
  id: string;
  title: string;
  status: string;
  calculatedCost: number;
  invoicedAmount: number;
  invoicedPercent: number;
  remainingAmount: number;
  isRotEligible: boolean;
}

export interface TaskSelection {
  taskId: string;
  percent: number;
  amount: number;
  isRotEligible: boolean;
}

// --- Pure helpers ---

export function calculateTaskCost(task: {
  task_cost_type?: string | null;
  estimated_hours?: number | null;
  hourly_rate?: number | null;
  subcontractor_cost?: number | null;
  markup_percent?: number | null;
  material_estimate?: number | null;
  material_markup_percent?: number | null;
  budget?: number | null;
}): number {
  const type = task.task_cost_type;

  if (type === "own_labor") {
    return (task.estimated_hours || 0) * (task.hourly_rate || 0);
  }

  if (type === "subcontractor") {
    const base = task.subcontractor_cost || 0;
    const markup = task.markup_percent || 0;
    let total = base * (1 + markup / 100);
    const mat = task.material_estimate || 0;
    const matMarkup = task.material_markup_percent || 0;
    total += mat * (1 + matMarkup / 100);
    return total;
  }

  // For "materials" type or mixed types, calculate all components
  if (type === "materials" || type) {
    const labor = (task.estimated_hours || 0) * (task.hourly_rate || 0);
    const sub = (task.subcontractor_cost || 0) * (1 + (task.markup_percent || 0) / 100);
    const mat = (task.material_estimate || 0) * (1 + (task.material_markup_percent || 0) / 100);
    const total = labor + sub + mat;
    if (total > 0) return total;
  }

  // Fallback to budget
  return task.budget || 0;
}

// --- Data fetching ---

export async function fetchProjectInvoicingSummary(
  projectId: string
): Promise<ProjectInvoicingSummary> {
  const [quotesRes, invoicesRes] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, total_amount, status")
      .eq("project_id", projectId)
      .eq("status", "accepted"),
    supabase
      .from("invoices")
      .select("total_amount, status")
      .eq("project_id", projectId)
      .neq("status", "cancelled"),
  ]);

  let acceptedQuoteTotal = (quotesRes.data || []).reduce(
    (sum, q) => sum + (q.total_amount || 0),
    0
  );

  // Fallback: if accepted quotes have total_amount = 0, sum from quote_items
  if (acceptedQuoteTotal === 0 && (quotesRes.data || []).length > 0) {
    const quoteIds = (quotesRes.data || []).map((q) => q.id);
    const { data: itemsData } = await supabase
      .from("quote_items")
      .select("total_price")
      .in("quote_id", quoteIds);
    if (itemsData) {
      acceptedQuoteTotal = itemsData.reduce(
        (sum, i) => sum + (i.total_price || 0),
        0
      );
    }
  }

  // Only count non-draft invoices
  const totalInvoicedAmount = (invoicesRes.data || [])
    .filter((inv) => inv.status !== "draft")
    .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

  const totalInvoicedPercent =
    acceptedQuoteTotal > 0
      ? Math.round((totalInvoicedAmount / acceptedQuoteTotal) * 10000) / 100
      : 0;

  return {
    acceptedQuoteTotal,
    totalInvoicedAmount,
    totalInvoicedPercent,
    remainingAmount: acceptedQuoteTotal - totalInvoicedAmount,
  };
}

export async function fetchInvoiceableTasks(
  projectId: string
): Promise<InvoiceableTask[]> {
  const { data: tasks, error } = await supabase
    .from("tasks")
    .select(
      `id, title, status, budget, task_cost_type, estimated_hours, hourly_rate, material_estimate, invoiced_amount, invoiced_percent, ${TASK_COSTS_EMBED}`
    )
    .eq("project_id", projectId)
    .in("status", ["completed", "in_progress"]);

  if (error) {
    console.error("Failed to fetch invoiceable tasks:", error);
    return [];
  }

  return (
    flattenTaskCostRows(
      (tasks || []) as unknown as Array<Record<string, unknown>>,
    ) as unknown as NonNullable<typeof tasks>
  )
    .map((t) => {
      const cost = calculateTaskCost(t);
      if (cost <= 0) return null;

      const invoicedAmount = t.invoiced_amount || 0;
      const invoicedPercent = t.invoiced_percent || 0;
      const remainingAmount = cost - invoicedAmount;

      return {
        id: t.id,
        title: t.title,
        status: t.status || "in_progress",
        calculatedCost: cost,
        invoicedAmount,
        invoicedPercent,
        remainingAmount: Math.max(0, remainingAmount),
        isRotEligible: false,
      };
    })
    .filter((t): t is InvoiceableTask => t !== null && t.remainingAmount > 0);
}

// --- Invoice creation ---

export async function createPercentInvoice(
  projectId: string,
  creatorId: string,
  percent: number,
  opts?: {
    clientIdRef?: string;
    bankgiro?: string;
    paymentTermsDays?: number;
    isRotEligible?: boolean;
  }
): Promise<string | null> {
  const summary = await fetchProjectInvoicingSummary(projectId);

  const invoiceAmount =
    Math.round(summary.acceptedQuoteTotal * (percent / 100) * 100) / 100;

  if (invoiceAmount > summary.remainingAmount + 0.01) {
    toast.error("Beloppet överskrider kvarvarande belopp");
    return null;
  }

  const invoice = await createInvoice(projectId, creatorId, "", {
    clientIdRef: opts?.clientIdRef,
    bankgiro: opts?.bankgiro,
    paymentTermsDays: opts?.paymentTermsDays,
  });

  if (!invoice) return null;

  // Set invoicing method
  await supabase
    .from("invoices")
    .update({ invoicing_method: "percent_of_project" })
    .eq("id", invoice.id);

  await addInvoiceItem(invoice.id, {
    description: `Delfaktura ${percent}% av projektvärde`,
    quantity: 1,
    unit_price: invoiceAmount,
    unit: "st",
    is_rot_eligible: opts?.isRotEligible ?? false,
  });

  await recalculateInvoiceTotals(invoice.id);
  return invoice.id;
}

export async function createCompletedWorkInvoice(
  projectId: string,
  creatorId: string,
  selections: TaskSelection[],
  opts?: {
    clientIdRef?: string;
    bankgiro?: string;
    paymentTermsDays?: number;
  }
): Promise<string | null> {
  if (selections.length === 0) {
    toast.error("Inga uppgifter valda");
    return null;
  }

  const invoice = await createInvoice(projectId, creatorId, "", {
    clientIdRef: opts?.clientIdRef,
    bankgiro: opts?.bankgiro,
    paymentTermsDays: opts?.paymentTermsDays,
  });

  if (!invoice) return null;

  // Set invoicing method
  await supabase
    .from("invoices")
    .update({ invoicing_method: "completed_work" })
    .eq("id", invoice.id);

  // Fetch task titles for descriptions
  const taskIds = selections.map((s) => s.taskId);
  const { data: taskData } = await supabase
    .from("tasks")
    .select("id, title, invoiced_amount, invoiced_percent")
    .in("id", taskIds);

  const taskMap = new Map(
    (taskData || []).map((t) => [t.id, t])
  );

  for (let i = 0; i < selections.length; i++) {
    const sel = selections[i];
    const task = taskMap.get(sel.taskId);
    const title = task?.title || "Uppgift";

    const desc =
      sel.percent >= 100
        ? title
        : `${title} (${sel.percent}%)`;

    await addInvoiceItem(invoice.id, {
      description: desc,
      quantity: 1,
      unit_price: sel.amount,
      unit: "st",
      is_rot_eligible: sel.isRotEligible,
      source_task_id: sel.taskId,
      sort_order: i,
    });

    // Update task invoicing tracking
    const prevAmount = task?.invoiced_amount || 0;
    const prevPercent = task?.invoiced_percent || 0;
    await supabase
      .from("tasks")
      .update({
        invoiced_amount: Math.round((prevAmount + sel.amount) * 100) / 100,
        invoiced_percent: Math.min(
          100,
          Math.round((prevPercent + sel.percent) * 100) / 100
        ),
      })
      .eq("id", sel.taskId);
  }

  await recalculateInvoiceTotals(invoice.id);
  return invoice.id;
}
