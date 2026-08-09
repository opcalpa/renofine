/**
 * EditorContextMenu — right-click menu for the v2 canvas (Carls återkomst-
 * önskan, omtänkt för v2). Context-aware:
 *
 * - With a selection: the actions you actually reach for (duplicate, copy,
 *   delete, rotate, wall view for a wall) — no digging in the toolbar.
 * - Always: the last 3 placed library objects as one-click "place another"
 *   (the real repeat-workflow win), quick tool switching with shortcuts,
 *   and paste when the clipboard has content.
 *
 * Plain positioned div (no Radix) so it opens exactly at the pointer and
 * closes on outside click/Escape without stealing canvas focus.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BringToFront,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Minus,
  MousePointer2,
  PanelTop,
  Pencil,
  RotateCw,
  Ruler,
  SendToBack,
  Square,
  Trash2,
  Type,
} from 'lucide-react';
import { useFloorMapStore } from '../store';
import { useEditorUiStore } from './state/uiStore';
import { Tool } from '../types';
import { execute } from './core/commands';
import { copySelection, clipboardSize, pasteClipboard } from './core/clipboard';
import { getRecentObjectIds } from './state/recentObjects';
import { getUnifiedObjectById } from '../objectLibrary';
import { getObjectDef } from './objects/objectModel';
import { findRoomForWall } from './FloatingSelectionToolbar';

interface EditorContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
}

const ITEM_CLASS =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40';

const Shortcut = ({ children }: { children: React.ReactNode }) => (
  <span className="ml-auto text-[10px] uppercase text-gray-400">{children}</span>
);

export const EditorContextMenu: React.FC<EditorContextMenuProps> = ({ x, y, onClose }) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const shapes = useFloorMapStore((s) => s.shapes);
  const selectedShapeIds = useFloorMapStore((s) => s.selectedShapeIds);

  const selected = useMemo(
    () => shapes.filter((s) => selectedShapeIds.includes(s.id) && !s.locked),
    [shapes, selectedShapeIds]
  );
  const singleWall = selected.length === 1 && selected[0].type === 'wall';
  const wallRoom = singleWall
    ? findRoomForWall(selected[0], shapes, useFloorMapStore.getState().currentPlanId)
    : null;
  const canTransform = selected.some((s) => s.type !== 'opening' && s.type !== 'image');
  const canReorder = selected.some((s) => s.type !== 'room');
  const singleObject = selected.length === 1 && !!getObjectDef(selected[0]);

  const recentDefs = useMemo(
    () =>
      getRecentObjectIds()
        .map((id) => getUnifiedObjectById(id))
        .filter((def): def is NonNullable<typeof def> => !!def),
    []
  );

  // Close on outside pointerdown + Escape
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  // Clamp to the viewport
  const style = useMemo(() => {
    const width = 224;
    const maxH = 420;
    return {
      left: Math.min(x, window.innerWidth - width - 8),
      top: Math.min(y, window.innerHeight - maxH - 8),
    };
  }, [x, y]);

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  const setTool = (tool: Tool) => run(() => useFloorMapStore.getState().setActiveTool(tool));

  const ids = selected.map((s) => s.id);
  const store = useFloorMapStore.getState;

  const tools: Array<{ tool: Tool; label: string; shortcut: string; Icon: React.FC<{ className?: string }> }> = [
    { tool: 'select', label: t('floormap.tools.select', 'Välj'), shortcut: 'V', Icon: MousePointer2 },
    { tool: 'wall', label: t('floormap.tools.wall', 'Vägg'), shortcut: 'W', Icon: Minus },
    { tool: 'room', label: t('floormap.tools.room', 'Rum'), shortcut: 'R', Icon: Square },
    { tool: 'measure', label: t('floormap.tools.measure', 'Mät'), shortcut: 'M', Icon: Ruler },
    { tool: 'text', label: t('floormap.tools.text', 'Text'), shortcut: 'T', Icon: Type },
  ];

  return (
    <div
      ref={menuRef}
      data-testid="editor-context-menu"
      className="fixed z-[120] w-56 rounded-lg border bg-white p-1 shadow-xl"
      style={style}
      onContextMenu={(e) => e.preventDefault()}
    >
      {selected.length > 0 && (
        <>
          <p className="px-2 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
            {selected.length === 1
              ? singleObject
                ? selected[0].name || t('contextMenu.selection', 'Markering')
                : t('contextMenu.selection', 'Markering')
              : t('contextMenu.selectionCount', '{{count}} markerade', { count: selected.length })}
          </p>
          <button className={ITEM_CLASS} onClick={run(() => execute('selection.duplicate', { ids }))}>
            <CopyPlus className="h-4 w-4" />
            {t('contextMenu.duplicate', 'Duplicera')}
            <Shortcut>⌘D</Shortcut>
          </button>
          <button className={ITEM_CLASS} onClick={run(() => copySelection())}>
            <Copy className="h-4 w-4" />
            {t('contextMenu.copy', 'Kopiera')}
            <Shortcut>⌘C</Shortcut>
          </button>
          {canTransform && (
            <button className={ITEM_CLASS} onClick={run(() => execute('selection.rotate', { ids }))}>
              <RotateCw className="h-4 w-4" />
              {t('contextMenu.rotate90', 'Rotera 90°')}
              <Shortcut>R</Shortcut>
            </button>
          )}
          {singleWall && wallRoom && (
            <button
              className={ITEM_CLASS}
              data-testid="context-wall-view"
              onClick={run(() =>
                useEditorUiStore
                  .getState()
                  .setElevationRequest({ roomShapeId: wallRoom.id, wallId: selected[0].id })
              )}
            >
              <PanelTop className="h-4 w-4" />
              {t('floormap.selection.wallView', 'Väggvy')}
            </button>
          )}
          {canReorder && (
            <>
              <button
                className={ITEM_CLASS}
                data-testid="context-bring-front"
                onClick={run(() => execute('selection.reorder', { ids, mode: 'front' }))}
              >
                <BringToFront className="h-4 w-4" />
                {t('contextMenu.bringToFront', 'Flytta främst')}
              </button>
              <button
                className={ITEM_CLASS}
                data-testid="context-send-back"
                onClick={run(() => execute('selection.reorder', { ids, mode: 'back' }))}
              >
                <SendToBack className="h-4 w-4" />
                {t('contextMenu.sendToBack', 'Flytta bakerst')}
              </button>
            </>
          )}
          <button
            className={`${ITEM_CLASS} text-red-600 hover:bg-red-50`}
            onClick={run(() => {
              execute('shape.delete', { ids });
              store().clearSelection();
            })}
          >
            <Trash2 className="h-4 w-4" />
            {t('contextMenu.delete', 'Radera')}
            <Shortcut>⌫</Shortcut>
          </button>
          <div className="my-1 h-px bg-gray-100" />
        </>
      )}

      {recentDefs.length > 0 && (
        <>
          <p className="px-2 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
            {t('contextMenu.recentObjects', 'Senaste objekt')}
          </p>
          {recentDefs.map((def) => (
            <button
              key={def.id}
              className={ITEM_CLASS}
              data-testid={`context-recent-${def.id}`}
              onClick={run(() => {
                store().setActiveTool('object');
                store().setPendingObjectId(def.id);
              })}
            >
              <Pencil className="h-4 w-4 opacity-60" />
              {def.name}
            </button>
          ))}
          <div className="my-1 h-px bg-gray-100" />
        </>
      )}

      <p className="px-2 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
        {t('contextMenu.tools', 'Verktyg')}
      </p>
      {tools.map(({ tool, label, shortcut, Icon }) => (
        <button key={tool} className={ITEM_CLASS} onClick={setTool(tool)}>
          <Icon className="h-4 w-4" />
          {label}
          <Shortcut>{shortcut}</Shortcut>
        </button>
      ))}

      {clipboardSize() > 0 && (
        <>
          <div className="my-1 h-px bg-gray-100" />
          <button className={ITEM_CLASS} onClick={run(() => pasteClipboard())}>
            <ClipboardPaste className="h-4 w-4" />
            {t('contextMenu.paste', 'Klistra in')}
            <Shortcut>⌘V</Shortcut>
          </button>
        </>
      )}
    </div>
  );
};
