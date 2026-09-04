/**
 * What a dropped folder wants to do to a project, laid out for review.
 *
 * Dropping 100 files on an existing project is not the same job as reading one
 * receipt. It is a reconciliation: the folder describes a home the person
 * already described once, and the two descriptions disagree. Renaida's panel
 * can hold a checklist; it cannot hold "is this `Badrum 1` the `Badrum` you
 * already have, and if so where do its tasks go?".
 *
 * So the drop produces this session, and the review page renders it. The files
 * are already archived by the time it exists — cancelling costs nothing but the
 * reading.
 */

import type { AgentProposal, ProposalAction } from './types';
import type { IngestOutcome } from '../ingestProjectFolder';
import type { DocumentType } from '../smartUploadService';

/** Which pile a file landed in, in the language of the review page. */
export type ImportFileKind =
  /** Gave the project something (rooms, tasks, a purchase, a drawing). */
  | 'interpreted'
  /** Recognised as already imported and never read — the cheap path. */
  | 'alreadyImported'
  /** Read fine, recognised as nothing. Filed, touches nothing. */
  | 'filed'
  /** Belongs to the home, not the renovation. */
  | 'homePaper'
  /** Could not be read at all. */
  | 'unreadable';

export interface ImportFileRow {
  id: string;
  name: string;
  kind: ImportFileKind;
  /** Where it ended up in Files — the review page signs this for the preview. */
  storagePath?: string;
  mimeType?: string;
  /** Proposal ids this file produced, so selecting a file highlights its rows. */
  proposalIds: string[];
  /**
   * The folder it was filed into ("/Kvitton", "/Import 2026-08-25", "" = the
   * project's root). The sorting already happened; this is what makes it
   * visible instead of something that silently happened to the person's files.
   */
  folder?: string;
  /**
   * Where the person moved it to during review. Undefined = leave it. Applied
   * as a real storage move on accept, so cancelling still costs nothing.
   */
  targetFolder?: string;
}

/** Where a file will actually live once the session is applied. */
export function destinationFolder(file: ImportFileRow): string | undefined {
  if (!file.storagePath) return undefined;
  return file.targetFolder ?? file.folder ?? '';
}

/**
 * How many files land in each folder, after the person's changes.
 *
 * The review page can list a hundred rows without ever answering "so where did
 * my files go?". This is that answer, in one line per folder.
 */
export function filingSummary(
  session: ImportSession
): Array<{ folder: string; count: number }> {
  const counts = new Map<string, number>();
  for (const file of session.files) {
    const folder = destinationFolder(file);
    if (folder === undefined) continue;
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([folder, count]) => ({ folder, count }))
    .sort((a, b) => b.count - a.count || a.folder.localeCompare(b.folder));
}

/** Files the person moved — the only ones the apply step has to touch. */
export function movedFiles(session: ImportSession): ImportFileRow[] {
  return session.files.filter(
    (f) => f.storagePath && f.targetFolder !== undefined && f.targetFolder !== f.folder
  );
}

export interface ExistingRoom {
  id: string;
  name: string;
  areaSqm?: number | null;
}

export interface ExistingPlan {
  id: string;
  name: string;
  /** A plan that already holds geometry — drawing over it would collide. */
  hasShapes: boolean;
}

/**
 * What the person decided about one drawing.
 *
 * The app used to have exactly one answer — trace it — and Carl's drawings came
 * back as three rooms that looked nothing like the flat. Laying the image on
 * the canvas and drawing the rooms by hand is often the honest option, so it is
 * offered rather than assumed.
 */
export type DrawingChoice = 'layer' | 'trace' | 'fileOnly';

export interface ImportDrawing {
  proposalId: string;
  fileName: string;
  /** Room names the vision pass thinks it saw. */
  roomNames: string[];
  wallCount: number;
  /** Where the original image is in Files — needed to place it as a layer. */
  storagePath?: string;
  choice: DrawingChoice;
  /** Which plan a layer goes on ('new' = a fresh plan named after the file). */
  targetPlanId: string | 'new';
}

