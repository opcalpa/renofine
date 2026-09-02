/**
 * Skiva 4: folder ingest → proposal batch.
 *
 * Dropping a folder on an EXISTING project must not be all-or-nothing. The
 * ingest engine produces a draft; this turns that draft into the same
 * envelope actions every other Renaida capture produces, so the user gets
 * ConfirmDiff: per-item accept/reject, per-item provenance, and one-tap undo.
 *
 * Everything here is deterministic — no model calls. The engine already did
 * the reading; this is the translation into the app's write vocabulary.
 */

import type { AgentProposal, ProposalAction } from './types';
import type { IngestOutcome } from '../ingestProjectFolder';
import type { ProjectDraft, WorkTypeLabeller } from '../renaidaProjectFlow';
import { taskTitle } from '../renaidaProjectFlow';
import { registerSketch } from './sketchRegistry';
import { matchRoom } from '@/lib/roomMatch';
import { purchaseKeys, taskKey } from '@/lib/importKeys';

export interface ExistingProjectContext {
  /**
   * Rooms already in the project. Ids matter: an exact match means the draft's
   * tasks point at the room that EXISTS instead of proposing a duplicate.
   */
  existingRooms: { id: string; name: string }[];
  /**
   * Keys of work and purchases the project already holds. A folder dropped a
   * second time must not book the same invoice twice — that one is worse than
   * a duplicate room, because it doubles the budget rather than adding a row
   * to delete.
   */
  existingTaskKeys?: Set<string>;
  existingPurchaseKeys?: Set<string>;
}

interface Options {
  /** Localizes work types into task titles (same seam project birth uses). */
  labelFor: WorkTypeLabeller;
  /** Localized strings — this file never hardcodes UI copy. */
  copy: {
    /** e.g. "Lägg till rummet {{name}}" */
    room: (name: string) => string;
    /** e.g. "Lägg till arbetet {{title}}" */
    task: (title: string, roomName: string | null) => string;
    /** e.g. "Bokför kvitto från {{vendor}} ({{total}})" */
    purchase: (vendor: string, total: number) => string;
    /** e.g. "Rita in ritningen {{file}} ({{rooms}} rum)" */
    sketch: (fileName: string, roomCount: number) => string;
    /** Plan name for a drawn sketch, e.g. "Grovskiss – plan.pdf" */
    planName: (fileName: string) => string;
  };
}

let sketchSeq = 0;

/** Stable-ish unique id without Date.now (kept deterministic per call order). */
function proposalId(prefix: string, index: number): string {
  return `ingest-${prefix}-${index}`;
}

export function ingestOutcomeToProposals(
  outcome: IngestOutcome,
  context: ExistingProjectContext,
  opts: Options
): AgentProposal[] {
  const { labelFor, copy } = opts;
  const draft: ProjectDraft = outcome.draft;
  const proposals: AgentProposal[] = [];

  // ── Rooms ──────────────────────────────────────────────────────────────
  // A room the project already has is not a proposal at all — matched through
  // roomMatch, so `Badrum 1` folds into `Badrum` and `Gäst-WC` into `Gäst WC`
  // instead of becoming duplicates of the home the person already described.
  const existingRooms = context.existingRooms.filter((r) => r.name?.trim());
  /** Draft room name → the existing room it resolved to (no proposal needed). */
  const resolvedToExisting = new Map<string, string>();

  let roomIndex = 0;
  draft.rooms
    .filter((r) => r.name.trim())
    .forEach((room) => {
      const name = room.name.trim();
      const match = matchRoom(name, existingRooms);

      if (match.exact) {
        resolvedToExisting.set(name, match.exact.id);
        return;
      }

      // Close but not certain (`WC` next to `Gäst WC`): still a new room, with
      // the candidate carried along so the review page can pre-fill "= existing".
      const action: ProposalAction = {
        type: 'create_room',
        name,
        ...(match.similar.length === 1 ? { suggestedMergeRoomId: match.similar[0].id } : {}),
      };
      proposals.push({
        id: proposalId('room', roomIndex++),
        summary: copy.room(name),
        confidence: room.source?.confidence ?? 0.8,
        action,
        sourceFile: room.source?.fileName,
      });
    });

  // ── Tasks ──────────────────────────────────────────────────────────────
  // roomName is resolved at apply time against rooms created earlier in the
  // SAME batch (applyProposals applies create_room first) or existing rooms.
  draft.tasks
    .filter((t) => !t.excluded)
    .forEach((task, i) => {
      const title = taskTitle(task, labelFor);
      // A task whose room already exists gets the real id here, so it lands on
      // that room instead of waiting for a create_room that will never come.
      const roomName = task.roomName?.trim();
      const existingRoomId = roomName ? resolvedToExisting.get(roomName) : undefined;
      const action: ProposalAction = {
        type: 'create_task',
        title,
        ...(existingRoomId ? { roomId: existingRoomId } : roomName ? { roomName } : {}),
      };
      // Same work, same room, already there — only detectable for rooms that
      // exist, which is exactly the re-drop case.
      const duplicate =
        !!context.existingTaskKeys?.has(taskKey(title, existingRoomId ?? null));
      proposals.push({
        id: proposalId('task', i),
        summary: copy.task(title, task.roomName),
        confidence: task.source?.confidence ?? 0.8,
        action,
        sourceFile: task.source?.fileName,
        ...(duplicate ? { duplicateOfExisting: true } : {}),
      });
    });

  // ── Purchases ──────────────────────────────────────────────────────────
  // Already envelope-shaped: the ingest engine builds ImportPurchaseAction via
  // the same captureDocument path the camera uses. Pass straight through.
  outcome.pendingPurchases.forEach((action, i) => {
    const keys = purchaseKeys({
      vendorName: action.vendorName,
      invoiceNumber: action.invoiceNumber ?? null,
      total: action.total,
      date: action.documentDate ?? null,
    });
    const duplicate = keys.some((k) => context.existingPurchaseKeys?.has(k));
    proposals.push({
      id: proposalId('purchase', i),
      summary: copy.purchase(action.vendorName, action.total),
      confidence: 0.8,
      action,
      sourceFile: action.sourceFileName,
      ...(duplicate ? { duplicateOfExisting: true } : {}),
    });
  });

  // ── Floor plans ────────────────────────────────────────────────────────
  outcome.pendingSketches.forEach((sketch, i) => {
    const key = `ingest-sketch-${sketchSeq++}`;
    registerSketch(key, sketch.result);
    const roomCount = sketch.result.rooms?.length ?? 0;
    const wallCount = sketch.result.walls?.length ?? 0;
    const action: ProposalAction = {
      type: 'create_plan_sketch',
      planName: copy.planName(sketch.fileName),
      sketchKey: key,
      roomCount,
      wallCount,
    };
    proposals.push({
      id: proposalId('sketch', i),
      summary: copy.sketch(sketch.fileName, roomCount),
      confidence: 0.7,
      action,
      sourceFile: sketch.fileName,
    });
  });

  return proposals;
}
