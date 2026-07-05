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
import type { ActionableProposal, AgentProposal, UndoOp } from "./types";
import { isActionable } from "./types";

export interface ApplyResult {
  applied: AgentProposal[];
  failed: { proposal: AgentProposal; error: string }[];
  /** Reverse-order list of undo operations for the applied changes. */
  undo: UndoOp[];
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

async function applyOne(
  proposal: ActionableProposal,
  projectId: string,
  profileId: string,
  createdRoomsByName: Map<string, string>,
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
        .from("tasks").select("status,progress,title,description").eq("id", taskId).single();

      const changes = action.type === "set_progress"
        ? { progress: action.progress, ...((action.status ?? (action.progress >= 100 ? "awaiting_review" : undefined)) ? { status: action.status ?? "awaiting_review" } : {}) }
        : action.changes;

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
        description: action.description ?? null,
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
      const description = [action.quantity, action.unit].filter(Boolean).join(" ") || null;
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
      checklists.push({
        id: crypto.randomUUID(),
        title: action.title?.trim() || "Checklista",
        items: action.items.map((title) => ({ id: crypto.randomUUID(), title, completed: false })),
      });
      // Progress is intentionally untouched — adding instructions shouldn't move
      // the task backwards; the checklist-driven recompute kicks in on first toggle.
      const { error } = await supabase.from("tasks").update({ checklists }).eq("id", action.taskId);
      if (error) throw new Error(error.message);

      logActivity(projectId, profileId, "renaida_checklist_create", "task", action.taskId, task?.title ?? "", { items: action.items.length });
      return { kind: "checklist_restore", taskId: action.taskId, before };
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
): Promise<ApplyResult> {
  const result: ApplyResult = { applied: [], failed: [], undo: [] };
  const actionable = accepted.filter(isActionable);
  if (actionable.length === 0) return result;

  let profileId: string;
  try {
    profileId = await getProfileId();
  } catch (e) {
    const error = e instanceof Error ? e.message : "Okänt fel";
    return { applied: [], failed: accepted.map((proposal) => ({ proposal, error })), undo: [] };
  }

  // Rooms first so create_task roomName references resolve within the batch.
  const ordered = [
    ...actionable.filter((p) => p.action.type === "create_room"),
    ...actionable.filter((p) => p.action.type !== "create_room"),
  ];
  const createdRoomsByName = new Map<string, string>();

  for (const proposal of ordered) {
    try {
      const undo = await applyOne(proposal, projectId, profileId, createdRoomsByName);
      result.applied.push(proposal);
      result.undo.unshift(undo); // reverse order for undo
    } catch (e) {
      result.failed.push({ proposal, error: e instanceof Error ? e.message : "Okänt fel" });
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
export async function undoProposals(undo: UndoOp[], projectId?: string): Promise<void> {
  for (const op of undo) {
    try {
      switch (op.kind) {
        case "task_fields":
          await supabase.from("tasks").update({
            status: op.before.status ?? null,
            progress: op.before.progress ?? null,
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
          case "delete_comment": return [op.commentId];
          case "delete_time": return [op.timeEntryId];
          default: return [];
        }
      });
      logActivity(projectId, profile.id, "renaida_undo", "project", projectId, "", { ops: undo.length, entityIds });
    }
  }
}
