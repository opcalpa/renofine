import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay } from "date-fns";

export interface ActiveTask {
  id: string;
  title: string;
  status: string;
  assigneeName: string | null;
}

export interface Milestone {
  id: string;
  title: string;
  date: string;
  color: string | null;
}

export interface SitePhoto {
  id: string;
  url: string;
  caption: string | null;
}

export interface ClientViewData {
  milestones: Milestone[];
  activeTasks: ActiveTask[];
  recentPhotos: SitePhoto[];
  loading: boolean;
}

export function useClientViewData(projectId: string): ClientViewData {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([]);
  const [recentPhotos, setRecentPhotos] = useState<SitePhoto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const today = startOfDay(new Date()).toISOString().slice(0, 10);

    async function fetchAll() {
      setLoading(true);

      const [milestonesRes, tasksRes, photosRes] = await Promise.all([
        supabase
          .from("milestones")
          .select("id, title, date, color")
          .eq("project_id", projectId)
          .order("date"),

        supabase
          .from("tasks")
          .select("id, title, status, assigned_to_stakeholder_id, stakeholder:profiles!tasks_assigned_to_stakeholder_id_fkey(name)")
          .eq("project_id", projectId)
          .is("deleted_at", null)
          .in("status", ["in_progress", "to_do"])
          .order("start_date", { ascending: true, nullsFirst: false })
          .limit(5),

        // Site photos: exclude inspiration sources (pinterest, url) — show actual project photos
        supabase
          .from("rooms")
          .select("id")
          .eq("project_id", projectId)
          .then(async ({ data: rooms }) => {
            if (!rooms?.length) return { data: [] as SitePhoto[], error: null };
            const roomIds = rooms.map((r) => r.id);
            const { data: photos, error } = await supabase
              .from("photos")
              .select("id, url, caption, source")
              .eq("linked_to_type", "room")
              .in("linked_to_id", roomIds)
              .order("created_at", { ascending: false })
              .limit(20);
            // Filter out inspiration sources client-side
            const sitePhotos = (photos || [])
              .filter((p) => !["pinterest", "url"].includes(p.source || ""))
              .slice(0, 4);
            return { data: sitePhotos, error };
          }),
      ]);

      if (cancelled) return;

      if (milestonesRes.data) setMilestones(milestonesRes.data);

      if (tasksRes.data) {
        setActiveTasks(
          (tasksRes.data as Array<Record<string, unknown>>).map((t) => ({
            id: t.id as string,
            title: t.title as string,
            status: t.status as string,
            assigneeName: (t.stakeholder as { name: string } | null)?.name || null,
          }))
        );
      }

      if (photosRes.data) setRecentPhotos(photosRes.data);

      setLoading(false);
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [projectId]);

  return { milestones, activeTasks, recentPhotos, loading };
}
