/**
 * Inherit a floor plan from an earlier renovation in the same home (S6).
 *
 * The walls of a flat do not change between renovations. Before this, the
 * second project on an address started from an empty canvas and someone redrew
 * the same rooms — the single most tedious thing the address entity was
 * supposed to make unnecessary.
 *
 * It copies, it does not share. The old plan is a historical document of what
 * that renovation looked like; editing this year's kitchen must never rewrite
 * last year's drawing. So: new rows, new ids, no link back.
 *
 * What is deliberately NOT carried over: `room_id` and `task_id`. Those point
 * at the OTHER project's rooms and tasks, and a shape claiming to be a room in
 * a project it does not belong to is a cross-project reference that every
 * downstream reader would have to defend against.
 */

import { supabase } from '@/integrations/supabase/client';
import type { FloorMapPlan } from '@/components/floormap/types';

export interface InheritablePlan {
  planId: string;
  planName: string;
  projectId: string;
  projectName: string;
  /** When that renovation happened — start date if known, else created. */
  projectDate: string | null;
  shapeCount: number;
  roomCount: number;
}

interface SiblingProject {
  id: string;
  name: string;
  start_date: string | null;
  created_at: string;
}

interface PlanShapeRow {
  id: string;
  shape_type: string;
  shape_data: Record<string, unknown> | null;
  properties: unknown;
  view_mode: string | null;
  color: string | null;
  stroke_color: string | null;
}

/** Keys inside shape_data that hold the id of ANOTHER shape in the same plan. */
const SHAPE_REFERENCE_KEYS = ['parentWallId', 'attachedToWall', 'startShapeId', 'endShapeId'];

/**
 * Plans on the other projects at this project's address, newest project first.
 *
 * Empty plans are left out: inheriting nothing is not a choice worth offering.
 */
