/**
 * Floating mini-toolbar anchored above the current selection (Figma-style):
 * rotate 90°, mirror, duplicate, delete — plus align/distribute when several
 * shapes are selected and flip for a single opening. All actions go through
 * editor commands, so each is one undoable step.
 */

import { useEffect, useMemo, useState } from 'react';
import { FloorMapShape } from '../types';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  ArrowLeftRight,
  Bold,
  Columns3,
  Copy,
  Eye,
  FlipHorizontal2,
  FlipVertical2,
  Group,
  Italic,
  PaintBucket,
  PanelTop,
  Ruler,
  RotateCw,
  Square,
  Trash2,
  Type,
  Ungroup,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFloorMapStore } from '../store';
import { useEditorUiStore } from './state/uiStore';
import { execute } from './core/commands';
import { beginGesture, endGesture } from './core/executor';
import { worldToMm } from './core/units';
import { unionBounds } from './geometry/bounds';
import type { AlignMode } from './core/selectionOps';
import { isGroupable, STYLABLE_TYPES } from './core/selectionOps';
import { pointInPolygon, updateRoomItemFinishForShape } from '../utils/roomItemLink';
import { getObjectDef, objectDimensionsMM } from './objects/objectModel';

/**
 * The room a wall belongs to: probe just inside the wall on both sides of
 * its midpoint (walls sit ON room boundaries, so the midpoint itself is
 * ambiguous). World units are px-at-zoom-1 (150 mm wall ≈ 15 units).
 */
export const findRoomForWall = (
  wall: FloorMapShape,
  shapes: FloorMapShape[],
  currentPlanId: string | null
): FloorMapShape | null => {
  const c = wall.coordinates as { x1: number; y1: number; x2: number; y2: number };
  if (c?.x1 === undefined) return null;
  const mid = { x: (c.x1 + c.x2) / 2, y: (c.y1 + c.y2) / 2 };
  const len = Math.hypot(c.x2 - c.x1, c.y2 - c.y1) || 1;
  const normal = { x: -(c.y2 - c.y1) / len, y: (c.x2 - c.x1) / len };
  const rooms = shapes.filter(
    (s) =>
      s.type === 'room' &&
      (s.planId === currentPlanId || !s.planId) &&
      s.coordinates &&
      'points' in s.coordinates &&
      Array.isArray((s.coordinates as { points: unknown }).points)
  );
  for (const dist of [12, 30]) {
    for (const side of [1, -1]) {
      const probe = { x: mid.x + normal.x * dist * side, y: mid.y + normal.y * dist * side };
      const hit = rooms.find((r) =>
        pointInPolygon(probe, (r.coordinates as { points: { x: number; y: number }[] }).points)
      );
      if (hit) return hit;
    }
  }
  return null;
};

const BUTTON_CLASS =
  'flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors';

/** Width (mm) editor for a single selected opening; commits on Enter/blur. */
const OpeningWidthInput = ({ opening }: { opening: FloorMapShape }) => {
  const { t } = useTranslation();
  const currentWidth = (opening.metadata?.widthMM as number) ?? 900;
  const [value, setValue] = useState(String(currentWidth));

  useEffect(() => {
    setValue(String(currentWidth));
  }, [opening.id, currentWidth]);

  const commitWidth = () => {
    const widthMM = parseInt(value, 10);
    if (Number.isFinite(widthMM) && widthMM > 0 && widthMM !== currentWidth) {
      execute('opening.setWidth', { id: opening.id, widthMM });
    } else {
      setValue(String(currentWidth));
    }
  };

  return (
    <label
      className="flex items-center gap-1 pl-1.5 pr-2 text-xs text-gray-500"
      title={t('floormap.selection.openingWidth', 'Öppningens bredd (mm)')}
    >
      <input
        type="number"
        className="h-7 w-16 rounded-md border px-1.5 text-right text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary"
        value={value}
        min={300}
        step={10}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commitWidth}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setValue(String(currentWidth));
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      mm
    </label>
  );
};

