/**
 * Agentic layer — apply accepted proposals to the DB.
 *
 * Maps each accepted AgentProposal to an existing write path, mirroring the
 * inline insert shapes used across the app. Every applied change:
 *   - is reversible (returns an UndoOp for one-tap undo), and
 *   - writes an activity_log row (actor "renaida") for auditability.
 *
 * See .claude/briefs/voice-capture-plan.md.
 */
import { supabase } from "@/integrations/supabase/client";
import { createRequestPurchase } from "@/lib/createRequestPurchase";
import { generateDocumentFilename } from "@/services/receiptAnalysisService";
import { takeAttachment } from "./documentCapture";
import type { ActionableProposal, AgentProposal, UndoOp } from "./types";
import { isActionable } from "./types";

export interface CreatedRef {
  type: "task" | "purchase" | "room";
  id: string;
  title: string;
  /** Which accepted proposal produced this object — lets the receipt link its bullet. */
  proposalId?: string;
}

export interface ApplyResult {
  applied: AgentProposal[];
  failed: { proposal: AgentProposal; error: string }[];
  /** Reverse-order list of undo operations for the applied changes. */
  undo: UndoOp[];
  /** Objects this batch created — lets the confirmation link straight to them. */
  created: CreatedRef[];
  /** Existing objects this batch changed — for "open & edit" links next to Undo. */
  modified: CreatedRef[];
  /** Persisted undo-stack row for this batch — lets undo survive a reload. */
  undoStackId?: string | null;
  /** Set when an open_feature proposal was applied — the caller navigates here. */
  navigateTo?: string;
}

/** A persisted, still-revertable Renaida batch (renaida_undo_stack row). */
export interface RestorableUndo {
  id: string;
  label: string;
  ops: UndoOp[];
  createdAt: string;
}

/** Newest un-undone batch Renaida applied for this user in this project (<48h). */
export async function fetchLatestUndoable(projectId: string): Promise<RestorableUndo | null> {
  const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("renaida_undo_stack")
    .select("id,label,ops,created_at")
    .eq("project_id", projectId)
    .is("undone_at", null)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data || !Array.isArray(data.ops)) return null;
  return { id: data.id, label: data.label, ops: data.ops as unknown as UndoOp[], createdAt: data.created_at };
}

interface ChecklistGroup {
  id?: string;
  title?: string;
  items?: { id?: string; title?: string; completed?: boolean }[];
}

async function getProfileId(): Promise<string> {
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error("Inte inloggad");
  const { data: profile } = await supabase
    .from("profiles").select("id").eq("user_id", user.id).single();
  if (!profile) throw new Error("Profil hittades inte");
  return profile.id;
}

/** Best-effort audit trail; never fails the apply. */
function logActivity(
  projectId: string,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  entityName: string,
  changes: Record<string, unknown>,
): void {
  void supabase.from("activity_log").insert({
    project_id: projectId,
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    entity_name: entityName,
    changes,
  }).then(() => {}, () => {});
}

/** Created objects carry the user's original words in their description —
 *  the curated title says WHAT, the transcript preserves exactly what was said. */
function withTranscript(description: string | null | undefined, sourceText?: string): string | null {
  const src = sourceText?.trim();
  if (!src) return description?.trim() || null;
  return [description?.trim(), `”${src}”`].filter(Boolean).join("\n\n");
}

