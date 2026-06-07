import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Home, Plus, Trash2, Columns3, Info, Paperclip } from "lucide-react";
import { useMeasurement } from "@/contexts/MeasurementContext";
import { useAuthSession } from "@/hooks/useAuthSession";
import type { Room } from "@/components/floormap/room-details/types";
import {
  computeFloorAreaSqm,
  computeWallAreaSqm,
  parseEstimationSettings,
  type RecipeEstimationSettings,
} from "@/lib/materialRecipes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EstimationSettings = RecipeEstimationSettings;

const DEFAULT_ESTIMATION: EstimationSettings = {
  paint_coverage_sqm_per_liter: 10,
  paint_coats: 2,
};

type ExtraColumnKey = "width" | "depth" | "ceilingHeight" | "wallArea" | "paintEstimate" | "status" | "attachments";

interface ExtraColumnDef {
  key: ExtraColumnKey;
  labelKey: string;
  defaultOn: boolean;
}

const EXTRA_COLUMNS: ExtraColumnDef[] = [
  { key: "width", labelKey: "rooms.width", defaultOn: true },
  { key: "depth", labelKey: "rooms.depth", defaultOn: true },
  { key: "ceilingHeight", labelKey: "rooms.ceilingHeight", defaultOn: true },
  { key: "wallArea", labelKey: "rooms.wallArea", defaultOn: true },
  { key: "paintEstimate", labelKey: "rooms.paintEstimate", defaultOn: false },
  { key: "status", labelKey: "common.status", defaultOn: false },
  { key: "attachments", labelKey: "tasksTable.attachment", defaultOn: false },
];

const DEFAULT_EXTRAS = new Set<ExtraColumnKey>(
  EXTRA_COLUMNS.filter((c) => c.defaultOn).map((c) => c.key)
);

const DEFAULT_CEILING_MM = 2400;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computePaintLiters(room: Room, settings: EstimationSettings): number | null {
  const wallArea = computeWallAreaSqm(room);
  if (!wallArea || wallArea <= 0) return null;
  const nonPaintable = room.dimensions?.non_paintable_area_sqm ?? 0;
  const paintable = Math.max(0, wallArea - nonPaintable);
  if (paintable <= 0) return null;
  return Math.ceil((paintable / settings.paint_coverage_sqm_per_liter) * settings.paint_coats);
}

function mmToM(val: number | null | undefined): string {
  if (val === null || val === undefined) return "";
  return (val / 1000).toFixed(1);
}

function mToMm(val: string): number | null {
  const trimmed = val.trim();
  if (trimmed === "") return null;
  const num = Number(trimmed.replace(",", "."));
  if (isNaN(num)) return null;
  return Math.round(num * 1000);
}

// ---------------------------------------------------------------------------
// Paint Formula Popover (used for both header info and cell clicks)
// ---------------------------------------------------------------------------

interface PaintFormulaPopoverProps {
  settings: EstimationSettings;
  onSettingsChange: (s: EstimationSettings) => void;
  room?: Room; // if provided, show room-specific breakdown
  children: React.ReactNode;
}