/** Name + real dimensions (mm) editor for a single selected custom object. */
const CustomObjectInputs = ({ shape }: { shape: FloorMapShape }) => {
  const { t } = useTranslation();
  const dims = objectDimensionsMM(shape);
  const [name, setName] = useState(shape.name || '');
  const [width, setWidth] = useState(String(dims?.width ?? 600));
  const [depth, setDepth] = useState(String(dims?.depth ?? 600));

  useEffect(() => {
    setName(shape.name || '');
    setWidth(String(dims?.width ?? 600));
    setDepth(String(dims?.depth ?? 600));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape.id, shape.name, dims?.width, dims?.depth]);

  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== shape.name) {
      execute('shape.update', { id: shape.id, updates: { name: trimmed } });
    } else {
      setName(shape.name || '');
    }
  };

  const commitSize = () => {
    const w = parseInt(width, 10);
    const d = parseInt(depth, 10);
    if (!Number.isFinite(w) || !Number.isFinite(d) || w < 50 || d < 50) {
      setWidth(String(dims?.width ?? 600));
      setDepth(String(dims?.depth ?? 600));
      return;
    }
    if (w === dims?.width && d === dims?.depth) return;
    const updates: Partial<FloorMapShape> = {
      metadata: { ...shape.metadata, customWidthMM: w, customDepthMM: d },
    };
    // Wall-hosted custom objects must keep the elevation contract in sync.
    if (shape.wallRelative) {
      updates.wallRelative = { ...shape.wallRelative, width: w, depth: d };
    }
    execute('shape.update', { id: shape.id, updates });
  };

  const inputKeys = (commit: () => void) => ({
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();
      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
    },
    onBlur: commit,
  });

  return (
    <div className="flex items-center gap-1 pl-1.5 pr-1 text-xs text-gray-500">
      <input
        type="text"
        className="h-7 w-28 rounded-md border px-1.5 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary"
        value={name}
        placeholder={t('floormap.selection.customName', 'Namn')}
        title={t('floormap.selection.customNameTitle', 'Objektets namn')}
        onChange={(e) => setName(e.target.value)}
        {...inputKeys(commitName)}
      />
      <input
        type="number"
        className="h-7 w-16 rounded-md border px-1.5 text-right text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary"
        value={width}
        min={50}
        step={10}
        title={t('floormap.selection.customWidth', 'Bredd (mm)')}
        onChange={(e) => setWidth(e.target.value)}
        {...inputKeys(commitSize)}
      />
      ×
      <input
        type="number"
        className="h-7 w-16 rounded-md border px-1.5 text-right text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary"
        value={depth}
        min={50}
        step={10}
        title={t('floormap.selection.customDepth', 'Djup (mm)')}
        onChange={(e) => setDepth(e.target.value)}
        {...inputKeys(commitSize)}
      />
      mm
    </div>
  );
};

/** Colour/material instruction for a single selected library object (P2). */
const ObjectFinishInput = ({ shape }: { shape: FloorMapShape }) => {
  const { t } = useTranslation();
  const current = typeof shape.metadata?.finishColor === 'string' ? shape.metadata.finishColor : '';
  const [value, setValue] = useState(current);

  useEffect(() => {
    setValue(typeof shape.metadata?.finishColor === 'string' ? shape.metadata.finishColor : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape.id, shape.metadata?.finishColor]);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed === current) return;
    execute('shape.update', {
      id: shape.id,
      updates: { metadata: { ...shape.metadata, finishColor: trimmed || undefined } },
    });
    // Mirror to the room_items row so the instruction reaches room details +
    // the worker view. Fire-and-forget: canvas is source of truth.
    void updateRoomItemFinishForShape(shape.id, trimmed).catch(() => undefined);
  };

  return (
    <input
      type="text"
      className="h-7 w-28 rounded-md border px-1.5 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary"
      value={value}
      placeholder={t('floormap.selection.finishColor', 'Kulör/finish')}
      title={t('floormap.selection.finishColorTitle', 'Kulör eller material, t.ex. "vit" eller "NCS S 3005-G80Y"')}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
      }}
      onBlur={commit}
    />
  );
};

