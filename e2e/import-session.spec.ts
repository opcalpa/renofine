/**
 * The import review's decision logic, against the real modules.
 *
 * This is the layer that decides what a dropped folder will DO: which files
 * count as having changed anything, which rooms a task may be assigned to once
 * some rooms are merged away, and what happens to a drawing by default. The UI
 * is a rendering of these answers, so pinning them here is what stops a
 * regression from silently re-inventing Carl's five bathrooms.
 */
import { test, expect } from '@playwright/test';
import { buildImportSession } from '../src/services/agent/buildImportSession';
import {
  assignableRooms,
  changeCount,
  destinationFolder,
  filingSummary,
  movedFiles,
  roomProposals,
  savedAsDocumentIds,
  taskProposals,
} from '../src/services/agent/importSession';
import { buildPurchaseRows } from '../src/components/project/import-review/purchaseRowModel';
import type { AgentProposal } from '../src/services/agent/types';
import type { IngestOutcome } from '../src/services/ingestProjectFolder';

function outcome(over: Partial<IngestOutcome> = {}): IngestOutcome {
  return {
    draft: { rooms: [], tasks: [], answered: [] },
    filesSeen: 0,
    filesRead: 0,
    alreadyImportedNames: [],
    roomsAdded: 0,
    tasksAdded: 0,
    receiptCount: 0,
    pendingPurchases: [],
    pendingSketches: [],
    floorplanCount: 0,
    ignoredCount: 0,
    unreadableCount: 0,
    notUnderstoodCount: 0,
    photosFiledCount: 0,
    propertyDocuments: [],
    archiveFiles: [],
    ...over,
  } as IngestOutcome;
}

function roomProposal(id: string, name: string, sourceFile?: string): AgentProposal {
  return { id, summary: name, confidence: 0.8, action: { type: 'create_room', name }, sourceFile };
}

function taskProposal(id: string, title: string, roomName?: string, sourceFile?: string): AgentProposal {
  return {
    id,
    summary: title,
    confidence: 0.8,
    action: { type: 'create_task', title, ...(roomName ? { roomName } : {}) },
    sourceFile,
  };
}

function purchaseProposal(id: string, vendor: string, total: number, sourceFile?: string): AgentProposal {
  return {
    id,
    summary: `${vendor} ${total}`,
    confidence: 0.8,
    sourceFile,
    action: {
      type: 'import_purchase',
      documentType: 'receipt',
      vendorName: vendor,
      total,
      lineItems: [],
      attachmentKey: `att-${id}`,
      sourceFileName: sourceFile,
    },
  };
}

const EXISTING = [
  { id: 'r-kok', name: 'Kök' },
  { id: 'r-bad', name: 'Badrum' },
];

test.describe('buildImportSession — the four honest piles', () => {
  test('files are grouped by what they actually did', () => {
    const session = buildImportSession({
      projectId: 'p1',
      outcome: outcome({
        filesRead: 3,
        archiveFiles: [
          { file: new File([''], 'semesterbild.jpg'), category: 'product_image' },
        ],
        propertyDocuments: [
          { file: new File([''], 'kopekontrakt.pdf') },
        ],
      } as Partial<IngestOutcome>),
      proposals: [roomProposal('p-1', 'Hall', 'offert.pdf')],
      existingRooms: EXISTING,
      existingPlans: [],
      archivedPaths: new Map([['offert.pdf', 'projects/p1/Offerter/offert.pdf']]),
    });

    const byKind = Object.fromEntries(
      ['interpreted', 'filed', 'homePaper'].map((k) => [
        k,
        session.files.filter((f) => f.kind === k).map((f) => f.name),
      ])
    );
    expect(byKind.interpreted).toEqual(['offert.pdf']);
    expect(byKind.homePaper).toEqual(['kopekontrakt.pdf']);
    expect(byKind.filed).toEqual(['semesterbild.jpg']);
  });

  test('a file carries the storage path so its original can be previewed', () => {
    const session = buildImportSession({
      projectId: 'p1',
      outcome: outcome(),
      proposals: [roomProposal('p-1', 'Hall', 'offert.pdf')],
      existingRooms: [],
      existingPlans: [],
      archivedPaths: new Map([['offert.pdf', 'projects/p1/Offerter/offert.pdf']]),
    });
    expect(session.files[0].storagePath).toBe('projects/p1/Offerter/offert.pdf');
    expect(session.files[0].proposalIds).toEqual(['p-1']);
  });
});

