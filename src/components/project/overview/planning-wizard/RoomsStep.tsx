import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getRoomSuggestions } from "@/services/intakeService";
import type { PlanningStepProps, PlanningWizardRoom } from "./types";

export function RoomsStep({ formData, updateFormData }: PlanningStepProps) {
  const { t } = useTranslation();
  const [customName, setCustomName] = useState("");
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const suggestions = getRoomSuggestions();

  const countByNameKey = (nameKey: string) =>
    formData.rooms.filter((r) => r.nameKey === nameKey).length;

  const addRoomOfType = (nameKey: string) => {
    const baseName = t(`intake.room.${nameKey}`, nameKey);
    const count = countByNameKey(nameKey);
    const room: PlanningWizardRoom = {
      id: crypto.randomUUID(),
      name: count === 0 ? baseName : `${baseName} #${count + 1}`,
      nameKey,
      aiSuggested: false,
    };
    updateFormData({ rooms: [...formData.rooms, room] });
  };

  const addCustomRoom = () => {
    if (!customName.trim()) return;
    const room: PlanningWizardRoom = {
      id: crypto.randomUUID(),
      name: customName.trim(),
    };
    updateFormData({ rooms: [...formData.rooms, room] });
    setCustomName("");
  };

  const removeRoom = (id: string) => {
    updateFormData({ rooms: formData.rooms.filter((r) => r.id !== id) });
  };

  const updateRoom = (id: string, updates: Partial<PlanningWizardRoom>) => {
    updateFormData({
      rooms: formData.rooms.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold">
          {t("planningWizard.step2Title", "Which rooms are involved?")}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t("planningWizard.step2Desc", "Select the rooms that are part of the renovation. Add dimensions for better estimates.")}
        </p>
      </div>

      {/* Room suggestions grid — click ALWAYS adds; multiples get "Name #N" auto-suffix */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {suggestions.map((s) => {
          const count = countByNameKey(s.nameKey);
          const selected = count > 0;
          const aiSuggested = formData.rooms.find((r) => r.nameKey === s.nameKey)?.aiSuggested;
          return (
            <button
              key={s.nameKey}
              type="button"
              className={cn(
                "relative flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition-all hover:border-primary/50",
                selected
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-muted hover:bg-muted/50"
              )}
              onClick={() => addRoomOfType(s.nameKey)}
            >
              <span className="text-xl">{s.icon}</span>
              <span className="text-xs font-medium truncate w-full text-center">
                {t(`intake.room.${s.nameKey}`, s.nameKey)}
              </span>
              {count >= 2 && (
                <span className="absolute top-1 left-1 h-5 min-w-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {count}
                </span>
              )}
              {aiSuggested && (
                <Sparkles className="absolute top-1 right-1 h-3 w-3 text-primary" />
              )}
            </button>
          );
        })}
      </div>

      {/* Add custom room */}
      <div className="flex gap-2">
        <Input
          placeholder={t("planningWizard.customRoom", "Other room...")}
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addCustomRoom(); }}
          className="flex-1"
        />
        <Button variant="outline" size="icon" onClick={addCustomRoom} disabled={!customName.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Selected rooms with optional dimensions */}
      {formData.rooms.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t("planningWizard.selectedRooms", "Selected rooms")} ({formData.rooms.length})
          </p>
          <div className="space-y-2">
            {formData.rooms.map((room) => (
              <div key={room.id} className="flex items-center gap-2 rounded-lg border p-3 bg-background">
                <div className="flex-1 min-w-0">
                  {editingRoomId === room.id ? (
                    <input
                      autoFocus
                      type="text"
                      className="text-sm font-medium px-1 py-0.5 -ml-1 rounded border focus:outline-none focus:ring-2 focus:ring-primary/50 w-full"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          updateRoom(room.id, { name: editingName.trim() || room.name });
                          setEditingRoomId(null);
                        }
                        if (e.key === "Escape") setEditingRoomId(null);
                      }}
                      onBlur={() => {
                        updateRoom(room.id, { name: editingName.trim() || room.name });
                        setEditingRoomId(null);
                      }}
                    />
                  ) : (
                    <p
                      className="text-sm font-medium flex items-center gap-1.5 cursor-text hover:text-primary transition-colors"
                      onClick={() => { setEditingRoomId(room.id); setEditingName(room.name); }}
                      title={t("planningWizard.clickToRename", "Click to rename")}
                    >
                      {room.name}
                      {room.aiSuggested && <Sparkles className="h-3 w-3 text-primary" />}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    <Input
                      type="number"
                      placeholder={t("planningWizard.width", "Width (m)")}
                      value={room.width_m ?? ""}
                      onChange={(e) => {
                        const v = e.target.value ? parseFloat(e.target.value) : undefined;
                        const area = v && room.depth_m ? Math.round(v * room.depth_m * 10) / 10 : room.area_sqm;
                        updateRoom(room.id, { width_m: v, area_sqm: area });
                      }}
                      className="h-7 text-xs w-20"
                      step="0.1"
                      min="0"
                    />
                    <span className="text-xs text-muted-foreground self-center">×</span>
                    <Input
                      type="number"
                      placeholder={t("planningWizard.depth", "Depth (m)")}
                      value={room.depth_m ?? ""}
                      onChange={(e) => {
                        const v = e.target.value ? parseFloat(e.target.value) : undefined;
                        const area = room.width_m && v ? Math.round(room.width_m * v * 10) / 10 : room.area_sqm;
                        updateRoom(room.id, { depth_m: v, area_sqm: area });
                      }}
                      className="h-7 text-xs w-20"
                      step="0.1"
                      min="0"
                    />
                    <span className="text-xs text-muted-foreground self-center">=</span>
                    <Input
                      type="number"
                      placeholder={t("planningWizard.area", "m²")}
                      value={room.area_sqm ?? ""}
                      onChange={(e) => updateRoom(room.id, { area_sqm: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className="h-7 text-xs w-16"
                      step="0.5"
                      min="0"
                    />
                    <span className="text-xs text-muted-foreground self-center">m²</span>
                    <Input
                      type="number"
                      placeholder={t("planningWizard.ceilingHeight", "Takhöjd (m)")}
                      value={room.ceiling_height_m ?? ""}
                      onChange={(e) => updateRoom(room.id, { ceiling_height_m: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className="h-7 text-xs w-24"
                      step="0.1"
                      min="0"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="h-6 w-6 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() => removeRoom(room.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Area comparison with total */}
          {(() => {
            const roomTotal = formData.rooms.reduce((s, r) => s + (r.area_sqm ?? 0), 0);
            const propTotal = formData.totalAreaSqm;
            if (!propTotal || roomTotal === 0) return null;
            const diff = Math.abs(roomTotal - propTotal);
            const pct = Math.round((diff / propTotal) * 100);
            if (pct < 15) return (
              <p className="text-xs text-muted-foreground">
                {t("planningWizard.areaMatch", "Room total: {{roomTotal}} m² of {{propTotal}} m² total", { roomTotal: Math.round(roomTotal), propTotal: Math.round(propTotal) })}
              </p>
            );
            return (
              <p className="text-xs text-amber-600">
                {t("planningWizard.areaDiff", "Room total ({{roomTotal}} m²) differs from property total ({{propTotal}} m²) by {{pct}}%", { roomTotal: Math.round(roomTotal), propTotal: Math.round(propTotal), pct })}
              </p>
            );
          })()}
        </div>
      )}
    </div>
  );
}
