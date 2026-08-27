import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { calculateRotDeduction, recalculateQuoteTotals } from "./quoteService";
import { analytics, AnalyticsEvents } from "@/lib/analytics";

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["sent"],
  sent: ["draft", "paid", "partially_paid", "cancelled"],
  partially_paid: ["paid", "cancelled"],
  paid: [],
  cancelled: [],
};

export async function createInvoice(
  projectId: string,
  creatorId: string,
  title?: string,
  opts?: {
    clientIdRef?: string;
    quoteId?: string;
    isAta?: boolean;
    bankgiro?: string;
    paymentTermsDays?: number;
  }
) {
  const invoiceNumber = await generateInvoiceNumber(creatorId);
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (opts?.paymentTermsDays ?? 30));

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      project_id: projectId,
      creator_id: creatorId,
      title: title || "",
      invoice_number: invoiceNumber,
      client_id_ref: opts?.clientIdRef ?? null,
      quote_id: opts?.quoteId ?? null,
      is_ata: opts?.isAta ?? false,
      bankgiro: opts?.bankgiro ?? null,
      payment_terms_days: opts?.paymentTermsDays ?? 30,
      due_date: dueDate.toISOString().split("T")[0],
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create invoice:", error);
    toast.error("Kunde inte skapa faktura");
    return null;
  }

  analytics.capture(AnalyticsEvents.INVOICE_CREATED, {
    project_id: projectId,
    is_ata: opts?.isAta ?? false,
    from_quote: !!opts?.quoteId,
  });

  return data;
}

export async function createInvoiceFromQuote(
  quoteId: string,
  creatorId: string,
  opts?: { bankgiro?: string; paymentTermsDays?: number }
) {
  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select("*, quote_items(*)")
    .eq("id", quoteId)
    .single();

  if (qErr || !quote) {
    toast.error("Kunde inte hämta offert");
    return null;
  }

  const invoice = await createInvoice(
    quote.project_id,
    creatorId,
    quote.title,
    {
      clientIdRef: quote.client_id_ref ?? undefined,
      quoteId,
      bankgiro: opts?.bankgiro,
      paymentTermsDays: opts?.paymentTermsDays,
    }
  );

  if (!invoice) return null;

  const items = (quote as { quote_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    unit: string | null;
    is_rot_eligible: boolean | null;
    room_id: string | null;
    sort_order: number | null;
    comment: string | null;
    discount_percent: number | null;
    vat_rate: number | null;
  }> }).quote_items || [];

  for (const item of items) {
    await addInvoiceItem(invoice.id, {
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      unit: item.unit ?? "st",
      is_rot_eligible: item.is_rot_eligible ?? false,
      room_id: item.room_id ?? undefined,
      sort_order: item.sort_order ?? 0,
      comment: item.comment,
      discount_percent: item.discount_percent,
      // Satsen måste följa med. Utan detta blev en 0 %-offert (omvänd
      // betalningsskyldighet) tyst en 25 %-faktura.
      vat_rate: item.vat_rate ?? 25,
    });
  }

  // Recalculate totals
  await recalculateInvoiceTotals(invoice.id);

  return invoice;
}