export interface ImportSession {
  projectId: string;
  /**
   * Identity of this import RUN, shared by the local journal and the
   * `import_runs` row on the server. Without it a resumed session would be
   * saved back as a new run every time it was reopened, and the history would
   * fill with copies of the same reading.
   *
   * Optional because sessions built before runs existed (and the dev harness)
   * still have to render.
   */
  runId?: string;
  /** Everything the reader produced — kept whole so nothing is lost in review. */
  outcome: IngestOutcome;
  proposals: AgentProposal[];
  files: ImportFileRow[];
  existingRooms: ExistingRoom[];
  existingPlans: ExistingPlan[];
  drawings: ImportDrawing[];
  /** Proposal ids the person has switched off. */
  rejected: Set<string>;
  /**
   * Rows whose warning the person has looked at and accepted as-is.
   *
   * Without this the queue never empties: a flag on a row you have already
   * judged stays lit forever, "Behöver din blick" never counts down, and the
   * only way to make it stop is to switch the row off — which throws away a
   * purchase you actually wanted (Carl, 2026-09-03).
   */
  acknowledged?: Set<string>;
  /** proposalId → the proposal it was merged into, so the row can say so. */
  merged?: Record<string, string>;
  /**
   * Readings the person said are NOT purchases, but whose FILE must be kept.
   *
   * A file that became a purchase has no storage path of its own — the order
   * owns it and uploads it at Genomför. So switching the row off used to throw
   * away the DOCUMENT, not just the purchase: a följesedel read as an 8 kr
   * order left Carl choosing between a false cost in the budget and losing the
   * paper (2026-09-03). Recorded here as the type to file it under, and carried
   * out as a real upload by `applyImportSession`.
   */
  savedAsDocument?: Record<string, DocumentType>;
  /**
   * Rows where the person answered "ingår i avtalet" to the ÄTA question.
   *
   * A Record, not a Set, on purpose: `import_runs.session` goes through JSON,
   * which turns a Set into `{}` — truthy enough to slip past `?.has` and crash
   * the review for whoever had done the most work (fixed 2026-09-04, and the
   * cheapest way not to repeat it is to stop adding Sets).
   */
  ataDismissed?: Record<string, true>;
  /**
   * Proposals a previous Genomför already wrote to the database.
   *
   * A partial apply hands back this same session minus what landed, and the
   * landed rows come back UNTICKED. Unticked is a display state, though, and a
   * person looking at a receipt they wanted can tick it again — which would
   * book it a second time. So the ids are recorded, and `applyImportSession`
   * refuses them at the write boundary regardless of what the checkbox says
   * (2026-09-04).
   */
  appliedProposalIds?: string[];
  /**
   * This drop's dated folder ("/Import 2026-09-03"), where anything typed
   * `other` lands instead of loose in the project's root.
   */
  importFolder?: string;
}

/** The room proposals in a session, in display order. */
export function roomProposals(session: ImportSession): AgentProposal[] {
  return session.proposals.filter((p) => p.action.type === 'create_room');
}

export function taskProposals(session: ImportSession): AgentProposal[] {
  return session.proposals.filter((p) => p.action.type === 'create_task');
}

export function purchaseProposals(session: ImportSession): AgentProposal[] {
  return session.proposals.filter((p) => p.action.type === 'import_purchase');
}

/**
 * Rooms a task can be assigned to: the ones the project has, plus the ones this
 * batch is about to create (minus any the person merged away or removed).
 */
export function assignableRooms(
  session: ImportSession
): Array<{ value: string; label: string; isNew: boolean }> {
  const existing = session.existingRooms.map((r) => ({
    value: `existing:${r.id}`,
    label: r.name,
    isNew: false,
  }));

  const incoming = roomProposals(session)
    .filter((p) => !session.rejected.has(p.id))
    .filter((p) => {
      const action = p.action as Extract<ProposalAction, { type: 'create_room' }>;
      // A room merged into an existing one is not a separate destination.
      return !action.mergeIntoRoomId;
    })
    .map((p) => ({
      value: `new:${p.id}`,
      label: (p.action as Extract<ProposalAction, { type: 'create_room' }>).name,
      isNew: true,
    }));

  return [...existing, ...incoming];
}

/** Readings kept as a document instead of as a purchase. */
export function savedAsDocumentIds(session: ImportSession): string[] {
  return Object.keys(session.savedAsDocument ?? {});
}

/** How many writes the session will actually perform, for the confirm button. */
export function changeCount(session: ImportSession): number {
  const active = session.proposals.filter((p) => !session.rejected.has(p.id)).length;
  const drawings = session.drawings.filter((d) => d.choice !== 'fileOnly').length;
  // Drawing proposals are counted through `drawings`, not twice.
  const drawingProposalIds = new Set(session.drawings.map((d) => d.proposalId));
  const nonDrawing = session.proposals.filter(
    (p) => !session.rejected.has(p.id) && !drawingProposalIds.has(p.id)
  ).length;
  // Saving a file as a document IS a write, and it is the only one left when
  // every reading was a misreading — without it "Genomför" sits disabled on a
  // session whose whole point is to rescue the papers.
  const documents = savedAsDocumentIds(session).length;
  return (active === nonDrawing ? active + drawings : nonDrawing + drawings) + documents;
}