export async function listInheritablePlans(projectId: string): Promise<InheritablePlan[]> {
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('property_id')
    .eq('id', projectId)
    .maybeSingle();

  if (projectError || !project?.property_id) return [];

  const { data: siblings, error: siblingError } = await supabase
    .from('projects')
    .select('id, name, start_date, created_at')
    .eq('property_id', project.property_id)
    .neq('id', projectId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (siblingError || !siblings || siblings.length === 0) return [];

  const byProject = new Map<string, SiblingProject>(
    (siblings as SiblingProject[]).map((p) => [p.id, p])
  );

  const { data: plans, error: planError } = await supabase
    .from('floor_map_plans')
    .select('id, name, project_id, created_at')
    .in('project_id', [...byProject.keys()])
    .order('created_at', { ascending: true });

  if (planError || !plans || plans.length === 0) return [];

  const { data: shapes, error: shapeError } = await supabase
    .from('floor_map_shapes')
    .select('plan_id, shape_type')
    .in('plan_id', plans.map((p) => p.id));

  if (shapeError) return [];

  const counts = new Map<string, { total: number; rooms: number }>();
  for (const shape of shapes ?? []) {
    if (!shape.plan_id) continue;
    const entry = counts.get(shape.plan_id) ?? { total: 0, rooms: 0 };
    entry.total += 1;
    if (shape.shape_type === 'room') entry.rooms += 1;
    counts.set(shape.plan_id, entry);
  }

  return plans
    .map((plan) => {
      const sibling = byProject.get(plan.project_id);
      const count = counts.get(plan.id) ?? { total: 0, rooms: 0 };
      return {
        planId: plan.id,
        planName: plan.name,
        projectId: plan.project_id,
        projectName: sibling?.name ?? '',
        projectDate: sibling?.start_date ?? sibling?.created_at?.slice(0, 10) ?? null,
        shapeCount: count.total,
        roomCount: count.rooms,
      };
    })
    .filter((p) => p.shapeCount > 0);
}

/**
 * Copy a plan and everything drawn on it into another project.
 *
 * Returns the new plan, or null when nothing was created. A plan that ends up
 * without its shapes is worse than no plan at all — it looks like the drawing
 * was lost — so a failed shape insert takes the empty plan down with it.
 */
export async function copyPlanToProject(
  sourcePlanId: string,
  targetProjectId: string,
  name: string
): Promise<FloorMapPlan | null> {
  const { data: source, error: sourceError } = await supabase
    .from('floor_map_plans')
    .select('id, name, view_settings')
    .eq('id', sourcePlanId)
    .maybeSingle();

  if (sourceError || !source) {
    console.error('copyPlanToProject: source plan not readable', sourceError);
    return null;
  }

  const { data: sourceShapes, error: shapeError } = await supabase
    .from('floor_map_shapes')
    .select('id, shape_type, shape_data, properties, view_mode, color, stroke_color')
    .eq('plan_id', sourcePlanId);

  if (shapeError) {
    console.error('copyPlanToProject: could not read shapes', shapeError);
    return null;
  }

  const { data: created, error: createError } = await supabase
    .from('floor_map_plans')
    .insert({
      project_id: targetProjectId,
      name: name.trim() || source.name,
      is_default: false,
      view_settings: source.view_settings,
    })
    .select('id, name, project_id, is_default, view_settings, created_at, updated_at')
    .single();

  if (createError || !created) {
    console.error('copyPlanToProject: could not create plan', createError);
    return null;
  }

  const newPlan: FloorMapPlan = {
    id: created.id,
    projectId: created.project_id,
    name: created.name,
    isDefault: created.is_default,
    viewSettings: created.view_settings as FloorMapPlan['viewSettings'],
    createdAt: created.created_at,
    updatedAt: created.updated_at,
  };

  const rows = (sourceShapes ?? []) as PlanShapeRow[];
  if (rows.length === 0) return newPlan;

  // Fresh ids first, so references between shapes can be rewritten to point
  // inside the copy. A door whose parentWallId still named the old wall would
  // detach itself the moment that wall moved in the new project.
  const idMap = new Map(rows.map((row) => [row.id, crypto.randomUUID()] as const));

  const copies = rows.map((row) => {
    const shapeData: Record<string, unknown> = { ...(row.shape_data ?? {}) };
    for (const key of SHAPE_REFERENCE_KEYS) {
      const ref = shapeData[key];
      if (typeof ref === 'string' && idMap.has(ref)) shapeData[key] = idMap.get(ref);
    }

    return {
      id: idMap.get(row.id) as string,
      project_id: targetProjectId,
      plan_id: newPlan.id,
      shape_type: row.shape_type,
      shape_data: shapeData,
      properties: row.properties,
      view_mode: row.view_mode,
      color: row.color,
      stroke_color: row.stroke_color,
      // room_id / task_id stay null on purpose — see the file header.
    };
  });

  const { error: insertError } = await supabase.from('floor_map_shapes').insert(copies);

  if (insertError) {
    console.error('copyPlanToProject: could not copy shapes', insertError);
    await supabase.from('floor_map_plans').delete().eq('id', newPlan.id);
    return null;
  }

  return newPlan;
}


export interface PlanPreview {
  planId: string;
  rooms: { points: { x: number; y: number }[]; color: string | null }[];
  walls: { x1: number; y1: number; x2: number; y2: number }[];
}

interface PreviewShapeRow {
  plan_id: string | null;
  project_id: string;
  shape_type: string;
  shape_data: Record<string, unknown> | null;
  color: string | null;
}

function readPoints(data: Record<string, unknown> | null): { x: number; y: number }[] {
  const raw = (data?.coordinates ?? data?.points) as unknown;
  const points = (raw as { points?: unknown })?.points ?? raw;
  if (!Array.isArray(points)) return [];
  return points
    .filter((p): p is { x: number; y: number } =>
      typeof (p as { x?: unknown })?.x === 'number' && typeof (p as { y?: unknown })?.y === 'number'
    )
    .map((p) => ({ x: p.x, y: p.y }));
}

function readSegment(
  data: Record<string, unknown> | null
): { x1: number; y1: number; x2: number; y2: number } | null {
  const raw = (data?.coordinates ?? data?.points) as Record<string, unknown> | undefined;
  if (!raw) return null;
  const { x1, y1, x2, y2 } = raw as Record<string, unknown>;
  if ([x1, y1, x2, y2].every((v) => typeof v === 'number')) {
    return { x1: x1 as number, y1: y1 as number, x2: x2 as number, y2: y2 as number };
  }
  return null;
}

/**
 * Enough geometry to draw a thumbnail of each project's floor plan.
 *
 * Rooms and walls only: at thumbnail size a sink is a smudge, while the outline
 * of the home is instantly recognisable as "this is my flat". One query for the
 * whole address rather than one per project.
 */
export async function fetchPlanPreviews(
  projectIds: string[]
): Promise<Map<string, PlanPreview>> {
  const previews = new Map<string, PlanPreview>();
  if (projectIds.length === 0) return previews;

  const { data: plans, error: planError } = await supabase
    .from('floor_map_plans')
    .select('id, project_id')
    .in('project_id', projectIds);

  if (planError || !plans || plans.length === 0) return previews;

  const { data: shapes, error: shapeError } = await supabase
    .from('floor_map_shapes')
    .select('plan_id, project_id, shape_type, shape_data, color')
    .in('plan_id', plans.map((p) => p.id))
    .in('shape_type', ['room', 'wall']);

  if (shapeError || !shapes) return previews;

  // A project can hold several plans; show the one with the most drawn on it.
  const byPlan = new Map<string, PreviewShapeRow[]>();
  for (const shape of shapes as PreviewShapeRow[]) {
    if (!shape.plan_id) continue;
    const bucket = byPlan.get(shape.plan_id);
    if (bucket) bucket.push(shape);
    else byPlan.set(shape.plan_id, [shape]);
  }

  for (const plan of plans) {
    const rows = byPlan.get(plan.id);
    if (!rows || rows.length === 0) continue;

    const current = previews.get(plan.project_id);
    const size = rows.length;
    if (current && current.rooms.length + current.walls.length >= size) continue;

    previews.set(plan.project_id, {
      planId: plan.id,
      rooms: rows
        .filter((r) => r.shape_type === 'room')
        .map((r) => ({
          points: readPoints(r.shape_data),
          // The column is only filled in for shapes drawn by hand; plans that
          // came from an import carry their colour inside shape_data.
          color: r.color ?? (typeof r.shape_data?.fillColor === 'string'
            ? (r.shape_data.fillColor as string)
            : null),
        }))
        .filter((r) => r.points.length > 2),
      walls: rows
        .filter((r) => r.shape_type === 'wall')
        .map((r) => readSegment(r.shape_data))
        .filter((w): w is { x1: number; y1: number; x2: number; y2: number } => w !== null),
    });
  }

  return previews;
}