function PaintFormulaPopover({ settings, onSettingsChange, room, children }: PaintFormulaPopoverProps) {
  const { t } = useTranslation();
  const ms = useMeasurement();
  const [localCoverage, setLocalCoverage] = useState(String(settings.paint_coverage_sqm_per_liter));
  const [localCoats, setLocalCoats] = useState(String(settings.paint_coats));

  // Sync local state when settings change externally
  useEffect(() => {
    setLocalCoverage(String(settings.paint_coverage_sqm_per_liter));
    setLocalCoats(String(settings.paint_coats));
  }, [settings.paint_coverage_sqm_per_liter, settings.paint_coats]);

  const handleSave = () => {
    const coverage = Number(localCoverage);
    const coats = Number(localCoats);
    if (coverage > 0 && coats > 0) {
      onSettingsChange({
        paint_coverage_sqm_per_liter: coverage,
        paint_coats: coats,
      });
    }
  };

  // Room-specific calculation breakdown
  const wallArea = room ? computeWallAreaSqm(room) : null;
  const nonPaintable = room?.dimensions?.non_paintable_area_sqm ?? 0;
  const paintable = wallArea ? Math.max(0, wallArea - nonPaintable) : null;
  const result = paintable
    ? Math.ceil((paintable / settings.paint_coverage_sqm_per_liter) * settings.paint_coats)
    : null;

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-[calc(100%-2rem)] sm:w-72 p-3" align="start">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium mb-1">{t("estimation.paintFormula", "Paint formula")}</p>
            <p className="text-xs text-muted-foreground">
              {t("estimation.paintFormulaDesc", "wall area / coverage × coats")}
            </p>
          </div>

          {/* Room-specific breakdown */}
          {room && paintable !== null && result !== null && (
            <div className="bg-muted/50 rounded-md p-2 text-xs tabular-nums space-y-0.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("rooms.wallArea")}:</span>
                <span>{wallArea?.toFixed(1)} {ms.areaLabel}</span>
              </div>
              {nonPaintable > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("estimation.nonPaintable", "Non-paintable")}:</span>
                  <span>-{nonPaintable.toFixed(1)} {ms.areaLabel}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-0.5 mt-0.5">
                <span className="text-muted-foreground">{t("estimation.paintableArea", "Paintable")}:</span>
                <span>{paintable.toFixed(1)} {ms.areaLabel}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{t("estimation.calculation", "Calculation")}:</span>
                <span>{paintable.toFixed(1)} / {settings.paint_coverage_sqm_per_liter} × {settings.paint_coats} = <strong className="text-foreground">~{result} L</strong></span>
              </div>
            </div>
          )}

          {/* Adjustable settings */}
          <div className="space-y-2 pt-1 border-t">
            <p className="text-xs font-medium">{t("estimation.adjustSettings", "Adjust defaults")}</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">{t("estimation.coverage", "Coverage (m²/L)")}</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="1"
                  className="h-7 text-sm mt-0.5"
                  value={localCoverage}
                  onChange={(e) => setLocalCoverage(e.target.value)}
                  onBlur={handleSave}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t("estimation.coats", "Coats")}</Label>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  max="5"
                  className="h-7 text-sm mt-0.5"
                  value={localCoats}
                  onChange={(e) => setLocalCoats(e.target.value)}
                  onBlur={handleSave}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/70">
              {t("estimation.savedToProfile", "Changes are saved to your profile")}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface PlanningRoomListProps {
  projectId: string;
  locked?: boolean;
  onRoomChange?: () => void;
}

