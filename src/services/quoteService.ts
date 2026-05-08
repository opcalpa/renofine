import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { lockProject, unlockProject } from "./projectLockService";
import { inviteCustomerAsClient } from "./intakeService";
import { analytics, AnalyticsEvents } from "@/lib/analytics";

const ROT_RATE = 0.3;
const VAT_RATE = 0.25;

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["sent"],
  sent: ["draft", "accepted", "rejected", "expired"],
  accepted: [],
  rejected: [],
  expired: [],
};

/** ROT = 30% of labor cost INC moms (Skatteverket requirement). totalPrice is ex moms. */
export function calculateRotDeduction(totalPrice: number, isEligible: boolean): number {
  return isEligible ? Math.round(totalPrice * (1 + VAT_RATE) * ROT_RATE * 100) / 100 : 0;
}

export function recalculateQuoteTotals(items: { total_price: number; is_rot_eligible: boolean; rot_deduction: number }[]) {
  const totalAmount = items.reduce((sum, i) => sum + (i.total_price ?? 0), 0);
  const totalRotDeduction = items.reduce((sum, i) => sum + (i.rot_deduction ?? 0), 0);
  return {
    total_amount: Math.round(totalAmount * 100) / 100,
    total_rot_deduction: Math.round(totalRotDeduction * 100) / 100,
    total_after_rot: Math.round((totalAmount - totalRotDeduction) * 100) / 100,
  };
}

export async function generateQuoteNumber(creatorId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `OFF-${year}-`;

  const { data } = await supabase
    .from("quotes")
    .select("quote_number")
    .eq("creator_id", creatorId)
    .like("quote_number", `${prefix}%`)
    .order("quote_number", { ascending: false })
    .limit(1);

  const lastNum = data?.[0]?.quote_number as string | undefined;
  const lastSeq = lastNum ? parseInt(lastNum.replace(prefix, ""), 10) || 0 : 0;
  return `${prefix}${String(lastSeq + 1).padStart(3, "0")}`;
}

export async function createQuote(projectId: string, title: string, creatorId: string, clientIdRef?: string, freeText?: string, quoteNumber?: string, isAta?: boolean) {
  const { data, error } = await supabase
    .from("quotes")
    .insert({
      project_id: projectId,
      title,
      creator_id: creatorId,
      ...(clientIdRef ? { client_id_ref: clientIdRef } : {}),
      ...(freeText ? { free_text: freeText } : {}),
      ...(quoteNumber ? { quote_number: quoteNumber } : {}),
      ...(isAta ? { is_ata: true } : {}),
    })
    .select()
    .single();
  if (error) {
    console.error("Failed to create quote:", error);
    toast.error("Kunde inte skapa offert");
    return null;
  }

  analytics.capture(AnalyticsEvents.QUOTE_CREATED, {
    project_id: projectId,
    is_ata: !!isAta,
  });

  // Mark onboarding step for creating first quote
  await supabase
    .from("profiles")
    .update({ onboarding_created_quote: true })
    .eq("id", creatorId);

  // Advance project status to quote_created (only from planning)
  await supabase
    .from("projects")
    .update({ status: "quote_created" })
    .eq("id", projectId)
    .or("status.eq.planning,status.is.null");

  return data;
}

export async function addQuoteItem(quoteId: string, item: { description: string; quantity: number; unit_price: number; unit?: string; is_rot_eligible?: boolean; room_id?: string; sort_order?: number; comment?: string | null; discount_percent?: number | null; source_task_id?: string | null; source_type?: string | null }) {
  const discountedTotal = item.quantity * item.unit_price * (1 - (item.discount_percent ?? 0) / 100);
  const rotDeduction = calculateRotDeduction(discountedTotal, item.is_rot_eligible ?? false);
  const { data, error } = await supabase
    .from("quote_items")
    .insert({ quote_id: quoteId, ...item, rot_deduction: rotDeduction })
    .select()
    .single();
  if (error) {
    console.error("Failed to add quote item:", error);
    toast.error("Kunde inte lägga till rad");
    return null;
  }
  return data;
}

export async function updateQuoteDraft(quoteId: string, updates: {
  title?: string;
  free_text?: string | null;
  client_id_ref?: string | null;
  ata_reason?: string | null;
  ata_time_shift_days?: number | null;
}) {
  const { data, error } = await supabase
    .from("quotes")
    .update(updates)
    .eq("id", quoteId)
    .select()
    .single();
  if (error) {
    console.error("Failed to update quote:", error);
    toast.error("Kunde inte uppdatera offert");
    return null;
  }
  return data;
}

