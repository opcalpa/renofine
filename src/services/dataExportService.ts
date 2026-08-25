import { supabase } from "@/integrations/supabase/client";
import { TASK_COSTS_EMBED, flattenTaskCostRows } from "@/lib/taskCosts";

export interface ExportedData {
  exportDate: string;
  profile: Record<string, unknown> | null;
  projects: Record<string, unknown>[];
  rooms: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  materials: Record<string, unknown>[];
  purchaseRequests: Record<string, unknown>[];
  quotes: Record<string, unknown>[];
  quoteItems: Record<string, unknown>[];
  comments: Record<string, unknown>[];
  photos: Record<string, unknown>[];
  floorMapPlans: Record<string, unknown>[];
  floorMapShapes: Record<string, unknown>[];
  clients: Record<string, unknown>[];
  activityLog: Record<string, unknown>[];
}

/**
 * Export all user data for GDPR compliance
 * Returns a JSON object containing all user-owned data
 */
export async function exportUserData(): Promise<ExportedData> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Get user's profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!profile) throw new Error("Profile not found");

  const profileId = profile.id;

  // Get all projects owned by user
  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_id", profileId)
    .is("deleted_at", null);

  const projectIds = projects?.map(p => p.id) || [];

  // Get all rooms in user's projects
  const { data: rooms } = projectIds.length > 0
    ? await supabase
        .from("rooms")
        .select("*")
        .in("project_id", projectIds)
    : { data: [] };

  // Get all tasks in user's projects
  const { data: tasks } = projectIds.length > 0
    ? await supabase
        .from("tasks")
        .select(`*, ${TASK_COSTS_EMBED}`)
        .in("project_id", projectIds)
    : { data: [] };

  const tasksFlat = flattenTaskCostRows(
    (tasks || []) as unknown as Array<Record<string, unknown>>,
  );

  // Get all materials in user's projects
  const { data: materials } = projectIds.length > 0
    ? await supabase
        .from("materials")
        .select("*")
        .in("project_id", projectIds)
    : { data: [] };

  // Get all purchase requests in user's projects
  const { data: purchaseRequests } = projectIds.length > 0
    ? await supabase
        .from("purchase_requests")
        .select("*")
        .in("project_id", projectIds)
    : { data: [] };

  // Get all quotes created by user
  const { data: quotes } = await supabase
    .from("quotes")
    .select("*")
    .eq("creator_id", profileId);

  const quoteIds = quotes?.map(q => q.id) || [];

  // Get all quote items
  const { data: quoteItems } = quoteIds.length > 0
    ? await supabase
        .from("quote_items")
        .select("*")
        .in("quote_id", quoteIds)
    : { data: [] };

  // Get all comments authored by user
  const { data: comments } = await supabase
    .from("comments")
    .select("*")
    .eq("created_by_user_id", profileId);

  // Get all photos uploaded by user
  const { data: photos } = await supabase
    .from("photos")
    .select("*")
    .eq("uploaded_by_user_id", profileId);

  // Get all floor map plans in user's projects
  const { data: floorMapPlans } = projectIds.length > 0
    ? await supabase
        .from("floor_map_plans")
        .select("*")
        .in("project_id", projectIds)
    : { data: [] };

  // Get all floor map shapes in user's projects
  const { data: floorMapShapes } = projectIds.length > 0
    ? await supabase
        .from("floor_map_shapes")
        .select("*")
        .in("project_id", projectIds)
    : { data: [] };

  // Get all clients created by user
  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .eq("created_by_profile_id", profileId);

  // Get activity log for user's projects
  const { data: activityLog } = projectIds.length > 0
    ? await supabase
        .from("activity_log")
        .select("*")
        .in("project_id", projectIds)
    : { data: [] };

  return {
    exportDate: new Date().toISOString(),
    profile: profile as Record<string, unknown>,
    projects: (projects || []) as Record<string, unknown>[],
    rooms: (rooms || []) as Record<string, unknown>[],
    tasks: tasksFlat as Record<string, unknown>[],
    materials: (materials || []) as Record<string, unknown>[],
    purchaseRequests: (purchaseRequests || []) as Record<string, unknown>[],
    quotes: (quotes || []) as Record<string, unknown>[],
    quoteItems: (quoteItems || []) as Record<string, unknown>[],
    comments: (comments || []) as Record<string, unknown>[],
    photos: (photos || []) as Record<string, unknown>[],
    floorMapPlans: (floorMapPlans || []) as Record<string, unknown>[],
    floorMapShapes: (floorMapShapes || []) as Record<string, unknown>[],
    clients: (clients || []) as Record<string, unknown>[],
    activityLog: (activityLog || []) as Record<string, unknown>[],
  };
}

/**
 * Download user data as a JSON file
 */
export async function downloadUserDataAsJson(): Promise<void> {
  const data = await exportUserData();

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `renofine-export-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