test.describe('drawings — the choice the engine cannot make', () => {
  const sketchProposal: AgentProposal = {
    id: 'p-sketch',
    summary: 'Rita in planritning.png',
    confidence: 0.7,
    action: { type: 'create_plan_sketch', planName: 'Grovskiss', sketchKey: 'k1', roomCount: 2, wallCount: 8 },
    sourceFile: 'planritning.png',
  };

  test('a project that already has a drawn plan defaults to LAYER', () => {
    const session = buildImportSession({
      projectId: 'p1',
      outcome: outcome(),
      proposals: [sketchProposal],
      existingRooms: [],
      existingPlans: [{ id: 'plan-1', name: 'Plan 1', hasShapes: true }],
      archivedPaths: new Map(),
    });
    expect(session.drawings[0].choice).toBe('layer');
    expect(session.drawings[0].targetPlanId).toBe('plan-1');
  });

  test('an empty project defaults to TRACE', () => {
    const session = buildImportSession({
      projectId: 'p1',
      outcome: outcome(),
      proposals: [sketchProposal],
      existingRooms: [],
      existingPlans: [{ id: 'plan-1', name: 'Plan 1', hasShapes: false }],
      archivedPaths: new Map(),
    });
    expect(session.drawings[0].choice).toBe('trace');
  });
});

test.describe('assignableRooms — where a task may land', () => {
  function session() {
    return buildImportSession({
      projectId: 'p1',
      outcome: outcome(),
      proposals: [
        roomProposal('p-wc', 'WC'),
        roomProposal('p-hall', 'Hall'),
        taskProposal('t-1', 'Kakel', 'WC'),
      ],
      existingRooms: EXISTING,
      existingPlans: [],
      archivedPaths: new Map(),
    });
  }

  test('existing rooms and new ones are both offered', () => {
    const rooms = assignableRooms(session());
    expect(rooms.map((r) => r.label)).toEqual(['Kök', 'Badrum', 'WC', 'Hall']);
    expect(rooms.filter((r) => r.isNew).map((r) => r.label)).toEqual(['WC', 'Hall']);
  });

  test('a room merged into an existing one stops being its own destination', () => {
    const s = session();
    const merged = {
      ...s,
      proposals: s.proposals.map((p) =>
        p.id === 'p-wc' ? { ...p, action: { ...p.action, mergeIntoRoomId: 'r-bad' } } : p
      ),
    };
    const rooms = assignableRooms(merged as typeof s);
    expect(rooms.map((r) => r.label)).toEqual(['Kök', 'Badrum', 'Hall']);
  });

  test('a removed room is not offered either', () => {
    const s = session();
    const s2 = { ...s, rejected: new Set(['p-hall']) };
    expect(assignableRooms(s2).map((r) => r.label)).toEqual(['Kök', 'Badrum', 'WC']);
  });
});