async function applyOne(
  proposal: ActionableProposal,
  projectId: string,
  profileId: string,
  createdRoomsByName: Map<string, string>,
  sourceText?: string,
): Promise<UndoOp> {
  const { action } = proposal;

  switch (action.type) {
    case "create_room": {
      const { data, error } = await supabase.from("rooms").insert({
        project_id: projectId,
        name: action.name,
      }).select("id").single();
      if (error || !data) throw new Error(error?.message ?? "Kunde inte skapa rum");

      createdRoomsByName.set(action.name.trim().toLowerCase(), data.id);
      logActivity(projectId, profileId, "renaida_room_create", "room", data.id, action.name, { name: action.name });
      return { kind: "delete_room", roomId: data.id };
    }

    case "update_task":
    case "set_progress": {
      const taskId = action.taskId;
      const { data: prev } = await supabase
        .from("tasks").select("status,progress,title,description,due_date,start_date,finish_date,budget,priority,hourly_rate,estimated_hours,subcontractor_cost").eq("id", taskId).single();

      // Honest refusal (Carl-kön C9): on tasks whose cost is BUILT FROM PARTS
      // (hours × rate / subcontractor), tasks.budget isn't shown anywhere — a
      // silent write there looks like nothing happened. Refuse with guidance
      // instead of writing an invisible number. USER_FACING_ prefix → Renaida
      // shows this text verbatim instead of the generic failure line.
      if (action.type === "update_task" && "budget" in action.changes) {
        const brokenDown =
          (prev?.hourly_rate != null && prev?.estimated_hours != null) ||
          prev?.subcontractor_cost != null;
        if (brokenDown) {
          throw new Error(
            "USER_FACING_Det här arbetets kostnad är nedbruten i delar (timmar, timpris, underentreprenad). Ändra delarna i arbetsrutan istället — om jag skriver en klumpsumma syns den ingenstans.",
          );
        }
      }

      const changes = action.type === "set_progress"
        ? { progress: action.progress, ...((action.status ?? (action.progress >= 100 ? "awaiting_review" : undefined)) ? { status: action.status ?? "awaiting_review" } : {}) }
        // The task modal shows finish_date as "Slutdatum" while reminders read
        // due_date — a deadline the user can't SEE isn't a deadline, so write both.
        : ("due_date" in action.changes
            ? (() => {
                const due = action.changes.due_date;
                const extra: Record<string, unknown> = { finish_date: due };
                // tasks_dates_check requires finish >= start: a deadline before the
                // planned start pulls the start with it (you can't start after it).
                if (due && !("start_date" in action.changes) && prev?.start_date && prev.start_date > due) {
                  extra.start_date = due;
                }
                return { ...action.changes, ...extra };
              })()
            : action.changes);

      const { error } = await supabase.from("tasks").update(changes).eq("id", taskId);
      if (error) throw new Error(error.message);

      logActivity(projectId, profileId, "renaida_task_update", "task", taskId, prev?.title ?? "", { before: prev, after: changes });
      return { kind: "task_fields", taskId, before: prev ?? {} };
    }

    case "create_task": {
      // roomName: room named by the router that didn't exist at routing time —
      // resolve against rooms created earlier in this same batch.
      const resolvedRoomId = action.roomId
        ?? (action.roomName ? createdRoomsByName.get(action.roomName.trim().toLowerCase()) : undefined);
      const { data, error } = await supabase.from("tasks").insert({
        project_id: projectId,
        room_id: resolvedRoomId ?? null,
        // The app writes BOTH fields (TaskEditDialog reads room_ids[] first) —
        // loop round 7: panel showed "Inget rum" when only room_id was set.
        room_ids: resolvedRoomId ? [resolvedRoomId] : [],
        title: action.title,
        description: withTranscript(action.description, sourceText),
        status: "to_do",
        priority: "medium",
        created_by_user_id: profileId,
      }).select("id").single();
      if (error || !data) throw new Error(error?.message ?? "Kunde inte skapa uppgift");

      logActivity(projectId, profileId, "renaida_task_create", "task", data.id, action.title, { title: action.title });
      return { kind: "delete_task", taskId: data.id };
    }

    case "create_purchase": {
      // Visible order: a request-PO + linked material (respects the PO invariant),
      // not an orphan planned material. Price unknown from voice → total 0.
      const description = withTranscript([action.quantity, action.unit].filter(Boolean).join(" ") || null, sourceText);
      const { purchaseOrderId, materialId } = await createRequestPurchase({
        projectId,
        createdByUserId: profileId,
        material: {
          name: action.item,
          price_total: 0,
          quantity: action.quantity ?? 1,
          unit: action.unit ?? "st",
          room_id: action.roomId ?? null,
          description,
        },
      });

      logActivity(projectId, profileId, "renaida_purchase_request", "purchase_order", purchaseOrderId, action.item, { item: action.item, quantity: action.quantity, unit: action.unit });
      return { kind: "delete_purchase", purchaseOrderId, materialId };
    }

    case "import_purchase": {
      // Mirrors QuickReceiptCaptureModal's ai_receipt/ai_invoice branches:
      // 1 PO (status=delivered) + N material rows, so every scanned document
      // lives in Inköp as a first-class order (Carl's decision 2026-07-09).
      const isInvoice = action.documentType === "invoice";
      const dateStr = action.documentDate ?? new Date().toISOString().slice(0, 10);
      const file = takeAttachment(action.attachmentKey);
      // Unique suffix: the same receipt scanned twice yields the same
      // vendor+date+amount name — without it the second upload overwrites the
      // first order's file, and undoing one import would delete the other's
      // attachment (path-keyed cleanup).
      const isPdf = !!file && ((file.type || "").includes("pdf") || file.name.toLowerCase().endsWith(".pdf"));
      const filename = generateDocumentFilename(
        action.documentType, action.vendorName, dateStr, action.total, action.invoiceNumber,
      ).replace(/\.jpg$/, `_${crypto.randomUUID().slice(0, 8)}.${isPdf ? "pdf" : "jpg"}`);
      const storagePath = file
        ? `projects/${projectId}/${isInvoice ? "Fakturor" : "Kvitton"}/${filename}`
        : null;

      // ROT semantics (Carl 2026-07-12): ROT lowers what the user actually pays,
      // so the order total = NET (gross − ROT deduction). We store the deduction
      // separately so the budget can surface all utilized ROT in its own column;
      // gross is derivable as total + rot_amount. Material line rows stay at their
      // truthful gross line values (the receipt/invoice prints gross lines).
      const grossTotal = action.total;
      const rotAmount = action.rotAmount ?? 0;
      const netTotal = Math.max(0, grossTotal - rotAmount);

      const { data: po, error: poError } = await supabase
        .from("purchase_orders")
        .insert({
          project_id: projectId,
          vendor_name: action.vendorName,
          total: netTotal,
          rot_amount: rotAmount || null,
          status: "delivered",
          source: isInvoice ? "ai_invoice" : "ai_receipt",
          delivered_at: dateStr,
          ordered_at: dateStr,
          invoice_number: isInvoice ? action.invoiceNumber ?? null : null,
          ocr_number: isInvoice ? action.ocrNumber ?? null : null,
          invoice_due_date: isInvoice ? action.dueDate ?? null : null,
          receipt_file_path: storagePath,
          created_by_user_id: profileId,
        })
        .select("id")
        .single();
      if (poError || !po) throw new Error(poError?.message ?? "Kunde inte skapa inköpsorder");

      // Invoice lines await payment (billed/0); receipt lines are already paid.
      const matRows = (action.lineItems.length
        ? action.lineItems.map((li) => ({
            name: li.description,
            quantity: li.quantity || 1,
            price_per_unit: li.unitPrice,
            price_total: li.total,
            paid_amount: isInvoice ? 0 : li.total ?? 0,
          }))
        : [{
            name: `${isInvoice ? "Faktura" : "Kvitto"} - ${action.vendorName}`,
            quantity: 1,
            price_per_unit: action.total,
            price_total: action.total,
            paid_amount: isInvoice ? 0 : action.total,
          }]
      ).map((row) => ({
        ...row,
        project_id: projectId,
        purchase_order_id: po.id,
        vendor_name: action.vendorName,
        unit: "st",
        status: isInvoice ? "billed" : "paid",
        // D3: room attribution from the user's capture-time words — same shape
        // as the manual "allocate order to room" action (room lives on the lines).
        room_id: action.roomId ?? null,
        created_by_user_id: profileId,
      }));

      const { data: createdMats, error: matError } = await supabase
        .from("materials").insert(matRows).select("id");
      if (matError) {
        // Don't leave a half-imported order behind — the PO invariant says
        // an order without its lines is a lie in the purchase list.
        await supabase.from("purchase_orders").delete().eq("id", po.id);
        throw new Error(matError.message);
      }
      const materialIds = (createdMats ?? []).map((m) => m.id);

      // Upload the document image + link it, same shape as the manual scan flow.
      if (file && storagePath) {
        const { error: uploadError } = await supabase.storage
          .from("project-files")
          .upload(storagePath, file, { upsert: true });
        if (!uploadError && materialIds[0]) {
          void supabase.from("task_file_links").insert({
            project_id: projectId,
            file_path: storagePath,
            file_name: filename,
            file_type: action.documentType,
            file_size: file.size,
            mime_type: file.type,
            linked_by_user_id: profileId,
            material_id: materialIds[0],
          }).then(() => {}, () => {});
          // Photo gallery is images-only — a PDF invoice still gets its
          // task_file_links row above, which is what the Files surfaces read.
          if (!isPdf) {
            const { data: { publicUrl } } = supabase.storage
              .from("project-files").getPublicUrl(storagePath);
            void supabase.from("photos").insert({
              linked_to_type: "material",
              linked_to_id: materialIds[0],
              url: publicUrl,
              caption: filename,
              uploaded_by_user_id: profileId,
            }).then(() => {}, () => {});
          }
        }
      }

      logActivity(projectId, profileId, "renaida_purchase_import", "purchase_order", po.id, action.vendorName, {
        documentType: action.documentType,
        total: action.total,
        lines: action.lineItems.length,
      });
      return {
        kind: "delete_import_purchase",
        purchaseOrderId: po.id,
        materialIds,
        filePath: file ? storagePath : null,
      };
    }

    case "log_time": {
      const date = action.date ?? new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase.from("time_entries").insert({
        project_id: projectId,
        task_id: action.taskId ?? null,
        user_id: profileId,
        date,
        hours: action.hours,
        description: action.description ?? null,
      }).select("id").single();
      if (error || !data) throw new Error(error?.message ?? "Kunde inte logga tid");

      logActivity(projectId, profileId, "renaida_log_time", "time_entry", data.id, `${action.hours}h`, { hours: action.hours, taskId: action.taskId, date });
      return { kind: "delete_time", timeEntryId: data.id };
    }

    case "toggle_checklist": {
      const { data: task } = await supabase
        .from("tasks").select("checklists,progress,title").eq("id", action.taskId).single();
      const before = { checklists: task?.checklists ?? null, progress: task?.progress ?? null };
      const checklists = (task?.checklists as ChecklistGroup[] | null) ?? [];
      const want = action.completed ?? true;
      const needle = action.itemText.toLowerCase();
      let found = false;
      for (const cl of checklists) {
        for (const item of cl.items ?? []) {
          if (!found && (item.title ?? "").toLowerCase().includes(needle)) {
            item.completed = want;
            found = true;
          }
        }
      }
      if (!found) throw new Error("Hittade ingen checklistpunkt som matchar");

      // Recompute task progress from checklist completion (mirrors worker-toggle-checklist).
      let total = 0, done = 0;
      for (const cl of checklists) for (const item of cl.items ?? []) { total++; if (item.completed) done++; }
      const progress = total > 0 ? Math.round((done / total) * 100) : (task?.progress ?? 0);

      const { error } = await supabase.from("tasks").update({ checklists, progress }).eq("id", action.taskId);
      if (error) throw new Error(error.message);

      logActivity(projectId, profileId, "renaida_checklist", "task", action.taskId, task?.title ?? "", { itemText: action.itemText, completed: want });
      return { kind: "checklist_restore", taskId: action.taskId, before };
    }

    case "create_checklist": {
      const { data: task } = await supabase
        .from("tasks").select("checklists,progress,title").eq("id", action.taskId).single();
      const before = { checklists: task?.checklists ?? null, progress: task?.progress ?? null };
      const checklists = (((task?.checklists as ChecklistGroup[] | null) ?? [])).slice();
      const newItems = action.items.map((title) => ({ id: crypto.randomUUID(), title, completed: false }));
      // "Lägg till en punkt…" on a task with exactly one list means that list —
      // append instead of stacking a second group. Explicit title → new group.
      if (checklists.length === 1 && !action.title?.trim()) {
        checklists[0] = { ...checklists[0], items: [...(checklists[0].items ?? []), ...newItems] };
      } else {
        checklists.push({
          id: crypto.randomUUID(),
          title: action.title?.trim() || "Checklista",
          items: newItems,
        });
      }
      // Progress is intentionally untouched — adding instructions shouldn't move
      // the task backwards; the checklist-driven recompute kicks in on first toggle.
      const { error } = await supabase.from("tasks").update({ checklists }).eq("id", action.taskId);
      if (error) throw new Error(error.message);

      logActivity(projectId, profileId, "renaida_checklist_create", "task", action.taskId, task?.title ?? "", { items: action.items.length });
      return { kind: "checklist_restore", taskId: action.taskId, before };
    }

    case "remove_checklist_item": {
      const { data: task } = await supabase
        .from("tasks").select("checklists,progress,title").eq("id", action.taskId).single();
      const before = { checklists: task?.checklists ?? null, progress: task?.progress ?? null };
      const checklists = (((task?.checklists as ChecklistGroup[] | null) ?? [])).slice();
      const needle = action.itemText.toLowerCase();
      let removed = false;
      for (const cl of checklists) {
        const idx = (cl.items ?? []).findIndex((it) => (it.title ?? "").toLowerCase().includes(needle));
        if (idx >= 0) {
          cl.items = [...(cl.items ?? [])];
          cl.items.splice(idx, 1);
          removed = true;
          break;
        }
      }
      if (!removed) throw new Error("Hittade ingen checklistpunkt som matchar");

      let total = 0, done = 0;
      for (const cl of checklists) for (const item of cl.items ?? []) { total++; if (item.completed) done++; }
      const progress = total > 0 ? Math.round((done / total) * 100) : (task?.progress ?? 0);

      const { error } = await supabase.from("tasks").update({ checklists, progress }).eq("id", action.taskId);
      if (error) throw new Error(error.message);

      logActivity(projectId, profileId, "renaida_checklist", "task", action.taskId, task?.title ?? "", { itemText: action.itemText, removed: true });
      return { kind: "checklist_restore", taskId: action.taskId, before };
    }

    case "assign_task": {
      // Same write path as TaskEditDialog's assignee select:
      // tasks.assigned_to_stakeholder_id = a project member's profile id.
      const { data: prev } = await supabase
        .from("tasks").select("assigned_to_stakeholder_id,title").eq("id", action.taskId).single();

      const { error } = await supabase.from("tasks")
        .update({ assigned_to_stakeholder_id: action.assigneeProfileId })
        .eq("id", action.taskId);
      if (error) throw new Error(error.message);

      const assigneeName = action.assigneeName ?? "";
      logActivity(projectId, profileId, "renaida_task_assign", "task", action.taskId,
        assigneeName ? `${prev?.title ?? ""} → ${assigneeName}` : prev?.title ?? "",
        { assigneeProfileId: action.assigneeProfileId, assigneeName, before: prev?.assigned_to_stakeholder_id ?? null });
      return { kind: "task_assignee", taskId: action.taskId, before: { assigned_to_stakeholder_id: prev?.assigned_to_stakeholder_id ?? null } };
    }

    case "add_note": {
      const { data, error } = await supabase.from("comments").insert({
        content: action.text,
        project_id: projectId,
        task_id: action.target === "task" ? action.targetId : null,
        created_by_user_id: profileId,
        author_display_name: "Renaida",
        visible_to_client: false,
      }).select("id").single();
      if (error || !data) throw new Error(error?.message ?? "Kunde inte spara kommentar");

      logActivity(projectId, profileId, "renaida_comment", "comment", data.id, action.text.slice(0, 60), { target: action.target, targetId: action.targetId });
      return { kind: "delete_comment", commentId: data.id };
    }
  }
}