export function PlanningRoomList({ projectId, locked = false, onRoomChange }: PlanningRoomListProps) {
  const { t } = useTranslation();
  const ms = useMeasurement();
  const { user } = useAuthSession();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [addingLoading, setAddingLoading] = useState(false);
  const autoOpenedRef = useRef(false);

  // Auto-open add row when room list is empty
  useEffect(() => {
    if (!loading && rooms.length === 0 && !locked && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setIsAdding(true);
    }
  }, [loading, rooms.length, locked]);
  const [editingCell, setEditingCell] = useState<{ roomId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [visibleExtras, setVisibleExtras] = useState<Set<ExtraColumnKey>>(DEFAULT_EXTRAS);
  const [estimationSettings, setEstimationSettings] = useState<EstimationSettings>(DEFAULT_ESTIMATION);
  const [profileId, setProfileId] = useState<string | null>(null);

  const show = useMemo(() => {
    const s: Record<ExtraColumnKey, boolean> = {} as Record<ExtraColumnKey, boolean>;
    for (const col of EXTRA_COLUMNS) {
      s[col.key] = visibleExtras.has(col.key);
    }
    return s;
  }, [visibleExtras]);

  const visibleColCount = useMemo(() => {
    let count = 2; // name + area
    for (const key of EXTRA_COLUMNS.map((c) => c.key)) {
      if (visibleExtras.has(key)) count++;
    }
    if (!locked) count++;
    count++; // flexible spacer column (absorbs slack so data columns stay grouped)
    return count;
  }, [visibleExtras, locked]);

  // ---- Fetch estimation settings from profile ----
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("id, estimation_settings")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setProfileId(data.id);
          setEstimationSettings(
            parseEstimationSettings(data.estimation_settings as Record<string, unknown> | null)
          );
        }
      });
  }, [user]);

  const handleEstimationChange = useCallback(
    async (newSettings: EstimationSettings) => {
      setEstimationSettings(newSettings);
      if (!profileId) return;
      const { error } = await supabase
        .from("profiles")
        .update({ estimation_settings: newSettings as unknown as Record<string, unknown> })
        .eq("id", profileId);
      if (error) {
        console.error("Failed to save estimation settings:", error);
      } else {
        toast.success(t("estimation.settingsSaved", "Settings saved"));
      }
    },
    [profileId, t]
  );

  // ---- Data fetching ----
  // Room attachment counts from task_file_links
  const [roomAttachCounts, setRoomAttachCounts] = useState<Map<string, number>>(new Map());

  const fetchRooms = useCallback(async () => {
    const [roomsRes, linksRes] = await Promise.all([
      supabase.from("rooms").select("*").eq("project_id", projectId).order("created_at", { ascending: true }),
      supabase.from("task_file_links").select("room_id").eq("project_id", projectId).not("room_id", "is", null),
    ]);
    if (roomsRes.error) {
      console.error("Failed to load rooms:", roomsRes.error);
    } else {
      setRooms(roomsRes.data as Room[]);
    }
    // Build counts
    const counts = new Map<string, number>();
    (linksRes.data || []).forEach((l: { room_id: string | null }) => {
      if (l.room_id) counts.set(l.room_id, (counts.get(l.room_id) || 0) + 1);
    });
    setRoomAttachCounts(counts);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  useEffect(() => {
    const channel = supabase
      .channel(`planning-rooms-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `project_id=eq.${projectId}` },
        () => fetchRooms()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, fetchRooms]);

  // ---- Quick add ----
  const handleQuickAdd = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setAddingLoading(true);
    const { error } = await supabase
      .from("rooms")
      .insert({
        project_id: projectId,
        name,
        ceiling_height_mm: DEFAULT_CEILING_MM,
        dimensions: {},
      });
    if (error) {
      toast.error(t("rooms.failedToCreate", "Failed to create room"));
    } else {
      toast.success(t("rooms.roomCreated"));
    }
    setNewName("");
    setIsAdding(false);
    setAddingLoading(false);
    fetchRooms();
    onRoomChange?.();
  }, [newName, projectId, t, fetchRooms, onRoomChange]);

  // ---- Delete ----
  const handleDelete = useCallback(async (roomId: string) => {
    const { error } = await supabase.from("rooms").delete().eq("id", roomId);
    if (error) {
      toast.error(t("common.error", "Error"));
    }
    fetchRooms();
    onRoomChange?.();
  }, [t, fetchRooms, onRoomChange]);

  // ---- Inline edit ----
  const startEdit = useCallback((roomId: string, field: string, currentValue: string) => {
    if (locked) return;
    setEditingCell({ roomId, field });
    setEditValue(currentValue);
  }, [locked]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue("");
  }, []);

  const saveEdit = useCallback(async (roomId: string, field: string, rawValue: string) => {
    setEditingCell(null);
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;

    let updatePayload: Record<string, unknown> = {};

    if (field === "name") {
      const trimmed = rawValue.trim();
      if (!trimmed) return;
      updatePayload = { name: trimmed };
    } else if (field === "ceilingHeight") {
      // Input is in meters, store as mm
      const mmVal = mToMm(rawValue);
      updatePayload = { ceiling_height_mm: mmVal };
    } else if (field === "width") {
      // Input is in meters, store as mm
      const mmVal = mToMm(rawValue);
      const dims = { ...(room.dimensions || {}), width_mm: mmVal };
      if (mmVal && dims.height_mm) {
        dims.area_sqm = (mmVal / 1000) * (dims.height_mm / 1000);
      }
      updatePayload = { dimensions: dims };
    } else if (field === "depth") {
      // Input is in meters, store as mm
      const mmVal = mToMm(rawValue);
      const dims = { ...(room.dimensions || {}), height_mm: mmVal };
      if (mmVal && dims.width_mm) {
        dims.area_sqm = (dims.width_mm / 1000) * (mmVal / 1000);
      }
      updatePayload = { dimensions: dims };
    } else if (field === "area") {
      const numVal = rawValue.trim() === "" ? null : Number(rawValue.replace(",", "."));
      const dims = { ...(room.dimensions || {}), area_sqm: numVal };
      updatePayload = { dimensions: dims };
    } else if (field === "wallArea") {
      const numVal = rawValue.trim() === "" ? null : Number(rawValue.replace(",", "."));
      const dims = { ...(room.dimensions || {}), wall_area_sqm: numVal };
      updatePayload = { dimensions: dims };
    }

    if (Object.keys(updatePayload).length === 0) return;

    setRooms((prev) =>
      prev.map((r) => {
        if (r.id !== roomId) return r;
        if (field === "name") return { ...r, name: rawValue.trim() };
        if (field === "ceilingHeight") return { ...r, ceiling_height_mm: updatePayload.ceiling_height_mm as number | null };
        if (field === "width" || field === "depth" || field === "area" || field === "wallArea") {
          return { ...r, dimensions: updatePayload.dimensions as Room["dimensions"] };
        }
        return r;
      })
    );

    const { error } = await supabase
      .from("rooms")
      .update(updatePayload)
      .eq("id", roomId);

    if (error) {
      toast.error(t("common.error", "Error"));
      fetchRooms();
    }
  }, [rooms, t, fetchRooms]);

  // ---- Toggle columns ----
  const toggleColumn = useCallback((key: ExtraColumnKey) => {
    setVisibleExtras((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ---- Render helpers ----
  const renderEditableCell = (
    room: Room,
    field: string,
    displayValue: string,
    className = ""
  ) => {
    const isEditing = editingCell?.roomId === room.id && editingCell?.field === field;

    if (isEditing) {
      return (
        <Input
          autoFocus
          type={field === "name" ? "text" : "number"}
          className="h-7 w-full text-sm"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveEdit(room.id, field, editValue);
            if (e.key === "Escape") cancelEdit();
          }}
          onBlur={() => saveEdit(room.id, field, editValue)}
        />
      );
    }

    if (locked) {
      return <span className={`text-sm ${className}`}>{displayValue || "–"}</span>;
    }

    return (
      <button
        className={`text-sm text-left w-full rounded px-1 -mx-1 hover:bg-muted cursor-text transition-colors ${className}`}
        onClick={() => startEdit(room.id, field, displayValue === "–" ? "" : displayValue)}
      >
        {displayValue || <span className="text-muted-foreground">–</span>}
      </button>
    );
  };

  // ---- Summary stats ----
  const totalArea = useMemo(() => {
    return rooms.reduce((sum, r) => sum + (computeFloorAreaSqm(r) || 0), 0);
  }, [rooms]);

  const totalWallArea = useMemo(() => {
    return rooms.reduce((sum, r) => sum + (computeWallAreaSqm(r) || 0), 0);
  }, [rooms]);

  const roomsWithDimensions = useMemo(() => {
    return rooms.filter((r) => computeFloorAreaSqm(r) !== null).length;
  }, [rooms]);

  // ---- Render ----
  return (
    <div className="space-y-3">
      {/* Header strip */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Home className="h-5 w-5 text-blue-500" />
          <div>
            <h3 className="text-base font-semibold">{t("planningRooms.title", "Room planning")}</h3>
            <p className="text-xs text-muted-foreground">
              {t("planningRooms.description", "Add rooms and dimensions to help estimate work")}
            </p>
          </div>
        </div>

        {rooms.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>
              {t("planningRooms.totalArea", "Total area")}: <strong>{totalArea > 0 ? `${totalArea.toFixed(1)} ${ms.areaLabel}` : "–"}</strong>
            </span>
            {show.wallArea && totalWallArea > 0 && (
              <span>
                {t("rooms.wallArea")}: <strong>{totalWallArea.toFixed(1)} {ms.areaLabel}</strong>
              </span>
            )}
            <span className="text-muted-foreground/60">
              {roomsWithDimensions}/{rooms.length} {t("planningRooms.measured", "measured")}
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : (
        <>
          <div className="rounded-lg border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted border-b">
                  <th className="px-3 py-2.5 text-left kicker w-[140px] sticky left-0 z-20 bg-muted">{t("planningRooms.roomName", "Room")}</th>
                  {show.width && <th className="px-3 py-2.5 text-right kicker whitespace-nowrap">{t("rooms.width")}</th>}
                  {show.depth && <th className="px-3 py-2.5 text-right kicker whitespace-nowrap">{t("rooms.depth")}</th>}
                  {show.ceilingHeight && <th className="px-3 py-2.5 text-right kicker whitespace-nowrap hidden sm:table-cell">{t("rooms.ceilingHeight")}</th>}
                  <th className="px-3 py-2.5 text-right kicker whitespace-nowrap">{t("rooms.area")}</th>
                  {show.wallArea && <th className="px-3 py-2.5 text-right kicker whitespace-nowrap hidden sm:table-cell">{t("rooms.wallArea")}</th>}
                  {show.paintEstimate && (
                    <th className="px-3 py-2.5 text-right kicker whitespace-nowrap w-[100px]">
                      <div className="flex items-center justify-end gap-1">
                        {t("rooms.paintEstimate")}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <PaintFormulaPopover
                                settings={estimationSettings}
                                onSettingsChange={handleEstimationChange}
                              >
                                <button className="text-muted-foreground/60 hover:text-foreground transition-colors">
                                  <Info className="h-3 w-3" />
                                </button>
                              </PaintFormulaPopover>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              {t("estimation.clickToAdjust", "Click to adjust formula")}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </th>
                  )}
                  {show.status && <th className="px-3 py-2.5 text-left kicker w-[100px]">{t("common.status")}</th>}
                  {show.attachments && <th className="px-3 py-2.5 text-left kicker w-[60px]">{t("tasksTable.attachment", "Bilagor")}</th>}
                  {/* Flexible spacer: soaks up slack so the data columns stay grouped and don't drift with window width */}
                  <th className="w-full p-0" aria-hidden="true" />
                  {!locked && <th className="w-[40px] px-2 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => {
                  const area = computeFloorAreaSqm(room);
                  const wallArea = computeWallAreaSqm(room);
                  const paintLiters = computePaintLiters(room, estimationSettings);

                  return (
                    <tr key={room.id} className="group border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5 sticky left-0 z-10 bg-card">
                        {renderEditableCell(room, "name", room.name, "font-medium")}
                      </td>
                      {show.width && (
                        <td className="px-3 py-2.5 text-right">
                          {renderEditableCell(room, "width", mmToM(room.dimensions?.width_mm), "tabular-nums text-right")}
                        </td>
                      )}
                      {show.depth && (
                        <td className="px-3 py-2.5 text-right">
                          {renderEditableCell(room, "depth", mmToM(room.dimensions?.height_mm), "tabular-nums text-right")}
                        </td>
                      )}
                      {show.ceilingHeight && (
                        <td className="px-3 py-2.5 text-right hidden sm:table-cell">
                          {renderEditableCell(room, "ceilingHeight", mmToM(room.ceiling_height_mm), "tabular-nums text-right")}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right">
                        {renderEditableCell(room, "area", area !== null ? area.toFixed(1) : "", "tabular-nums text-right")}
                      </td>
                      {show.wallArea && (
                        <td className="px-3 py-2.5 text-right hidden sm:table-cell">
                          {renderEditableCell(
                            room,
                            "wallArea",
                            room.dimensions?.wall_area_sqm != null
                              ? (room.dimensions.wall_area_sqm as number).toFixed(1)
                              : wallArea !== null ? wallArea.toFixed(1) : "",
                            "tabular-nums text-muted-foreground text-right"
                          )}
                        </td>
                      )}
                      {show.paintEstimate && (
                        <td className="px-3 py-2.5 text-right">
                          {paintLiters !== null ? (
                            <PaintFormulaPopover
                              settings={estimationSettings}
                              onSettingsChange={handleEstimationChange}
                              room={room}
                            >
                              <button className="text-sm tabular-nums text-muted-foreground hover:text-foreground hover:bg-muted rounded px-1 -mx-1 transition-colors cursor-pointer">
                                ~{paintLiters} L
                              </button>
                            </PaintFormulaPopover>
                          ) : (
                            <span className="text-sm text-muted-foreground">–</span>
                          )}
                        </td>
                      )}
                      {show.status && (
                        <td className="px-3 py-2.5">
                          <span className="text-xs text-muted-foreground">
                            {room.status ? t(`roomStatuses.${room.status.replace(/_/g, "")}`, room.status) : "–"}
                          </span>
                        </td>
                      )}
                      {show.attachments && (
                        <td className="px-3 py-2.5">
                          {roomAttachCounts.get(room.id) ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Paperclip className="h-3 w-3" />
                              {roomAttachCounts.get(room.id)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">–</span>
                          )}
                        </td>
                      )}
                      <td className="w-full p-0" aria-hidden="true" />
                      {!locked && (
                        <td className="px-2 py-2.5 w-[40px]">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(room.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}

                {isAdding && (
                  <tr>
                    <td colSpan={visibleColCount} className="px-3 py-2.5">
                      <form
                        className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleQuickAdd();
                        }}
                      >
                        <Input
                          autoFocus
                          placeholder={t("rooms.roomNamePlaceholder")}
                          className="h-7 text-sm flex-1 max-w-[240px]"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              setIsAdding(false);
                              setNewName("");
                            }
                          }}
                          disabled={addingLoading}
                        />
                        <Button type="submit" size="sm" variant="ghost" className="h-7 text-xs" disabled={!newName.trim() || addingLoading}>
                          {t("common.add", "Add")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={() => { setIsAdding(false); setNewName(""); }}
                        >
                          {t("common.cancel")}
                        </Button>
                      </form>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2">
            {!locked && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setIsAdding(true)}>
                <Plus className="h-3.5 w-3.5" />
                {t("planningRooms.addRoom", "Add room")}
              </Button>
            )}

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" title={t("planningTasks.showColumns", "Columns")}>
                  <Columns3 className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="end">
                {EXTRA_COLUMNS.map((col) => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={visibleExtras.has(col.key)}
                      onCheckedChange={() => toggleColumn(col.key)}
                    />
                    {t(col.labelKey)}
                  </label>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        </>
      )}
    </div>
  );
}