test.describe('changeCount — what the confirm button promises', () => {
  test('counts only what will actually be written', () => {
    const s = buildImportSession({
      projectId: 'p1',
      outcome: outcome(),
      proposals: [roomProposal('p-1', 'Hall'), taskProposal('t-1', 'Målning', 'Hall')],
      existingRooms: [],
      existingPlans: [],
      archivedPaths: new Map(),
    });
    expect(changeCount(s)).toBe(2);
    expect(changeCount({ ...s, rejected: new Set(['t-1']) })).toBe(1);
  });

  test('room and task proposals stay separable', () => {
    const s = buildImportSession({
      projectId: 'p1',
      outcome: outcome(),
      proposals: [roomProposal('p-1', 'Hall'), taskProposal('t-1', 'Målning', 'Hall')],
      existingRooms: [],
      existingPlans: [],
      archivedPaths: new Map(),
    });
    expect(roomProposals(s)).toHaveLength(1);
    expect(taskProposals(s)).toHaveLength(1);
  });

  /**
   * "Inte ett inköp — spara som dokument" is a WRITE, and the only one left when
   * every reading was a misreading. Counting it is what stops Genomför sitting
   * disabled on a session whose whole point is to rescue the papers
   * (Carl, 2026-09-03).
   */
  test('a reading kept as a document still counts as a change', () => {
    const base = buildImportSession({
      projectId: 'p1',
      outcome: outcome(),
      proposals: [purchaseProposal('k-1', 'Hornbach', 496.8, 'IMG_4047.jpg')],
      existingRooms: [],
      existingPlans: [],
      archivedPaths: new Map(),
      importFolder: '/Import 2026-09-03',
    });
    expect(changeCount(base)).toBe(1);

    // Dropped outright: nothing is written, and the paper is gone with it.
    expect(changeCount({ ...base, rejected: new Set(['k-1']) })).toBe(0);

    // Dropped as a purchase but kept as a document: still one write.
    const rescued = {
      ...base,
      rejected: new Set(['k-1']),
      savedAsDocument: { 'k-1': 'other' as const },
    };
    expect(changeCount(rescued)).toBe(1);
    expect(savedAsDocumentIds(rescued)).toEqual(['k-1']);
  });

  test("the drop's dated folder rides on the session", () => {
    const s = buildImportSession({
      projectId: 'p1',
      outcome: outcome(),
      proposals: [],
      existingRooms: [],
      existingPlans: [],
      archivedPaths: new Map(),
      importFolder: '/Import 2026-09-03',
    });
    // Without it a rescued document lands loose in the project's root rather
    // than in the same batch folder as the rest of the unplaced files.
    expect(s.importFolder).toBe('/Import 2026-09-03');
  });
});

/**
 * Where the files LAND. The sorting into /Kvitton, /Offerter and the rest was
 * always there, but it happened silently after the review — so the person could
 * neither see it nor disagree with it. These pin the answer the review page now
 * gives, and the one thing that must never regress: a file the person did not
 * move is not moved.
 */
test.describe('filing — where the dropped files go', () => {
  function filedSession(paths: Array<[string, string]>) {
    return buildImportSession({
      projectId: 'p1',
      outcome: outcome({
        filesRead: paths.length,
        archiveFiles: paths.map(([name]) => ({
          file: new File([''], name),
          category: 'other' as const,
        })),
      } as Partial<IngestOutcome>),
      proposals: [],
      existingRooms: EXISTING,
      existingPlans: [],
      archivedPaths: new Map(paths),
    });
  }

  test('a file carries the folder it was actually filed into', () => {
    const session = filedSession([
      ['kvitto.pdf', 'projects/p1/Kvitton/1-kvitto.pdf'],
      ['okant.pdf', 'projects/p1/Import 2026-08-25/2-okant.pdf'],
    ]);
    const byName = new Map(session.files.map((f) => [f.name, f.folder]));
    expect(byName.get('kvitto.pdf')).toBe('/Kvitton');
    expect(byName.get('okant.pdf')).toBe('/Import 2026-08-25');
  });

  test('a file in the project root reports the root, not undefined', () => {
    const session = filedSession([['los.pdf', 'projects/p1/1-los.pdf']]);
    expect(session.files[0].folder).toBe('');
    expect(destinationFolder(session.files[0])).toBe('');
  });

  test('the summary counts files per folder, biggest pile first', () => {
    const session = filedSession([
      ['a.pdf', 'projects/p1/Kvitton/a.pdf'],
      ['b.pdf', 'projects/p1/Kvitton/b.pdf'],
      ['c.pdf', 'projects/p1/Offerter/c.pdf'],
    ]);
    expect(filingSummary(session)).toEqual([
      { folder: '/Kvitton', count: 2 },
      { folder: '/Offerter', count: 1 },
    ]);
  });

  test('moving a file changes the summary before anything is applied', () => {
    const session = filedSession([
      ['a.pdf', 'projects/p1/Import 2026-08-25/a.pdf'],
      ['b.pdf', 'projects/p1/Import 2026-08-25/b.pdf'],
    ]);
    session.files[0].targetFolder = '/Kvitton';
    expect(filingSummary(session)).toEqual([
      { folder: '/Import 2026-08-25', count: 1 },
      { folder: '/Kvitton', count: 1 },
    ]);
  });

  test('only files the person actually moved are touched on apply', () => {
    const session = filedSession([
      ['a.pdf', 'projects/p1/Kvitton/a.pdf'],
      ['b.pdf', 'projects/p1/Kvitton/b.pdf'],
      ['c.pdf', 'projects/p1/Kvitton/c.pdf'],
    ]);
    // Untouched.
    expect(movedFiles(session)).toEqual([]);
    // Moved somewhere else.
    session.files[0].targetFolder = '/Offerter';
    // Explicitly re-picked the folder it is already in — not a move.
    session.files[1].targetFolder = '/Kvitton';
    expect(movedFiles(session).map((f) => f.name)).toEqual(['a.pdf']);
  });

  test('a file that never reached storage offers no folder to move', () => {
    const session = buildImportSession({
      projectId: 'p1',
      outcome: outcome({
        propertyDocuments: [{ file: new File([''], 'kopekontrakt.pdf') }],
      } as Partial<IngestOutcome>),
      proposals: [],
      existingRooms: EXISTING,
      existingPlans: [],
      archivedPaths: new Map(),
    });
    const row = session.files.find((f) => f.name === 'kopekontrakt.pdf')!;
    expect(row.folder).toBeUndefined();
    expect(destinationFolder(row)).toBeUndefined();
    expect(filingSummary(session)).toEqual([]);
  });
});

