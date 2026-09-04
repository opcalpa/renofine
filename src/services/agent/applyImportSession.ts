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
import { movedFiles, type ImportDrawing, type ImportSession } from './importSession';
import { peekAttachment } from './documentCapture';
import {
  ensureFolder,
  moveToFolder,
  uploadToCategoryFolder,
  CATEGORY_FOLDERS,
} from '@/services/smartUploadService';
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
  /** How many files the person moved to another folder, and that actually moved. */
  filesMoved: number;
  /** Readings kept as a plain document instead of as a purchase, and filed. */
  documentsSaved: number;
  /** Those that could not be filed — named, never swallowed. */
  documentsFailed: string[];
  /** What did not land, by the name on the paper. A count cannot be acted on. */
  failedNames: string[];
  /**
   * The same review, minus everything that DID land — or null when all of it did.
   *
   * A partial apply used to end with the review closed, the journal cleared and
   * the run marked applied, so the only way back was to reopen the run: which
   * still held every proposal ticked, against a project that now had most of
   * them (2026-09-04). Retrying meant booking the successes a second time.
   *
   * Handing the retry back from HERE is what makes it honest — the successes,
   * the layers that were drawn, the folder moves that happened and the
   * documents that were filed are all known in this function and nowhere else.
   */
  retrySession: ImportSession | null;
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

/**
 * Carry out the folder moves the person made on the review page.
 *
 * FIRST, before anything reads a path: a drawing that was moved must become a
 * layer at its NEW path, or the canvas would point at a file that is no longer
 * there. Returns how many actually moved — a move that failed leaves the file
 * where it was, and the caller says so rather than claiming otherwise.
 */
async function applyFolderMoves(
  session: ImportSession
): Promise<{ moved: number; newPaths: Map<string, string> }> {
  const moves = movedFiles(session);
  const newPaths = new Map<string, string>();
  if (moves.length === 0) return { moved: 0, newPaths };

  for (const folder of new Set(moves.map((f) => f.targetFolder as string))) {
    await ensureFolder(session.projectId, folder);
  }

  for (const file of moves) {
    const from = file.storagePath as string;
    const to = await moveToFolder(session.projectId, from, file.targetFolder as string);
    // A move that failed leaves the file where it was — recording nothing here
    // is what keeps the rest of the apply pointing at a path that exists.
    if (to) newPaths.set(from, to);
  }
  return { moved: newPaths.size, newPaths };
}

/**
 * "Inte ett inköp — spara som dokument."
 *
 * The hole this closes: a file the reader turned into a purchase has NO storage
 * path of its own. The order owns the bytes and uploads them at Genomför, so
 * switching the row off threw away the DOCUMENT along with the purchase — a
 * följesedel read as an 8 kr order left the person choosing between a false
 * cost in the budget and losing the paper (Carl, 2026-09-03).
 *
 * Awaited rather than fire-and-forget, for the same reason merged pages are: a
 * file that silently failed to upload is a lost receipt, and this action exists
 * precisely because the person wanted to keep it. Failures come back by name.
 */
async function saveDroppedDocuments(
  session: ImportSession
): Promise<{ saved: number; failed: string[]; savedIds: string[] }> {
  const entries = Object.entries(session.savedAsDocument ?? {});
  if (entries.length === 0) return { saved: 0, failed: [], savedIds: [] };

  const fallback = session.importFolder ?? '';
  for (const category of new Set(entries.map(([, c]) => c))) {
    await ensureFolder(session.projectId, CATEGORY_FOLDERS[category] || fallback);
  }

  let saved = 0;
  const failed: string[] = [];
  const savedIds: string[] = [];
  for (const [proposalId, category] of entries) {
    const proposal = session.proposals.find((p) => p.id === proposalId);
    if (!proposal || proposal.action.type !== 'import_purchase') continue;
    // A row that is switched back ON is a purchase again, and the order will
    // upload the same bytes. Filing them here too would put the receipt in
    // Files twice — the UI keeps the two states exclusive, and this is the
    // guard at the write boundary that makes it true regardless.
    if (!session.rejected.has(proposalId)) continue;
    const action = proposal.action;
    const name = action.sourceFileName ?? proposal.sourceFile ?? proposalId;
    // The reading is discarded; the FILE is the whole point of this action.
    // Pages merged into this row come along: they were merged BECAUSE they are
    // the same document, and leaving them behind would lose sheet two of the
    // very paper being rescued.
    const parts: Array<{ key: string | undefined; label: string }> = [
      { key: action.attachmentKey, label: name },
      ...(action.extraPages ?? []).map((page, i) => ({
        key: page.attachmentKey,
        label: page.fileName || `${name} (${i + 2})`,
      })),
    ];
    let allParts = true;
    for (const part of parts) {
      // Peek, never take: an upload that fails must leave the bytes where they
      // are rather than consume them on the way to nowhere.
      const file = peekAttachment(part.key);
      if (!file) {
        failed.push(part.label);
        allParts = false;
        continue;
      }
      const path = await uploadToCategoryFolder(session.projectId, file, category, fallback);
      if (path) saved += 1;
      else {
        failed.push(part.label);
        allParts = false;
      }
    }
    // Only a paper filed in FULL is done. One that lost sheet two is retried
    // whole — a duplicate page is recoverable, a missing one is not.
    if (allParts) savedIds.push(proposalId);
  }
  return { saved, failed, savedIds };
}

