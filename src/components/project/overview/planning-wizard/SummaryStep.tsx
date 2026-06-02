import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Pencil, Plus, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getRoomSuggestions } from "@/services/workTypeUtils";
import type { AIPropertyType, PlanningStepProps, PlanningWizardRoom } from "./types";

const ROOM_ICONS: Record<string, string> = Object.fromEntries(
  getRoomSuggestions().map((s) => [s.nameKey, s.icon])
);

const PROPERTY_TYPES: Array<{ value: AIPropertyType; labelKey: string }> = [
  { value: "apartment", labelKey: "planningWizard.propertyType.apartment" },
  { value: "villa", labelKey: "planningWizard.propertyType.villa" },
  { value: "townhouse", labelKey: "planningWizard.propertyType.townhouse" },
  { value: "summerhouse", labelKey: "planningWizard.propertyType.summerhouse" },
  { value: "other", labelKey: "planningWizard.propertyType.other" },
];

const PROPERTY_TYPE_FALLBACK: Record<AIPropertyType, string> = {
  apartment: "Lägenhet",
  villa: "Villa",
  townhouse: "Radhus",
  summerhouse: "Fritidshus",
  other: "Annat",
};

function emojiFor(nameKey: string | undefined): string {
  if (!nameKey) return "📐";
  return ROOM_ICONS[nameKey] ?? "📐";
}

