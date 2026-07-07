import { supabase } from "@/integrations/supabase/client";
import { isDemoProject } from "@/services/demoProjectService";
import { getLastProjectId } from "@/lib/autoEntry";

export interface FallbackProject {
  id: string;
  name: string;
  isDemo: boolean;
}

let cached: { value: FallbackProject | null; at: number } | null = null;
const TTL_MS = 60_000;

/**
 * The project Renaida acts on when the panel is used outside a project page
 * (e.g. the start page): last visited → newest real project → personal demo
 * → null. Scoped explicitly to the caller's own/shared projects — admin RLS
 * can see everything, so RLS alone is not the filter here.
 */
export async function resolveFallbackProject(): Promise<FallbackProject | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: prof } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!prof?.id) return null;

  const { data: shares } = await supabase
    .from("project_shares")
    .select("project_id")
    .eq("shared_with_user_id", prof.id);
  const sharedIds = (shares ?? []).map((s) => s.project_id);
  const orFilter = sharedIds.length > 0
    ? `owner_id.eq.${prof.id},id.in.(${sharedIds.join(",")})`
    : `owner_id.eq.${prof.id}`;

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, project_type, created_at")
    .or(orFilter)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  const list = projects ?? [];
  const real = list.filter((p) => !isDemoProject(p.project_type));
  const personalDemo = list.find((p) => p.project_type === "demo_project");
  const remembered = getLastProjectId();
  const pick = real.find((p) => p.id === remembered) ?? real[0] ?? personalDemo ?? null;

  const value = pick
    ? { id: pick.id, name: pick.name, isDemo: isDemoProject(pick.project_type) }
    : null;
  cached = { value, at: Date.now() };
  return value;
}
