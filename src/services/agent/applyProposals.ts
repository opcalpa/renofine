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

const ACTOR = "renaida";

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
): Promise<UndoOp> {
  const { action } = proposal;

  switch (action.type) {
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
      const { data, error } = await supabase.from("tasks").insert({
        project_id: projectId,
        room_id: action.roomId ?? null,
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

  for (const proposal of actionable) {
    try {
      const undo = await applyOne(proposal, projectId, profileId);
      result.applied.push(proposal);
      result.undo.unshift(undo); // reverse order for undo
    } catch (e) {
      result.failed.push({ proposal, error: e instanceof Error ? e.message : "Okänt fel" });
    }
  }
  return result;
}

/** Reverse applied changes (one-tap undo). Best-effort per op. */
export async function undoProposals(undo: UndoOp[]): Promise<void> {
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
        case "delete_purchase":
          await supabase.from("materials").delete().eq("id", op.materialId);
          await supabase.from("purchase_orders").delete().eq("id", op.purchaseOrderId);
          break;
        case "delete_comment":
          await supabase.from("comments").delete().eq("id", op.commentId);
          break;
      }
    } catch {
      // best-effort
    }
  }
}
