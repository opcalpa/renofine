// ============================================================================
// projectDataService.ts — Renofine v2.2.0 (Spår B2)
// ============================================================================
// Thin wrappers around the Team v2 field-masking RPCs (see migration
// 20260516130000_team_v2_masking_rpcs). Field-masking happens at the DB level
// (SECURITY DEFINER), so a UI bug can never leak data — this layer just types
// the round-trip.
//
// Gated by isTeamV2MaskingEnabled(): callers must check the flag and fall back
// to their existing query path when it is off. Nothing here is load-bearing
// until a hook opts in.
//
// NOTE: these RPCs are not in the generated Database types yet, so rpc() is
// cast (same `as never` pattern used elsewhere for untyped objects).
// ============================================================================

import { supabase } from "@/integrations/supabase/client";

export type ViewerMode = "full" | "own" | "client" | "none";

export interface MaskedProject {
  id: string;
  name: string;
  address: string | null;
  status: string;
  tracks_economy: boolean;
  tracks_rot: boolean;
  total_budget: number | null;
  spent_amount: number | null;
  contract_value: number | null;
}

export interface MaskedTask {
  id: string;
  title: string;
  status: string;
  progress: number;
  start_date: string | null;
  finish_date: string | null;
  room_id: string | null;
  cost_centers: string[] | null;
  budget: number | null;
  payment_status: string | null;
  paid_amount: number | null;
}

export interface MaskedMaterial {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  status: string;
  room_id: string | null;
  created_by_user_id: string;
  exclude_from_budget: boolean;
  price_per_unit: number | null;
  price_total: number | null;
  vendor_name: string | null;
  vendor_link: string | null;
  paid_by: string | null;
}

export interface ProjectOverviewData {
  project: MaskedProject;
  viewer_mode: ViewerMode;
  tasks: MaskedTask[];
  materials: MaskedMaterial[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedRpc = (name: string, args: Record<string, unknown>) => any;
const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;

export async function getViewerMode(projectId: string): Promise<ViewerMode> {
  const { data, error } = await rpc("derive_viewer_mode", {
    p_project_id: projectId,
  });
  if (error) throw error;
  return (data as ViewerMode) ?? "none";
}

export async function getProjectOverview(
  projectId: string,
): Promise<ProjectOverviewData> {
  const { data, error } = await rpc("get_project_overview", {
    p_project_id: projectId,
  });
  if (error) throw error;
  return data as ProjectOverviewData;
}

export async function getProjectTasks(projectId: string): Promise<MaskedTask[]> {
  const { data, error } = await rpc("get_project_tasks", {
    p_project_id: projectId,
  });
  if (error) throw error;
  return (data as MaskedTask[]) ?? [];
}

export async function getProjectMaterials(
  projectId: string,
): Promise<MaskedMaterial[]> {
  const { data, error } = await rpc("get_project_materials", {
    p_project_id: projectId,
  });
  if (error) throw error;
  return (data as MaskedMaterial[]) ?? [];
}

export async function getProjectAsPersona(
  projectId: string,
  persona: "worker" | "client" | "member" | "pm",
  mode: "none" | "own" | "full",
): Promise<ProjectOverviewData> {
  const { data, error } = await rpc("get_project_as_persona", {
    p_project_id: projectId,
    p_persona: persona,
    p_mode: mode,
  });
  if (error) throw error;
  return data as ProjectOverviewData;
}

export interface AuditLogEntry {
  id: string;
  profile_id: string | null;
  worker_token_id: string | null;
  action: string;
  target: string | null;
  target_type: string | null;
  denied: boolean;
  created_at: string;
}

export async function getAuditLog(
  projectId: string,
  filter?: { action?: string; denied?: boolean; days?: number },
): Promise<AuditLogEntry[]> {
  // access_log is not in the generated Database types yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from("access_log" as never)
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (filter?.action) query = query.eq("action", filter.action);
  if (filter?.denied !== undefined) query = query.eq("denied", filter.denied);
  if (filter?.days) {
    const since = new Date(Date.now() - filter.days * 86400_000).toISOString();
    query = query.gte("created_at", since);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as AuditLogEntry[]) ?? [];
}

export async function getLastActive(
  profileId: string,
  projectId: string,
): Promise<Date | null> {
  const { data, error } = await supabase
    .from("access_log" as never)
    .select("created_at")
    .eq("project_id", projectId)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? new Date((data as { created_at: string }).created_at) : null;
}
