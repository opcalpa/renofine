import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
  ArrowUpDown,
  LayoutGrid,
  Table as TableIcon,
  CheckSquare,
  Layers,
  Settings2,
} from "lucide-react";
import { ColumnToggle } from "@/components/shared/ColumnToggle";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { RoomsTableView } from "../rooms-table/RoomsTableView";
import {
  FIELD_DEFINITIONS,
  DEFAULT_VISIBLE_FIELDS,
  type Room,
  type FieldKey,
} from "../rooms-table/types";
import { RoomCardV2 } from "./RoomCardV2";
import { useRoomsProgress } from "./useRoomsProgress";
import { useRoomCoverPhotos } from "./useRoomCoverPhotos";

type SortOption = "name_asc" | "name_desc" | "area_desc" | "area_asc" | "created_desc" | "created_asc";
type ViewMode = "cards" | "table";
type GroupBy = "status" | "none";

const SORT_STORAGE_KEY = "renofine_rooms_sort";
const VIEW_MODE_STORAGE_KEY = "renofine_rooms_view_mode";
const VISIBLE_FIELDS_STORAGE_KEY = "renofine_rooms_visible_fields";
const GROUP_STORAGE_KEY = "renofine_rooms_group_by";

interface RoomsListV2Props {
  projectId: string;
  rooms?: Room[];
  onRoomClick: (room: Room) => void;
  onAddRoom?: () => void;
  onDeleteRoom?: (roomId: string) => void;
  onNavigateToRoom?: (room: Room) => void;
  onPlaceRoom?: (room: Room) => void;
  onRoomUpdated?: () => void;
  onShowAllOnPlan?: () => void;
}