/**
 * ÄTA is a RELATIONSHIP, not a kind of paper (Carl, 2026-09-04).
 *
 * A homeowner accepts a quote, that becomes the budget, and ordinary invoices
 * land inside it. Then unplanned work turns out to be necessary and arrives as
 * an ordinary invoice too — nothing on the paper says ÄTA. So the mark lives on
 * the COST, and these pin the two things that must stay true about it.
 */
test.describe('ÄTA på inköpsraden', () => {
  const ataProposal = (id: string, ata: boolean): AgentProposal => ({
    id,
    summary: id,
    sourceFile: `${id}.jpg`,
    action: {
      type: 'import_purchase',
      documentType: 'invoice',
      vendorName: 'Hantverkaren AB',
      total: 25000,
      lineItems: [],
      bookAsAta: ata,
      attachmentKey: `key-${id}`,
    },
  } as unknown as AgentProposal);

  test('flaggan följer med raden och ändrar INTE beloppet', () => {
    const session = {
      projectId: 'p',
      outcome: outcome(),
      proposals: [ataProposal('inside', false), ataProposal('extra', true)],
      files: [],
      existingRooms: [],
      existingPlans: [],
      drawings: [],
      rejected: new Set<string>(),
    };
    const rows = buildPurchaseRows(session);
    const inside = rows.find((r) => r.id === 'inside');
    const extra = rows.find((r) => r.id === 'extra');

    expect(inside?.bookAsAta).toBe(false);
    expect(extra?.bookAsAta).toBe(true);
    // The cost is real either way — ÄTA moves which side of the accepted
    // budget it counts on, never how much it is.
    expect(inside?.action.total).toBe(25000);
    expect(extra?.action.total).toBe(25000);
  });

  test('en ÄTA-rad räknas fortfarande som en ändring att genomföra', () => {
    const session = {
      projectId: 'p',
      outcome: outcome(),
      proposals: [ataProposal('extra', true)],
      files: [],
      existingRooms: [],
      existingPlans: [],
      drawings: [],
      rejected: new Set<string>(),
    };
    // Booking something outside the budget is not the same as excluding it:
    // it still has to be written, or the cost simply vanishes.
    expect(changeCount(session)).toBe(1);
  });
});