export async function addInvoiceItem(
  invoiceId: string,
  item: {
    description: string;
    quantity: number;
    unit_price: number;
    unit?: string;
    is_rot_eligible?: boolean;
    room_id?: string;
    sort_order?: number;
    comment?: string | null;
    discount_percent?: number | null;
    source_task_id?: string | null;
    vat_rate?: number;
  }
) {
  const discountedTotal =
    item.quantity * item.unit_price * (1 - (item.discount_percent ?? 0) / 100);
  const rotDeduction = calculateRotDeduction(
    discountedTotal,
    item.is_rot_eligible ?? false
  );

  const { data, error } = await supabase
    .from("invoice_items")
    .insert({
      invoice_id: invoiceId,
      ...item,
      rot_deduction: rotDeduction,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to add invoice item:", error);
    toast.error("Kunde inte lägga till rad");
    return null;
  }
  return data;
}

export async function replaceInvoiceItems(
  invoiceId: string,
  items: {
    description: string;
    quantity: number;
    unit_price: number;
    unit?: string;
    is_rot_eligible?: boolean;
    room_id?: string;
    sort_order?: number;
    comment?: string | null;
    discount_percent?: number | null;
    vat_rate?: number;
  }[]
) {
  const { error: delErr } = await supabase
    .from("invoice_items")
    .delete()
    .eq("invoice_id", invoiceId);

  if (delErr) {
    console.error("Failed to delete old invoice items:", delErr);
    toast.error("Kunde inte rensa gamla rader");
    return false;
  }

  for (const item of items) {
    const result = await addInvoiceItem(invoiceId, item);
    if (!result) return false;
  }

  await recalculateInvoiceTotals(invoiceId);
  return true;
}

export async function recalculateInvoiceTotals(invoiceId: string) {
  const { data: allItems } = await supabase
    .from("invoice_items")
    .select("total_price, is_rot_eligible, rot_deduction")
    .eq("invoice_id", invoiceId);

  if (allItems) {
    const totals = recalculateQuoteTotals(allItems as { total_price: number; is_rot_eligible: boolean; rot_deduction: number }[]);
    await supabase.from("invoices").update(totals).eq("id", invoiceId);
  }
}

export async function updateInvoiceDraft(
  invoiceId: string,
  updates: {
    title?: string;
    free_text?: string | null;
    client_id_ref?: string | null;
    invoice_number?: string | null;
    due_date?: string | null;
    payment_terms_days?: number | null;
    bankgiro?: string | null;
    bank_account_number?: string | null;
    ocr_reference?: string | null;
    notes?: string | null;
    is_ata?: boolean;
  }
) {
  const { data, error } = await supabase
    .from("invoices")
    .update(updates)
    .eq("id", invoiceId)
    .select()
    .single();

  if (error) {
    console.error("Failed to update invoice:", error);
    toast.error("Kunde inte uppdatera faktura");
    return null;
  }
  return data;
}

export async function updateInvoiceStatus(
  invoiceId: string,
  newStatus: string
) {
  const { data: invoice, error: fetchErr } = await supabase
    .from("invoices")
    .select("status, project_id")
    .eq("id", invoiceId)
    .single();

  if (fetchErr || !invoice) {
    toast.error("Kunde inte hämta faktura");
    return null;
  }

  const allowed = VALID_TRANSITIONS[invoice.status] ?? [];
  if (!allowed.includes(newStatus)) {
    toast.error(
      `Kan inte ändra status från ${invoice.status} till ${newStatus}`
    );
    return null;
  }

  const statusUpdates: Record<string, unknown> = { status: newStatus };
  if (newStatus === "sent") statusUpdates.sent_at = new Date().toISOString();
  if (newStatus === "paid") statusUpdates.paid_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("invoices")
    .update(statusUpdates)
    .eq("id", invoiceId)
    .select()
    .single();

  if (error) {
    console.error("Failed to update invoice status:", error);
    toast.error("Kunde inte uppdatera status");
    return null;
  }
  return data;
}

export async function recordPayment(invoiceId: string, amount: number, paymentDate?: string) {
  if (amount <= 0) {
    toast.error("Betalningsbelopp måste vara större än 0");
    return null;
  }

  const { data: invoice, error: fetchErr } = await supabase
    .from("invoices")
    .select("paid_amount, total_amount, status")
    .eq("id", invoiceId)
    .single();

  if (fetchErr || !invoice) {
    toast.error("Kunde inte hämta faktura");
    return null;
  }

  if (invoice.status !== "sent" && invoice.status !== "partially_paid") {
    toast.error("Kan inte registrera betalning för denna faktura");
    return null;
  }

  const total = invoice.total_amount ?? 0;
  const remaining = total - (invoice.paid_amount ?? 0);
  const cappedAmount = Math.min(amount, remaining);
  const newPaid = (invoice.paid_amount ?? 0) + cappedAmount;
  const newStatus = newPaid >= total ? "paid" : "partially_paid";

  const updates: Record<string, unknown> = {
    paid_amount: Math.round(newPaid * 100) / 100,
    status: newStatus,
  };
  if (newStatus === "paid") {
    updates.paid_at = paymentDate
      ? new Date(paymentDate).toISOString()
      : new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("invoices")
    .update(updates)
    .eq("id", invoiceId)
    .select()
    .single();

  if (error) {
    console.error("Failed to record payment:", error);
    toast.error("Kunde inte registrera betalning");
    return null;
  }
  return data;
}

export async function fetchInvoiceWithItems(invoiceId: string) {
  const { data: invoice, error: iErr } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();

  if (iErr || !invoice) return null;

  const [itemsRes, creatorRes, projectRes] = await Promise.all([
    supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("profiles")
      .select("name, company_name, avatar_url, org_number, company_address, company_postal_code, company_city, email, phone, company_website, company_logo_url, bankgiro, bank_account_number")
      .eq("id", invoice.creator_id)
      .single(),
    supabase
      .from("projects")
      .select("name")
      .eq("id", invoice.project_id)
      .single(),
  ]);

  return {
    invoice,
    items: itemsRes.data ?? [],
    creator: creatorRes.data,
    projectName: projectRes.data?.name ?? "",
  };
}

export async function shareInvoiceWithCustomer(
  invoiceId: string,
  customerEmail: string,
  customerName?: string
): Promise<boolean> {
  const { data: invoice, error: iErr } = await supabase
    .from("invoices")
    .select("project_id, creator_id, status")
    .eq("id", invoiceId)
    .single();

  if (iErr || !invoice) {
    toast.error("Kunde inte hämta faktura");
    return false;
  }

  // Check for existing pending invitation
  const { data: existing } = await supabase
    .from("project_invitations")
    .select("id, token, status")
    .eq("project_id", invoice.project_id)
    .eq("email", customerEmail)
    .eq("related_invoice_id", invoiceId)
    .maybeSingle();

  let invitationId: string;

  if (existing && existing.token && existing.status === "pending") {
    invitationId = existing.id;
  } else {
    if (existing) {
      await supabase
        .from("project_invitations")
        .delete()
        .eq("id", existing.id);
    }

    const clientPermissions = {
      timeline_access: "view",
      tasks_access: "view",
      tasks_scope: "all",
      space_planner_access: "view",
      purchases_access: "view",
      purchases_scope: "all",
      overview_access: "view",
      teams_access: "view",
      budget_access: "view",
      files_access: "view",
      customer_view_access: "view",
    };

    const token = crypto.randomUUID();
    const { data: invitation, error: invErr } = await supabase
      .from("project_invitations")
      .insert({
        project_id: invoice.project_id,
        invited_by_user_id: invoice.creator_id,
        email: customerEmail,
        invited_name: customerName || customerEmail,
        role: "client",
        contractor_role: "other",
        related_invoice_id: invoiceId,
        token,
        ...clientPermissions,
        permissions_snapshot: clientPermissions,
      } as Record<string, unknown>)
      .select("id")
      .single();

    if (invErr || !invitation) {
      console.error("Failed to create invoice invitation:", invErr);
      toast.error("Kunde inte skapa inbjudan");
      return false;
    }

    invitationId = invitation.id;
  }

  // Update invoice status to sent
  if (invoice.status === "draft") {
    const result = await updateInvoiceStatus(invoiceId, "sent");
    if (!result) return false;
  }

  // Send the invoice email via edge function
  try {
    await supabase.functions.invoke("send-invoice-email", {
      body: { invitationId, invoiceId },
    });
  } catch (sendError) {
    console.error("Failed to send invoice email:", sendError);
  }

  return true;
}

export async function markInvoiceViewed(invoiceId: string): Promise<void> {
  const { data: invoice } = await supabase
    .from("invoices")
    .select("viewed_at, project_id, title")
    .eq("id", invoiceId)
    .single();

  if (!invoice || invoice.viewed_at) return;

  await supabase
    .from("invoices")
    .update({ viewed_at: new Date().toISOString() })
    .eq("id", invoiceId);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (profile) {
      await supabase.from("activity_log").insert({
        project_id: invoice.project_id,
        actor_id: profile.id,
        action: "viewed",
        entity_type: "invoice",
        entity_id: invoiceId,
        entity_name: invoice.title,
      });
    }
  }
}

export async function generateInvoiceNumber(
  creatorId: string
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `FAK-${year}-`;

  const { data } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("creator_id", creatorId)
    .like("invoice_number", `${prefix}%`)
    .order("invoice_number", { ascending: false })
    .limit(1);

  const lastNum = data?.[0]?.invoice_number as string | undefined;
  const lastSeq = lastNum ? parseInt(lastNum.replace(prefix, ""), 10) || 0 : 0;
  return `${prefix}${String(lastSeq + 1).padStart(3, "0")}`;
}

export function getDisplayStatus(invoice: {
  status: string;
  due_date: string | null;
  sent_at: string | null;
}): string {
  if (
    (invoice.status === "sent" || invoice.status === "partially_paid") &&
    invoice.due_date &&
    invoice.due_date < new Date().toISOString().split("T")[0]
  ) {
    return "overdue";
  }
  return invoice.status;
}
