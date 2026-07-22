/**
 * Room naming + rooms-table sync for the v2 editor.
 *
 * - When a new auto-room has been stable for a moment, the naming dialog
 *   opens: name it (creates a rooms row → feeds Rumshantering/estimation) or
 *   link an existing unplaced project room (link-first, no duplicates).
 * - Double-clicking a room re-opens the dialog (via uiStore.namingShapeId).
 * - Linked rooms get area/perimeter/position synced to their rooms row,
 *   debounced after wall edits.
 */

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { NameRoomDialog } from '../NameRoomDialog';
import { useFloorMapStore } from '../store';
import { useEditorUiStore } from './state/uiStore';
import { execute } from './core/commands';
import {
  insertRoomRow,
  updateRoomRow,
  fetchUnplacedRooms,
  ProjectRoomOption,
} from './sync/roomTableSync';
import { FloorMapShape, PolygonCoordinates } from '../types';

const NAMING_STABILITY_MS = 1200;
const ROOM_SYNC_DEBOUNCE_MS = 2500;

interface RoomNamingControllerProps {
  isReadOnly?: boolean;
}

export const RoomNamingController = ({ isReadOnly }: RoomNamingControllerProps) => {
  const { t } = useTranslation();
  const shapes = useFloorMapStore((s) => s.shapes);
  const currentPlanId = useFloorMapStore((s) => s.currentPlanId);
  const currentProjectId = useFloorMapStore((s) => s.currentProjectId);
  const namingShapeId = useEditorUiStore((s) => s.namingShapeId);
  const setNamingShapeId = useEditorUiStore((s) => s.setNamingShapeId);
  const dirtyCounter = useEditorUiStore((s) => s.dirtyCounter);

  const [projectRooms, setProjectRooms] = useState<ProjectRoomOption[]>([]);
  const lastSyncedPolygons = useRef(new Map<string, string>());

  const namingShape = namingShapeId ? shapes.find((s) => s.id === namingShapeId) ?? null : null;

  // Queue: first stable unnamed auto-room opens the dialog.
  useEffect(() => {
    if (isReadOnly || namingShapeId) return;
    const candidate = shapes.find(
      (s) =>
        s.type === 'room' &&
        (s.planId === currentPlanId || !s.planId) &&
        s.metadata?.needsNaming &&
        !s.metadata?.detached
    );
    if (!candidate) return;
    const timer = setTimeout(() => {
      // Still present and still unnamed after the stability window?
      const fresh = useFloorMapStore
        .getState()
        .shapes.find((s) => s.id === candidate.id && s.metadata?.needsNaming && !s.metadata?.detached);
      if (fresh) setNamingShapeId(fresh.id);
    }, NAMING_STABILITY_MS);
    return () => clearTimeout(timer);
  }, [shapes, currentPlanId, isReadOnly, namingShapeId, setNamingShapeId]);

  // Load link-first options when the dialog opens.
  useEffect(() => {
    if (!namingShape || !currentProjectId) return;
    const placedRoomIds = useFloorMapStore
      .getState()
      .shapes.filter((s) => s.type === 'room' && s.roomId)
      .map((s) => s.roomId!) as string[];
    fetchUnplacedRooms(currentProjectId, placedRoomIds).then(setProjectRooms);
  }, [namingShape?.id, currentProjectId]);

  // Debounced rooms-row sync for linked rooms after wall edits.
  useEffect(() => {
    if (isReadOnly || dirtyCounter === 0) return;
    const timer = setTimeout(() => {
      const linked = useFloorMapStore
        .getState()
        .shapes.filter(
          (s): s is FloorMapShape =>
            s.type === 'room' && !!s.roomId && !s.metadata?.detached
        );
      for (const room of linked) {
        const polygonKey = JSON.stringify((room.coordinates as PolygonCoordinates)?.points ?? []);
        if (lastSyncedPolygons.current.get(room.roomId!) === polygonKey) continue;
        updateRoomRow(room).then((ok) => {
          if (ok) lastSyncedPolygons.current.set(room.roomId!, polygonKey);
        });
      }
    }, ROOM_SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [dirtyCounter, isReadOnly]);

  const clearNeedsNaming = (shape: FloorMapShape, extra: Partial<FloorMapShape> = {}) => {
    execute('shape.update', {
      id: shape.id,
      updates: {
        ...extra,
        metadata: { ...shape.metadata, ...(extra.metadata ?? {}), needsNaming: undefined },
      },
    });
  };

  const handleConfirm = async (roomName: string, color?: string, existingRoomId?: string) => {
    const shape = namingShape;
    setNamingShapeId(null);
    if (!shape) return;

    if (existingRoomId) {
      clearNeedsNaming(shape, { roomId: existingRoomId, name: roomName, color });
      const updated = useFloorMapStore.getState().shapes.find((s) => s.id === shape.id);
      if (updated) await updateRoomRow(updated);
      toast.success(t('floormap.roomLinked', 'Rummet kopplades till "{{name}}"', { name: roomName }));
      return;
    }

    if (!currentProjectId) return;
    const newRoomId = await insertRoomRow(currentProjectId, { ...shape, name: roomName }, roomName);
    if (newRoomId) {
      clearNeedsNaming(shape, { roomId: newRoomId, name: roomName, color });
      toast.success(t('floormap.roomSaved', 'Rummet "{{name}}" sparades i projektet', { name: roomName }));
    } else {
      // Keep the canvas room usable even when the row can't be written
      // (e.g. guest mode / RLS) — honest about what didn't happen.
      clearNeedsNaming(shape, { name: roomName, color });
      toast.error(
        t('floormap.roomSaveFailed', 'Kunde inte spara rummet i projektet — det finns kvar på ritningen')
      );
    }
  };

  const handleCancel = () => {
    const shape = namingShape;
    setNamingShapeId(null);
    if (shape?.metadata?.needsNaming) clearNeedsNaming(shape);
  };

  return (
    <NameRoomDialog
      open={!!namingShape}
      onOpenChange={(open) => {
        if (!open) handleCancel();
      }}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      defaultName={namingShape?.name ?? ''}
      projectRooms={projectRooms}
    />
  );
};
