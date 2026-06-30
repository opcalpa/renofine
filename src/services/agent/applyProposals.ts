/**
 * Agentic layer — apply accepted proposals to the DB.
 *
 * Maps each accepted AgentProposal to an existing write path, mirroring the
 * inline insert shapes in AIProjectImportModal.handleImport and
 * QuoteReviewDialog.handleImport. Nothing here invents an id — proposals
 * reference entities the router resolved against real project context.
 *
 * See .claude/briefs/agentic-mvp.md.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ActionableProposal, AgentProposal } from "./types";
import { isActionable } from "./types";

export interface ApplyResult {
  applied: AgentProposal[];
  failed: { proposal: AgentProposal; error: string }[];
}

/** Resolve the caller's profile id (used as created_by_user_id), mirroring the import dialogs. */
async function getProfileId(): Promise<string> {
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error("Inte inloggad");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!profile) throw new Error("Profil hittades inte");
  return profile.id;
}

async function applyOne(
  proposal: ActionableProposal,
  projectId: string,
  profileId: string,
): Promise<void> {
  const { action } = proposal;

  switch (action.type) {
    case "update_task": {
      const { error } = await supabase
        .from("tasks")
        .update(action.changes)
        .eq("id", action.taskId);
      if (error) throw new Error(error.message);
      return;
    }

    case "set_progress": {
      // Mirror the worker-upload-photo rule: a completed task awaits owner review.
      const status = action.status ?? (action.progress >= 100 ? "awaiting_review" : undefined);
      const { error } = await supabase
        .from("tasks")
        .update({ progress: action.progress, ...(status ? { status } : {}) })
        .eq("id", action.taskId);
      if (error) throw new Error(error.message);
      return;
    }

    case "create_task": {
      const { error } = await supabase.from("tasks").insert({
        project_id: projectId,
        room_id: action.roomId ?? null,
        title: action.title,
        description: action.description ?? null,
        status: "to_do",
        priority: "medium",
        created_by_user_id: profileId,
      });
      if (error) throw new Error(error.message);
      return;
    }

    case "create_purchase": {
      // Field-captured wishes carry no price yet → planned material, no PO.
      const description = [action.quantity, action.unit].filter(Boolean).join(" ") || null;
      const { error } = await supabase.from("materials").insert({
        project_id: projectId,
        room_id: action.roomId ?? null,
        name: action.item,
        description,
        quantity: action.quantity ?? null,
        unit: action.unit ?? "st",
        status: "planned",
        created_by_user_id: profileId,
      });
      if (error) throw new Error(error.message);
      return;
    }

    case "add_note": {
      // Not part of the MVP slice yet — surfaced as a failure rather than silently dropped.
      throw new Error("add_note är inte stödd ännu");
    }
  }
}

/**
 * Apply the user-accepted proposals. `unknown` proposals are never applied.
 * Returns a per-proposal outcome so the UI can report partial success.
 */
export async function applyProposals(
  accepted: AgentProposal[],
  projectId: string,
): Promise<ApplyResult> {
  const result: ApplyResult = { applied: [], failed: [] };

  const actionable = accepted.filter(isActionable);
  if (actionable.length === 0) return result;

  let profileId: string;
  try {
    profileId = await getProfileId();
  } catch (e) {
    const error = e instanceof Error ? e.message : "Okänt fel";
    return { applied: [], failed: accepted.map((proposal) => ({ proposal, error })) };
  }

  for (const proposal of actionable) {
    try {
      await applyOne(proposal, projectId, profileId);
      result.applied.push(proposal);
    } catch (e) {
      result.failed.push({ proposal, error: e instanceof Error ? e.message : "Okänt fel" });
    }
  }

  return result;
}
