/**
 * Turn a finished folder read into the session the review page renders.
 *
 * Deterministic: everything here already happened (the reading, the matching,
 * the archiving). This only arranges it so a person can check it.
 */

import type { AgentProposal, ProposalAction } from './types';
import type { IngestOutcome } from '../ingestProjectFolder';
import type {
  ExistingPlan,
  ExistingRoom,
  ImportDrawing,
  ImportFileKind,
  ImportFileRow,
  ImportSession,
} from './importSession';

interface BuildArgs {
  projectId: string;
  outcome: IngestOutcome;
  proposals: AgentProposal[];
  existingRooms: ExistingRoom[];
  existingPlans: ExistingPlan[];
  /** file name → storage path, from the archive pass. */
  archivedPaths: Map<string, string>;
}

/**
 * Which plan a traced/layered drawing should target by default.
 *
 * Drawing over a plan that already holds walls would collide with what is
 * there, so an existing plan with geometry means "layer"; an empty project
 * means the drawing may as well be traced.
 */
function defaultDrawingChoice(existingPlans: ExistingPlan[]): ImportDrawing['choice'] {
  return existingPlans.some((p) => p.hasShapes) ? 'layer' : 'trace';
}

function defaultTargetPlan(existingPlans: ExistingPlan[]): string | 'new' {
  const withShapes = existingPlans.find((p) => p.hasShapes);
  if (withShapes) return withShapes.id;
  return existingPlans[0]?.id ?? 'new';
}

export function buildImportSession({
  projectId,
  outcome,
  proposals,
  existingRooms,
  existingPlans,
  archivedPaths,
}: BuildArgs): ImportSession {
  // ── Drawings ───────────────────────────────────────────────────────────
  // A drawing is the one import decision the engine genuinely cannot make:
  // trace it, or lay the image under the canvas and draw by hand.
  const drawings: ImportDrawing[] = proposals
    .filter((p) => p.action.type === 'create_plan_sketch')
    .map((p) => {
      const action = p.action as Extract<ProposalAction, { type: 'create_plan_sketch' }>;
      const fileName = p.sourceFile ?? action.planName;
      const sketch = outcome.pendingSketches.find((s) => s.fileName === fileName);
      return {
        proposalId: p.id,
        fileName,
        roomNames: (sketch?.result.rooms ?? [])
          .map((r) => (r.name ?? '').trim())
          .filter((n) => n && !/^room$/i.test(n)),
        wallCount: action.wallCount,
        storagePath: archivedPaths.get(fileName),
        choice: defaultDrawingChoice(existingPlans),
        targetPlanId: defaultTargetPlan(existingPlans),
      };
    });

  // ── Files ──────────────────────────────────────────────────────────────
  // Every file that was read gets a row, grouped by what it actually did, so
  // "100 files" becomes four honest piles instead of one number.
  const proposalsByFile = new Map<string, string[]>();
  for (const p of proposals) {
    if (!p.sourceFile) continue;
    const list = proposalsByFile.get(p.sourceFile) ?? [];
    list.push(p.id);
    proposalsByFile.set(p.sourceFile, list);
  }

  const rows: ImportFileRow[] = [];
  const seen = new Set<string>();

  const push = (name: string, kind: ImportFileKind, mimeType?: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    rows.push({
      id: name,
      name,
      kind,
      storagePath: archivedPaths.get(name),
      mimeType,
      proposalIds: proposalsByFile.get(name) ?? [],
    });
  };

  // Files that produced something come first — they are what needs checking.
  for (const [name] of proposalsByFile) push(name, 'interpreted');

  for (const candidate of outcome.propertyDocuments) {
    push(candidate.file.name, 'homePaper', candidate.file.type);
  }
  for (const entry of outcome.archiveFiles) {
    push(entry.file.name, 'filed', entry.file.type);
  }

  return {
    projectId,
    outcome,
    proposals,
    files: rows,
    existingRooms,
    existingPlans,
    drawings,
    rejected: new Set<string>(),
  };
}
