import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
} from "@/components/ui/drawer";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Loader2, Save, X, Trash2, Plus, Eye } from "lucide-react";
import { RoomDetailForm } from "./RoomDetailForm";
import { RoomDetailFormV2 } from "./v2/RoomDetailFormV2";
import { useRoomForm } from "./hooks/useRoomForm";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import type { RoomDetailDialogProps } from "./types";

// Feature flag — flip to false to fall back to the accordion-based v1 form.
// Once v2 is validated in production, remove RoomDetailForm and this toggle.
const USE_V2 = true;

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" && window.innerWidth >= 1024
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

export function RoomDetailDialog({
  room,
  projectId,
  open,
  onOpenChange,
  onRoomUpdated,
  isCreateMode = false,
  onViewElevation,
  showPinterest,
}: RoomDetailDialogProps) {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();
  const {
    formData,
    updateFormData,
    updateSpec,
    saving,
    isNewRoom,
    handleSave,
    handleDelete,
  } = useRoomForm({
    room,
    projectId,
    onRoomUpdated,
    onClose: () => onOpenChange(false),
  });

  const isLoading = open && !room && !isCreateMode;

  const actionBar = (
    <div className="flex items-center justify-between gap-3 pt-4 border-t flex-shrink-0">
      <div>
        {!isNewRoom && (
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
            disabled={saving}
          >
            <Trash2 className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("floormap.deleteRoom", "Ta bort rum")}</span>
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
          <X className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">{isNewRoom ? t("common.cancel") : t("common.close", "Stäng")}</span>
        </Button>
        {!isNewRoom && onViewElevation && (
          <Button
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
              onViewElevation();
            }}
            disabled={saving}
          >
            <Eye className="mr-2 h-4 w-4" />
            {t("roomElevation.viewElevation", "View Elevation")}
          </Button>
        )}
        <Button
          onClick={handleSave}
          disabled={saving || !formData.name.trim()}
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isNewRoom ? t("common.creating", "Skapar...") : t("common.saving", "Sparar...")}
            </>
          ) : isNewRoom ? (
            <>
              <Plus className="mr-2 h-4 w-4" />
              {t("floormap.createRoom")}
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {t("common.save", "Spara")}
            </>
          )}
        </Button>
      </div>
    </div>
  );

  // ── Desktop: right-side sheet, transparent overlay so canvas stays visible ──
  if (isDesktop) {
    if (isLoading) {
      return (
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetPortal>
            <SheetOverlay className="bg-transparent pointer-events-none" />
            <SheetContent side="right" className="w-[520px] max-w-[90vw] flex flex-col gap-0 p-0 !top-14 !h-[calc(100dvh-3.5rem)]">
              <div className="flex flex-col items-center justify-center flex-1 py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">{t("rooms.loadingRoomData", "Loading room data")}...</p>
              </div>
            </SheetContent>
          </SheetPortal>
        </Sheet>
      );
    }

    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetPortal>
          {/* Transparent overlay — canvas stays visible and interactive */}
          <SheetOverlay className="bg-transparent pointer-events-none" />
          <SheetContent
            side="right"
            // Sit below the fixed planner top bar (h-14 / z-60) so the room hero header
            // isn't clipped behind it. Overrides the Sheet's default inset-y-0 / h-full.
            className="w-[520px] max-w-[90vw] flex flex-col gap-0 p-0 overflow-hidden !top-14 !h-[calc(100dvh-3.5rem)]"
          >
            {/* Title hidden visually for existing rooms — room name inside form is the real heading */}
            <VisuallyHidden>
              <SheetTitle>
                {isNewRoom ? t("floormap.createRoom") : t("floormap.roomDetails", "Rumsdetaljer")}
              </SheetTitle>
              <SheetDescription>
                {isNewRoom
                  ? t("rooms.fillInNewRoomDetails", "Fyll i detaljer för det nya rummet")
                  : t("rooms.editRoomInfoAndComments", "Redigera ruminformation")}
              </SheetDescription>
            </VisuallyHidden>
            {isNewRoom && (
              <div className="flex-shrink-0 px-6 pt-5 pb-3 border-b flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" />
                <span className="font-semibold">{t("floormap.createRoom")}</span>
              </div>
            )}

            {USE_V2 ? (
              <div className="flex-1 overflow-hidden">
                <RoomDetailFormV2
                  room={room}
                  projectId={projectId}
                  formData={formData}
                  updateFormData={updateFormData}
                  updateSpec={updateSpec}
                  showPinterest={showPinterest}
                />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <RoomDetailForm
                  room={room}
                  projectId={projectId}
                  formData={formData}
                  updateFormData={updateFormData}
                  updateSpec={updateSpec}
                  showPinterest={showPinterest}
                />
              </div>
            )}

            <div className="px-6 pb-5">{actionBar}</div>
          </SheetContent>
        </SheetPortal>
      </Sheet>
    );
  }

  // ── Mobile (V2): bottom-sheet drawer ──
  if (USE_V2) {
    if (isLoading) {
      return (
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerPortal>
            <DrawerOverlay />
            <DrawerContent className="h-[92vh] p-0">
              <VisuallyHidden>
                <DrawerTitle>{t("rooms.loadingRoomData", "Loading room data")}</DrawerTitle>
                <DrawerDescription>{t("rooms.waitingForRoomData", "Waiting")}</DrawerDescription>
              </VisuallyHidden>
              <div className="flex flex-1 flex-col items-center justify-center py-12">
                <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">{t("rooms.loadingRoomData", "Loading room data")}...</p>
              </div>
            </DrawerContent>
          </DrawerPortal>
        </Drawer>
      );
    }

    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerPortal>
          <DrawerOverlay />
          <DrawerContent className="flex h-[92vh] flex-col p-0">
            <VisuallyHidden>
              <DrawerTitle>
                {isNewRoom ? t("floormap.createRoom") : t("floormap.roomDetails", "Rumsdetaljer")}
              </DrawerTitle>
              <DrawerDescription>
                {isNewRoom
                  ? t("rooms.fillInNewRoomDetails", "Fyll i detaljer för det nya rummet")
                  : t("rooms.editRoomInfoAndComments", "Redigera ruminformation")}
              </DrawerDescription>
            </VisuallyHidden>

            {isNewRoom && (
              <div className="flex flex-shrink-0 items-center gap-2 border-b px-5 pt-2 pb-3">
                <Plus className="h-5 w-5 text-primary" />
                <span className="font-semibold">{t("floormap.createRoom")}</span>
              </div>
            )}

            <div className="flex-1 overflow-hidden">
              <RoomDetailFormV2
                room={room}
                projectId={projectId}
                formData={formData}
                updateFormData={updateFormData}
                updateSpec={updateSpec}
                showPinterest={showPinterest}
              />
            </div>

            {/* Sticky CTA */}
            <div className="flex-shrink-0 px-4 pb-5">{actionBar}</div>
          </DrawerContent>
        </DrawerPortal>
      </Drawer>
    );
  }

  // ── Mobile (V1 legacy): centered dialog ──
  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <VisuallyHidden>
            <DialogTitle>{t("rooms.loadingRoomData", "Loading room data")}</DialogTitle>
            <DialogDescription>{t("rooms.waitingForRoomData", "Waiting for room data to load")}</DialogDescription>
          </VisuallyHidden>
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">{t("rooms.loadingRoomData", "Loading room data")}...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl lg:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {isNewRoom ? (
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              <DialogTitle>{t("floormap.createRoom")}</DialogTitle>
            </div>
            <DialogDescription>
              {t("rooms.fillInNewRoomDetails", "Fyll i detaljer för det nya rummet")}
            </DialogDescription>
          </DialogHeader>
        ) : (
          <VisuallyHidden>
            <DialogTitle>{t("floormap.roomDetails", "Rumsdetaljer")}</DialogTitle>
            <DialogDescription>{t("rooms.editRoomInfoAndComments", "Redigera ruminformation")}</DialogDescription>
          </VisuallyHidden>
        )}

        <div className="flex-1 overflow-y-auto pr-2">
          <RoomDetailForm
            room={room}
            projectId={projectId}
            formData={formData}
            updateFormData={updateFormData}
            updateSpec={updateSpec}
            showPinterest={showPinterest}
          />
        </div>

        {actionBar}
      </DialogContent>
    </Dialog>
  );
}