export async function replaceQuoteItems(quoteId: string, items: { description: string; quantity: number; unit_price: number; unit?: string; is_rot_eligible?: boolean; room_id?: string; sort_order?: number; comment?: string | null; discount_percent?: number | null; source_task_id?: string | null; source_type?: string | null }[]) {
  // Delete existing items
  const { error: delErr } = await supabase
    .from("quote_items")
    .delete()
    .eq("quote_id", quoteId);
  if (delErr) {
    console.error("Failed to delete old quote items:", delErr);
    toast.error("Kunde inte rensa gamla rader");
    return false;
  }

  // Insert new items
  for (const item of items) {
    const result = await addQuoteItem(quoteId, item);
    if (!result) return false;
  }

  // Recalculate totals
  const { data: allItems } = await supabase
    .from("quote_items")
    .select("total_price, is_rot_eligible, rot_deduction")
    .eq("quote_id", quoteId);

  if (allItems) {
    const totals = recalculateQuoteTotals(allItems);
    await supabase.from("quotes").update(totals).eq("id", quoteId);
  }

  return true;
}

export async function updateQuoteStatus(quoteId: string, newStatus: string) {
  const { data: quote, error: fetchErr } = await supabase
    .from("quotes")
    .select("status, project_id, intake_request_id, creator_id, total_amount")
    .eq("id", quoteId)
    .single();
  if (fetchErr || !quote) {
    toast.error("Kunde inte hämta offert");
    return null;
  }
  const allowed = VALID_TRANSITIONS[quote.status] ?? [];
  if (!allowed.includes(newStatus)) {
    toast.error(`Kan inte ändra status från ${quote.status} till ${newStatus}`);
    return null;
  }
  const { data, error } = await supabase.from("quotes").update({ status: newStatus }).eq("id", quoteId).select().single();
  if (error) {
    console.error("Failed to update quote status:", error);
    toast.error("Kunde inte uppdatera status");
    return null;
  }

  // Track status changes
  if (newStatus === "sent") {
    analytics.capture(AnalyticsEvents.QUOTE_SENT, { quote_id: quoteId, project_id: quote.project_id });
  } else if (newStatus === "accepted") {
    analytics.capture(AnalyticsEvents.QUOTE_ACCEPTED, { quote_id: quoteId, project_id: quote.project_id, total: quote.total_amount });
  }

  // Handle project locking and budget based on quote status
  // (Project status is also updated by the DB trigger handle_quote_status_project_sync)
  if (quote.project_id) {
    try {
      if (newStatus === "sent") {
        await lockProject(quote.project_id, quoteId);
      } else if (newStatus === "draft" || newStatus === "accepted" || newStatus === "rejected") {
        await unlockProject(quote.project_id);
      }

      // When accepted, set project budget from quote total
      if (newStatus === "accepted" && quote.total_amount) {
        await supabase
          .from("projects")
          .update({ total_budget: quote.total_amount })
          .eq("id", quote.project_id);
      }
    } catch (lockError) {
      console.error("Failed to update project lock/budget:", lockError);
    }
  }

  // When quote is accepted, invite the customer as client (if from intake request)
  if (newStatus === "accepted" && quote.intake_request_id && quote.project_id) {
    try {
      // Fetch intake request to get customer info
      const { data: intake } = await supabase
        .from("customer_intake_requests")
        .select("customer_email, customer_name")
        .eq("id", quote.intake_request_id)
        .single();

      if (intake?.customer_email) {
        await inviteCustomerAsClient(
          quote.project_id,
          intake.customer_email,
          intake.customer_name || intake.customer_email,
          quote.creator_id
        );
      }
    } catch (inviteError) {
      console.error("Failed to invite customer as client:", inviteError);
      // Don't fail the status update if invite fails
    }
  }

  return data;
}