export async function applyImportSession(session: ImportSession): Promise<ImportApplyResult> {
  // Moves first: everything below reads storage paths. The session belongs to
  // React, so the new paths ride along in a map instead of being written back
  // into it.
  const { moved: filesMoved, newPaths } = await applyFolderMoves(session);
  const atCurrentPath = (drawing: ImportDrawing): ImportDrawing =>
    drawing.storagePath && newPaths.has(drawing.storagePath)
      ? { ...drawing, storagePath: newPaths.get(drawing.storagePath) }
      : drawing;
  const drawingsByProposal = new Map(session.drawings.map((d) => [d.proposalId, d]));

  // Drawings the person wants as a layer must NOT go through the tracing
  // action — that is the whole point of the choice.
  // Already written by an earlier Genomför on this same session. Checked here
  // rather than trusting `rejected`, because a person can tick a row back on.
  const alreadyApplied = new Set(session.appliedProposalIds ?? []);
  const accepted: AgentProposal[] = session.proposals.filter((p) => {
    if (alreadyApplied.has(p.id)) return false;
    if (session.rejected.has(p.id)) return false;
    const drawing = drawingsByProposal.get(p.id);
    if (drawing) return drawing.choice === 'trace';
    return true;
  });

  const result = await applyProposals(accepted, session.projectId);

  // Layers, after the proposals — a new plan created here should not collide
  // with one a traced sketch just made.
  let targetPlanId: string | null = null;
  // Layers land outside `applyProposals`, so nothing else records that they
  // happened — and a retry that redrew them would put the same image on the
  // plan twice.
  const layeredProposalIds: string[] = [];
  for (const drawing of session.drawings) {
    if (drawing.choice !== 'layer') continue;
    const planId = await addDrawingAsLayer(atCurrentPath(drawing), session.projectId);
    if (planId) {
      targetPlanId = planId;
      layeredProposalIds.push(drawing.proposalId);
    }
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

  // After the proposals, deliberately: a throw above means nothing was written
  // at all and the person retries the whole session, which is the failure mode
  // that cannot leave duplicate copies of a document in Files.
  //
  // Non-throwing: by this point the purchases are already in the database, and
  // letting a storage hiccup bubble would tell the person the whole import
  // failed when it did not. What did not land comes back by name instead.
  const documents = await saveDroppedDocuments(session).catch((e) => {
    console.error('applyImportSession: saving dropped documents failed', e);
    return {
      saved: 0,
      savedIds: [],
      failed: Object.keys(session.savedAsDocument ?? {}).map((id) => {
        const p = session.proposals.find((x) => x.id === id);
        return (p?.action.type === 'import_purchase' ? p.action.sourceFileName : null)
          ?? p?.sourceFile
          ?? id;
      }),
    };
  });
  const { saved: documentsSaved, failed: documentsFailed, savedIds } = documents;

  const failedNames = result.failed.map(({ proposal }) => proposalLabel(proposal));

  return {
    ...result,
    placeableRooms,
    targetPlanId,
    filesMoved,
    documentsSaved,
    documentsFailed,
    failedNames,
    retrySession:
      result.failed.length > 0 || documentsFailed.length > 0
        ? buildRetrySession(session, {
            appliedIds: result.applied.map((p) => p.id),
            layeredProposalIds,
            documentSavedIds: savedIds,
            newPaths,
          })
        : null,
  };
}

/** What to call a proposal in a message to a person. */
function proposalLabel(proposal: AgentProposal): string {
  const fromFile =
    proposal.action.type === 'import_purchase' ? proposal.action.sourceFileName : null;
  return fromFile ?? proposal.sourceFile ?? proposal.summary?.trim() ?? proposal.id;
}

/**
 * The same review with everything that already landed taken out of it.
 *
 * Pressing Genomför again on this session must write ONLY what failed. Each
 * branch below is a way the first pass changed the world without the session
 * knowing:
 *
 *  - applied proposals are switched off (`rejected` is what the apply reads);
 *  - drawings already laid on a plan drop to `fileOnly`;
 *  - files already moved have their move folded in, so the move is not retried
 *    from a path that no longer exists;
 *  - documents already filed leave `savedAsDocument`, so the paper is not
 *    filed in Files a second time.
 *
 * Deliberately conservative in one direction: anything this cannot prove
 * happened is left to be retried. A duplicate is visible and fixable; a
 * silently skipped receipt is neither.
 */
export function buildRetrySession(
  session: ImportSession,
  done: {
    appliedIds: string[];
    layeredProposalIds: string[];
    documentSavedIds: string[];
    newPaths: Map<string, string>;
  }
): ImportSession {
  const rejected = new Set(session.rejected);
  for (const id of done.appliedIds) rejected.add(id);
  // Untick AND record. The tick is what the person sees; this is what the
  // write boundary obeys.
  const appliedProposalIds = [...new Set([...(session.appliedProposalIds ?? []), ...done.appliedIds])];

  const savedAsDocument = { ...(session.savedAsDocument ?? {}) };
  for (const id of done.documentSavedIds) delete savedAsDocument[id];

  const layered = new Set(done.layeredProposalIds);
  const drawings = session.drawings.map((d) =>
    layered.has(d.proposalId) ? { ...d, choice: 'fileOnly' as const } : d
  );

  const files = session.files.map((f) => {
    const moved = f.storagePath ? done.newPaths.get(f.storagePath) : undefined;
    if (!moved) return f;
    return { ...f, storagePath: moved, folder: f.targetFolder, targetFolder: undefined };
  });

  return { ...session, rejected, savedAsDocument, drawings, files, appliedProposalIds };
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
