/**
 * useProjectsData — data fetching hook for the Projects/Start page.
 * Handles authenticated, guest, and admin project loading + financials.
 */

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useGuestMode } from "@/hooks/useGuestMode";
import { getGuestProjects } from "@/services/guestStorageService";

export interface ProjectItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  project_type?: string | null;
  owner_id?: string | null;
  cover_image_url?: string | null;
}

interface ProjectFinancials {
  budget: number;
  profit: number;
  tasksDone: number;
  tasksTotal: number;
  spentAmount: number;
}

export interface ProjectsDataResult {
  profile: Record<string, unknown> | null;
  projects: ProjectItem[];
  sharedProjectIds: Set<string>;
  ownerNames: Record<string, string>;
  projectFinancials: Record<string, ProjectFinancials>;
  loading: boolean;
  authLoading: boolean;
  isGuest: boolean;
  needsWelcomeModal: boolean;
  refetch: () => void;
}

export function useProjectsData(): ProjectsDataResult {
  const { user, loading: authLoading } = useAuthSession();
  const { isGuest, refreshStorageUsage } = useGuestMode();

  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [sharedProjectIds, setSharedProjectIds] = useState<Set<string>>(new Set());
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const [projectFinancials, setProjectFinancials] = useState<Record<string, ProjectFinancials>>({});
  const [loading, setLoading] = useState(true);
  const [needsWelcomeModal, setNeedsWelcomeModal] = useState(false);

  const fetchGuestProjects = useCallback(() => {
    try {
      const guestProjects = getGuestProjects();
      setProjects(guestProjects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        status: p.status,
        created_at: p.created_at,
        address: p.address,
        postal_code: p.postal_code,
        city: p.city,
        project_type: p.project_type,
        owner_id: null,
      })));
      refreshStorageUsage();
    } catch (error) {
      console.error("Error loading guest projects:", error);
    } finally {
      setLoading(false);
    }
  }, [refreshStorageUsage]);

  const fetchProfile = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user?.id)
        .single();
      setProfile(data);
      if (data && !data.onboarding_welcome_completed) {
        setNeedsWelcomeModal(true);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  }, [user?.id]);

  const fetchProjectFinancials = useCallback(async (projectIds: string[], laborCostPercent: number) => {
    if (projectIds.length === 0) return;
    const { data: tasks } = await supabase
      .from("tasks")
      .select("project_id, status, budget, estimated_hours, hourly_rate, labor_cost_percent, subcontractor_cost, markup_percent, material_estimate, material_markup_percent")
      .in("project_id", projectIds);

    if (!tasks) return;

    const financials: Record<string, ProjectFinancials> = {};
    for (const task of tasks) {
      if (!financials[task.project_id]) financials[task.project_id] = { budget: 0, profit: 0, tasksDone: 0, tasksTotal: 0, spentAmount: 0 };
      const fin = financials[task.project_id];
      fin.budget += task.budget || 0;
      fin.tasksTotal++;
      if (task.status === "done") fin.tasksDone++;
      const laborTotal = (task.estimated_hours || 0) * (task.hourly_rate || 0);
      const costPct = task.labor_cost_percent ?? laborCostPercent;
      const laborProfit = laborTotal * (1 - costPct / 100);
      const ueProfit = (task.subcontractor_cost || 0) * (task.markup_percent || 0) / 100;
      const matProfit = (task.material_estimate || 0) * (task.material_markup_percent || 0) / 100;
      fin.profit += laborProfit + ueProfit + matProfit;
    }

    // Fetch spent amounts from projects table
    const { data: projectData } = await supabase
      .from("projects")
      .select("id, spent_amount")
      .in("id", projectIds);
    if (projectData) {
      for (const p of projectData) {
        if (financials[p.id]) financials[p.id].spentAmount = p.spent_amount || 0;
      }
    }

    setProjectFinancials(financials);
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("id, default_labor_cost_percent")
        .eq("user_id", currentUser.id)
        .single();
      if (!prof) return;

      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;

      setProjects(data || []);

      const { data: shares } = await supabase
        .from("project_shares")
        .select("project_id")
        .eq("shared_with_user_id", prof.id);
      if (shares) {
        setSharedProjectIds(new Set(shares.map((s: { project_id: string }) => s.project_id)));
      }

      const uniqueOwnerIds = [...new Set((data || []).map((p: ProjectItem) => p.owner_id).filter(Boolean))] as string[];
      if (uniqueOwnerIds.length > 0) {
        const { data: owners } = await supabase
          .from("profiles")
          .select("id, name")
          .in("id", uniqueOwnerIds);
        if (owners) {
          const map: Record<string, string> = {};
          for (const o of owners) map[o.id] = o.name || "";
          setOwnerNames(map);
        }
      }

      const laborCostPct = (prof as { default_labor_cost_percent?: number | null })?.default_labor_cost_percent ?? 50;
      fetchProjectFinancials((data || []).map((p: ProjectItem) => p.id), laborCostPct);
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setLoading(false);
    }
  }, [fetchProjectFinancials]);

  useEffect(() => {
    if (authLoading) return;
    if (isGuest) {
      fetchGuestProjects();
      if (!localStorage.getItem("guest_onboarding_completed")) {
        setNeedsWelcomeModal(true);
      }
    } else if (user) {
      fetchProfile();
      fetchProjects();
    }
  }, [user, authLoading, isGuest, fetchGuestProjects, fetchProfile, fetchProjects]);

  const refetch = useCallback(() => {
    if (isGuest) fetchGuestProjects();
    else fetchProjects();
  }, [isGuest, fetchGuestProjects, fetchProjects]);

  return {
    profile,
    projects,
    sharedProjectIds,
    ownerNames,
    projectFinancials,
    loading,
    authLoading,
    isGuest,
    needsWelcomeModal,
    refetch,
  };
}
