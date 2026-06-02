import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { WorkType } from "@/services/workTypeUtils";
import { getRoomSuggestions } from "@/services/workTypeUtils";
import type { PlanningStepProps, PlanningWizardRoom, RoomSpecificWork } from "./types";

type CellState = "checked" | "checked-ai" | "empty" | "empty-ai" | "na";

const WORK_TYPE_CATALOG: Array<{ value: WorkType; labelKey: string; short: string }> = [
  { value: "malning", labelKey: "intake.workType.malning", short: "Mål" },
  { value: "el", labelKey: "intake.workType.el", short: "El" },
  { value: "golv", labelKey: "intake.workType.golv", short: "Golv" },
  { value: "kakel", labelKey: "intake.workType.kakel", short: "Kakel" },
  { value: "vvs", labelKey: "intake.workType.vvs", short: "VVS" },
  { value: "snickeri", labelKey: "intake.workType.snickeri", short: "Snick" },
  { value: "rivning", labelKey: "intake.workType.rivning", short: "Riv" },
  { value: "fonster_dorrar", labelKey: "intake.workType.fonster_dorrar", short: "Fönst" },
];

const ROOM_ICONS: Record<string, string> = Object.fromEntries(
  getRoomSuggestions().map((s) => [s.nameKey, s.icon])
);

const KAKEL_APPLICABLE = new Set(["kitchen", "bathroom", "wcShower", "laundry", "hallway"]);

function isApplicable(roomNameKey: string | undefined, wt: WorkType): boolean {
  if (!roomNameKey) return true;
  if (wt === "kakel") return KAKEL_APPLICABLE.has(roomNameKey);
  return true;
}

function emojiFor(nameKey: string | undefined): string {
  if (!nameKey) return "📐";
  return ROOM_ICONS[nameKey] ?? "📐";
}

// Compute visible work-type columns: union of AI-extracted + currently-active.
// Start from AI; expand if user actively toggles new types.
function visibleWorkTypesFor(formData: PlanningStepProps["formData"]): WorkType[] {
  const set = new Set<WorkType>();
  formData.aiParsed?.globalWorkTypes.forEach((wt) => set.add(wt));
  formData.aiParsed?.rooms.forEach((r) => r.suggestedWorkTypes.forEach((wt) => set.add(wt)));
  formData.globalWorkTypes.forEach((wt) => set.add(wt));
  Object.values(formData.roomSpecificWork).forEach((rw) => {
    rw.workTypes.forEach((wt) => set.add(wt));
  });
  if (set.size === 0) {
    return ["malning", "golv"];
  }
  return WORK_TYPE_CATALOG.filter((c) => set.has(c.value)).map((c) => c.value);
}

// Whether AI originally suggested this combo (for sparkle indicator)
function isAISuggested(formData: PlanningStepProps["formData"], room: PlanningWizardRoom, wt: WorkType): boolean {
  if (!formData.aiParsed) return false;
  if (formData.aiParsed.globalWorkTypes.includes(wt)) return true;
  const aiRoom = formData.aiParsed.rooms.find((r) => r.nameKey === room.nameKey);
  return aiRoom?.suggestedWorkTypes.includes(wt) ?? false;
}

function cellStateFor(
  formData: PlanningStepProps["formData"],
  room: PlanningWizardRoom,
  wt: WorkType
): CellState {
  if (!isApplicable(room.nameKey, wt)) return "na";
  const isGlobal = formData.globalWorkTypes.includes(wt);
  const roomWork = formData.roomSpecificWork[room.id];
  const excluded = roomWork?.excludedGlobals?.includes(wt) ?? false;
  const inRoomTypes = roomWork?.workTypes.includes(wt) ?? false;
  const aiSuggested = isAISuggested(formData, room, wt);

  // Effective checked = global (and not excluded) OR explicitly in room work types
  const checked = (isGlobal && !excluded) || inRoomTypes;
  if (checked) return aiSuggested ? "checked-ai" : "checked";
  // Empty but AI hinted
  if (aiSuggested) return "empty-ai";
  return "empty";
}

function ensureRoomSpecific(rsw: Record<string, RoomSpecificWork>, roomId: string): RoomSpecificWork {
  return rsw[roomId] ?? { description: "", workTypes: [], excludedGlobals: [] };
}

