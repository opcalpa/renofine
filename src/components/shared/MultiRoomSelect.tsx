import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface Room {
  id: string;
  name: string;
}

interface MultiRoomSelectProps {
  rooms: Room[];
  selectedIds: string[];
  onChange: (roomIds: string[]) => void;
  /** Compact inline mode for table cells */
  compact?: boolean;
  /** Align popover */
  align?: "start" | "center" | "end";
  className?: string;
  /**
   * When set, selected room names become links into the room's detail view:
   * clicking a name opens the room, the chevron/rest of the field opens the
   * picker. Each popover row also gets an open-arrow.
   */
  onOpenRoom?: (roomId: string) => void;
}

export function MultiRoomSelect({
  rooms,
  selectedIds,
  onChange,
  compact = false,
  align = "start",
  className,
  onOpenRoom,
}: MultiRoomSelectProps) {
  const { t } = useTranslation();

  const toggle = useCallback(
    (roomId: string) => {
      const next = selectedIds.includes(roomId)
        ? selectedIds.filter((id) => id !== roomId)
        : [...selectedIds, roomId];
      onChange(next);
    },
    [selectedIds, onChange]
  );

  const selectAll = useCallback(() => {
    onChange(rooms.map((r) => r.id));
  }, [rooms, onChange]);

  const clearAll = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const selectedRooms = selectedIds
    .map((id) => rooms.find((r) => r.id === id))
    .filter((r): r is Room => !!r);
  const selectedNames = selectedRooms.map((r) => r.name);

  const allSelected = rooms.length > 0 && selectedIds.length === rooms.length;

  // Clickable room name → into the room; stops the click from reaching the
  // popover trigger so "open room" and "open picker" never fight.
  const roomLink = (room: Room) => (
    <span
      key={room.id}
      className="text-primary hover:underline cursor-pointer"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpenRoom?.(room.id);
      }}
    >
      {room.name}
    </span>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "text-left transition-colors",
            compact
              ? "h-8 px-2 rounded border text-xs hover:bg-accent flex items-center gap-1 min-w-[100px] max-w-[180px]"
              : "w-full px-3 py-2 rounded-md border text-sm hover:bg-accent flex items-center gap-1.5 min-h-[36px]",
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {selectedNames.length === 0 ? (
            <span className="text-muted-foreground">
              {t("tasks.noRoom")}
            </span>
          ) : onOpenRoom ? (
            <span className="truncate">
              {selectedRooms.slice(0, 2).map((r, i) => (
                <span key={r.id}>
                  {i > 0 && <span>, </span>}
                  {roomLink(r)}
                </span>
              ))}
              {selectedRooms.length > 2 && <span>, +{selectedRooms.length - 2}</span>}
            </span>
          ) : selectedNames.length <= 2 ? (
            <span className="truncate">{selectedNames.join(", ")}</span>
          ) : (
            <span className="truncate">
              {selectedNames[0]}, +{selectedNames.length - 1}
            </span>
          )}
          {onOpenRoom && (
            <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1" align={align}>
        <div className="space-y-0.5">
          {/* All rooms toggle */}
          <label className="flex items-center gap-2 w-full text-sm px-2 py-1.5 rounded hover:bg-muted cursor-pointer font-medium">
            <Checkbox
              checked={allSelected}
              onCheckedChange={() => (allSelected ? clearAll() : selectAll())}
            />
            {t("rooms.allRooms", "Alla rum")}
          </label>
          <div className="border-t my-1" />
          {rooms.map((r) => {
            const checked = selectedIds.includes(r.id);
            return (
              <label
                key={r.id}
                className="flex items-center gap-2 w-full text-sm px-2 py-1.5 rounded hover:bg-muted cursor-pointer"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(r.id)}
                />
                <span className="flex-1 truncate">{r.name}</span>
                {onOpenRoom && (
                  <button
                    type="button"
                    title={t("rooms.openRoom", "Öppna rumsdetaljer")}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onOpenRoom(r.id);
                    }}
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </label>
            );
          })}
          {selectedIds.length > 0 && (
            <>
              <div className="border-t my-1" />
              <button
                type="button"
                className="w-full text-left text-xs text-muted-foreground px-2 py-1 hover:bg-muted rounded"
                onClick={clearAll}
              >
                {t("common.clearAll", "Rensa alla")}
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
