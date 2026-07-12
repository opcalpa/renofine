import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MultiRoomSelect } from "@/components/shared/MultiRoomSelect";
import { EntityPhotoGallery } from "@/components/shared/EntityPhotoGallery";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { TipList } from "@/components/ui/TipCard";
import type { ContextualTip } from "@/lib/contextualTips";
import { DEFAULT_COST_CENTERS } from "@/lib/costCenters";
import { parseLocalDate, formatLocalDate } from "@/lib/dateUtils";
import { useToast } from "@/hooks/use-toast";
import { ChecklistsSection } from "../ChecklistsSection";
import { type Task, type TaskRoom, taskRoomIdList } from "../types";

interface OverviewTabProps {
  task: Task;
  patch: (updates: Partial<Task>) => void;
  isPlanning: boolean;
  projectId: string;
  rooms: TaskRoom[];
  teamMembers: { id: string; name: string; role?: string }[];
  dependencies: { id: string; title: string; status: string }[];
  tips: ContextualTip[];
  dismissTip: (id: string) => void;
  onOpenRoom?: (roomId: string) => void;
  relatedPOCount: number;
  onShowRelated: () => void;
  /** Per-user show/hide prefs — fields with content always render regardless. */
  fieldPrefs: Record<string, boolean>;
  photoCount: number;
  commentCount: number;
}