export function WorkMatrixStep({ formData, updateFormData }: PlanningStepProps) {
  const { t } = useTranslation();

  const [showDiscovered, setShowDiscovered] = useState(false);
  const [addWorkPopoverOpen, setAddWorkPopoverOpen] = useState(false);
  const [addRoomPopoverOpen, setAddRoomPopoverOpen] = useState(false);
  const [customRoomInput, setCustomRoomInput] = useState("");
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);

  const mainRooms = formData.rooms;
  const discoveredRooms = formData.otherSpaces;
  const allRooms = useMemo(
    () => (showDiscovered ? [...mainRooms, ...discoveredRooms] : mainRooms),
    [mainRooms, discoveredRooms, showDiscovered]
  );

  const visibleWorkTypes = useMemo(() => visibleWorkTypesFor(formData), [formData]);

  const addableWorkTypes = useMemo(
    () => WORK_TYPE_CATALOG.filter((c) => !visibleWorkTypes.includes(c.value)),
    [visibleWorkTypes]
  );

  const addableRoomTypes = useMemo(() => {
    const usedKeys = new Set([...mainRooms, ...discoveredRooms].map((r) => r.nameKey).filter(Boolean));
    return getRoomSuggestions().filter((s) => !usedKeys.has(s.nameKey));
  }, [mainRooms, discoveredRooms]);

  // Toggle a cell: ALLA RUM row OR specific room cell
  const toggleCell = (room: PlanningWizardRoom | null, wt: WorkType) => {
    if (!room) {
      // ALLA RUM row: toggle global
      const isGlobal = formData.globalWorkTypes.includes(wt);
      const nextGlobals = isGlobal
        ? formData.globalWorkTypes.filter((g) => g !== wt)
        : [...formData.globalWorkTypes, wt];
      // Adding it as global clears any excludedGlobals entries that match.
      const nextRsw: Record<string, RoomSpecificWork> = {};
      Object.entries(formData.roomSpecificWork).forEach(([rid, rw]) => {
        nextRsw[rid] = {
          ...rw,
          excludedGlobals: (rw.excludedGlobals ?? []).filter((g) => g !== wt),
        };
      });
      updateFormData({ globalWorkTypes: nextGlobals, roomSpecificWork: nextRsw });
      return;
    }

    // Specific room cell
    const isGlobal = formData.globalWorkTypes.includes(wt);
    const current = cellStateFor(formData, room, wt);
    const becomingChecked = current === "empty" || current === "empty-ai";

    const rsw = { ...formData.roomSpecificWork };
    const rw = ensureRoomSpecific(rsw, room.id);

    if (becomingChecked) {
      // If global, just remove from excludedGlobals (inherit again).
      // Otherwise, add to room workTypes.
      if (isGlobal) {
        rsw[room.id] = {
          ...rw,
          excludedGlobals: (rw.excludedGlobals ?? []).filter((g) => g !== wt),
        };
      } else {
        rsw[room.id] = {
          ...rw,
          workTypes: rw.workTypes.includes(wt) ? rw.workTypes : [...rw.workTypes, wt],
        };
      }
    } else {
      // Unchecking
      if (isGlobal) {
        // Exclude from this room
        rsw[room.id] = {
          ...rw,
          excludedGlobals: (rw.excludedGlobals ?? []).includes(wt)
            ? (rw.excludedGlobals ?? [])
            : [...(rw.excludedGlobals ?? []), wt],
        };
      } else {
        rsw[room.id] = {
          ...rw,
          workTypes: rw.workTypes.filter((w) => w !== wt),
        };
      }
    }

    // If we just added work to an otherSpace, promote it to main rooms
    const isOtherSpace = formData.otherSpaces.find((s) => s.id === room.id);
    if (becomingChecked && isOtherSpace) {
      updateFormData({
        roomSpecificWork: rsw,
        rooms: [...formData.rooms, isOtherSpace],
        otherSpaces: formData.otherSpaces.filter((s) => s.id !== room.id),
      });
    } else {
      updateFormData({ roomSpecificWork: rsw });
    }
  };

  const handleAddWorkType = (wt: WorkType) => {
    // Add as global so it shows up across all rooms (the column appears via visibleWorkTypes)
    if (!formData.globalWorkTypes.includes(wt)) {
      updateFormData({ globalWorkTypes: [...formData.globalWorkTypes, wt] });
    }
    setAddWorkPopoverOpen(false);
  };

  const handleAddRoom = (nameKey: string) => {
    const baseName = t(`intake.room.${nameKey}`, nameKey);
    const existingOfType = formData.rooms.filter((r) => r.nameKey === nameKey).length;
    const newRoom: PlanningWizardRoom = {
      id: crypto.randomUUID(),
      name: existingOfType === 0 ? baseName : `${baseName} #${existingOfType + 1}`,
      nameKey,
      aiSuggested: false,
    };
    updateFormData({ rooms: [...formData.rooms, newRoom] });
    setAddRoomPopoverOpen(false);
  };

  const handleAddCustomRoom = () => {
    const v = customRoomInput.trim();
    if (!v) return;
    const newRoom: PlanningWizardRoom = {
      id: crypto.randomUUID(),
      name: v,
      aiSuggested: false,
    };
    updateFormData({ rooms: [...formData.rooms, newRoom] });
    setCustomRoomInput("");
    setAddRoomPopoverOpen(false);
  };

  const setRoomDescription = (roomId: string, value: string) => {
    const rsw = { ...formData.roomSpecificWork };
    const rw = ensureRoomSpecific(rsw, roomId);
    rsw[roomId] = { ...rw, description: value };
    updateFormData({ roomSpecificWork: rsw });
  };

  // Live task count — mirrors planningWizardService:
  // - Global workTypes collapse to ONE task spanning all applicable rooms
  // - Per-room workTypes (not in globals) get their own task per room
  const { taskCount, involvedRoomCount } = useMemo(() => {
    const involved = new Set<string>();
    let tasks = 0;
    formData.globalWorkTypes.forEach((wt) => {
      const applicable = formData.rooms.filter((r) => {
        const excluded = formData.roomSpecificWork[r.id]?.excludedGlobals?.includes(wt) ?? false;
        return !excluded && isApplicable(r.nameKey, wt);
      });
      if (applicable.length > 0) {
        tasks += 1; // ONE multi-room task per global workType
        applicable.forEach((r) => involved.add(r.id));
      }
    });
    Object.entries(formData.roomSpecificWork).forEach(([roomId, rw]) => {
      const room = formData.rooms.find((r) => r.id === roomId);
      if (!room) return;
      rw.workTypes.forEach((wt) => {
        if (formData.globalWorkTypes.includes(wt)) return; // covered by global
        tasks += 1;
        involved.add(roomId);
      });
    });
    return { taskCount: tasks, involvedRoomCount: involved.size };
  }, [formData]);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold">
          {t("planningWizard.matrixTitle", "Vad ska göras var?")}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t(
            "planningWizard.matrixDesc",
            "Bocka i där arbete sker. Vi har förvalt det vi tror — ändra fritt. Klicka rumsnamnet för beskrivning."
          )}
        </p>
      </div>

      <div className="rounded-lg border bg-background overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-2.5 sticky left-0 bg-background z-10 min-w-[160px]">
                {t("planningWizard.matrixRoomCol", "Rum")}
              </th>
              {visibleWorkTypes.map((wt) => {
                const cat = WORK_TYPE_CATALOG.find((c) => c.value === wt)!;
                return (
                  <th
                    key={wt}
                    className="text-center text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 py-2.5 min-w-[64px]"
                    title={t(cat.labelKey)}
                  >
                    {cat.short}
                  </th>
                );
              })}
              <th className="px-2 py-2.5 min-w-[40px] text-center">
                <Popover open={addWorkPopoverOpen} onOpenChange={setAddWorkPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center h-6 w-6 rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary/60 hover:text-primary transition-all"
                      title={t("planningWizard.matrixAddWork", "Lägg till arbetstyp")}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      {t("planningWizard.matrixAddWorkTitle", "Lägg till arbetstyp")}
                    </p>
                    {addableWorkTypes.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {addableWorkTypes.map((wt) => (
                          <button
                            key={wt.value}
                            type="button"
                            onClick={() => handleAddWorkType(wt.value)}
                            className="inline-flex items-center gap-1 rounded-full border border-muted px-2.5 py-1 text-xs font-medium hover:border-primary hover:bg-primary/5 transition-colors"
                          >
                            <Plus className="h-3 w-3 text-muted-foreground" />
                            {t(wt.labelKey)}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {t("planningWizard.matrixAddWorkEmpty", "Alla standard-arbeten är redan med.")}
                      </p>
                    )}
                  </PopoverContent>
                </Popover>
              </th>
            </tr>
          </thead>
          <tbody>
            {/* ALLA RUM cascade row */}
            <tr className="border-b-2 border-foreground/10 bg-muted/50">
              <td className="px-3 py-3 sticky left-0 bg-muted/50 z-10">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-primary shrink-0" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/90">
                    {t("planningWizard.matrixAllRooms", "Alla rum")}
                  </span>
                </div>
              </td>
              {visibleWorkTypes.map((wt) => {
                const isGlobal = formData.globalWorkTypes.includes(wt);
                const aiGlobal = formData.aiParsed?.globalWorkTypes.includes(wt) ?? false;
                const state: CellState = isGlobal ? (aiGlobal ? "checked-ai" : "checked") : (aiGlobal ? "empty-ai" : "empty");
                return (
                  <td key={wt} className="text-center px-2 py-3">
                    <MatrixCell state={state} onClick={() => toggleCell(null, wt)} />
                  </td>
                );
              })}
              <td className="px-2 py-3" />
            </tr>

            {/* All rooms (main + discovered if expanded) */}
            {allRooms.map((room) => {
              const isExpanded = expandedRoomId === room.id;
              const description = formData.roomSpecificWork[room.id]?.description ?? "";
              const isCustomRoom = room.aiSuggested === false;
              return (
                <RoomRow
                  key={room.id}
                  room={room}
                  visibleWorkTypes={visibleWorkTypes}
                  formData={formData}
                  isExpanded={isExpanded}
                  description={description}
                  onTitleClick={() => setExpandedRoomId(isExpanded ? null : room.id)}
                  onCellClick={(wt) => toggleCell(room, wt)}
                  onDescriptionChange={(v) => setRoomDescription(room.id, v)}
                  isCustomRoom={isCustomRoom}
                />
              );
            })}

            {/* + Add room row */}
            <tr className="border-b">
              <td className="px-3 py-2 sticky left-0 bg-background z-10" colSpan={visibleWorkTypes.length + 2}>
                <Popover open={addRoomPopoverOpen} onOpenChange={setAddRoomPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      <span className="inline-flex items-center justify-center h-5 w-5 rounded-full border border-dashed border-muted-foreground/40 hover:border-primary/60 transition-colors">
                        <Plus className="h-3 w-3" />
                      </span>
                      {t("planningWizard.matrixAddRoom", "Lägg till rum")}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      {t("planningWizard.matrixAddRoomTitle", "Lägg till rum")}
                    </p>
                    {addableRoomTypes.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {addableRoomTypes.map((s) => (
                          <button
                            key={s.nameKey}
                            type="button"
                            onClick={() => handleAddRoom(s.nameKey)}
                            className="inline-flex items-center gap-1 rounded-full border border-muted px-2.5 py-1 text-xs font-medium hover:border-primary hover:bg-primary/5 transition-colors"
                          >
                            <span>{s.icon}</span>
                            {t(`intake.room.${s.nameKey}`, s.nameKey)}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="border-t pt-2">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                        {t("planningWizard.matrixAddRoomCustom", "Eget rum")}
                      </p>
                      <div className="flex gap-1.5">
                        <Input
                          value={customRoomInput}
                          onChange={(e) => setCustomRoomInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCustomRoom(); } }}
                          placeholder={t("planningWizard.matrixCustomRoomPlaceholder", "T.ex. Klädkammare")}
                          className="h-8 text-xs flex-1"
                        />
                        <button
                          type="button"
                          onClick={handleAddCustomRoom}
                          disabled={!customRoomInput.trim()}
                          className="inline-flex items-center justify-center h-8 w-8 rounded-md border bg-primary text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary/90"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </td>
            </tr>

            {/* Discovered-no-work expander */}
            {discoveredRooms.length > 0 && !showDiscovered && (
              <tr className="border-b last:border-b-0">
                <td colSpan={visibleWorkTypes.length + 2} className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setShowDiscovered(true)}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronRight className="h-3 w-3" />
                    {t(
                      "planningWizard.matrixShowDiscovered",
                      "Visa fler upptäckta rum ({{count}})",
                      { count: discoveredRooms.length }
                    )}
                    <span className="text-muted-foreground/60 ml-1">
                      — {discoveredRooms.map((r) => r.name.toLowerCase()).join(", ")}
                    </span>
                  </button>
                </td>
              </tr>
            )}
            {discoveredRooms.length > 0 && showDiscovered && (
              <tr className="border-b last:border-b-0">
                <td colSpan={visibleWorkTypes.length + 2} className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setShowDiscovered(false)}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronDown className="h-3 w-3" />
                    {t("planningWizard.matrixHideDiscovered", "Dölj upptäckta rum utan arbete")}
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Honest footer counter */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-primary/5 border border-primary/15">
        <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-foreground/80 leading-relaxed tabular-nums">
          {taskCount === 0 ? (
            t(
              "planningWizard.matrixFooterEmpty",
              "Bocka i en cell för att skapa en uppgift. Du kan också fortsätta utan att välja något och bygga planen från grunden."
            )
          ) : (
            t(
              "planningWizard.matrixFooter",
              "Skapar {{tasks}} {{taskWord}} över {{rooms}} rum. Typ, material och kostnad väljer du per uppgift i nästa steg.",
              {
                tasks: taskCount,
                rooms: involvedRoomCount,
                taskWord: taskCount === 1 ? "uppgift" : "uppgifter",
              }
            )
          )}
        </p>
      </div>
    </div>
  );
}

interface RoomRowProps {
  room: PlanningWizardRoom;
  visibleWorkTypes: WorkType[];
  formData: PlanningStepProps["formData"];
  isExpanded: boolean;
  description: string;
  onTitleClick: () => void;
  onCellClick: (wt: WorkType) => void;
  onDescriptionChange: (value: string) => void;
  isCustomRoom: boolean;
}

function RoomRow({
  room,
  visibleWorkTypes,
  formData,
  isExpanded,
  description,
  onTitleClick,
  onCellClick,
  onDescriptionChange,
  isCustomRoom,
}: RoomRowProps) {
  const { t } = useTranslation();
  return (
    <>
      <tr className="border-b hover:bg-muted/10 transition-colors">
        <td className="px-3 py-2.5 sticky left-0 bg-background z-10">
          <button
            type="button"
            onClick={onTitleClick}
            className={cn(
              "group flex items-center gap-2 text-left w-full transition-colors",
              isExpanded ? "text-foreground" : "text-foreground hover:text-primary"
            )}
          >
            <span className="text-base shrink-0">{emojiFor(room.nameKey)}</span>
            <span className={cn(
              "text-sm truncate transition-all",
              isExpanded ? "font-bold" : "font-medium"
            )}>
              {room.name}
            </span>
            {isCustomRoom && (
              <Plus className="h-3 w-3 text-muted-foreground/60 rotate-45 shrink-0" />
            )}
            <ChevronRight className={cn(
              "h-3 w-3 text-muted-foreground/40 shrink-0 transition-transform ml-auto",
              isExpanded && "rotate-90 text-primary"
            )} />
          </button>
        </td>
        {visibleWorkTypes.map((wt) => {
          const state = cellStateFor(formData, room, wt);
          return (
            <td key={wt} className="text-center px-2 py-2.5">
              <MatrixCell state={state} onClick={() => onCellClick(wt)} />
            </td>
          );
        })}
        <td className="px-2 py-2.5" />
      </tr>
      {isExpanded && (
        <tr className="border-b bg-primary/5">
          <td colSpan={visibleWorkTypes.length + 2} className="px-3 py-3">
            <div className="flex flex-col gap-1.5 max-w-2xl ml-8">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                {t("planningWizard.matrixRoomNote", "Anteckning om {{room}}", { room: room.name })}
              </label>
              <textarea
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                placeholder={t(
                  "planningWizard.matrixRoomNotePlaceholder",
                  "T.ex. Stengolv i entré, slipa befintligt parkett i resten…"
                )}
                rows={2}
                className="text-sm rounded-md border bg-background px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 leading-relaxed"
                autoFocus
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function MatrixCell({ state, onClick }: { state: CellState; onClick: () => void }) {
  if (state === "na") {
    return <span className="text-muted-foreground/30 select-none">—</span>;
  }

  const checked = state === "checked" || state === "checked-ai";
  const aiHinted = state === "checked-ai" || state === "empty-ai";

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center justify-center h-6 w-6 rounded border transition-all",
          checked
            ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
            : aiHinted
              ? "border-primary/40 bg-primary/5 hover:border-primary/70 hover:bg-primary/10"
              : "border-muted-foreground/30 bg-background hover:border-primary/60"
        )}
        aria-pressed={checked}
      >
        {checked && (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      {aiHinted && (
        <Sparkles
          className="absolute -top-1.5 -right-1.5 h-3 w-3 text-primary fill-primary/30 pointer-events-none"
        />
      )}
    </span>
  );
}
