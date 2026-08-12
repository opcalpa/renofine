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

// ---------------------------------------------------------------------------
// R2: quote-accept news — the builder's first "wow" moment must not pass silent
// ---------------------------------------------------------------------------

export interface AcceptedQuoteNews {
  quoteId: string;
  title: string;
  totalAmount: number | null;
  clientName: string | null;
  isAta: boolean;
}

const ACCEPT_ACK_KEY = (quoteId: string) => `renofine.renaida.acceptAck.${quoteId}`;
const ACCEPT_NEWS_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** Persist that the acceptance was celebrated — shown once per quote. */
export function markAcceptedQuoteAcked(quoteId: string): void {
  try {
    localStorage.setItem(ACCEPT_ACK_KEY(quoteId), "1");
  } catch {
    /* private mode etc. — worst case the news repeats */
  }
}

/**
 * The customer accepted a quote the CALLER created (recently, not yet
 * celebrated) — Renaida acknowledges it and points at the next step. The
 * accept moment itself happens on the customer's screen (confetti there);
 * without this the builder's side stays silent. Best-effort: null on any error.
 */
export async function fetchAcceptedQuoteNews(
  projectId: string,
): Promise<AcceptedQuoteNews | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile) return null;

    const { data } = await supabase
      .from("quotes")
      .select("id, title, total_amount, updated_at, client_id, is_ata")
      .eq("project_id", projectId)
      .eq("creator_id", profile.id)
      .eq("status", "accepted")
      .order("updated_at", { ascending: false })
      .limit(5);
    if (!data?.length) return null;

    const now = Date.now();
    const fresh = data.find((q) => {
      const ts = q.updated_at ? Date.parse(q.updated_at) : 0;
      if (!ts || now - ts > ACCEPT_NEWS_WINDOW_MS) return false;
      try {
        return !localStorage.getItem(ACCEPT_ACK_KEY(q.id));
      } catch {
        return false;
      }
    });
    if (!fresh) return null;

    let clientName: string | null = null;
    if (fresh.client_id) {
      const { data: client } = await supabase
        .from("clients")
        .select("name")
        .eq("id", fresh.client_id)
        .maybeSingle();
      clientName = client?.name ?? null;
    }

    return {
      quoteId: fresh.id,
      title: fresh.title,
      totalAmount: fresh.total_amount,
      clientName,
      isAta: !!fresh.is_ata,
    };
  } catch {
    return null;
  }
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
