/**
 * Proactive Renaida (Fas 3b) — read project state, surface concrete loose ends.
 *
 * These are DETERMINISTIC detectors (no LLM): things the user has effectively
 * already done but hasn't recorded, so Renaida can offer to finish them off.
 * Each suggestion carries a ready-made action; the component turns it into an
 * AgentProposal and presents it via the SAME ConfirmDiff. Proactive suggestions
 * are ALWAYS confirmed (never auto-applied) — the user didn't initiate them.
 *
 * See project_renaida_wow_engine.md (Fas 3b). Best-effort: never throws.
 */
import { supabase } from "@/integrations/supabase/client";

export type SuggestionKind = "checklist_done";

export interface RenaidaSuggestion {
  taskId: string;
  title: string;
  kind: SuggestionKind;
}

interface ChecklistGroup {
  items?: { completed?: boolean }[];
}

/** Task has checklist items and every one is ticked, but the task isn't marked done. */
function checklistFullyDoneButTaskOpen(task: {
  status: string | null;
  progress: number | null;
  checklists: unknown;
}): boolean {
  if (task.status === "completed") return false;
  if ((task.progress ?? 0) >= 100) return false;
  const groups = Array.isArray(task.checklists) ? (task.checklists as ChecklistGroup[]) : [];
  let total = 0;
  let done = 0;
  for (const g of groups) {
    for (const item of g.items ?? []) {
      total++;
      if (item.completed) done++;
    }
  }
  return total > 0 && done === total;
}

/**
 * Fetch up to `limit` proactive suggestions for a project. RLS scopes the query
 * to tasks the caller can see. Returns [] on any error or when nothing is found.
 */
export async function fetchProactiveSuggestions(
  projectId: string,
  limit = 3,
): Promise<RenaidaSuggestion[]> {
  try {
    const { data, error } = await supabase
      .from("tasks")
      .select("id,title,status,progress,checklists")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error || !data) return [];

    const suggestions: RenaidaSuggestion[] = [];
    for (const task of data) {
      if (checklistFullyDoneButTaskOpen(task)) {
        suggestions.push({ taskId: task.id, title: task.title, kind: "checklist_done" });
      }
      if (suggestions.length >= limit) break;
    }
    return suggestions;
  } catch {
    return [];
  }
}