export async function fetchQuoteWithItems(quoteId: string) {
  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .single();
  if (qErr || !quote) return null;

  const [itemsRes, creatorRes, projectRes] = await Promise.all([
    supabase
      .from("quote_items")
      .select("*")
      .eq("quote_id", quoteId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("profiles")
      .select("name, company_name, avatar_url")
      .eq("id", quote.creator_id)
      .single(),
    supabase
      .from("projects")
      .select("name")
      .eq("id", quote.project_id)
      .single(),
  ]);

  return {
    quote,
    items: itemsRes.data ?? [],
    creator: creatorRes.data,
    projectName: projectRes.data?.name ?? "",
  };
}

export async function shareQuoteWithCustomer(
  quoteId: string,
  customerEmail: string,
  customerName?: string
): Promise<boolean> {
  // 1. Fetch the quote
  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select("project_id, creator_id, status")
    .eq("id", quoteId)
    .single();

  if (qErr || !quote) {
    toast.error("Kunde inte hämta offert");
    return false;
  }

  // 2. Check for existing pending invitation — delete broken ones (no token), reuse valid ones
  const { data: existing } = await supabase
    .from("project_invitations")
    .select("id, token, status")
    .eq("project_id", quote.project_id)
    .eq("email", customerEmail)
    .eq("related_quote_id", quoteId)
    .maybeSingle();

  let invitationId: string;

  if (existing && existing.token && existing.status === "pending") {
    // Reuse valid existing invitation — just resend the email
    invitationId = existing.id;
  } else {
    // Delete broken/old invitation if it exists
    if (existing) {
      await supabase.from("project_invitations").delete().eq("id", existing.id);
    }
    // 3. Client permissions (same as inviteCustomerAsClient)
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

    // 4. Create invitation (set token explicitly — the alias column has no auto-default)
    const token = crypto.randomUUID();
    const { data: invitation, error: invErr } = await supabase
      .from("project_invitations")
      .insert({
        project_id: quote.project_id,
        invited_by_user_id: quote.creator_id,
        email: customerEmail,
        invited_name: customerName || customerEmail,
        role: "client",
        contractor_role: "other",
        related_quote_id: quoteId,
        token,
        ...clientPermissions,
        permissions_snapshot: clientPermissions,
      } as Record<string, unknown>)
      .select("id")
      .single();

    if (invErr || !invitation) {
      console.error("Failed to create quote invitation:", invErr);
      toast.error("Kunde inte skapa inbjudan");
      return false;
    }

    invitationId = invitation.id;
  }

  // 5. Update quote status to sent (handles project lock + status via updateQuoteStatus)
  if (quote.status === "draft") {
    const result = await updateQuoteStatus(quoteId, "sent");
    if (!result) return false;
  }

  // 6. Send the quote email via edge function
  try {
    await supabase.functions.invoke("send-quote-email", {
      body: { invitationId, quoteId },
    });
  } catch (sendError) {
    console.error("Failed to send quote email:", sendError);
    // Don't fail — invitation is created, email just didn't send
  }

  return true;
}

export async function markQuoteViewed(quoteId: string): Promise<void> {
  const { data: quote } = await supabase
    .from("quotes")
    .select("viewed_at, project_id, title")
    .eq("id", quoteId)
    .single();

  if (!quote || quote.viewed_at) return;

  await supabase
    .from("quotes")
    .update({ viewed_at: new Date().toISOString() })
    .eq("id", quoteId);

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (profile) {
      await supabase.from("activity_log").insert({
        project_id: quote.project_id,
        actor_id: profile.id,
        action: "viewed",
        entity_type: "quote",
        entity_id: quoteId,
        entity_name: quote.title,
      });
    }
  }
}

export async function reviseQuote(originalQuoteId: string): Promise<string | null> {
  const result = await fetchQuoteWithItems(originalQuoteId);
  if (!result) {
    toast.error("Kunde inte hämta original-offert");
    return null;
  }

  const { quote, items } = result;

  // Count existing revisions to determine revision number
  const { count } = await supabase
    .from("quotes")
    .select("id", { count: "exact", head: true })
    .eq("revised_from", originalQuoteId);
  const revisionNum = (count ?? 0) + 1;

  const quoteNumber = await generateQuoteNumber(quote.creator_id);
  const newTitle = `${quote.title.replace(/\s*\(Rev\.\s*\d+\)$/, "")} (Rev. ${revisionNum})`;

  const newQuote = await createQuote(
    quote.project_id,
    newTitle,
    quote.creator_id,
    quote.client_id_ref ?? undefined,
    quote.free_text ?? undefined,
    quoteNumber,
    quote.is_ata ?? undefined,
  );
  if (!newQuote) return null;

  // Set revised_from link
  await supabase
    .from("quotes")
    .update({ revised_from: originalQuoteId })
    .eq("id", newQuote.id);

  // Copy all items (preserve source lineage)
  for (const item of items) {
    await addQuoteItem(newQuote.id, {
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      unit: item.unit ?? undefined,
      is_rot_eligible: item.is_rot_eligible ?? undefined,
      room_id: item.room_id ?? undefined,
      sort_order: item.sort_order ?? undefined,
      comment: item.comment ?? null,
      discount_percent: item.discount_percent ?? null,
      source_task_id: (item as Record<string, unknown>).source_task_id as string | null ?? null,
      source_type: (item as Record<string, unknown>).source_type as string | null ?? null,
    });
  }

  // Recalculate totals
  const { data: allItems } = await supabase
    .from("quote_items")
    .select("total_price, is_rot_eligible, rot_deduction")
    .eq("quote_id", newQuote.id);

  if (allItems) {
    const totals = recalculateQuoteTotals(allItems);
    await supabase.from("quotes").update(totals).eq("id", newQuote.id);
  }

  return newQuote.id;
}

