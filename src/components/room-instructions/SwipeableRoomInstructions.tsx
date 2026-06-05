import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { RoomInstructionCard } from "./RoomInstructionCard";
import type { FloorPlanObject, WallObject } from "@/components/worker/roomObjectShared";
import type { RoomInstruction, FloorPlanShape } from "./types";

interface SwipeableRoomInstructionsProps {
  rooms: RoomInstruction[];
  floorPlanShapes?: FloorPlanShape[];
  floorPlanObjects?: FloorPlanObject[];
  wallObjects?: WallObject[];
  /** Worker token — enables "ask a question" on tapped objects (W3). */
  token?: string;
  canToggleChecklist?: boolean;
  canUploadPhotos?: boolean;
  onChecklistToggle?: (taskId: string, checklistId: string, itemId: string, completed: boolean) => void;
  onPhotoUpload?: (taskId: string | null, roomId: string, category: "progress" | "completed", file: File, progress?: number) => void;
}

export function SwipeableRoomInstructions({
  rooms,
  floorPlanShapes,
  floorPlanObjects,
  wallObjects,
  token,
  canToggleChecklist,
  canUploadPhotos,
  onChecklistToggle,
  onPhotoUpload,
}: SwipeableRoomInstructionsProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Track active room via scroll position
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const idx = Math.round(el.scrollLeft / el.clientWidth);
      setActiveIndex(Math.max(0, Math.min(rooms.length - 1, idx)));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [rooms.length]);

  const scrollTo = useCallback((index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(rooms.length - 1, index));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
  }, [rooms.length]);

  if (rooms.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        {t("rooms.noAssignedRooms", "Inga rum med tilldelade uppgifter")}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Navigation header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background sticky top-0 z-10">
        <button
          type="button"
          aria-label={t("common.previous", "Föregående")}
          className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30"
          onClick={() => scrollTo(activeIndex - 1)}
          disabled={activeIndex === 0}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center gap-1">
          <span className="text-sm font-semibold">{rooms[activeIndex]?.name || t("rooms.unassignedRoom", "Utan rum")}</span>
          {/* Dots */}
          <div className="flex items-center gap-1.5">
            {rooms.map((room, i) => (
              <button
                key={room.id}
                type="button"
                aria-label={`${room.name || t("rooms.unassignedRoom", "Utan rum")} (${i + 1}/${rooms.length})`}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === activeIndex ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                )}
                onClick={() => scrollTo(i)}
              />
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {activeIndex + 1} / {rooms.length} {t("rooms.roomsLabel", "rum")}
          </span>
        </div>

        <button
          type="button"
          aria-label={t("common.next", "Nästa")}
          className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30"
          onClick={() => scrollTo(activeIndex + 1)}
          disabled={activeIndex === rooms.length - 1}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Swipeable cards container */}
      <div
        ref={scrollRef}
        className="flex-1 flex overflow-x-auto snap-x snap-mandatory overscroll-x-contain"
        style={{
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {rooms.map((room) => (
          <div
            key={room.id}
            className="w-full flex-shrink-0 snap-center overflow-y-auto px-4 pt-4"
          >
            <RoomInstructionCard
              room={room}
              floorPlanShapes={floorPlanShapes}
              floorPlanObjects={floorPlanObjects}
              wallObjects={wallObjects}
              token={token}
              canToggleChecklist={canToggleChecklist}
              canUploadPhotos={canUploadPhotos}
              onChecklistToggle={onChecklistToggle}
              onPhotoUpload={onPhotoUpload}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
