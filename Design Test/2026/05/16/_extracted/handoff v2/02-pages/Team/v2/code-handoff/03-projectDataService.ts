// ============================================================================
// projectDataService.ts — Renofine v2.2.0
// ============================================================================
// Service-layer wrapper around Supabase queries that delegates to the
// `get_project_overview` (and sibling) RPCs, which apply field-masking
// based on the viewer's mode at the database level.
//
// All hooks (useOverviewData, useTasksData, useMaterialsList, etc.) should
// route through these functions instead of querying tables directly.
//
// Why service layer:
//   1. Single point of field-masking — bugs in UI never leak data
//   2. Easy to audit (everything goes through here)
//   3. Future-proof for caching, retries, telemetry
// ============================================================================

import { supabase } from "@/integrations/supabase/client";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ViewerMode = "full" | "own" | "client" | "none";

export interface MaskedProject {
  id: string;
  name: string;
  address: string | null;
  status: string;
  tracks_economy: boolean;
  tracks_rot: boolean;
  total_budget: number | null;     // null if mode !== "full"
  spent_amount: number | null;     // null if mode !== "full"
  contract_value: number | null;   // null if mode !== "full" && !== "client"
}

export interface MaskedTask {
  id: string;
  title: string;
  status: string;
  progress: number;
  start_date: string | null;
  finish_date: string | null;
  room_id: string | null;
  cost_centers: string[];
  // Economy fields — null per mode
  budget: number | null;           // null if mode === "own" || mode === "none"
  payment_status: string | null;   // null if mode !== "full"
  paid_amount: number | null;      // null if mode !== "full"
}

export interface MaskedMaterial {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  status: string;
  task_id: string | null;
  room_id: string | null;
  created_by_user_id: string;
  // Economy fields — null per mode
  price_per_unit: number | null;
  price_total: number | null;
  vendor_name: string | null;
  vendor_link: string | null;
  paid_by: string | null;
  exclude_from_budget: boolean;
}

export interface ProjectOverviewData {
  project: MaskedProject;
  viewer_mode: ViewerMode;
  tasks: MaskedTask[];
  materials: MaskedMaterial[];
}

// ─── RPCs ───────────────────────────────────────────────────────────────────

/**
 * Get project overview with all field-masking applied at the database level.
 * Logs the view to access_log as a side effect.
 */
export async function getProjectOverview(
  projectId: string,
): Promise<ProjectOverviewData> {
  const { data, error } = await supabase.rpc("get_project_overview", {
    p_project_id: projectId,
  });
  if (error) throw error;
  return data as ProjectOverviewData;
}

/**
 * Get tasks for a project. Backend filters per viewer mode + scope.
 */
export async function getProjectTasks(
  projectId: string,
): Promise<MaskedTask[]> {
  const { data, error } = await supabase.rpc("get_project_tasks", {
    p_project_id: projectId,
  });
  if (error) throw error;
  return (data as MaskedTask[]) || [];
}

/**
 * Get materials for a project. Backend filters: own-mode sees only
 * materials.created_by_user_id = viewer.
 */
export async function getProjectMaterials(
  projectId: string,
): Promise<MaskedMaterial[]> {
  const { data, error } = await supabase.rpc("get_project_materials", {
    p_project_id: projectId,
  });
  if (error) throw error;
  return (data as MaskedMaterial[]) || [];
}

// ─── Convenience: derive viewer mode without fetching ───────────────────────

/**
 * Returns the viewer's economic mode for a project.
 * Used by UI to decide tab visibility before data loads.
 */
export async function getViewerMode(projectId: string): Promise<ViewerMode> {
  const { data, error } = await supabase.rpc("derive_viewer_mode", {
    p_project_id: projectId,
  });
  if (error) throw error;
  return data as ViewerMode;
}

// ─── Preview: render as different persona ───────────────────────────────────

/**
 * Get project data as if viewed by a specific persona+mode.
 * Used by InvitePreviewOverlay.
 * Requires project owner or co_owner permissions to call.
 */
export async function getProjectAsPersona(
  projectId: string,
  persona: "worker" | "client" | "member" | "pm",
  mode: "none" | "own" | "full",
): Promise<ProjectOverviewData> {
  const { data, error } = await supabase.rpc("get_project_as_persona", {
    p_project_id: projectId,
    p_persona: persona,
    p_mode: mode,
  });
  if (error) throw error;
  return data as ProjectOverviewData;
}

// ─── Audit log ──────────────────────────────────────────────────────────────

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
  let query = supabase
    .from("access_log")
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
  return (data as AuditLogEntry[]) || [];
}

export async function getLastActive(
  profileId: string,
  projectId: string,
): Promise<Date | null> {
  const { data, error } = await supabase
    .from("access_log")
    .select("created_at")
    .eq("project_id", projectId)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? new Date(data.created_at) : null;
}
