import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, Check, X, Clock, Pencil, Trash2, Download, Loader2 } from "lucide-react";
import { LogTimeDialog } from "./LogTimeDialog";
import { isTeamV2MaskingEnabled } from "@/lib/featureFlags";
import { getViewerMode, type ViewerMode } from "@/services/projectDataService";

interface TimeTrackingTabProps {
  projectId: string;
  isReadOnly: boolean;
  userType: string;
}

interface TimeEntry {
  id: string;
  task_id: string | null;
  user_id: string;
  date: string;
  hours: number;
  description: string | null;
  hourly_rate: number | null;
  approved: boolean;
  approved_by: string | null;
  created_at: string;
  task_title?: string;
  user_name?: string;
}

interface Task {
  id: string;
  title: string;
  estimated_hours: number | null;
  hourly_rate: number | null;
}

export function TimeTrackingTab({ projectId, isReadOnly, userType }: TimeTrackingTabProps) {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { toast } = useToast();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [defaultRate, setDefaultRate] = useState(0);

  const isHomeowner = userType === "homeowner";
  const [exporting, setExporting] = useState(false);
  // L5: rate-derived costs (own + others') must not show to masked viewers.
  // null = flag off / resolving. Flag off → unchanged (isHomeowner only).
  const [viewerMode, setViewerMode] = useState<ViewerMode | null>(null);
  const economyVisible =
    !isHomeowner && (!isTeamV2MaskingEnabled() || viewerMode === "full");

  const fetchData = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    if (isTeamV2MaskingEnabled()) {
      try { setViewerMode(await getViewerMode(projectId)); } catch { setViewerMode("none"); }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, default_hourly_rate")
      .eq("user_id", user.id)
      .single();

    if (profile) {
      setProfileId(profile.id);
      if ((profile as Record<string, unknown>).default_hourly_rate) {
        setDefaultRate(Number((profile as Record<string, unknown>).default_hourly_rate));
      }
    }

    const [entriesRes, tasksRes] = await Promise.all([
      supabase
        .from("time_entries")
        .select("*")
        .eq("project_id", projectId)
        .order("date", { ascending: false }),
      supabase
        .from("tasks")
        .select("id, title, estimated_hours, hourly_rate")
        .eq("project_id", projectId)
        .order("title"),
    ]);

    const taskMap = new Map((tasksRes.data || []).map((t) => [t.id, t.title]));
    setTasks(tasksRes.data || []);

    // Fetch user names for entries
    const userIds = [...new Set((entriesRes.data || []).map((e) => e.user_id))];
    const { data: profiles } = userIds.length > 0
      ? await supabase.from("profiles").select("id, name").in("id", userIds)
      : { data: [] };
    const nameMap = new Map((profiles || []).map((p) => [p.id, p.name]));

    const enriched: TimeEntry[] = (entriesRes.data || []).map((e) => ({
      ...e,
      task_title: e.task_id ? taskMap.get(e.task_id) || "–" : "–",
      user_name: nameMap.get(e.user_id) || "–",
    }));

    setEntries(enriched);
    setLoading(false);
  }, [user, projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`time_entries_${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "time_entries", filter: `project_id=eq.${projectId}` }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, fetchData]);

  const handleSave = async (entry: { taskId: string | null; date: string; hours: number; description: string; hourlyRate: number | null }) => {
    if (!profileId) return;

    if (editingEntry) {
      const { error } = await supabase
        .from("time_entries")
        .update({ task_id: entry.taskId, date: entry.date, hours: entry.hours, description: entry.description || null, hourly_rate: entry.hourlyRate })
        .eq("id", editingEntry.id);
      if (error) {
        toast({ title: t("common.error"), description: error.message, variant: "destructive" });
        return;
      }
      toast({ description: t("timeTracking.entryUpdated") });
    } else {
      const { error } = await supabase.from("time_entries").insert({
        project_id: projectId,
        task_id: entry.taskId,
        user_id: profileId,
        date: entry.date,
        hours: entry.hours,
        description: entry.description || null,
        hourly_rate: entry.hourlyRate,
      });
      if (error) {
        toast({ title: t("common.error"), description: error.message, variant: "destructive" });
        return;
      }
      toast({ description: t("timeTracking.entryAdded") });
    }
    setEditingEntry(null);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("time_entries").delete().eq("id", id);
    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      return;
    }
    toast({ description: t("timeTracking.entryDeleted") });
    fetchData();
  };

  const handleApprove = async (id: string, approved: boolean) => {
    if (!profileId) return;
    const { error } = await supabase
      .from("time_entries")
      .update({
        approved,
        approved_by: approved ? profileId : null,
        approved_at: approved ? new Date().toISOString() : null,
      })
      .eq("id", id);
    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      return;
    }
    toast({ description: t("timeTracking.entryApproved") });
    fetchData();
  };

  // Summering
  const totalLogged = entries.reduce((sum, e) => sum + Number(e.hours), 0);
  const totalEstimated = tasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
  const progressPct = totalEstimated > 0 ? Math.min(100, Math.round((totalLogged / totalEstimated) * 100)) : 0;
  const totalLoggedCost = entries.reduce((sum, e) => sum + Number(e.hours) * (e.hourly_rate || 0), 0);
  const totalEstimatedCost = tasks.reduce((sum, t) => sum + (t.estimated_hours || 0) * (t.hourly_rate || 0), 0);

  // Group by week
  const weekGroups = new Map<string, TimeEntry[]>();
  for (const entry of entries) {
    const d = new Date(entry.date);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay() + 1);
    const key = weekStart.toISOString().split("T")[0];
    const arr = weekGroups.get(key) || [];
    arr.push(entry);
    weekGroups.set(key, arr);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground"><Clock className="h-5 w-5 animate-spin mr-2" /> {t("common.loading")}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm text-muted-foreground">{t("timeTracking.summary")}</div>
              <div className="text-2xl font-bold tabular-nums">
                {totalLogged}{t("timeTracking.hoursShort")}
                {totalEstimated > 0 && (
                  <span className="text-base font-normal text-muted-foreground ml-2">
                    / {totalEstimated}{t("timeTracking.hoursShort")} {t("timeTracking.totalEstimated").toLowerCase()}
                  </span>
                )}
              </div>
              {economyVisible && totalLoggedCost > 0 && (
                <div className="text-sm text-muted-foreground mt-1 tabular-nums">
                  {Math.round(totalLoggedCost).toLocaleString("sv-SE")} kr
                  {totalEstimatedCost > 0 && (
                    <span> / {Math.round(totalEstimatedCost).toLocaleString("sv-SE")} kr</span>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {!isReadOnly && !isHomeowner && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={exporting || entries.length === 0}
                  onClick={async () => {
                    if (!profileId) return;
                    setExporting(true);
                    try {
                      const { generatePaxmlExport, downloadPaxmlFile } = await import("@/services/paxmlExportService");
                      const now = new Date();
                      const result = await generatePaxmlExport(profileId, now.getFullYear(), now.getMonth() + 1);
                      if (result) {
                        downloadPaxmlFile(result.content, result.filename);
                        toast({
                          title: t("timeTracking.paxmlExported", "Löneunderlag exporterat"),
                          description: t("timeTracking.paxmlExportedDesc", "{{workers}} personer, {{hours}}h, {{amount}} kr", {
                            workers: result.workerCount,
                            hours: result.totalHours.toFixed(1),
                            amount: Math.round(result.totalAmount).toLocaleString("sv-SE"),
                          }),
                        });
                      } else {
                        toast({ title: t("timeTracking.paxmlNoData", "Inga godkända timmar denna månad"), variant: "destructive" });
                      }
                    } catch (err) {
                      console.error("PAXml export failed:", err);
                      toast({ title: t("common.error"), variant: "destructive" });
                    } finally {
                      setExporting(false);
                    }
                  }}
                >
                  {exporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                  {t("timeTracking.exportPayroll", "Löneexport")}
                </Button>
              )}
              {!isReadOnly && (
                <Button onClick={() => { setEditingEntry(null); setDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-1" />
                  {t("timeTracking.logTime")}
                </Button>
              )}
            </div>
          </div>
          {totalEstimated > 0 && (
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Entries list */}
      {entries.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Clock className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="font-medium">{t("timeTracking.noEntries")}</p>
          <p className="text-sm mt-1">{t("timeTracking.noEntriesDescription")}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {[...weekGroups.entries()].map(([weekKey, weekEntries]) => {
            const weekTotal = weekEntries.reduce((s, e) => s + Number(e.hours), 0);
            const weekCost = weekEntries.reduce((s, e) => s + Number(e.hours) * (e.hourly_rate || 0), 0);
            const weekLabel = new Date(weekKey).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });

            return (
              <div key={weekKey}>
                <div className="flex items-center justify-between mb-2 text-xs text-muted-foreground uppercase tracking-wider">
                  <span>v.{getWeekNumber(new Date(weekKey))} · {weekLabel}</span>
                  <span className="tabular-nums font-medium">
                    {weekTotal}{t("timeTracking.hoursShort")}
                    {economyVisible && weekCost > 0 && (
                      <span className="ml-2">{Math.round(weekCost).toLocaleString("sv-SE")} kr</span>
                    )}
                  </span>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  {weekEntries.map((entry, i) => (
                    <div
                      key={entry.id}
                      className={`flex items-center gap-3 px-4 py-3 text-sm ${i > 0 ? "border-t" : ""} ${entry.approved ? "bg-muted/30" : ""}`}
                    >
                      {/* Date */}
                      <div className="w-20 shrink-0 text-muted-foreground tabular-nums">
                        {new Date(entry.date).toLocaleDateString("sv-SE", { day: "numeric", month: "short" })}
                      </div>

                      {/* Task */}
                      <div className="flex-1 min-w-0 truncate">
                        {entry.task_title}
                        {entry.description && (
                          <span className="text-muted-foreground ml-2">— {entry.description}</span>
                        )}
                      </div>

                      {/* Person */}
                      <div className="w-24 shrink-0 text-muted-foreground truncate">
                        {entry.user_name}
                      </div>

                      {/* Hours + cost */}
                      <div className="w-20 shrink-0 text-right tabular-nums">
                        <div className="font-medium">{Number(entry.hours)}{t("timeTracking.hoursShort")}</div>
                        {economyVisible && entry.hourly_rate && (
                          <div className="text-xs text-muted-foreground">
                            {Math.round(Number(entry.hours) * entry.hourly_rate).toLocaleString("sv-SE")} kr
                          </div>
                        )}
                      </div>

                      {/* Status + actions */}
                      <div className="w-24 shrink-0 flex items-center justify-end gap-1">
                        {entry.approved ? (
                          <span className="text-xs text-primary flex items-center gap-1">
                            <Check className="h-3 w-3" />
                            {t("timeTracking.approved")}
                          </span>
                        ) : !isReadOnly && !isHomeowner ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => handleApprove(entry.id, true)}
                          >
                            {t("timeTracking.approve")}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t("timeTracking.pending")}</span>
                        )}
                      </div>

                      {/* Edit/Delete (only own entries, not readonly) */}
                      {!isReadOnly && entry.user_id === profileId && !entry.approved && (
                        <div className="flex items-center gap-0.5">
                          <button
                            className="h-6 w-6 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setEditingEntry(entry);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            className="h-6 w-6 rounded hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(entry.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <LogTimeDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingEntry(null); }}
        tasks={tasks}
        defaultRate={defaultRate}
        onSave={handleSave}
        initial={editingEntry ? {
          taskId: editingEntry.task_id,
          date: editingEntry.date,
          hours: Number(editingEntry.hours),
          description: editingEntry.description || "",
        } : undefined}
      />
    </div>
  );
}

function getWeekNumber(d: Date): number {
  const onejan = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - onejan.getTime()) / 86400000);
  return Math.ceil((days + onejan.getDay() + 1) / 7);
}
