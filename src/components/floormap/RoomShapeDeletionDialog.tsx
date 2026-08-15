import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Trash2, PencilRuler, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useFloorMapStore } from "./store";
import { execute } from "./editor/core/commands";

interface RoomShapeDeletionDialogProps {
  /** Bump the room-data trigger so the canvas re-enriches after a room entity goes away. */
  onRoomsChanged: () => void;
}

/**
 * Shared 3-choice dialog for deleting a room-linked canvas shape. Both the v1
 * store delete paths and the v2 `shape.delete` command defer here (via
 * `pendingRoomShapeDeletion`) instead of silently orphaning the room entity —
 * a room shape deleted on canvas would otherwise leave a phantom room in the
 * rooms list. The user chooses: remove the drawing AND the room (with all its
 * saved data), or just the drawing (room stays in the list), or cancel.
 * Mounted once in FloorMapEditor so it covers both editors.
 */
export function RoomShapeDeletionDialog({ onRoomsChanged }: RoomShapeDeletionDialogProps) {
  const { t } = useTranslation();
  const pending = useFloorMapStore((s) => s.pendingRoomShapeDeletion);
  const setPending = useFloorMapStore((s) => s.setPendingRoomShapeDeletion);
  const [names, setNames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pending) {
      setNames([]);
      return;
    }
    let active = true;
    (async () => {
      const ids = pending.rooms.map((r) => r.roomId);
      const { data } = await supabase.from("rooms").select("name").in("id", ids);
      if (active) setNames((data ?? []).map((r) => r.name as string).filter(Boolean));
    })();
    return () => {
      active = false;
    };
  }, [pending]);

  if (!pending) return null;

  // Remove the selected canvas shapes using each editor's native mechanism so
  // undo/wall-regen stay consistent (v2 = command/patch, v1 = store + auto-walls).
  const removeShapes = () => {
    if (pending.via === "v2") {
      execute("shape.delete", { ids: pending.shapeIds, confirmed: true });
    } else {
      const st = useFloorMapStore.getState();
      st.deleteShapes(pending.shapeIds);
      st.regenerateAutoWalls();
      st.clearSelection();
    }
  };

  const handleBoth = async () => {
    setBusy(true);
    try {
      for (const r of pending.rooms) {
        const { error } = await supabase.from("rooms").delete().eq("id", r.roomId);
        if (error) throw error;
      }
      removeShapes();
      toast.success(t("roomDeleteDialog.deletedBoth", "Rummet och ritningen togs bort"));
      onRoomsChanged();
      setPending(null);
    } catch (e) {
      console.error("Room delete failed:", e);
      toast.error(t("roomDeleteDialog.couldNotDelete", "Kunde inte ta bort rummet"));
    } finally {
      setBusy(false);
    }
  };

  const handleDrawingOnly = () => {
    removeShapes();
    toast.success(t("roomDeleteDialog.deletedDrawing", "Ritningen togs bort – rummet finns kvar i listan"));
    setPending(null);
  };

  const label =
    names.length === 1
      ? `"${names[0]}"`
      : t("roomDeleteDialog.nRooms", "{{count}} rum", { count: pending.rooms.length });

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) setPending(null); }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t("roomDeleteDialog.title", "Ta bort {{label}}?", { label })}</DialogTitle>
          <DialogDescription>
            {t(
              "roomDeleteDialog.description",
              "Rummet kan ha sparade uppgifter (arbeten, budget, objekt). Vad vill du ta bort?",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-2">
          <Button
            variant="destructive"
            className="h-auto justify-start gap-3 py-3 text-left"
            disabled={busy}
            onClick={handleBoth}
          >
            {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Trash2 className="h-4 w-4 shrink-0" />}
            <span className="flex flex-col">
              <span className="font-medium">
                {t("roomDeleteDialog.optionBoth", "Ta bort ritningen + rummet")}
              </span>
              <span className="text-xs opacity-90">
                {t("roomDeleteDialog.optionBothHint", "Rummet och all sparad data tas bort permanent.")}
              </span>
            </span>
          </Button>
          <Button
            variant="outline"
            className="h-auto justify-start gap-3 py-3 text-left"
            disabled={busy}
            onClick={handleDrawingOnly}
          >
            <PencilRuler className="h-4 w-4 shrink-0" />
            <span className="flex flex-col">
              <span className="font-medium">
                {t("roomDeleteDialog.optionDrawingOnly", "Ta bort bara ritningen")}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("roomDeleteDialog.optionDrawingOnlyHint", "Rummet blir kvar i rumslistan med all data.")}
              </span>
            </span>
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setPending(null)}>
            {t("common.cancel", "Avbryt")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
