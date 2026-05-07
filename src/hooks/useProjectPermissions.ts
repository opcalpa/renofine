import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { isDemoProject } from "@/services/demoProjectService";
import { PUBLIC_DEMO_PROJECT_ID } from "@/constants/publicDemo";

export interface ProjectPermissions {
  isOwner: boolean;
  isSystemAdmin: boolean;
  isDemoProject: boolean;
  isClient: boolean;
  isPlanningContributor: boolean;
  roleType: string | null;
  customerView: string;
  overview: string;
  timeline: string;
  tasks: string;
  tasksScope: string;
  spacePlanner: string;
  purchases: string;
  purchasesScope: string;
  budget: string;
  files: string;
  teams: string;
  timeTracking: string;
  loading: boolean;
}

const ALL_EDIT: Omit<ProjectPermissions, "loading"> = {
  isOwner: true,
  isSystemAdmin: false,
  isDemoProject: false,
  isClient: false,
  isPlanningContributor: false,
  roleType: null,
  customerView: "view",
  overview: "edit",
  timeline: "edit",
  tasks: "edit",
  tasksScope: "all",
  spacePlanner: "edit",
  purchases: "edit",
  purchasesScope: "all",
  budget: "edit",
  files: "edit",
  teams: "invite",
  timeTracking: "edit",
};

// View-only permissions for demo project (non-admin users)
// Note: budget is "edit" to showcase full features in demo
const DEMO_VIEW_ONLY: Omit<ProjectPermissions, "loading"> = {
  isOwner: false,
  isSystemAdmin: false,
  isDemoProject: true,
  isClient: false,
  isPlanningContributor: false,
  roleType: null,
  customerView: "none",
  overview: "view",
  timeline: "view",
  tasks: "view",
  tasksScope: "all",
  spacePlanner: "view",
  purchases: "view",
  purchasesScope: "all",
  budget: "edit",
  files: "view",
  teams: "none",
  timeTracking: "view",
};

const ALL_NONE: Omit<ProjectPermissions, "loading"> = {
  isOwner: false,
  isSystemAdmin: false,
  isDemoProject: false,
  isClient: false,
  isPlanningContributor: false,
  roleType: null,
  customerView: "none",
  overview: "none",
  timeline: "none",
  tasks: "none",
  tasksScope: "all",
  spacePlanner: "none",
  purchases: "none",
  purchasesScope: "all",
  budget: "none",
  files: "none",
  teams: "none",
  timeTracking: "none",
};

export function useProjectPermissions(projectId: string | undefined): ProjectPermissions {
  const { user } = useAuthSession();
  const [perms, setPerms] = useState<Omit<ProjectPermissions, "loading">>(ALL_NONE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Handle public demo project for anonymous users
    if (!user && projectId === PUBLIC_DEMO_PROJECT_ID) {
      setPerms(DEMO_VIEW_ONLY);
      setLoading(false);
      return;
    }

    if (!user || !projectId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchPermissions = async () => {
      setLoading(true);

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, is_system_admin")
        .eq("user_id", user.id)
        .single();

      if (!profile || cancelled) {
        setLoading(false);
        return;
      }

      const isAdmin = (profile as { id: string; is_system_admin?: boolean }).is_system_admin === true;

      const { data: project } = await supabase
        .from("projects")
        .select("owner_id, project_type")
        .eq("id", projectId)
        .single();

      if (!project || cancelled) {
        setLoading(false);
        return;
      }

      const isDemo = isDemoProject(project.project_type);

      // System admin gets full access everywhere
      if (isAdmin) {
        setPerms({ ...ALL_EDIT, isSystemAdmin: true, isDemoProject: isDemo });
        setLoading(false);
        return;
      }

      // Owner gets full access
      if (project.owner_id === profile.id) {
        setPerms({ ...ALL_EDIT, isSystemAdmin: false, isDemoProject: isDemo });
        setLoading(false);
        return;
      }

      // Check for project_shares (works for both demo and regular projects)
      const { data: share } = await supabase
        .from("project_shares")
        .select("role, role_type, customer_view_access, overview_access, timeline_access, tasks_access, tasks_scope, space_planner_access, purchases_access, purchases_scope, budget_access, files_access, teams_access, time_tracking_access")
        .eq("project_id", projectId)
        .eq("shared_with_user_id", profile.id)
        .maybeSingle();

      if (cancelled) return;

      if (share) {
        const shareRoleType = (share as Record<string, unknown>).role_type as string | null;

        // Co-owner gets full access (same as project owner)
        if (shareRoleType === "co_owner") {
          setPerms({ ...ALL_EDIT, isSystemAdmin: false, isDemoProject: isDemo });
          setLoading(false);
          return;
        }

        // Other roles - use their share permissions
        // Clients always get customer view access even if not explicitly set in DB
        const customerView = share.customer_view_access || (shareRoleType === "client" ? "view" : "none");
        setPerms({
          isOwner: false,
          isSystemAdmin: false,
          isDemoProject: isDemo,
          isClient: customerView !== "none",
          isPlanningContributor: shareRoleType === "planning_contributor",
          roleType: shareRoleType || null,
          customerView,
          overview: share.overview_access || "none",
          timeline: share.timeline_access || "none",
          tasks: share.tasks_access || "none",
          tasksScope: share.tasks_scope || "all",
          spacePlanner: share.space_planner_access || "none",
          purchases: share.purchases_access || "none",
          purchasesScope: share.purchases_scope || "all",
          budget: share.budget_access || "none",
          files: share.files_access || "none",
          teams: share.teams_access || "none",
          timeTracking: (share as Record<string, unknown>).time_tracking_access as string || "none",
        });
      } else if (isDemo) {
        // Demo project without invite - view only
        setPerms(DEMO_VIEW_ONLY);
      } else {
        // Regular project without invite - no access
        setPerms(ALL_NONE);
      }

      setLoading(false);
    };

    fetchPermissions();

    return () => {
      cancelled = true;
    };
  }, [user, projectId]);

  return useMemo(() => ({ ...perms, loading }), [perms, loading]);
}