/** Name editor for the leader of a selected group ("eget objekt"). */
const GroupNameInput = ({ leader }: { leader: FloorMapShape }) => {
  const { t } = useTranslation();
  const current = leader.name || '';
  const [value, setValue] = useState(current);

  useEffect(() => {
    setValue(leader.name || '');
  }, [leader.id, leader.name]);

  const commit = () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === current) {
      setValue(current);
      return;
    }
    execute('shape.update', {
      id: leader.id,
      updates: {
        name: trimmed,
        templateInfo: leader.templateInfo
          ? { ...leader.templateInfo, templateName: trimmed }
          : undefined,
      },
    });
  };

  return (
    <input
      type="text"
      className="h-7 w-32 rounded-md border px-1.5 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary"
      value={value}
      placeholder={t('floormap.selection.groupName', 'Namnge objektet')}
      title={t('floormap.selection.groupNameTitle', 'Namn på det egna objektet')}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
      }}
      onBlur={commit}
    />
  );
};

/** Font size + bold/italic editor for a single selected text shape. */
const TextStyleInput = ({ shape }: { shape: FloorMapShape }) => {
  const { t } = useTranslation();
  const isBold = !!shape.textStyle?.isBold;
  const isItalic = !!shape.textStyle?.isItalic;
  const [size, setSize] = useState(String(shape.fontSize ?? 16));

  useEffect(() => {
    setSize(String(shape.fontSize ?? 16));
  }, [shape.id, shape.fontSize]);

  const commitSize = () => {
    const n = parseInt(size, 10);
    if (Number.isFinite(n) && n >= 8) execute('text.setStyle', { id: shape.id, fontSize: n });
    else setSize(String(shape.fontSize ?? 16));
  };

  const toggleBtn = (active: boolean) =>
    `flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
      active ? 'bg-primary/10 text-primary' : 'text-gray-600 hover:bg-gray-100'
    }`;

  return (
    <div className="flex items-center gap-1 pl-1.5 pr-1 text-xs text-gray-500">
      <Type className="h-3.5 w-3.5 text-gray-400" />
      <input
        type="number"
        className="h-7 w-12 rounded-md border px-1.5 text-right text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary"
        value={size}
        min={8}
        step={1}
        data-testid="text-size"
        title={t('floormap.selection.fontSize', 'Textstorlek')}
        onChange={(e) => setSize(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setSize(String(shape.fontSize ?? 16));
            (e.target as HTMLInputElement).blur();
          }
        }}
        onBlur={commitSize}
      />
      <button
        className={toggleBtn(isBold)}
        data-testid="text-bold"
        title={t('floormap.selection.bold', 'Fet')}
        onClick={() => execute('text.setStyle', { id: shape.id, isBold: !isBold })}
      >
        <Bold className="h-4 w-4" />
      </button>
      <button
        className={toggleBtn(isItalic)}
        data-testid="text-italic"
        title={t('floormap.selection.italic', 'Kursiv')}
        onClick={() => execute('text.setStyle', { id: shape.id, isItalic: !isItalic })}
      >
        <Italic className="h-4 w-4" />
      </button>
    </div>
  );
};

/** A hex like #rrggbb the native colour input accepts, or a fallback. */
const hexOr = (c: string | undefined, fallback: string) =>
  /^#[0-9a-fA-F]{6}$/.test(c ?? '') ? (c as string) : fallback;

/** Free shapes without a fill face — stroke/opacity only, no fill swatch. */
const STROKE_ONLY = new Set<FloorMapShape['type']>(['line', 'freehand', 'connector']);

/**
 * Fill/stroke colour + opacity editor for the selected free shape(s)
 * (rectangles, circles, lines, text, freehand). Colours commit once (native
 * picker); opacity drags live-preview as one undo step.
 */