function groupByNameKey(rooms: PlanningWizardRoom[]): Array<{ nameKey: string | undefined; name: string; count: number; ids: string[] }> {
  const groups = new Map<string, { nameKey: string | undefined; name: string; count: number; ids: string[] }>();
  rooms.forEach((r) => {
    const key = r.nameKey || `_custom_${r.name}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.ids.push(r.id);
    } else {
      groups.set(key, { nameKey: r.nameKey, name: r.name, count: 1, ids: [r.id] });
    }
  });
  return Array.from(groups.values());
}

export function SummaryStep({ formData, updateFormData }: PlanningStepProps) {
  const { t } = useTranslation();

  const [editingArea, setEditingArea] = useState(false);
  const [areaInput, setAreaInput] = useState(formData.totalAreaSqm?.toString() ?? "");
  const [editingFloors, setEditingFloors] = useState(false);
  const [floorsInput, setFloorsInput] = useState(formData.floors?.toString() ?? "");
  const [propertyPopoverOpen, setPropertyPopoverOpen] = useState(false);
  const [addRoomPopoverOpen, setAddRoomPopoverOpen] = useState(false);
  const [customRoomInput, setCustomRoomInput] = useState("");

  const roomGroups = groupByNameKey(formData.rooms);
  const otherGroups = groupByNameKey(formData.otherSpaces);

  const propertyTypeLabel = formData.propertyType
    ? t(`planningWizard.propertyType.${formData.propertyType}`, PROPERTY_TYPE_FALLBACK[formData.propertyType])
    : t("planningWizard.propertyTypeUnknown", "Välj typ");

  const handleSetPropertyType = (value: AIPropertyType | null) => {
    updateFormData({ propertyType: value });
    setPropertyPopoverOpen(false);
  };

  const handleSaveArea = () => {
    const v = areaInput.trim();
    if (!v) {
      updateFormData({ totalAreaSqm: undefined });
    } else {
      const n = parseInt(v, 10);
      if (!isNaN(n) && n > 0 && n < 5000) {
        updateFormData({ totalAreaSqm: n });
      }
    }
    setEditingArea(false);
  };

  const handleSaveFloors = () => {
    const v = floorsInput.trim();
    if (!v) {
      updateFormData({ floors: null });
    } else {
      const n = parseInt(v, 10);
      if (!isNaN(n) && n > 0 && n < 10) {
        updateFormData({ floors: n });
      }
    }
    setEditingFloors(false);
  };

  const addRoomOfType = (nameKey: string) => {
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

  const addCustomRoom = () => {
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

  const incrementRoomGroup = (nameKey: string | undefined) => {
    if (!nameKey) return;
    addRoomOfType(nameKey);
  };

  const decrementRoomGroup = (ids: string[]) => {
    if (ids.length === 0) return;
    // Remove the last one added in this group
    const idToRemove = ids[ids.length - 1];
    updateFormData({ rooms: formData.rooms.filter((r) => r.id !== idToRemove) });
  };

  const removeOtherSpace = (id: string) => {
    updateFormData({ otherSpaces: formData.otherSpaces.filter((s) => s.id !== id) });
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold">
          {t("planningWizard.summaryTitle", "Stämmer det här?")}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t(
            "planningWizard.summaryDesc",
            "Vi tolkade din beskrivning så här. Justera om något inte stämmer."
          )}
        </p>
      </div>

      {/* Object-level summary chips */}
      <div className="rounded-lg border bg-background p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Property type */}
          <Popover open={propertyPopoverOpen} onOpenChange={setPropertyPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium hover:border-primary/60 hover:bg-primary/5 transition-colors"
              >
                {formData.aiParsed?.propertyType && (
                  <Sparkles className="h-3 w-3 text-primary" />
                )}
                {propertyTypeLabel}
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-48 p-2">
              <div className="flex flex-col gap-0.5">
                {PROPERTY_TYPES.map((pt) => (
                  <button
                    key={pt.value}
                    type="button"
                    onClick={() => handleSetPropertyType(pt.value)}
                    className={cn(
                      "text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors",
                      formData.propertyType === pt.value && "bg-primary/10 text-primary font-medium"
                    )}
                  >
                    {t(pt.labelKey, PROPERTY_TYPE_FALLBACK[pt.value])}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Floors */}
          {editingFloors ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary px-2 py-0.5 text-sm">
              <Input
                value={floorsInput}
                onChange={(e) => setFloorsInput(e.target.value)}
                onBlur={handleSaveFloors}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleSaveFloors(); }
                  if (e.key === "Escape") setEditingFloors(false);
                }}
                autoFocus
                className="h-6 w-12 text-sm tabular-nums px-1.5"
                type="number"
                min="1"
                max="9"
              />
              <span className="text-muted-foreground">plan</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => { setFloorsInput(formData.floors?.toString() ?? ""); setEditingFloors(true); }}
              className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium hover:border-primary/60 hover:bg-primary/5 transition-colors tabular-nums"
            >
              {formData.aiParsed?.floors && (
                <Sparkles className="h-3 w-3 text-primary" />
              )}
              {formData.floors
                ? t("planningWizard.floorsCount", "{{count}} plan", { count: formData.floors })
                : t("planningWizard.floorsUnknown", "Plan?")}
              <Pencil className="h-3 w-3 text-muted-foreground/60" />
            </button>
          )}

          {/* Total area */}
          {editingArea ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary px-2 py-0.5 text-sm">
              <Input
                value={areaInput}
                onChange={(e) => setAreaInput(e.target.value)}
                onBlur={handleSaveArea}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleSaveArea(); }
                  if (e.key === "Escape") setEditingArea(false);
                }}
                autoFocus
                className="h-6 w-16 text-sm tabular-nums px-1.5"
                type="number"
                min="1"
                max="4999"
              />
              <span className="text-muted-foreground">m²</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => { setAreaInput(formData.totalAreaSqm?.toString() ?? ""); setEditingArea(true); }}
              className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium hover:border-primary/60 hover:bg-primary/5 transition-colors tabular-nums"
            >
              {formData.aiParsed?.totalAreaSqm && (
                <Sparkles className="h-3 w-3 text-primary" />
              )}
              {formData.totalAreaSqm
                ? `${formData.totalAreaSqm} m²`
                : t("planningWizard.totalAreaUnknown", "Total yta?")}
              <Pencil className="h-3 w-3 text-muted-foreground/60" />
            </button>
          )}
        </div>

        {/* Main rooms — chips with count badges */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("planningWizard.summaryRooms", "Rum med arbete")} ({formData.rooms.length})
          </p>
          {roomGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              {t("planningWizard.summaryNoRooms", "Inga rum identifierade. Lägg till nedan.")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {roomGroups.map((g) => (
                <div
                  key={g.nameKey ?? g.name}
                  className="group inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-sm"
                >
                  <span>{emojiFor(g.nameKey)}</span>
                  <span className="font-medium">{g.name}</span>
                  {g.count > 1 && (
                    <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 text-[11px] font-semibold text-primary tabular-nums">
                      ×{g.count}
                    </span>
                  )}
                  <div className="ml-1 flex items-center gap-0.5">
                    {g.nameKey && (
                      <button
                        type="button"
                        onClick={() => incrementRoomGroup(g.nameKey)}
                        className="h-5 w-5 rounded-full hover:bg-primary/10 inline-flex items-center justify-center text-primary"
                        aria-label="Lägg till ett till"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => decrementRoomGroup(g.ids)}
                      className="h-5 w-5 rounded-full hover:bg-destructive/10 inline-flex items-center justify-center text-muted-foreground hover:text-destructive"
                      aria-label="Ta bort ett"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* + Add room */}
          <Popover open={addRoomPopoverOpen} onOpenChange={setAddRoomPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors mt-1"
              >
                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full border border-dashed border-muted-foreground/40 hover:border-primary/60 transition-colors">
                  <Plus className="h-3 w-3" />
                </span>
                {t("planningWizard.summaryAddRoom", "Lägg till rum")}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {t("planningWizard.matrixAddRoomTitle", "Lägg till rum")}
              </p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {getRoomSuggestions().map((s) => (
                  <button
                    key={s.nameKey}
                    type="button"
                    onClick={() => addRoomOfType(s.nameKey)}
                    className="inline-flex items-center gap-1 rounded-full border border-muted px-2.5 py-1 text-xs font-medium hover:border-primary hover:bg-primary/5 transition-colors"
                  >
                    <span>{s.icon}</span>
                    {t(`intake.room.${s.nameKey}`, s.nameKey)}
                  </button>
                ))}
              </div>
              <div className="border-t pt-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                  {t("planningWizard.matrixAddRoomCustom", "Eget rum")}
                </p>
                <div className="flex gap-1.5">
                  <Input
                    value={customRoomInput}
                    onChange={(e) => setCustomRoomInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomRoom(); } }}
                    placeholder={t("planningWizard.matrixCustomRoomPlaceholder", "T.ex. Klädkammare")}
                    className="h-8 text-xs flex-1"
                  />
                  <button
                    type="button"
                    onClick={addCustomRoom}
                    disabled={!customRoomInput.trim()}
                    className="inline-flex items-center justify-center h-8 w-8 rounded-md border bg-primary text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary/90"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Other spaces — discovered without proposed work */}
        {otherGroups.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("planningWizard.summaryOtherSpaces", "Övriga ytor som upptäcktes")} ({formData.otherSpaces.length})
            </p>
            <p className="text-[11px] text-muted-foreground/80 -mt-1">
              {t(
                "planningWizard.summaryOtherSpacesHint",
                "Vi hittade dessa men föreslog inget arbete. Lägg till arbete på nästa sida, eller ta bort."
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {otherGroups.map((g) => {
                // Find the space ids
                const spaceIds = g.ids;
                return (
                  <div
                    key={g.nameKey ?? g.name}
                    className="group inline-flex items-center gap-1 rounded-full border border-muted px-2.5 py-1 text-sm text-muted-foreground"
                  >
                    <span>{emojiFor(g.nameKey)}</span>
                    <span>{g.name}</span>
                    {g.count > 1 && (
                      <span className="ml-0.5 rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums">
                        ×{g.count}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const space = formData.otherSpaces.find((s) => s.id === spaceIds[0]);
                        if (space) removeOtherSpace(space.id);
                      }}
                      className="ml-1 h-5 w-5 rounded-full hover:bg-destructive/10 inline-flex items-center justify-center hover:text-destructive transition-colors"
                      aria-label="Ta bort"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Summary sentence from AI */}
      {formData.aiParsed?.summary && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-primary/5 border border-primary/15">
          <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-foreground/70 leading-relaxed italic">
            "{formData.aiParsed.summary}"
          </p>
        </div>
      )}

    </div>
  );
}
