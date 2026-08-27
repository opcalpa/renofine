import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HardHat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { WorkerComposer, type ComposerTask } from "@/components/worker/WorkerComposer";

interface Props {
  projectId: string;
  /** Only members who may change the project get to report on it. */
  enabled: boolean;
}

/**
 * "Från bygget" — the owner's own two taps.
 *
 * The field composer used to be reachable only through a worker link, so the
 * person paying for the app got the worse tool: an eight-tap dialog for hours
 * their own painter reported by holding a microphone. In a two-to-five person
 * firm the owner is ON the site, which makes that backwards.
 *
 * Same component, same server, same receipt — the difference is that hours land
 * on their profile (what payroll reads) instead of on a token, and the owner's
 * own hours arrive approved because nobody queues up to approve themselves.
 */
export function SiteReportCard({ projectId, enabled }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: tasks = [] } = useQuery({
    queryKey: ["site-report-tasks", projectId],
    enabled,
    queryFn: async (): Promise<ComposerTask[]> => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title")
        .eq("project_id", projectId)
        .in("status", ["planned", "to_do", "waiting", "in_progress"])
        .order("created_at");
      if (error) {
        console.error("Failed to load tasks for site report:", error);
        return [];
      }
      return (data ?? []).map((row) => ({ id: row.id, title: row.title }));
    },
  });

  if (!enabled) return null;

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <HardHat className="h-4 w-4" />
        {t("field.fromSite", "Från bygget")}
      </h3>
      <WorkerComposer
        projectId={projectId}
        tasks={tasks}
        canCreatePurchases
        onSent={() => {
          // The report may have moved a task, logged hours or asked for
          // material — everything the page shows can be stale a second later.
          queryClient.invalidateQueries({ queryKey: ["field-inbox", projectId] });
          queryClient.invalidateQueries({ queryKey: ["site-report-tasks", projectId] });
          queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
        }}
      />
    </section>
  );
}
