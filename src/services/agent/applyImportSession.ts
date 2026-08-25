import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/integrations/supabase/client';
import {
  createPlanInDB,
  loadShapesForPlan,
  saveShapesForPlan,
} from '@/components/floormap/utils/plans';
import { worldPerMm } from '@/components/floormap/editor/core/units';
import type { FloorMapShape } from '@/components/floormap/types';
import { applyProposals } from './applyProposals';
import type { ApplyResult } from './applyProposals';
import type { AgentProposal, ProposalAction } from './types';
import type { ImportDrawing, ImportSession } from './importSession';
import type { PlaceRoomRequest } from '@/components/floormap/editor/placeRoomFromList';

/**
 * Carry out what the person decided on the import review page.
 *
 * Two things happen here that `applyProposals` cannot do on its own: a drawing
 * chosen as a LAYER becomes an image shape on an existing plan rather than a
 * traced sketch, and the rooms that were actually created are handed back so
 * the planner can offer to place them.
 */

type CreateRoomAction = Extract<ProposalAction, { type: 'create_room' }>;

export interface ImportApplyResult extends ApplyResult {
  /** Rooms created by this import, ready to be placed on the canvas. */
  placeableRooms: PlaceRoomRequest[];
  /** The plan a drawing landed on, so the app can navigate there. */
  targetPlanId: string | null;
}

/**
 * Put a drawing under the canvas as a locked background image.
 *
 * Sized so the image spans a believable width (the vision pass has no real
 * scale), placed at the origin, and kept BEHIND everything via zIndex — the
 * same shape `uploadPlanImage` builds for a manual import, so the canvas has
 * only one kind of background image to reason about.
 */
const LAYER_SPAN_MM = 10000;

/**
 * The drawing's real proportions, read from the stored file.
 *
 * Without this the layer was forced to 4:3 — a portrait A4 plan landed on the
 * canvas squashed into landscape, and every wall traced over it inherited the
 * distortion. The bucket is private, so the bytes come through a short-lived
 * signed URL. Returns null when the file cannot be read — a PDF original is the
 * normal such case — and the caller then keeps the old assumption rather than
 * failing the whole import.
 */
async function drawingAspect(storagePath: string): Promise<number | null> {
  try {
    const { data } = await supabase.storage
      .from('project-files')
      .createSignedUrl(storagePath, 60);
    if (!data?.signedUrl) return null;
    const blob = await (await fetch(data.signedUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const aspect = bitmap.height / bitmap.width;
    bitmap.close?.();
    return Number.isFinite(aspect) && aspect > 0 ? aspect : null;
  } catch {
    return null;
  }
}

async function addDrawingAsLayer(
  drawing: ImportDrawing,
  projectId: string
): Promise<string | null> {
  if (!drawing.storagePath) return null;

  let planId = drawing.targetPlanId;
  if (planId === 'new') {
    const plan = await createPlanInDB(projectId, drawing.fileName);
    if (!plan) return null;
    planId = plan.id;
  }

  // Never overwrite: read what the plan holds and append.
  const existing = await loadShapesForPlan(planId);
  const span = LAYER_SPAN_MM * worldPerMm();
  const aspect = (await drawingAspect(drawing.storagePath)) ?? 0.75;

  const image: FloorMapShape = {
    id: uuidv4(),
    type: 'image',
    planId,
    coordinates: { x: 0, y: 0, width: span, height: span * aspect },
    imageUrl: drawing.storagePath,
    imageOpacity: 0.5,
    locked: false,
    zIndex: -100,
    name: drawing.fileName,
  };

  const saved = await saveShapesForPlan(planId, [...existing, image]);
  return saved ? planId : null;
}

export async function applyImportSession(session: ImportSession): Promise<ImportApplyResult> {
  const drawingsByProposal = new Map(session.drawings.map((d) => [d.proposalId, d]));

  // Drawings the person wants as a layer must NOT go through the tracing
  // action — that is the whole point of the choice.
  const accepted: AgentProposal[] = session.proposals.filter((p) => {
    if (session.rejected.has(p.id)) return false;
    const drawing = drawingsByProposal.get(p.id);
    if (drawing) return drawing.choice === 'trace';
    return true;
  });

  const result = await applyProposals(accepted, session.projectId);

  // Layers, after the proposals — a new plan created here should not collide
  // with one a traced sketch just made.
  let targetPlanId: string | null = null;
  for (const drawing of session.drawings) {
    if (drawing.choice !== 'layer') continue;
    const planId = await addDrawingAsLayer(drawing, session.projectId);
    if (planId) targetPlanId = planId;
  }
  if (!targetPlanId) {
    // A traced sketch reports its new plan through its undo op (delete_plan) —
    // that is the only place the id surfaces.
    const traced = result.undo.find((op) => op.kind === 'delete_plan');
    targetPlanId = traced && traced.kind === 'delete_plan' ? traced.planId : null;
  }

  // Which rooms actually got made — merged ones wrote nothing, so they are not
  // placeable and must not show up as unplaced.
  const createdRoomIds = new Set(
    result.created.filter((c) => c.type === 'room').map((c) => c.id)
  );
  const nameById = new Map(
    result.created.filter((c) => c.type === 'room').map((c) => [c.id, c.title])
  );

  const placeableRooms: PlaceRoomRequest[] = Array.from(createdRoomIds).map((id) => ({
    roomId: id,
    name: nameById.get(id) ?? '',
    areaSqm: null,
  }));

  // Areas, when the draft knew them — a placed room should start at its real
  // size rather than a default 4×3.
  const areaByName = new Map<string, number>();
  for (const room of session.outcome.draft.rooms) {
    if (room.areaSqm) areaByName.set(room.name.trim().toLowerCase(), room.areaSqm);
  }
  for (const room of placeableRooms) {
    const area = areaByName.get(room.name.trim().toLowerCase());
    if (area) room.areaSqm = area;
  }

  return { ...result, placeableRooms, targetPlanId };
}

/** Rooms the person merged into existing ones — for an honest summary. */
export function mergedRoomCount(session: ImportSession): number {
  return session.proposals.filter(
    (p) =>
      p.action.type === 'create_room' &&
      !session.rejected.has(p.id) &&
      !!(p.action as CreateRoomAction).mergeIntoRoomId
  ).length;
}

/** Convenience for the summary toast. */
export async function countRoomsInProject(projectId: string): Promise<number> {
  const { count } = await supabase
    .from('rooms')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  return count ?? 0;
}