const ShapeStyleInput = ({ shapes }: { shapes: FloorMapShape[] }) => {
  const { t } = useTranslation();
  const ids = shapes.map((s) => s.id);
  const first = shapes[0];
  const hasFill = shapes.some((s) => !STROKE_ONLY.has(s.type));
  const opacityPct = Math.round((first.opacity ?? 1) * 100);

  return (
    <div className="flex items-center gap-1.5 pl-1.5 pr-1 text-xs text-gray-500">
      {hasFill && (
        <label className="flex items-center gap-1" title={t('floormap.selection.fillColor', 'Fyllnadsfärg')}>
          <PaintBucket className="h-3.5 w-3.5 text-gray-400" />
          <input
            type="color"
            className="h-6 w-6 cursor-pointer rounded border p-0"
            value={hexOr(first.color, '#3b82f6')}
            data-testid="shape-fill"
            onChange={(e) => execute('selection.setStyle', { ids, color: e.target.value })}
          />
        </label>
      )}
      <label className="flex items-center gap-1" title={t('floormap.selection.strokeColor', 'Konturfärg')}>
        <Square className="h-3.5 w-3.5 text-gray-400" />
        <input
          type="color"
          className="h-6 w-6 cursor-pointer rounded border p-0"
          value={hexOr(first.strokeColor, '#374151')}
          data-testid="shape-stroke"
          onChange={(e) => execute('selection.setStyle', { ids, strokeColor: e.target.value })}
        />
      </label>
      <label className="flex items-center gap-1" title={t('floormap.selection.opacity', 'Genomskinlighet')}>
        <Eye className="h-3.5 w-3.5 text-gray-400" />
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={opacityPct}
          data-testid="shape-opacity"
          className="w-16 accent-primary"
          onPointerDown={() => beginGesture('Ändra genomskinlighet')}
          onChange={(e) => execute('selection.setStyle', { ids, opacity: parseInt(e.target.value, 10) / 100 })}
          onPointerUp={() => endGesture()}
          onPointerCancel={() => endGesture()}
        />
      </label>
    </div>
  );
};

/**
 * Opacity + real-width (scale) editor for a selected trace/background image.
 * Opacity drags live-preview but land as one undo step (gesture). Width scales
 * the image proportionally so it matches a real measure — the calibrate step
 * of tracing. Width is hidden for legacy images without a materialized size.
 */
const ImagePropsInput = ({ shape }: { shape: FloorMapShape }) => {
  const { t } = useTranslation();
  const c = shape.coordinates as { width: number };
  const materialized = !!c.width && c.width >= 1;
  const opacityPct = Math.round((shape.imageOpacity ?? 0.5) * 100);
  const [widthMM, setWidthMM] = useState(materialized ? String(Math.round(worldToMm(c.width))) : '');

  useEffect(() => {
    setWidthMM(materialized ? String(Math.round(worldToMm(c.width))) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape.id, c.width, materialized]);

  const commitWidth = () => {
    const mm = parseInt(widthMM, 10);
    if (Number.isFinite(mm) && mm >= 100) {
      execute('image.setWidth', { id: shape.id, widthMM: mm });
    } else {
      setWidthMM(materialized ? String(Math.round(worldToMm(c.width))) : '');
    }
  };

  return (
    <div className="flex items-center gap-2 pl-1.5 pr-1 text-xs text-gray-500">
      {materialized && (
        <label
          className="flex items-center gap-1"
          title={t('floormap.selection.imageWidth', 'Bildens verkliga bredd (mm) — skalar bilden till rätt mått')}
        >
          <Ruler className="h-3.5 w-3.5 text-gray-400" />
          <input
            type="number"
            className="h-7 w-20 rounded-md border px-1.5 text-right text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary"
            value={widthMM}
            min={100}
            step={10}
            data-testid="image-width"
            onChange={(e) => setWidthMM(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setWidthMM(materialized ? String(Math.round(worldToMm(c.width))) : '');
                (e.target as HTMLInputElement).blur();
              }
            }}
            onBlur={commitWidth}
          />
          mm
        </label>
      )}
      <label
        className="flex items-center gap-1"
        title={t('floormap.selection.imageOpacity', 'Genomskinlighet — så du ser din ritning ovanpå')}
      >
        <Eye className="h-3.5 w-3.5 text-gray-400" />
        <input
          type="range"
          min={5}
          max={100}
          step={5}
          value={opacityPct}
          data-testid="image-opacity"
          className="w-20 accent-primary"
          onPointerDown={() => beginGesture('Ändra bildopacitet')}
          onChange={(e) => execute('image.setOpacity', { id: shape.id, opacity: parseInt(e.target.value, 10) / 100 })}
          onPointerUp={() => endGesture()}
          onPointerCancel={() => endGesture()}
        />
      </label>
    </div>
  );
};

/** Thickness (mm) presets for a wall — exterior/interior/light-partition. */
const WALL_THICKNESS_PRESETS = [
  { labelKey: 'floormap.selection.wallExterior', fallback: 'Yttervägg', mm: 300 },
  { labelKey: 'floormap.selection.wallInterior', fallback: 'Innervägg', mm: 120 },
  { labelKey: 'floormap.selection.wallLight', fallback: 'Lättvägg', mm: 70 },
] as const;