export async function applyProposals(
  accepted: AgentProposal[],
  projectId: string,
  sourceText?: string,
): Promise<ApplyResult> {
  const result: ApplyResult = { applied: [], failed: [], undo: [], created: [], modified: [] };
  const actionable = accepted.filter(isActionable);
  if (actionable.length === 0) return result;

  let profileId: string;
  try {
    profileId = await getProfileId();
  } catch (e) {
    const error = e instanceof Error ? e.message : "Okänt fel";
    return { applied: [], failed: accepted.map((proposal) => ({ proposal, error })), undo: [], created: [], modified: [] };
  }

  // open_feature proposals only NAVIGATE — they write nothing and have no undo,
  // so handle them outside the DB apply loop. (Carl 2026-07-12)
  const FEATURE_PATHS: Record<string, string> = { new_quote: "/quotes/new", new_invoice: "/invoices/new" };
  for (const proposal of actionable) {
    if (proposal.action.type === "open_feature") {
      result.applied.push(proposal);
      if (!result.navigateTo) result.navigateTo = FEATURE_PATHS[proposal.action.feature];
    }
  }
  const dbActionable = actionable.filter((p) => p.action.type !== "open_feature");

  // Rooms first so create_task roomName references resolve within the batch.
  const ordered = [
    ...dbActionable.filter((p) => p.action.type === "create_room"),
    ...dbActionable.filter((p) => p.action.type !== "create_room"),
  ];
  const createdRoomsByName = new Map<string, string>();
  const modifiedTaskIds = new Set<string>();

  for (const proposal of ordered) {
    try {
      const undo = await applyOne(proposal, projectId, profileId, createdRoomsByName, sourceText);
      result.applied.push(proposal);
      result.undo.unshift(undo); // reverse order for undo
      // Created objects → refs for "open it" links in the confirmation
      if (undo.kind === "delete_task" && proposal.action.type === "create_task") {
        result.created.push({ type: "task", id: undo.taskId, title: proposal.action.title, proposalId: proposal.id });
      } else if (undo.kind === "delete_purchase" && proposal.action.type === "create_purchase") {
        result.created.push({ type: "purchase", id: undo.purchaseOrderId, title: proposal.action.item, proposalId: proposal.id });
      } else if (undo.kind === "delete_room" && proposal.action.type === "create_room") {
        result.created.push({ type: "room", id: undo.roomId, title: proposal.action.name, proposalId: proposal.id });
      } else if (undo.kind === "delete_import_purchase" && proposal.action.type === "import_purchase") {
        result.created.push({ type: "purchase", id: undo.purchaseOrderId, title: proposal.action.vendorName, proposalId: proposal.id });
      }
      // Changed-in-place tasks → refs for "open & edit" links next to Undo
      switch (undo.kind) {
        case "task_fields":
        case "checklist_restore":
        case "task_assignee":
          modifiedTaskIds.add(undo.taskId);
          break;
        case "delete_time":
          if (proposal.action.type === "log_time" && proposal.action.taskId) modifiedTaskIds.add(proposal.action.taskId);
          break;
        case "delete_comment":
          if (proposal.action.type === "add_note" && proposal.action.target === "task" && proposal.action.targetId) {
            modifiedTaskIds.add(proposal.action.targetId);
          }
          break;
      }
    } catch (e) {
      result.failed.push({ proposal, error: e instanceof Error ? e.message : "Okänt fel" });
    }
  }

  if (modifiedTaskIds.size > 0) {
    const { data } = await supabase
      .from("tasks").select("id,title").in("id", [...modifiedTaskIds]);
    result.modified = (data ?? []).map((t) => ({ type: "task" as const, id: t.id, title: t.title ?? "" }));
  }

  // Persist the batch's reversal ops so undo survives a reload (loop round 15:
  // a receipt import couldn't be reverted after navigation). Best-effort — a
  // failed insert must never fail the apply itself.
  if (result.undo.length > 0) {
    try {
      const first = result.applied[0]?.summary?.trim() || "Renaida-ändring";
      const label = (result.applied.length > 1 ? `${first} (+${result.applied.length - 1})` : first).slice(0, 200);
      const { data: stackRow } = await supabase
        .from("renaida_undo_stack")
        .insert({
          profile_id: profileId,
          project_id: projectId,
          label,
          ops: JSON.parse(JSON.stringify(result.undo)),
        })
        .select("id")
        .single();
      result.undoStackId = stackRow?.id ?? null;
    } catch {
      result.undoStackId = null;
    }
  }
  return result;
}

