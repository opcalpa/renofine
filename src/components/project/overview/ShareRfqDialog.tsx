import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Send, Mail, Download, CheckCircle2, Loader2, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RfqTask {
  id: string;
  title: string;
  description: string | null;
  room_names: string[];
}

interface RfqRoom {
  name: string;
  area_sqm: number | null;
}

interface ShareRfqDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName?: string;
  projectAddress?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ShareRfqDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  projectAddress,
}: ShareRfqDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<RfqTask[]>([]);
  const [rooms, setRooms] = useState<RfqRoom[]>([]);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) {
      setSent(false);
      setEmail("");
      setMessage("");
      return;
    }
    const fetchData = async () => {
      const [{ data: taskData }, { data: roomData }] = await Promise.all([
        supabase
          .from("tasks")
          .select("id, title, description, room_id, room_ids")
          .eq("project_id", projectId)
          .order("created_at", { ascending: true }),
        supabase
          .from("rooms")
          .select("id, name, dimensions")
          .eq("project_id", projectId)
          .order("created_at", { ascending: true }),
      ]);

      const roomMap = new Map<string, string>();
      if (roomData) {
        for (const r of roomData) roomMap.set(r.id, r.name);
      }

      if (taskData) {
        setTasks(
          taskData.map((task) => {
            const ids = (task.room_ids as string[] | null) ?? (task.room_id ? [task.room_id] : []);
            return {
              id: task.id,
              title: task.title,
              description: task.description,
              room_names: ids.map((id) => roomMap.get(id)).filter(Boolean) as string[],
            };
          })
        );
      }
      if (roomData) {
        setRooms(
          roomData.map((r) => ({
            name: r.name,
            area_sqm: (r.dimensions as Record<string, unknown>)?.area_sqm as number | null ?? null,
          }))
        );
      }
    };
    fetchData();
  }, [open, projectId]);

  const handleInvite = async () => {
    if (!email.trim()) return;
    setSending(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!profile) throw new Error("Profile not found");

      const rfqPerms = {
        role_type: "rfq_builder",
        timeline_access: "view",
        tasks_access: "edit",
        tasks_scope: "all",
        overview_access: "view",
        budget_access: "edit",
        files_access: "view",
        space_planner_access: "view",
        purchases_access: "none",
        teams_access: "none",
      };

      const { data: invitationData, error } = await supabase
        .from("project_invitations")
        .insert({
          project_id: projectId,
          invited_by_user_id: profile.id,
          email: email.trim().toLowerCase(),
          role: "editor",
          contractor_role: "general_contractor",
          delivery_method: "email",
          status: "pending",
          ...rfqPerms,
          permissions_snapshot: {
            ...rfqPerms,
            message: message || null,
          },
        } as Record<string, unknown>)
        .select()
        .single();

      if (error) throw error;

      // Send email via Edge Function
      try {
        await supabase.functions.invoke("send-project-invitation", {
          body: { invitationId: invitationData.id },
        });
      } catch (sendErr) {
        console.error("Email send failed:", sendErr);
      }

      setSent(true);
      toast({ description: t("shareRfq.inviteSent", "Invitation sent!") });
    } catch {
      toast({ variant: "destructive", description: t("common.errorSaving", "Could not send invitation") });
    }
    setSending(false);
  };

  const totalArea = rooms.reduce((sum, r) => sum + (r.area_sqm ?? 0), 0);

  const handleDownloadPdf = useCallback(() => {
    const title = projectName || t("common.project", "Project");
    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>${title} — ${t("shareRfq.title")}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,system-ui,sans-serif;color:#1a1a1a;padding:40px;max-width:700px;margin:auto;font-size:13px;line-height:1.5}
  h1{font-size:20px;font-weight:600;margin-bottom:2px}
  .addr{color:#666;font-size:13px;margin-bottom:24px}
  h2{font-size:14px;font-weight:600;color:#444;text-transform:uppercase;letter-spacing:.5px;margin:20px 0 8px;padding-bottom:4px;border-bottom:1px solid #e5e5e5}
  .task{margin-bottom:10px}
  .task-title{font-weight:500;font-size:13px}
  .task-desc{color:#666;font-size:12px;margin-top:1px}
  .task-rooms{color:#888;font-size:11px;margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;font-weight:500;color:#666;padding:6px 12px 6px 0;border-bottom:1px solid #e5e5e5}
  td{padding:5px 12px 5px 0;border-bottom:1px solid #f0f0f0}
  .total{font-weight:500;color:#444}
  .footer{margin-top:32px;padding-top:12px;border-top:1px solid #e5e5e5;color:#999;font-size:11px}
  @media print{body{padding:20px}}
</style></head><body>
<h1>${title}</h1>
${projectAddress ? `<p class="addr">${projectAddress}</p>` : ""}
<h2>${t("shareRfq.scopeOfWork", "Scope of work")} (${tasks.length})</h2>
${tasks.map((task) => `<div class="task">
  <div class="task-title">${task.title}</div>
  ${task.description ? `<div class="task-desc">${task.description}</div>` : ""}
  ${task.room_names.length ? `<div class="task-rooms">${task.room_names.join(", ")}</div>` : ""}
</div>`).join("")}
${rooms.length ? `
<h2>${t("shareRfq.rooms", "Rooms")} (${rooms.length})</h2>
<table>
  <thead><tr><th>${t("common.name", "Name")}</th><th>${t("homeownerPlanning.area", "Area")}</th></tr></thead>
  <tbody>
    ${rooms.map((r) => `<tr><td>${r.name}</td><td>${r.area_sqm ? r.area_sqm + " m²" : "—"}</td></tr>`).join("")}
    <tr><td class="total">${t("common.total", "Total")}</td><td class="total">${totalArea ? totalArea + " m²" : "—"}</td></tr>
  </tbody>
</table>` : ""}
<div class="footer">${t("shareRfq.generatedBy", "Generated by Renofine")} — ${new Date().toLocaleDateString()}</div>
</body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (w) {
      w.onload = () => {
        w.print();
        URL.revokeObjectURL(url);
      };
    }
  }, [tasks, rooms, totalArea, projectName, projectAddress, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="4xl" className="!max-h-[88vh] overflow-y-auto !p-0">
        {/* Header */}
        <div className="px-5 pt-6 pb-0 md:px-8 md:pt-8">
          <DialogTitle className="text-xl font-semibold">
            {t("homeownerPlanning.requestQuote", "Request quote")}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            {t("shareRfq.description", "Share your renovation plan with builders to receive quotes.")}
          </DialogDescription>
        </div>

        <div className="grid gap-6 md:gap-8 md:grid-cols-[3fr,2fr] px-5 py-5 md:px-8 md:py-6">
          {/* ── Left: RFQ Preview ── */}
          <div className="rounded-xl border bg-muted/20 p-6 space-y-5 min-w-0">
            {/* Project header */}
            <div>
              <p className="font-semibold text-lg leading-tight">{projectName || t("common.project", "Project")}</p>
              {projectAddress && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {projectAddress}
                </p>
              )}
            </div>

            <Separator />

            {/* Tasks */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                {t("shareRfq.scopeOfWork", "Scope of work")} ({tasks.length})
              </p>
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  {t("shareRfq.noTasks", "No tasks added yet")}
                </p>
              ) : (
                <div className="space-y-3">
                  {tasks.map((task, i) => (
                    <div key={task.id} className="flex gap-3">
                      <span className="text-sm text-muted-foreground/40 w-5 shrink-0 text-right pt-px tabular-nums">{i + 1}.</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug">{task.title}</p>
                        {task.description && (
                          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
                        )}
                        {task.room_names.length > 0 && (
                          <p className="text-xs text-muted-foreground/60 mt-1">
                            {task.room_names.join(", ")}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Rooms */}
            {rooms.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {t("shareRfq.rooms", "Rooms")} ({rooms.length})
                  </p>
                  <div className="space-y-1.5">
                    {rooms.map((room, i) => (
                      <div key={i} className="flex items-baseline justify-between text-sm py-1">
                        <span className="truncate">{room.name}</span>
                        <span className="text-sm text-muted-foreground ml-3 tabular-nums shrink-0">
                          {room.area_sqm ? `${room.area_sqm} m²` : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                  {totalArea > 0 && (
                    <div className="flex items-baseline justify-between text-sm pt-2 border-t">
                      <span className="font-medium">{t("common.total", "Total")}</span>
                      <span className="font-medium tabular-nums">{totalArea} m²</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── Right: Invite / Success ── */}
          <div className="flex flex-col min-w-0">
            {sent ? (
              <div className="flex flex-col items-center justify-center gap-4 flex-1 text-center py-8">
                <CheckCircle2 className="h-12 w-12 text-green-600" />
                <div>
                  <p className="text-base font-semibold">
                    {t("shareRfq.sentConfirmation", "Invitation sent to {{email}}", { email })}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2 max-w-[300px] mx-auto">
                    {t("shareRfq.sentDescription", "The builder will receive an email with a link to view your renovation plan and create a quote.")}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => { setSent(false); setEmail(""); }}>
                  {t("shareRfq.inviteAnother", "Invite another builder")}
                </Button>
              </div>
            ) : (
              <div className="space-y-5 flex flex-col flex-1">
                <div className="space-y-1.5">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    {t("shareRfq.inviteBuilder", "Invite a builder")}
                  </Label>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t("shareRfq.inviteDescription", "The builder gets access to your scope and rooms, and can create a quote for you.")}
                  </p>
                </div>
                <div className="space-y-3">
                  <Input
                    type="email"
                    placeholder={t("shareRfq.emailPlaceholder", "builder@company.com")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleInvite(); }}
                    className="h-11"
                  />
                  <Input
                    placeholder={t("shareRfq.messagePlaceholder", "Optional message...")}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="flex flex-col gap-2.5 mt-auto pt-4">
                  <Button
                    onClick={handleInvite}
                    disabled={!email.trim() || sending}
                    className="gap-2 w-full h-11"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {t("shareRfq.sendInvitation", "Send invitation")}
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2 w-full h-11"
                    onClick={handleDownloadPdf}
                    disabled={tasks.length === 0}
                  >
                    <Download className="h-4 w-4" />
                    {t("shareRfq.downloadPdf", "PDF")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
