import { useState } from 'react';
import { ImportReviewPage } from '@/components/project/import-review/ImportReviewPage';
import type { ImportSession } from '@/services/agent/importSession';
import type { AgentProposal } from '@/services/agent/types';

/**
 * Dev-only harness for the import review.
 *
 * The review only exists after someone drops a folder, which makes the one
 * thing the layout has to survive — fifty to a hundred purchase rows — the one
 * thing nobody can look at without spending a hundred model calls first. The
 * Design handoff's acceptance list asks for exactly that check
 * (`design_handoff_import_v2`, 2026-09-01), so here it is with synthetic data.
 *
 * Route is registered under `import.meta.env.DEV` only.
 */

const VENDORS = [
  'Bauhaus', 'HORNBACH', 'Byggmax', 'K-Rauta', 'Beijer Bygg', 'Dahl Sverige',
  'Optimera', 'Woody Bygghandel', 'Ahlsell', 'XL-BYGG',
];

function makeSession(count: number): ImportSession {
  const proposals: AgentProposal[] = [];
  for (let i = 0; i < count; i++) {
    // Rows 12 and 13 are deliberately the SAME vendor and amount — the A4
    // with a receipt stapled to it, shot flat and then lifted.
    const vendor = i === 13 ? VENDORS[12 % VENDORS.length] : VENDORS[i % VENDORS.length];
    // Deterministic variety: every ninth row disagrees with its line sum, every
    // seventh is already booked, and rows 12/13 are the same receipt twice.
    const mismatch = i % 9 === 3;
    const dupExisting = i % 7 === 5;
    const total = i === 13 ? 749.5 : 300 + i * 137.25;
    proposals.push({
      id: `p${i}`,
      summary: `Bokför inköp från ${vendor} (${Math.round(total)} kr)`,
      confidence: 0.9,
      sourceFile: `IMG_${4043 + i}.jpg`,
      ...(dupExisting ? { duplicateOfExisting: true } : {}),
      action: {
        type: 'import_purchase',
        documentType: i % 5 === 0 ? 'invoice' : 'receipt',
        vendorName: vendor,
        total: i === 12 ? 749.5 : total,
        documentDate: `202${3 + (i % 3)}-0${1 + (i % 9)}-1${i % 10}`,
        invoiceNumber: i % 5 === 0 ? `5520${7000 + i}` : null,
        lineItems: [
          { description: 'Kortregel 45×95×2500 C24', quantity: 6, unitPrice: 199, total: 1194 },
          {
            description: 'Gipsskiva 13 mm',
            quantity: 12,
            unitPrice: 142,
            total: mismatch ? 1704 : Math.max(0, (i === 12 ? 749.5 : total) - 1194),
          },
        ],
      },
    });
  }

  return {
    projectId: 'dev',
    proposals,
    files: [
      // Files the reader could not place — the only ones offering "lift to
      // purchase", so the harness has to contain some.
      { id: 'IMG_9100.jpg', name: 'IMG_9100.jpg', kind: 'filed' as const, proposalIds: [], folder: '', storagePath: 'projects/dev/IMG_9100.jpg' },
      { id: 'IMG_9101.jpg', name: 'IMG_9101.jpg', kind: 'filed' as const, proposalIds: [], folder: '', storagePath: 'projects/dev/IMG_9101.jpg' },
      { id: 'kopekontrakt.pdf', name: 'kopekontrakt.pdf', kind: 'homePaper' as const, proposalIds: [], folder: '', storagePath: 'projects/dev/kopekontrakt.pdf' },
    ].concat(proposals.map((p) => ({
      id: p.sourceFile!,
      name: p.sourceFile!,
      kind: 'interpreted' as const,
      proposalIds: [p.id],
      folder: p.action.type === 'import_purchase' && p.action.documentType === 'invoice' ? '/Fakturor' : '/Kvitton',
      storagePath: `projects/dev/Kvitton/${p.sourceFile}`,
    }))) as ImportSession['files'],
    existingRooms: [
      { id: 'r1', name: 'Kök' },
      { id: 'r2', name: 'Badrum' },
      { id: 'r3', name: 'Vardagsrum' },
    ],
    existingPlans: [],
    drawings: [],
    rejected: new Set(proposals.filter((p) => p.duplicateOfExisting).map((p) => p.id)),
    outcome: {
      filesRead: count,
      unreadableCount: 1,
      truncatedDocCount: 2,
      alreadyImportedNames: ['IMG_9000.jpg', 'IMG_9001.jpg'],
      modelCalls: { total: count * 2, byKind: { 'classify-document': count, 'process-document-v2': count } },
      draft: { rooms: [], tasks: [] },
    } as unknown as ImportSession['outcome'],
  };
}

export default function DevImportReview() {
  const [session, setSession] = useState(() => makeSession(50));
  return (
    <ImportReviewPage
      session={session}
      onChange={setSession}
      onApply={async () => {}}
      onCancel={() => {}}
      applying={false}
    />
  );
}
