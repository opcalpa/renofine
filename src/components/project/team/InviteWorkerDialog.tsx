import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, Check, Send, MessageSquare, Mail } from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LANGUAGES = [
  { code: "sv", name: "Svenska", flag: "\u{1F1F8}\u{1F1EA}" },
  { code: "en", name: "English", flag: "\u{1F1EC}\u{1F1E7}" },
  { code: "uk", name: "\u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430", flag: "\u{1F1FA}\u{1F1E6}" },
  { code: "pl", name: "Polski", flag: "\u{1F1F5}\u{1F1F1}" },
  { code: "ro", name: "Rom\u00E2n\u0103", flag: "\u{1F1F7}\u{1F1F4}" },
  { code: "lt", name: "Lietuvi\u0173", flag: "\u{1F1F1}\u{1F1F9}" },
  { code: "et", name: "Eesti", flag: "\u{1F1EA}\u{1F1EA}" },
  { code: "de", name: "Deutsch", flag: "\u{1F1E9}\u{1F1EA}" },
  { code: "fr", name: "Fran\u00E7ais", flag: "\u{1F1EB}\u{1F1F7}" },
  { code: "es", name: "Espa\u00F1ol", flag: "\u{1F1EA}\u{1F1F8}" },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaskOption {
  id: string;
  title: string;
  roomName: string | null;
  hasChecklist: boolean;
  hasRoom: boolean;
}

interface InviteWorkerDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InviteWorkerDialog({
  projectId,
  open,
  onOpenChange,
  onCreated,
}: InviteWorkerDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState("sv");
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [canCreatePurchases, setCanCreatePurchases] = useState(true);
  const [canLogReceipts, setCanLogReceipts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [generatedTokenId, setGeneratedTokenId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const [smsSent, setSmsSent] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [generatingChecklists, setGeneratingChecklists] = useState(false);

  const hasContactMethod = phone.trim() || email.trim();

  // Load project tasks
  useEffect(() => {
    if (!open) return;
    loadTasks();
    // Reset on open
    setName("");
    setPhone("");
    setEmail("");
    setLanguage("sv");
    setSelectedTaskIds([]);
    setCanCreatePurchases(true);
    setCanLogReceipts(false);
    setGeneratedLink(null);
  }, [open]);

  const loadTasks = async () => {
    const { data } = await supabase
      .from("tasks")
      .select("id, title, room_id, checklists")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (!data) return;

    // Fetch room names
    const roomIds = [...new Set(data.map((t) => t.room_id).filter(Boolean))];
    let roomMap: Record<string, string> = {};
    if (roomIds.length > 0) {
      const { data: rooms } = await supabase
        .from("rooms")
        .select("id, name")
        .in("id", roomIds);
      for (const r of rooms || []) {
        roomMap[r.id] = r.name;
      }
    }

    setTasks(
      data.map((t) => {
        const checklists = t.checklists as Array<{ items?: unknown[] }> | null;
        const hasItems = (checklists || []).some((cl) => (cl.items?.length || 0) > 0);
        return {
          id: t.id,
          title: t.title,
          roomName: t.room_id ? roomMap[t.room_id] || null : null,
          hasChecklist: hasItems,
          hasRoom: !!t.room_id,
        };
      })
    );
  };

  const toggleTask = (taskId: string) => {
    setSelectedTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || selectedTaskIds.length === 0) return;

    setSaving(true);
    try {
      // Get current user profile id
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!profile) throw new Error("Profile not found");

      const { data: tokenRecord, error } = await supabase
        .from("worker_access_tokens")
        .insert({
          project_id: projectId,
          created_by_user_id: profile.id,
          worker_name: name.trim(),
          worker_phone: phone.trim() || null,
          worker_email: email.trim() || null,
          worker_language: language,
          assigned_task_ids: selectedTaskIds,
          can_create_purchases: canCreatePurchases,
          can_log_receipts: canLogReceipts,
        })
        .select("id, token")
        .single();

      if (error) throw error;

      // Use production URL for shareable links — localhost doesn't work from WhatsApp/SMS
      const appOrigin = window.location.hostname === "localhost"
        ? "https://app.renofine.com"
        : window.location.origin;
      const link = `${appOrigin}/w/${tokenRecord.token}`;
      setGeneratedTokenId(tokenRecord.id);
      setGeneratedLink(link);

      // Trigger translation in background (best-effort, don't block)
      if (language !== "en" && language !== "sv") {
        supabase.functions
          .invoke("translate-task-content", {
            body: { taskIds: selectedTaskIds, targetLanguage: language },
          })
          .catch((err) => {
            console.error("Translation trigger failed:", err);
          });
      }

      toast({
        title: t("teamWorker.workerInvited", "Worker invited"),
        description: t("teamWorker.linkCreated", "Link created. Share it with the worker."),
      });

      onCreated?.();
    } catch (err) {
      console.error("Failed to create worker token:", err);
      toast({
        title: t("common.error", "Error"),
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCopyLink = async () => {
    if (!generatedLink) return;
    await navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    toast({ description: t("teamWorker.linkCopied", "Link copied to clipboard") });
    setTimeout(() => setCopied(false), 2000);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("teamWorker.inviteWorker", "Invite Worker")}</DialogTitle>
          <DialogDescription>
            {t(
              "teamWorker.inviteWorkerDescription",
              "Create a link with work instructions for a subcontractor. Add phone, email, or both to send the invitation."
            )}
          </DialogDescription>
        </DialogHeader>

        {generatedLink ? (
          // Success view — show link
          <div className="space-y-4 py-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">
                {t("teamWorker.copyLink", "Copy link")}
              </p>
              <p className="text-sm font-mono break-all select-all">{generatedLink}</p>
            </div>
            <Button className="w-full gap-2" onClick={handleCopyLink}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied
                ? t("teamWorker.linkCopied", "Link copied")
                : t("teamWorker.copyLink", "Copy link")}
            </Button>

            {/* SMS button (if phone provided) */}
            {phone.trim() && generatedTokenId && (
              <Button
                variant="outline"
                className="w-full gap-2"
                disabled={smsSending || smsSent}
                onClick={async () => {
                  setSmsSending(true);
                  try {
                    const { data } = await supabase.functions.invoke("send-worker-sms", {
                      body: { tokenId: generatedTokenId },
                    });
                    if (data?.sent) {
                      setSmsSent(true);
                      toast({ description: `SMS sent to ${phone}` });
                    } else {
                      // SMS not configured — open WhatsApp as fallback
                      const waUrl = `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(data?.message || generatedLink || "")}`;
                      window.open(waUrl, "_blank");
                    }
                  } catch (err) {
                    console.error("SMS failed:", err);
                  } finally {
                    setSmsSending(false);
                  }
                }}
              >
                {smsSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : smsSent ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {smsSent
                  ? t("worker.smsSent", "SMS sent")
                  : t("worker.sendSms", "Send SMS")}
              </Button>
            )}

            {/* Email send */}
            {email.trim() && generatedTokenId && (
              <Button
                variant="outline"
                className="w-full gap-2"
                disabled={emailSending || emailSent}
                onClick={async () => {
                  setEmailSending(true);
                  try {
                    const { data } = await supabase.functions.invoke("send-worker-email", {
                      body: { tokenId: generatedTokenId },
                    });
                    if (data?.sent) {
                      setEmailSent(true);
                      toast({ description: t("worker.emailSent", "Email sent to {{email}}", { email }) });
                    } else {
                      // Edge function not deployed — open mailto as fallback
                      const subject = encodeURIComponent(t("worker.emailSubject", "Your work instructions"));
                      const body = encodeURIComponent(generatedLink || "");
                      window.open(`mailto:${email}?subject=${subject}&body=${body}`, "_blank");
                    }
                  } catch {
                    // Fallback to mailto
                    const subject = encodeURIComponent(t("worker.emailSubject", "Your work instructions"));
                    const body = encodeURIComponent(generatedLink || "");
                    window.open(`mailto:${email}?subject=${subject}&body=${body}`, "_blank");
                  } finally {
                    setEmailSending(false);
                  }
                }}
              >
                {emailSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : emailSent ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                {emailSent
                  ? t("worker.emailSent", "Email sent")
                  : t("worker.sendEmail", "Send email")}
              </Button>
            )}

            {/* WhatsApp share */}
            {phone.trim() && (
              <Button
                variant="ghost"
                className="w-full gap-2 text-muted-foreground"
                onClick={() => {
                  const waUrl = `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(generatedLink || "")}`;
                  window.open(waUrl, "_blank");
                }}
              >
                <MessageSquare className="h-4 w-4" />
                {t("worker.shareViaWhatsApp", "Share via WhatsApp")}
              </Button>
            )}

            <Button
              variant="outline"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              {t("common.close", "Close")}
            </Button>
          </div>
        ) : (
          // Form view
          <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto flex-1 pr-1">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="worker-name">
                {t("teamWorker.workerName", "Worker name")} *
              </Label>
              <Input
                id="worker-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dmytro"
                required
              />
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="worker-phone">
                {t("teamWorker.workerPhone", "Phone number")}
              </Label>
              <Input
                id="worker-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+380 ..."
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="worker-email">
                {t("teamWorker.workerEmail", "Email")}
              </Label>
              <Input
                id="worker-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>

            {/* Language */}
            <div className="space-y-2">
              <Label>{t("teamWorker.workerLanguage", "Language")}</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.flag} {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Assign tasks */}
            <div className="space-y-2">
              <Label>
                {t("teamWorker.assignTasks", "Assign tasks")} *
              </Label>
              <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                {tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-3">
                    {t("tasks.noTasks", "No tasks")}
                  </p>
                ) : (
                  tasks.map((task) => (
                    <label
                      key={task.id}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedTaskIds.includes(task.id)}
                        onCheckedChange={() => toggleTask(task.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{task.title}</p>
                        {task.roomName && (
                          <p className="text-xs text-muted-foreground truncate">
                            {task.roomName}
                          </p>
                        )}
                      </div>
                    </label>
                  ))
                )}
              </div>
              {selectedTaskIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("teamWorker.tasksAssigned", "{{count}} tasks", {
                    count: selectedTaskIds.length,
                  })}
                </p>
              )}
            </div>

            {/* Auto-generate checklists hint */}
            {(() => {
              const selectedTasks = tasks.filter((t) => selectedTaskIds.includes(t.id));
              const missingChecklist = selectedTasks.filter((t) => !t.hasChecklist && t.hasRoom);
              if (missingChecklist.length === 0) return null;
              return (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg space-y-2">
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    {t(
                      "teamWorker.missingChecklists",
                      "{{count}} tasks have no step-by-step instructions. Generate them automatically from room specs?",
                      { count: missingChecklist.length }
                    )}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={generatingChecklists}
                    onClick={async () => {
                      setGeneratingChecklists(true);
                      try {
                        for (const task of missingChecklist) {
                          // Fetch task with room_id and description
                          const { data: taskData } = await supabase
                            .from("tasks")
                            .select("room_id, description")
                            .eq("id", task.id)
                            .single();

                          if (!taskData?.room_id) continue;

                          // Fetch room specs
                          const { data: room } = await supabase
                            .from("rooms")
                            .select("name, wall_spec, floor_spec, ceiling_spec, joinery_spec, dimensions")
                            .eq("id", taskData.room_id)
                            .single();

                          if (!room) continue;

                          const { data: result } = await supabase.functions.invoke("generate-work-checklist", {
                            body: {
                              taskTitle: task.title,
                              taskDescription: taskData.description,
                              roomName: room.name,
                              wallSpec: room.wall_spec,
                              floorSpec: room.floor_spec,
                              ceilingSpec: room.ceiling_spec,
                              joinerySpec: room.joinery_spec,
                              dimensions: room.dimensions,
                            },
                          });

                          if (result?.checklist) {
                            await supabase
                              .from("tasks")
                              .update({ checklists: [result.checklist] })
                              .eq("id", task.id);
                          }
                        }
                        // Reload tasks to update hasChecklist
                        loadTasks();
                        toast({ description: t("tasks.checklistGenerated", "Checklists generated") });
                      } catch (err) {
                        console.error("Auto-generate failed:", err);
                      } finally {
                        setGeneratingChecklists(false);
                      }
                    }}
                  >
                    {generatingChecklists ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <span className="mr-1">✨</span>
                    )}
                    {t("teamWorker.generateChecklists", "Generate checklists")}
                  </Button>
                </div>
              );
            })()}

            {/* Purchase permissions */}
            <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("teamWorker.purchasePermissions", "Inköp")}
              </p>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <Label htmlFor="worker-can-create-purchases" className="text-sm cursor-pointer">
                    {t("teamWorker.canCreatePurchases", "Kan föreslå inköp")}
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    {t("teamWorker.canCreatePurchasesDesc", "Skapar förslag som du godkänner")}
                  </p>
                </div>
                <Switch
                  id="worker-can-create-purchases"
                  checked={canCreatePurchases}
                  onCheckedChange={setCanCreatePurchases}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <Label htmlFor="worker-can-log-receipts" className="text-sm cursor-pointer">
                    {t("teamWorker.canLogReceipts", "Kan logga utförda inköp")}
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    {t("teamWorker.canLogReceiptsDesc", "Workern kan registrera och bifoga kvitto direkt — kringgår godkännande")}
                  </p>
                </div>
                <Switch
                  id="worker-can-log-receipts"
                  checked={canLogReceipts}
                  onCheckedChange={setCanLogReceipts}
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={saving || !name.trim() || selectedTaskIds.length === 0}
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("teamWorker.inviteWorker", "Invite Worker")}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