/**
 * Thickness + height (mm) editor for the selected wall(s). Applies to every
 * selected wall as one undo step, so you can e.g. select all exterior walls
 * and set them to 300 mm at once. Shows blank when the walls disagree.
 */
const WallPropsInput = ({ walls }: { walls: FloorMapShape[] }) => {
  const { t } = useTranslation();
  const ids = walls.map((w) => w.id);

  const commonThickness = walls.every((w) => (w.thicknessMM ?? 150) === (walls[0].thicknessMM ?? 150))
    ? (walls[0].thicknessMM ?? 150)
    : null;
  const commonHeight = walls.every((w) => (w.heightMM ?? 2400) === (walls[0].heightMM ?? 2400))
    ? (walls[0].heightMM ?? 2400)
    : null;

  const [thickness, setThickness] = useState(commonThickness != null ? String(commonThickness) : '');
  const [height, setHeight] = useState(commonHeight != null ? String(commonHeight) : '');

  useEffect(() => {
    setThickness(commonThickness != null ? String(commonThickness) : '');
    setHeight(commonHeight != null ? String(commonHeight) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(','), commonThickness, commonHeight]);

  const commitThickness = (raw: string) => {
    const mm = parseInt(raw, 10);
    if (Number.isFinite(mm) && mm >= 20 && mm !== commonThickness) {
      execute('wall.setThickness', { ids, thicknessMM: mm });
    } else {
      setThickness(commonThickness != null ? String(commonThickness) : '');
    }
  };

  const commitHeight = (raw: string) => {
    const mm = parseInt(raw, 10);
    if (Number.isFinite(mm) && mm >= 500 && mm !== commonHeight) {
      execute('wall.setHeight', { ids, heightMM: mm });
    } else {
      setHeight(commonHeight != null ? String(commonHeight) : '');
    }
  };

  const keys = (commit: (v: string) => void) => ({
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();
      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      if (e.key === 'Escape') {
        setThickness(commonThickness != null ? String(commonThickness) : '');
        setHeight(commonHeight != null ? String(commonHeight) : '');
        (e.target as HTMLInputElement).blur();
      }
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => commit(e.target.value),
  });

  return (
    <div className="flex items-center gap-1 pl-1.5 pr-1 text-xs text-gray-500">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={BUTTON_CLASS}
            data-testid="wall-preset"
            title={t('floormap.selection.wallPreset', 'Väggtyp (tjockleks-förinställning)')}
          >
            <Columns3 className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuLabel>{t('floormap.selection.wallType', 'Väggtyp')}</DropdownMenuLabel>
          {WALL_THICKNESS_PRESETS.map((p) => (
            <DropdownMenuItem
              key={p.mm}
              onClick={() => {
                execute('wall.setThickness', { ids, thicknessMM: p.mm });
                setThickness(String(p.mm));
              }}
            >
              {t(p.labelKey, p.fallback)}
              <span className="ml-auto text-muted-foreground">{p.mm} mm</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <label
        className="flex items-center gap-1"
        title={t('floormap.selection.wallThickness', 'Väggtjocklek (mm)')}
      >
        <input
          type="number"
          className="h-7 w-14 rounded-md border px-1.5 text-right text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary"
          value={thickness}
          min={20}
          step={10}
          placeholder="—"
          data-testid="wall-thickness"
          onChange={(e) => setThickness(e.target.value)}
          {...keys(commitThickness)}
        />
      </label>
      <span className="text-gray-300">·</span>
      <label
        className="flex items-center gap-1"
        title={t('floormap.selection.wallHeight', 'Vägghöjd (mm)')}
      >
        <input
          type="number"
          className="h-7 w-16 rounded-md border px-1.5 text-right text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary"
          value={height}
          min={500}
          step={50}
          placeholder="—"
          data-testid="wall-height"
          onChange={(e) => setHeight(e.target.value)}
          {...keys(commitHeight)}
        />
        <span className="text-gray-400">↑</span>
      </label>
    </div>
  );
};

export const FloatingSelectionToolbar = () => {
  const { t } = useTranslation();
  const shapes = useFloorMapStore((s) => s.shapes);
  const selectedShapeIds = useFloorMapStore((s) => s.selectedShapeIds);
  const viewState = useFloorMapStore((s) => s.viewState);
  const activeTool = useFloorMapStore((s) => s.activeTool);
  const marquee = useEditorUiStore((s) => s.marquee);

  const selected = useMemo(
    () => shapes.filter((s) => selectedShapeIds.includes(s.id) && !s.locked),
    [shapes, selectedShapeIds]
  );
  const transformables = useMemo(
    () => selected.filter((s) => s.type !== 'opening' && s.type !== 'image'),
    [selected]
  );

  const anchor = useMemo(() => {
    const bounds = unionBounds(selected);
    if (!bounds) return null;
    return {
      x: ((bounds.minX + bounds.maxX) / 2) * viewState.zoom + viewState.panX,
      y: bounds.minY * viewState.zoom + viewState.panY,
    };
  }, [selected, viewState]);

  if (activeTool !== 'select' || marquee || selected.length === 0 || !anchor) return null;

  const ids = selected.map((s) => s.id);
  const singleOpening = selected.length === 1 && selected[0].type === 'opening';
  const singleWall = selected.length === 1 && selected[0].type === 'wall';
  const wallsOnly = selected.length >= 1 && selected.every((s) => s.type === 'wall');
  const singleImage = selected.length === 1 && selected[0].type === 'image';
  // Restyleable free shapes only (never library/custom objects — they have
  // their own inputs above and aren't plain fill/stroke shapes).
  const stylableOnly =
    selected.length >= 1 && selected.every((s) => STYLABLE_TYPES.has(s.type) && !getObjectDef(s));
  const singleText = selected.length === 1 && selected[0].type === 'text';
  const wallRoom = singleWall
    ? findRoomForWall(selected[0], shapes, useFloorMapStore.getState().currentPlanId)
    : null;
  const singleCustom =
    selected.length === 1 && getObjectDef(selected[0])?.category === 'custom';
  const singleObject = selected.length === 1 && !!getObjectDef(selected[0]);

  // Group detection: a coherent group is >1 shapes all sharing one groupId.
  const groupIds = new Set(selected.map((s) => s.groupId).filter(Boolean) as string[]);
  const isCoherentGroup =
    selected.length > 1 && groupIds.size === 1 && selected.every((s) => !!s.groupId);
  const groupLeader = isCoherentGroup
    ? selected.find((s) => s.isGroupLeader) ?? selected[0]
    : null;
  const canGroup = !isCoherentGroup && selected.filter(isGroupable).length >= 2;

  const canTransform = transformables.length > 0;
  const canAlign = transformables.length >= 2;
  const canDistribute = transformables.length >= 3;

  const align = (mode: AlignMode) => execute('selection.align', { ids, mode });

  return (
    <div
      className="absolute z-30 flex items-center gap-0.5 rounded-lg border bg-white p-1 shadow-lg"
      data-testid="selection-toolbar"
      style={{
        left: anchor.x,
        // High enough that the rotation grip (26 px above the selection box)
        // stays visible below the toolbar.
        top: Math.max(anchor.y - 84, 8),
        transform: 'translateX(-50%)',
      }}
    >
      {wallsOnly && <WallPropsInput walls={selected} />}
      {singleImage && <ImagePropsInput shape={selected[0]} />}
      {stylableOnly && <ShapeStyleInput shapes={selected} />}
      {singleText && <TextStyleInput shape={selected[0]} />}
      {singleCustom && <CustomObjectInputs shape={selected[0]} />}
      {singleObject && <ObjectFinishInput shape={selected[0]} />}
      {groupLeader && <GroupNameInput leader={groupLeader} />}

      {singleOpening ? (
        <>
          <OpeningWidthInput opening={selected[0]} />
          <button
            className={BUTTON_CLASS}
            title={t('floormap.selection.flipOpening', 'Vänd öppning (F)')}
            onClick={() => execute('opening.flip', { id: selected[0].id })}
          >
            <ArrowLeftRight className="h-4 w-4" />
          </button>
        </>
      ) : (
        canTransform && (
          <>
            <button
              className={BUTTON_CLASS}
              title={t('floormap.selection.rotate90', 'Rotera 90°')}
              onClick={() => execute('selection.rotate', { ids })}
            >
              <RotateCw className="h-4 w-4" />
            </button>
            <button
              className={BUTTON_CLASS}
              title={t('floormap.selection.mirrorH', 'Spegla horisontellt')}
              onClick={() => execute('selection.mirror', { ids, direction: 'horizontal' })}
            >
              <FlipHorizontal2 className="h-4 w-4" />
            </button>
            <button
              className={BUTTON_CLASS}
              title={t('floormap.selection.mirrorV', 'Spegla vertikalt')}
              onClick={() => execute('selection.mirror', { ids, direction: 'vertical' })}
            >
              <FlipVertical2 className="h-4 w-4" />
            </button>
          </>
        )
      )}

      {!singleOpening && (
        <button
          className={BUTTON_CLASS}
          title={t('floormap.selection.duplicate', 'Duplicera (Cmd+D)')}
          onClick={() => execute('selection.duplicate', { ids })}
        >
          <Copy className="h-4 w-4" />
        </button>
      )}

      {canAlign && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={BUTTON_CLASS}
              title={t('floormap.selection.alignMenu', 'Justera & fördela')}
            >
              <AlignStartVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-48">
            <DropdownMenuLabel>{t('floormap.selection.align', 'Justera')}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => align('left')}>
              <AlignStartVertical className="mr-2 h-4 w-4" />
              {t('floormap.selection.alignLeft', 'Vänsterkanter')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => align('centerX')}>
              <AlignCenterVertical className="mr-2 h-4 w-4" />
              {t('floormap.selection.alignCenterX', 'Centrera horisontellt')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => align('right')}>
              <AlignEndVertical className="mr-2 h-4 w-4" />
              {t('floormap.selection.alignRight', 'Högerkanter')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => align('top')}>
              <AlignStartHorizontal className="mr-2 h-4 w-4" />
              {t('floormap.selection.alignTop', 'Överkanter')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => align('centerY')}>
              <AlignCenterHorizontal className="mr-2 h-4 w-4" />
              {t('floormap.selection.alignCenterY', 'Centrera vertikalt')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => align('bottom')}>
              <AlignEndHorizontal className="mr-2 h-4 w-4" />
              {t('floormap.selection.alignBottom', 'Underkanter')}
            </DropdownMenuItem>
            {canDistribute && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>
                  {t('floormap.selection.distribute', 'Fördela')}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => execute('selection.distribute', { ids, axis: 'horizontal' })}
                >
                  <AlignHorizontalSpaceBetween className="mr-2 h-4 w-4" />
                  {t('floormap.selection.distributeH', 'Jämnt horisontellt')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => execute('selection.distribute', { ids, axis: 'vertical' })}
                >
                  <AlignVerticalSpaceBetween className="mr-2 h-4 w-4" />
                  {t('floormap.selection.distributeV', 'Jämnt vertikalt')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {singleWall && wallRoom && (
        <>
          <div className="mx-0.5 h-5 w-px bg-gray-200" />
          <button
            className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
            data-testid="show-wall-view"
            title={t('floormap.selection.showWallView', 'Visa väggvy — öppningar, objekt och ytor på denna vägg')}
            onClick={() =>
              useEditorUiStore
                .getState()
                .setElevationRequest({ roomShapeId: wallRoom.id, wallId: selected[0].id })
            }
          >
            <PanelTop className="h-4 w-4" />
            {t('floormap.selection.wallView', 'Väggvy')}
          </button>
        </>
      )}

      {(canGroup || isCoherentGroup) && (
        <>
          <div className="mx-0.5 h-5 w-px bg-gray-200" />
          {canGroup && (
            <button
              className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
              data-testid="group-shapes"
              title={t('floormap.selection.groupTitle', 'Gör markeringen till ett eget objekt')}
              onClick={() => execute('selection.group', { ids })}
            >
              <Group className="h-4 w-4" />
              {t('floormap.selection.group', 'Gruppera')}
            </button>
          )}
          {isCoherentGroup && (
            <button
              className={BUTTON_CLASS}
              data-testid="ungroup-shapes"
              title={t('floormap.selection.ungroup', 'Dela upp objektet')}
              onClick={() => execute('selection.ungroup', { ids })}
            >
              <Ungroup className="h-4 w-4" />
            </button>
          )}
        </>
      )}

      <div className="mx-0.5 h-5 w-px bg-gray-200" />
      <button
        className={`${BUTTON_CLASS} hover:bg-red-50 hover:text-red-600`}
        title={t('floormap.selection.delete', 'Radera (Delete)')}
        onClick={() => execute('shape.delete', { ids })}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
};
