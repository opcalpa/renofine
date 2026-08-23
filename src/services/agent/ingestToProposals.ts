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

export interface ExistingProjectContext {
  /** Rooms already in the project — used to avoid proposing duplicates. */
  roomNames: string[];
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

const norm = (s: string) => s.trim().toLowerCase();

export function ingestOutcomeToProposals(
  outcome: IngestOutcome,
  context: ExistingProjectContext,
  opts: Options
): AgentProposal[] {
  const { labelFor, copy } = opts;
  const draft: ProjectDraft = outcome.draft;
  const proposals: AgentProposal[] = [];

  // ── Rooms ──────────────────────────────────────────────────────────────
  // Only rooms the project doesn't already have. Existing ones aren't a
  // proposal at all — tasks below just reference them by name.
  const existing = new Set(context.roomNames.map(norm));
  const newRooms = draft.rooms.filter((r) => r.name.trim() && !existing.has(norm(r.name)));

  newRooms.forEach((room, i) => {
    const action: ProposalAction = { type: 'create_room', name: room.name.trim() };
    proposals.push({
      id: proposalId('room', i),
      summary: copy.room(room.name.trim()),
      confidence: room.source?.confidence ?? 0.8,
      action,
    });
  });

  // ── Tasks ──────────────────────────────────────────────────────────────
  // roomName is resolved at apply time against rooms created earlier in the
  // SAME batch (applyProposals applies create_room first) or existing rooms.
  draft.tasks
    .filter((t) => !t.excluded)
    .forEach((task, i) => {
      const title = taskTitle(task, labelFor);
      const action: ProposalAction = {
        type: 'create_task',
        title,
        ...(task.roomName ? { roomName: task.roomName } : {}),
      };
      proposals.push({
        id: proposalId('task', i),
        summary: copy.task(title, task.roomName),
        confidence: task.source?.confidence ?? 0.8,
        action,
      });
    });

  // ── Purchases ──────────────────────────────────────────────────────────
  // Already envelope-shaped: the ingest engine builds ImportPurchaseAction via
  // the same captureDocument path the camera uses. Pass straight through.
  outcome.pendingPurchases.forEach((action, i) => {
    proposals.push({
      id: proposalId('purchase', i),
      summary: copy.purchase(action.vendorName, action.total),
      confidence: 0.8,
      action,
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
    });
  });

  return proposals;
}