/**
 * Reverse applied changes (one-tap undo). Best-effort per op.
 * When projectId is given, an honest "Renaida reverted her changes" receipt
 * row is logged — the original receipt rows stay (audit history), this row
 * marks them as undone instead of leaving them misleading.
 */
export async function undoProposals(undo: UndoOp[], projectId?: string, undoStackId?: string | null): Promise<void> {
  for (const op of undo) {
    try {
      switch (op.kind) {
        case "task_fields":
          await supabase.from("tasks").update({
            status: op.before.status ?? null,
            progress: op.before.progress ?? null,
            title: op.before.title ?? undefined,
            description: op.before.description ?? null,
            due_date: op.before.due_date ?? null,
            start_date: op.before.start_date ?? null,
            finish_date: op.before.finish_date ?? null,
            budget: op.before.budget ?? null,
            priority: op.before.priority ?? null,
          }).eq("id", op.taskId);
          break;
        case "delete_task":
          await supabase.from("tasks").delete().eq("id", op.taskId);
          break;
        case "delete_room":
          // Undo runs in reverse order, so tasks created into this room in the
          // same batch are deleted before the room itself.
          await supabase.from("rooms").delete().eq("id", op.roomId);
          break;
        case "delete_purchase":
          await supabase.from("materials").delete().eq("id", op.materialId);
          await supabase.from("purchase_orders").delete().eq("id", op.purchaseOrderId);
          break;
        case "delete_import_purchase":
          if (op.materialIds.length) {
            await supabase.from("photos").delete().in("linked_to_id", op.materialIds).eq("linked_to_type", "material");
            await supabase.from("materials").delete().in("id", op.materialIds);
          }
          await supabase.from("purchase_orders").delete().eq("id", op.purchaseOrderId);
          if (op.filePath) {
            await supabase.from("task_file_links").delete().eq("file_path", op.filePath);
            await supabase.storage.from("project-files").remove([op.filePath]);
          }
          break;
        case "delete_comment":
          await supabase.from("comments").delete().eq("id", op.commentId);
          break;
        case "delete_time":
          await supabase.from("time_entries").delete().eq("id", op.timeEntryId);
          break;
        case "checklist_restore":
          await supabase.from("tasks").update({
            checklists: op.before.checklists as never,
            progress: op.before.progress,
          }).eq("id", op.taskId);
          break;
        case "task_assignee":
          await supabase.from("tasks").update({
            assigned_to_stakeholder_id: op.before.assigned_to_stakeholder_id,
          }).eq("id", op.taskId);
          break;
      }
    } catch {
      // best-effort
    }
  }

  if (projectId && undo.length > 0) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles").select("id").eq("user_id", user.id).single();
    if (profile) {
      // entityIds lets the feed suppress the DB-trigger "deleted" rows for the
      // entities this undo removed — one clean "Renaida ångrade" row instead of
      // a noisy "Carl tog bort …" + undo-row pair.
      const entityIds = undo.flatMap((op) => {
        switch (op.kind) {
          case "delete_task": return [op.taskId];
          case "delete_room": return [op.roomId];
          case "delete_purchase": return [op.purchaseOrderId, op.materialId];
          case "delete_import_purchase": return [op.purchaseOrderId, ...op.materialIds];
          case "delete_comment": return [op.commentId];
          case "delete_time": return [op.timeEntryId];
          default: return [];
        }
      });
      logActivity(projectId, profile.id, "renaida_undo", "project", projectId, "", { ops: undo.length, entityIds });
    }
  }

  // Spend the persisted batch — it must not be offered for undo again.
  if (undoStackId) {
    void supabase
      .from("renaida_undo_stack")
      .update({ undone_at: new Date().toISOString() })
      .eq("id", undoStackId)
      .then(() => {}, () => {});
  }
}
