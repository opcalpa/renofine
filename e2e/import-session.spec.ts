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
  roomProposals,
  taskProposals,
} from '../src/services/agent/importSession';
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
});