export async function createTasksFromQuote(quoteId: string) {
  const result = await fetchQuoteWithItems(quoteId);
  if (!result) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!profile) return;

  const projectId = result.quote.project_id;
  const isChangeOrder = !!(result.quote as Record<string, unknown>).is_ata;

  // Group items by source_task_id for smart merging
  const itemsBySourceTask = new Map<string, typeof result.items>();
  const orphanItems: typeof result.items = [];

  for (const item of result.items) {
    if (!item.description) continue;
    const sourceId = (item as Record<string, unknown>).source_task_id as string | null;
    if (sourceId) {
      const group = itemsBySourceTask.get(sourceId) || [];
      group.push(item);
      itemsBySourceTask.set(sourceId, group);
    } else {
      orphanItems.push(item);
    }
  }

  let updated = 0;
  let created = 0;
  let materialsCreated = 0;

  // ── 1. Smart-merge items that have a source task ──
  // First verify which source tasks still exist and load their markup settings
  const sourceTaskIds = Array.from(itemsBySourceTask.keys());
  const existingSourceIds = new Set<string>();
  const sourceTaskMarkups = new Map<string, { markup_percent: number | null; material_markup_percent: number | null; labor_cost_percent: number | null }>();
  if (sourceTaskIds.length > 0) {
    const { data: found } = await supabase
      .from("tasks")
      .select("id, markup_percent, material_markup_percent, labor_cost_percent")
      .in("id", sourceTaskIds);
    for (const t of found || []) {
      existingSourceIds.add(t.id);
      sourceTaskMarkups.set(t.id, {
        markup_percent: t.markup_percent,
        material_markup_percent: t.material_markup_percent,
        labor_cost_percent: t.labor_cost_percent,
      });
    }
  }

  for (const [sourceTaskId, items] of itemsBySourceTask) {
    // If source task was deleted, treat items as orphans
    if (!existingSourceIds.has(sourceTaskId)) {
      orphanItems.push(...items);
      continue;
    }

    const taskUpdates: Record<string, unknown> = {
      status: "to_do",
    };
    if (isChangeOrder) taskUpdates.is_ata = true;

    // Accumulate ROT from all items for this task
    let taskRotEligible = false;
    let taskRotAmount = 0;

    for (const item of items) {
      const sourceType = (item as Record<string, unknown>).source_type as string | null;
      const isRotEligible = !!(item as Record<string, unknown>).is_rot_eligible;
      const rotDeduction = ((item as Record<string, unknown>).rot_deduction as number) ?? 0;

      if (isRotEligible) {
        taskRotEligible = true;
        taskRotAmount += rotDeduction;
      }

      if (sourceType === "material") {
        // Planned materials row already exists as budget reference — skip creating duplicate to_order row
      } else if (sourceType === "subcontractor") {
        // Set subcontractor cost on the source task
        taskUpdates.subcontractor_cost = item.total_price ?? 0;
        taskUpdates.task_cost_type = "subcontractor";
      } else {
        // hours / fixed — set budget from this line's total
        taskUpdates.budget = item.total_price ?? null;
        if (sourceType === "hours") {
          taskUpdates.estimated_hours = item.quantity;
          taskUpdates.hourly_rate = item.unit_price;
          taskUpdates.task_cost_type = "own_labor";
        }
      }
    }

    if (taskRotEligible) {
      taskUpdates.rot_eligible = true;
      taskUpdates.rot_amount = Math.round(taskRotAmount * 100) / 100;
    }

    const { error } = await supabase
      .from("tasks")
      .update(taskUpdates)
      .eq("id", sourceTaskId);
    if (!error) updated++;
  }

  // ── 2. Orphan items (manually added in quote, no source task) ──
  // Fall back to title matching against existing tasks, then create new
  const [{ data: existingTasks }, { data: plannedStandaloneMaterials }] = await Promise.all([
    supabase.from("tasks").select("id, title").eq("project_id", projectId),
    supabase
      .from("materials")
      .select("id, name")
      .eq("project_id", projectId)
      .eq("status", "planned")
      .is("task_id", null),
  ]);

  const tasksByTitle = new Map(
    (existingTasks || []).map((t) => [t.title.toLowerCase().trim(), t])
  );
  // Index planned standalone materials by name for upsert matching
  const plannedMaterialsByName = new Map(
    (plannedStandaloneMaterials || []).map((m) => [m.name.toLowerCase().trim(), m])
  );

  // Track which existing tasks were already updated via source_task_id
  const alreadyUpdatedIds = new Set(itemsBySourceTask.keys());

  for (const item of orphanItems) {
    // Strip room suffix like "(kök)" for matching
    const cleanDesc = item.description.replace(/\s*\([^)]+\)\s*$/, "").trim();
    const matchKey = cleanDesc.toLowerCase();
    const existing = tasksByTitle.get(matchKey);
    const orphanSourceType = (item as Record<string, unknown>).source_type as string | null;

    if (orphanSourceType === "material") {
      // Orphan material — all quote materials stay as "planned" budget references.
      // Builders create real purchase orders manually via "Skapa order" in the purchases tab.
      const existingPlanned = plannedMaterialsByName.get(matchKey);
      if (!existingPlanned) {
        // No planned row yet (material was added in quote editor, not planning) — create one
        const { error } = await supabase.from("materials").insert({
          project_id: projectId,
          name: item.description,
          quantity: item.quantity ?? 1,
          unit: item.unit || "st",
          price_per_unit: item.unit_price ?? 0,
          price_total: item.total_price ?? 0,
          status: "planned",
          room_id: item.room_id ?? null,
          created_by_user_id: profile.id,
        });
        if (!error) materialsCreated++;
      }
      // If existingPlanned — already a planned budget reference, leave as-is
    } else if (existing && !alreadyUpdatedIds.has(existing.id)) {
      // Update existing task (hours / subcontractor / fixed)
      const orphanUpdates: Record<string, unknown> = { budget: item.total_price ?? null, status: "to_do" };
      if (orphanSourceType === "hours") orphanUpdates.task_cost_type = "own_labor";
      else if (orphanSourceType === "subcontractor") orphanUpdates.task_cost_type = "subcontractor";
      if (isChangeOrder) orphanUpdates.is_ata = true;
      const isRotEligible = !!(item as Record<string, unknown>).is_rot_eligible;
      if (isRotEligible) {
        orphanUpdates.rot_eligible = true;
        orphanUpdates.rot_amount = ((item as Record<string, unknown>).rot_deduction as number) ?? 0;
      }
      const { error } = await supabase
        .from("tasks")
        .update(orphanUpdates)
        .eq("id", existing.id);
      if (!error) {
        updated++;
        alreadyUpdatedIds.add(existing.id);
      }
    } else {
      // Create new task for hours / subcontractor / fixed orphans
      const newTaskCostType = orphanSourceType === "subcontractor" ? "subcontractor" : "own_labor";
      const isRotEligible = !!(item as Record<string, unknown>).is_rot_eligible;
      const rotDeduction = ((item as Record<string, unknown>).rot_deduction as number) ?? 0;
      const { error } = await supabase.from("tasks").insert({
        project_id: projectId,
        title: item.description,
        status: "to_do",
        priority: "medium",
        room_id: item.room_id ?? null,
        budget: item.total_price ?? null,
        task_cost_type: newTaskCostType,
        is_ata: isChangeOrder || undefined,
        rot_eligible: isRotEligible || undefined,
        rot_amount: isRotEligible ? rotDeduction : undefined,
        created_by_user_id: profile.id,
      });
      if (!error) created++;
    }
  }

  // ── 3. Clean up __subcontractor__ sentinel planned materials ──
  // These were budget placeholders during planning; subcontractor costs are now on task.subcontractor_cost
  await supabase
    .from("materials")
    .delete()
    .eq("project_id", projectId)
    .eq("description", "__subcontractor__");

  // ── 4. Archive leftover planning tasks that weren't in the quote ──
  // Skip for change orders — don't archive main quote tasks when accepting ÄTA
  if (existingTasks && !isChangeOrder) {
    const planningLeftovers = existingTasks.filter(
      (t) => !alreadyUpdatedIds.has(t.id)
    );
    if (planningLeftovers.length > 0) {
      // Check which ones are still in "planned" status
      const { data: planned } = await supabase
        .from("tasks")
        .select("id")
        .in("id", planningLeftovers.map((t) => t.id))
        .eq("status", "planned");

      if (planned && planned.length > 0) {
        await supabase
          .from("tasks")
          .update({ status: "archived" })
          .in("id", planned.map((t) => t.id));
      }
    }
  }

  const parts = [];
  if (updated) parts.push(`${updated} uppdaterade`);
  if (created) parts.push(`${created} skapade`);
  if (materialsCreated) parts.push(`${materialsCreated} material`);
  if (parts.length > 0) {
    toast.success(parts.join(", "));
  }
}
