/**
 * Renaida learning substrate (client write path).
 *
 * Every Renaida interaction can teach her something about the user. This module
 * persists those facts to `renaida_user_memory`; the agent-route edge fn reads
 * them back into the routing prompt so matching gets more personal over time.
 *
 * Writes are RLS-scoped to the caller's own profile. Facts are deduped on
 * (profile_id, project_id, kind, key): a repeat observation strengthens the
 * existing row's evidence_count instead of inserting a duplicate.
 *
 * See project_renaida_wow_engine.md (Fas 1). Best-effort: learning must never
 * break the apply flow, so every write swallows its own errors.
 */
import { supabase } from "@/integrations/supabase/client";

export type MemoryKind = "correction" | "phrase_map" | "vendor" | "preference" | "pattern";

async function getProfileId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles").select("id").eq("user_id", user.id).single();
  return profile?.id ?? null;
}

/** Upsert one fact; a repeat observation strengthens evidence_count. */
export async function rememberFact(params: {
  projectId: string | null;
  kind: MemoryKind;
  key: string;
  value: string;
}): Promise<void> {
  const { projectId, kind, key, value } = params;
  if (!key.trim() || !value.trim()) return;
  try {
    const profileId = await getProfileId();
    if (!profileId) return;

    // Read-modify-write (the unique index guards against races; low write rate).
    const existing = supabase
      .from("renaida_user_memory")
      .select("id,evidence_count")
      .eq("profile_id", profileId)
      .eq("kind", kind)
      .eq("key", key);
    const { data: rows } = await (projectId
      ? existing.eq("project_id", projectId)
      : existing.is("project_id", null)
    ).limit(1);

    const row = rows?.[0];
    if (row) {
      await supabase.from("renaida_user_memory").update({
        value,
        evidence_count: (row.evidence_count ?? 1) + 1,
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
    } else {
      await supabase.from("renaida_user_memory").insert({
        profile_id: profileId,
        project_id: projectId,
        kind, key, value,
      });
    }
  } catch {
    // best-effort: never fail the apply because learning hiccuped
  }
}

/**
 * Record a routing correction: the user re-picked a different task than the one
 * Renaida proposed. Stored as a phrase → intended-work hint that the router
 * sees next time. `phrase` is normalized + truncated to keep the store lean.
 */
export async function recordCorrection(params: {
  projectId: string;
  phrase: string;
  chosenWork: string;
}): Promise<void> {
  const key = params.phrase.trim().toLowerCase().slice(0, 120);
  if (!key) return;
  await rememberFact({
    projectId: params.projectId,
    kind: "correction",
    key,
    value: params.chosenWork.trim().slice(0, 160),
  });
}