export function OverviewTab({
  task,
  patch,
  isPlanning,
  projectId,
  rooms,
  teamMembers,
  dependencies,
  tips,
  dismissTip,
  onOpenRoom,
  relatedPOCount,
  onShowRelated,
  fieldPrefs,
  photoCount,
  commentCount,
}: OverviewTabProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const internalSupported = "internal_notes" in task;
  // Hidden fields stay visible while they hold content — nothing disappears silently
  const showField = (key: string, hasContent: boolean) => (fieldPrefs[key] ?? true) || hasContent;

  const fmtDate = (iso?: string) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(i18n.language === "sv" ? "sv-SE" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Description is the PRIMARY field — always visible, never hidden behind a
  // toggle. It's the work description shown to workers. (Carl 2026-07-12)
  const descriptionSection = (
    <div className="space-y-1.5">
      <Label className="rf-section-label" htmlFor="edit-task-description">
        {t("tasks.description", "Beskrivning")}
      </Label>
      <Textarea
        id="edit-task-description"
        value={task.description || ""}
        onChange={(e) => patch({ description: e.target.value })}
        rows={3}
        placeholder={t("tasks.descriptionPlaceholder", "Lägg till detaljer, material eller instruktioner…")}
        className="rounded-lg text-sm"
      />
      <p className="text-xs text-muted-foreground">
        {t("tasks.descriptionSharedHint", "Syns för alla i projektet, även inbjudna arbetare.")}
      </p>
    </div>
  );

  // Internal notes live in their OWN separated section (below the checklists),
  // so the description above is never missed. Never shared with workers.
  // ("Kundens önskemål" stays a ROOM-level concept — no duplicate data points.)
  const internalNotesSection = internalSupported ? (
    <div className="space-y-1.5">
      <Label className="rf-section-label" htmlFor="edit-task-internal-notes">
        {t("tasks.internalNotes", "Interna anteckningar")}
      </Label>
      <Textarea
        id="edit-task-internal-notes"
        value={task.internal_notes || ""}
        onChange={(e) => patch({ internal_notes: e.target.value })}
        rows={3}
        placeholder={t("tasks.internalNotesPlaceholder", "Interna anteckningar — syns inte för arbetare…")}
        className="rounded-lg text-sm"
        style={{ background: "var(--rf-paper-2)" }}
      />
      <p className="text-xs text-muted-foreground">
        {t("tasks.internalNotesHint", "Bara för dig och ditt team — delas aldrig med arbetare.")}
      </p>
    </div>
  ) : null;

  const roomField = (
    <div className="space-y-1.5">
      <Label className="rf-section-label flex items-center gap-1">
        {t("tasks.room")}
        {isPlanning && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[220px]">
                <p className="text-xs">{t("tasks.roomTooltip")}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </Label>
      <MultiRoomSelect
        rooms={rooms}
        selectedIds={taskRoomIdList(task)}
        onChange={(ids) => patch({ room_ids: ids, room_id: ids[0] || null })}
        onOpenRoom={onOpenRoom}
      />
    </div>
  );

  // Quick-info chip row — compact, wraps to screen width, relation chips only
  // when non-empty; counts are clickable and jump to Relaterat (Carl 9 Jul).
  const infoChip = (label: string, onClick?: () => void) =>
    onClick ? (
      <button
        key={label}
        type="button"
        onClick={onClick}
        className="rounded-full border px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
        style={{ borderColor: "var(--rf-hairline)", background: "var(--rf-paper-2)" }}
      >
        {label}
      </button>
    ) : (
      <span
        key={label}
        className="rounded-full border px-2.5 py-1 text-xs"
        style={{ borderColor: "var(--rf-hairline)", background: "var(--rf-paper-2)", color: "var(--rf-fg-muted)" }}
      >
        {label}
      </span>
    );

  const quickInfo = (
    <div className="flex flex-wrap items-center gap-1.5">
      {infoChip(`${t("rooms.createdAt", "Skapat")} ${fmtDate(task.created_at)}`)}
      {infoChip(`${t("rooms.updatedAt", "Uppdaterat")} ${fmtDate(task.updated_at)}`)}
      {relatedPOCount > 0 && infoChip(
        `${relatedPOCount} ${relatedPOCount === 1 ? t("tasks.purchaseOrderOne", "köporder") : t("tasks.purchaseOrderMany", "köpordrar")}`,
        onShowRelated,
      )}
      {dependencies.length > 0 && infoChip(
        `${dependencies.length} ${dependencies.length === 1 ? t("tasks.dependencyOne", "beroende") : t("tasks.dependencyMany", "beroenden")}`,
        onShowRelated,
      )}
    </div>
  );

  const photosSection = (
    <div>
      <span className="rf-section-label mb-2 block">{t("entityPhotos.photos", "Foton")}</span>
      <EntityPhotoGallery entityId={task.id} entityType="task" projectId={projectId} />
    </div>
  );

  const commentsSection = (
    <div className="pt-3 border-t" style={{ borderColor: "var(--rf-hairline)" }}>
      <CommentsSection taskId={task.id} projectId={projectId} />
    </div>
  );

  return (
    <div className="flex flex-col gap-5 px-6 py-5">
      {tips.length > 0 && <TipList tips={tips} onDismiss={dismissTip} maxTips={1} compact />}

      {descriptionSection}

      {showField("checklists", (task.checklists || []).length > 0) && (
        <ChecklistsSection task={task} patch={patch} projectId={projectId} />
      )}

      {internalNotesSection}

      {isPlanning ? (
        roomField
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-3">
            <div className="space-y-1.5">
              <Label className="rf-section-label">{t("tasks.status")}</Label>
              {(() => {
                const unresolvedDeps = dependencies.filter((d) => d.status !== "completed");
                const blockedStatuses = ["in_progress", "completed"];
                const isBlocked = unresolvedDeps.length > 0;
                const handleStatusChange = (value: string) => {
                  if (isBlocked && blockedStatuses.includes(value)) {
                    toast({
                      title: t("tasks.depBlockedTitle", "Dependencies not completed"),
                      description: `${unresolvedDeps.map((d) => d.title).join(", ")} — ${t("tasks.depOverrideHint", "status changed anyway")}`,
                    });
                  }
                  patch({ status: value });
                };
                return (
                  <Select value={task.status} onValueChange={handleStatusChange}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="planned">{t("statuses.planned", "Planned")}</SelectItem>
                      <SelectItem value="to_do">{t("statuses.toDo")}</SelectItem>
                      <SelectItem value="in_progress">{t("statuses.inProgress")}{isBlocked && " ⚠️"}</SelectItem>
                      <SelectItem value="waiting">{t("statuses.waiting")}</SelectItem>
                      <SelectItem value="awaiting_review">{t("statuses.awaitingReview", "Awaiting review")}</SelectItem>
                      <SelectItem value="completed">{t("statuses.completed")}{isBlocked && " ⚠️"}</SelectItem>
                      <SelectItem value="cancelled">{t("statuses.cancelled")}</SelectItem>
                    </SelectContent>
                  </Select>
                );
              })()}
            </div>
            {showField("priority", task.priority !== "medium") && (
            <div className="space-y-1.5">
              <Label className="rf-section-label">{t("tasks.priority")}</Label>
              <Select value={task.priority} onValueChange={(value) => patch({ priority: value })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t("tasks.priorityLow")}</SelectItem>
                  <SelectItem value="medium">{t("tasks.priorityMedium")}</SelectItem>
                  <SelectItem value="high">{t("tasks.priorityHigh")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            )}
            {showField("assignee", !!task.assigned_to_stakeholder_id) && (
            <div className="space-y-1.5">
              <Label className="rf-section-label">{t("tasks.assignTo")}</Label>
              <Select
                value={task.assigned_to_stakeholder_id || "unassigned"}
                onValueChange={(value) => patch({ assigned_to_stakeholder_id: value === "unassigned" ? null : value })}
              >
                <SelectTrigger className="h-9"><SelectValue placeholder={t("common.unassigned")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">{t("common.unassigned")}</SelectItem>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name} {member.role ? `(${member.role})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
            {roomField}
            {showField("category", (task.cost_centers || []).length > 0) && (
            <div className="space-y-1.5">
              <Label className="rf-section-label">{t("tasks.costCenter")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-9 justify-start text-sm font-normal">
                    {(task.cost_centers || []).length > 0
                      ? (task.cost_centers || [])
                          .map((cc: string) => {
                            const def = DEFAULT_COST_CENTERS.find((d) => d.id === cc);
                            return def ? t(def.labelKey, def.label) : cc;
                          })
                          .join(", ")
                      : <span className="text-muted-foreground">{t("common.none", "Ingen")}</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2 max-h-[60vh] overflow-y-auto" align="start" style={{ overflowY: "auto" }}>
                  {DEFAULT_COST_CENTERS.map((cc) => {
                    const Icon = cc.icon;
                    const isSelected = (task.cost_centers || []).includes(cc.id);
                    return (
                      <label key={cc.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted cursor-pointer text-xs">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => {
                            const current = task.cost_centers || [];
                            const next = checked ? [...current, cc.id] : current.filter((c: string) => c !== cc.id);
                            patch({ cost_centers: next, cost_center: next[0] || null });
                          }}
                        />
                        <Icon className="h-3.5 w-3.5" /> {t(cc.labelKey, cc.label)}
                      </label>
                    );
                  })}
                </PopoverContent>
              </Popover>
            </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-3">
            <div className="space-y-1.5">
              <Label className="rf-section-label">{t("tasks.startDate")}</Label>
              <DatePicker
                date={task.start_date ? parseLocalDate(task.start_date) : undefined}
                onDateChange={(date) => patch({ start_date: date ? formatLocalDate(date) : null })}
                placeholder={t("tasks.startDate")}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="rf-section-label">{t("tasks.finishDate")}</Label>
              <DatePicker
                date={task.finish_date ? parseLocalDate(task.finish_date) : undefined}
                onDateChange={(date) => patch({ finish_date: date ? formatLocalDate(date) : null })}
                placeholder={t("tasks.finishDate")}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="rf-section-label">{t("tasks.progress")} {task.progress}%</Label>
              <Slider
                min={0}
                max={100}
                step={5}
                value={[task.progress]}
                onValueChange={([value]) => patch({ progress: value })}
                className="w-full pt-2"
              />
            </div>
          </div>
        </>
      )}

      {showField("photos", photoCount > 0) && photosSection}
      {showField("quickInfo", relatedPOCount > 0 || dependencies.length > 0) && quickInfo}
      {showField("comments", commentCount > 0) && commentsSection}
    </div>
  );
}