export function RoomsListV2({
  projectId,
  rooms: externalRooms,
  onRoomClick,
  onAddRoom,
  onDeleteRoom,
  onNavigateToRoom,
  onPlaceRoom,
  onRoomUpdated,
  onShowAllOnPlan,
}: RoomsListV2Props) {
  const { t, i18n } = useTranslation();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(!externalRooms);
  const [searchTerm, setSearchTerm] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  const { progressMap } = useRoomsProgress(projectId);
  const coverMap = useRoomCoverPhotos(rooms.map((r) => r.id));

  const [sortOption, setSortOption] = useState<SortOption>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(SORT_STORAGE_KEY);
      if (saved && ["name_asc", "name_desc", "area_desc", "area_asc", "created_desc", "created_asc"].includes(saved)) {
        return saved as SortOption;
      }
    }
    return "created_desc";
  });

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (saved === "table" || saved === "cards") return saved;
    }
    return "cards";
  });

  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(GROUP_STORAGE_KEY);
      if (saved === "status" || saved === "none") return saved;
    }
    return "status";
  });

  const [visibleFields, setVisibleFields] = useState<Set<FieldKey>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(VISIBLE_FIELDS_STORAGE_KEY);
      if (saved) {
        try {
          return new Set(JSON.parse(saved) as FieldKey[]);
        } catch {
          // ignore
        }
      }
    }
    return new Set(DEFAULT_VISIBLE_FIELDS);
  });

  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (externalRooms) {
      setRooms(externalRooms);
      setLoading(false);
    } else {
      setLoading(true);
      fetchRooms().finally(() => setLoading(false));
    }
  }, [externalRooms, projectId]);

  const fetchRooms = async () => {
    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Fetch rooms failed:", error);
      toast.error(t("rooms.fetchError", "Kunde inte hämta rum"));
      return;
    }
    setRooms(data || []);
  };

  const handleSortChange = useCallback((value: SortOption) => {
    setSortOption(value);
    localStorage.setItem(SORT_STORAGE_KEY, value);
    import("@/hooks/usePersistedPreference").then(({ scheduleServerSync }) =>
      scheduleServerSync(SORT_STORAGE_KEY, value)
    );
  }, []);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    import("@/hooks/usePersistedPreference").then(({ scheduleServerSync }) =>
      scheduleServerSync(VIEW_MODE_STORAGE_KEY, mode)
    );
  }, []);

  const handleGroupChange = useCallback((g: GroupBy) => {
    setGroupBy(g);
    localStorage.setItem(GROUP_STORAGE_KEY, g);
  }, []);

  const handleVisibleFieldsChange = useCallback((next: Set<FieldKey>) => {
    setVisibleFields(next);
    const arr = Array.from(next);
    localStorage.setItem(VISIBLE_FIELDS_STORAGE_KEY, JSON.stringify(arr));
    import("@/hooks/usePersistedPreference").then(({ scheduleServerSync }) =>
      scheduleServerSync(VISIBLE_FIELDS_STORAGE_KEY, arr)
    );
  }, []);

  const filteredRooms = useMemo(() => {
    const filtered = rooms.filter(
      (room) =>
        room.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        room.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        room.notes?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return [...filtered].sort((a, b) => {
      switch (sortOption) {
        case "name_asc":
          return a.name.localeCompare(b.name, i18n.language);
        case "name_desc":
          return b.name.localeCompare(a.name, i18n.language);
        case "area_desc":
          return (b.dimensions?.area_sqm ?? 0) - (a.dimensions?.area_sqm ?? 0);
        case "area_asc":
          return (a.dimensions?.area_sqm ?? 0) - (b.dimensions?.area_sqm ?? 0);
        case "created_desc":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "created_asc":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        default:
          return 0;
      }
    });
  }, [rooms, searchTerm, sortOption, i18n.language]);

  const toggleRoomSelection = useCallback((roomId: string) => {
    setSelectedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  }, []);

  const selectAllFiltered = useCallback(() => {
    setSelectedRoomIds(new Set(filteredRooms.map((r) => r.id)));
  }, [filteredRooms]);

  const clearSelection = useCallback(() => {
    setSelectedRoomIds(new Set());
  }, []);

  const toggleBulkMode = useCallback(() => {
    setBulkMode((m) => !m);
    setSelectedRoomIds(new Set());
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedRoomIds.size === 0) return;
    const count = selectedRoomIds.size;
    if (!window.confirm(t("rooms.confirmBulkDelete", { count }))) return;
    setIsDeleting(true);
    try {
      for (const id of selectedRoomIds) {
        onDeleteRoom?.(id);
      }
      clearSelection();
      setBulkMode(false);
      toast.success(t("rooms.bulkDeleteSuccess", { count }));
    } catch (e) {
      console.error("Bulk delete error:", e);
      toast.error(t("rooms.bulkDeleteError"));
    } finally {
      setIsDeleting(false);
    }
  }, [selectedRoomIds, onDeleteRoom, clearSelection, t]);

  const handleOptimisticUpdate = useCallback((roomId: string, updates: Partial<Room>) => {
    setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, ...updates } : r)));
  }, []);

  // Group rooms when groupBy = status
  const groups = useMemo(() => {
    if (groupBy === "none") {
      return [{ key: "all", title: t("rooms.allRooms", "Alla rum"), rooms: filteredRooms }];
    }
    const active: Room[] = [];
    const todo: Room[] = [];
    const done: Room[] = [];
    for (const r of filteredRooms) {
      const p = progressMap.get(r.id);
      const pct = p?.pct ?? 0;
      if (pct === 100) done.push(r);
      else if (pct > 0) active.push(r);
      else todo.push(r);
    }
    return [
      { key: "active", title: t("rooms.groupActive", "Pågår"), rooms: active },
      { key: "todo", title: t("rooms.groupTodo", "Inte startat"), rooms: todo },
      { key: "done", title: t("rooms.groupDone", "Klart"), rooms: done },
    ].filter((g) => g.rooms.length > 0);
  }, [filteredRooms, groupBy, progressMap, t]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--rf-green)" }} />
      </div>
    );
  }

  return (
    <div className="rf-paper" style={{ background: "var(--rf-paper)", minHeight: "100%" }}>
      {/* PAGE HEAD */}
      <div
        className="px-6 pt-6 pb-4 sm:px-10"
        style={{ borderBottom: "1px solid var(--rf-hairline)", background: "var(--rf-surface)" }}
      >
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <div className="rf-eyebrow mb-1.5">
              {t("rooms.title", "Rum")} · {filteredRooms.length}
            </div>
            <h1 className="rf-display" style={{ fontSize: 30, margin: 0 }}>
              {t("rooms.title", "Rum")}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleBulkMode}
              className="gap-1.5"
              style={
                bulkMode
                  ? { background: "var(--rf-bg-sunken)", color: "var(--rf-ink)" }
                  : undefined
              }
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {bulkMode
                ? t("rooms.endSelection", "Avsluta val")
                : t("rooms.select", "Välj")}
            </Button>
            {onShowAllOnPlan && (
              <Button variant="outline" size="sm" onClick={onShowAllOnPlan} className="gap-1.5">
                <Layers className="h-3.5 w-3.5" />
                {t("rooms.showOnFloorPlan", "Visa på ritning")}
              </Button>
            )}
            {onAddRoom && (
              <Button
                size="sm"
                onClick={onAddRoom}
                className="gap-1.5"
                style={{
                  background: "var(--rf-ink)",
                  color: "var(--rf-paper)",
                  border: "1px solid var(--rf-ink)",
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                {t("rooms.newRoom", "Nytt rum")}
              </Button>
            )}
          </div>
        </div>

        {/* primary toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-md flex-1">
            <Search
              className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
              style={{ color: "var(--rf-fg-muted)" }}
            />
            <Input
              type="text"
              placeholder={t("rooms.searchPlaceholderV2", "Sök rum, anteckningar, material…")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              style={{ background: "var(--rf-paper)", borderColor: "var(--rf-hairline)" }}
            />
          </div>
          <Select value={sortOption} onValueChange={(v) => handleSortChange(v as SortOption)}>
            <SelectTrigger className="w-[170px]">
              <ArrowUpDown className="mr-2 h-3.5 w-3.5" style={{ color: "var(--rf-fg-muted)" }} />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_desc">{t("rooms.sortCreatedDesc", "Nyast först")}</SelectItem>
              <SelectItem value="created_asc">{t("rooms.sortCreatedAsc", "Äldst först")}</SelectItem>
              <SelectItem value="name_asc">{t("rooms.sortNameAsc", "Namn A–Ö")}</SelectItem>
              <SelectItem value="name_desc">{t("rooms.sortNameDesc", "Namn Ö–A")}</SelectItem>
              <SelectItem value="area_desc">{t("rooms.sortAreaDesc", "Yta (störst)")}</SelectItem>
              <SelectItem value="area_asc">{t("rooms.sortAreaAsc", "Yta (minst)")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* secondary toolbar — group & view */}
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="rf-eyebrow">{t("rooms.groupBy", "Gruppera")}</span>
            {(["status", "none"] as GroupBy[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => handleGroupChange(g)}
                className="rounded px-2 py-0.5 text-xs"
                style={{
                  fontWeight: groupBy === g ? 500 : 400,
                  color: groupBy === g ? "var(--rf-ink)" : "var(--rf-fg-muted)",
                  background: groupBy === g ? "var(--rf-paper)" : "transparent",
                  border: groupBy === g ? "1px solid var(--rf-hairline)" : "1px solid transparent",
                }}
              >
                {g === "status" ? t("common.status", "Status") : t("rooms.groupNone", "Ingen")}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {isDesktop && viewMode === "table" && (
              <ColumnToggle
                columns={FIELD_DEFINITIONS.map((f) => f.key)}
                labels={
                  Object.fromEntries(
                    FIELD_DEFINITIONS.map((f) => [f.key, t(f.labelKey, f.key)])
                  ) as Record<string, string>
                }
                visible={visibleFields}
                onChange={(v) => handleVisibleFieldsChange(v as Set<FieldKey>)}
                trigger={
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
                    style={{
                      color: "var(--rf-fg-muted)",
                      background: "transparent",
                      border: "1px solid var(--rf-hairline)",
                    }}
                  >
                    <Settings2 className="h-3 w-3" />
                    {t("rooms.fields", "Fält")}
                    <span
                      className="rf-num"
                      style={{ fontSize: 10, color: "var(--rf-fg-muted)", fontWeight: 500 }}
                    >
                      {visibleFields.size}
                    </span>
                  </button>
                }
              />
            )}
            {isDesktop && (
              <div
                className="flex p-0.5"
                style={{
                  background: "var(--rf-bg-sunken)",
                  borderRadius: 6,
                  border: "1px solid var(--rf-hairline)",
                }}
              >
                {(["cards", "table"] as ViewMode[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => handleViewModeChange(v)}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs"
                    style={{
                      fontWeight: viewMode === v ? 500 : 400,
                      color: viewMode === v ? "var(--rf-ink)" : "var(--rf-fg-muted)",
                      background: viewMode === v ? "var(--rf-surface)" : "transparent",
                      border: viewMode === v ? "1px solid var(--rf-hairline)" : "1px solid transparent",
                    }}
                  >
                    {v === "cards" ? (
                      <LayoutGrid className="h-3 w-3" />
                    ) : (
                      <TableIcon className="h-3 w-3" />
                    )}
                    {v === "cards" ? t("rooms.viewCards", "Kort") : t("rooms.viewTable", "Tabell")}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BULK ACTION BANNER (sand) */}
      {bulkMode && selectedRoomIds.size > 0 && (
        <div
          className="flex items-center justify-between px-6 py-2.5 sm:px-10"
          style={{ background: "#F4EFE3", borderBottom: "1px solid #D9CFB8" }}
        >
          <div style={{ fontSize: 13, color: "#5A4A1F", fontWeight: 500 }}>
            {t("rooms.selectedCount", { count: selectedRoomIds.size })}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={selectAllFiltered}>
              {t("rooms.selectAll", "Markera alla")}
            </Button>
            <Button variant="outline" size="sm" onClick={clearSelection}>
              <X className="h-3.5 w-3.5" />
            </Button>
            {onDeleteRoom && (
              <Button
                size="sm"
                onClick={handleBulkDelete}
                disabled={isDeleting}
                style={{ background: "#B5341E", color: "#fff", border: "1px solid #B5341E" }}
              >
                {isDeleting ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                )}
                {t("rooms.deleteSelected", "Ta bort")}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* CONTENT */}
      <div className="px-6 pb-10 pt-6 sm:px-10">
        {filteredRooms.length === 0 ? (
          <div
            className="rounded-lg border-2 border-dashed py-12 text-center"
            style={{ borderColor: "var(--rf-hairline)" }}
          >
            <h3 className="rf-display mb-1" style={{ fontSize: 20 }}>
              {searchTerm ? t("rooms.noRoomsFound", "Inga rum hittades") : t("rooms.noRoomsYet", "Inga rum ännu")}
            </h3>
            <p style={{ fontSize: 13, color: "var(--rf-fg-muted)" }}>
              {searchTerm
                ? t("rooms.tryAnotherSearch", "Prova en annan sökning")
                : t("rooms.drawRoomHint", "Rita ett rum på ritningen genom att använda Rum-verktyget")}
            </p>
          </div>
        ) : isDesktop && viewMode === "table" ? (
          <RoomsTableView
            rooms={filteredRooms}
            visibleFields={Array.from(visibleFields)}
            fieldDefinitions={FIELD_DEFINITIONS}
            selectedRoomIds={selectedRoomIds}
            onRoomClick={onRoomClick}
            onToggleSelection={toggleRoomSelection}
            onDeleteRoom={onDeleteRoom}
            onNavigateToRoom={onNavigateToRoom}
            onPlaceRoom={onPlaceRoom}
            onRoomUpdated={onRoomUpdated}
            onOptimisticUpdate={handleOptimisticUpdate}
            bulkMode={bulkMode}
            formatDate={(iso) =>
              new Date(iso).toLocaleDateString(i18n.language === "sv" ? "sv-SE" : "en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
            }
          />
        ) : (
          groups.map((g) => (
            <div key={g.key} className="mb-8">
              <div className="mb-4 flex items-baseline gap-3">
                <h2 className="rf-display" style={{ fontSize: 18, margin: 0 }}>
                  {g.title}
                </h2>
                <span className="rf-num" style={{ fontSize: 12, color: "var(--rf-fg-muted)" }}>
                  {g.rooms.length}
                </span>
                <div
                  className="flex-1"
                  style={{ height: 1, background: "var(--rf-hairline)" }}
                />
              </div>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {g.rooms.map((room) => (
                  <RoomCardV2
                    key={room.id}
                    room={room}
                    progress={progressMap.get(room.id)}
                    coverPhoto={coverMap.get(room.id)}
                    bulkMode={bulkMode}
                    selected={selectedRoomIds.has(room.id)}
                    onClick={() => onRoomClick(room)}
                    onToggleSelect={() => toggleRoomSelection(room.id)}
                    onShowOnPlan={() => onNavigateToRoom?.(room)}
                    onPlaceOnPlan={() => onPlaceRoom?.(room)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
