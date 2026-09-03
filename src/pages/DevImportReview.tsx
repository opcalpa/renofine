import { useEffect, useState } from 'react';
import { registerAttachment } from '@/services/agent/documentCapture';
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
    // Row 4 is the case that taught us the checker could be wrong: the total was
    // read off the NET line, so VAT is a legal 25 % against the total itself and
    // the rows add up to total + VAT. It must show ONE warning ("looks like it
    // excludes VAT") with its one-click correction — not two (Carl, 2026-09-03).
    const netTotal = i === 4;
    const total = i === 13 ? 749.5 : netTotal ? 2544 : 300 + i * 137.25;
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
        ...(netTotal ? { vatAmount: 636 } : {}),
        attachmentKey: `att-${i}`,
        lineItems: netTotal
          ? [
              { description: 'Kortregel 45×95×2500 C24', quantity: 6, unitPrice: 199, total: 1194 },
              { description: 'Gipsskiva 13 mm', quantity: 14, unitPrice: 142, total: 1986 },
            ]
          : [
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
    files: ([
      // Files the reader could not place — the only ones offering "lift to
      // purchase", so the harness has to contain some.
      { id: 'IMG_9100.jpg', name: 'IMG_9100.jpg', kind: 'filed' as const, proposalIds: [], folder: '', storagePath: 'projects/dev/IMG_9100.jpg' },
      { id: 'IMG_9101.jpg', name: 'IMG_9101.jpg', kind: 'filed' as const, proposalIds: [], folder: '', storagePath: 'projects/dev/IMG_9101.jpg' },
      { id: 'kopekontrakt.pdf', name: 'kopekontrakt.pdf', kind: 'homePaper' as const, proposalIds: [], folder: '', storagePath: 'projects/dev/kopekontrakt.pdf' },
    ] as ImportSession['files']).concat(proposals.map((p) => ({
      id: p.sourceFile!,
      name: p.sourceFile!,
      kind: 'interpreted' as const,
      proposalIds: [p.id],
      folder: p.action.type === 'import_purchase' && p.action.documentType === 'invoice' ? '/Fakturor' : '/Kvitton',
      storagePath: `projects/dev/Kvitton/${p.sourceFile}`,
    }))),
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

/**
 * A landscape stand-in for a photographed receipt, so the image viewer
 * actually mounts here — rotation memory and the portrait default cannot be
 * checked against a preview that never loads an image.
 */
function makeLandscapeBlob(idx: number): Promise<File> {
  const c = document.createElement('canvas');
  // A DIFFERENT size per row: the only way to prove the preview shows THIS
  // row's document and not the previous one's (the stale-URL bug, 2026-09-02).
  c.width = 1000 + idx * 100;
  c.height = 700;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#FBF9F3';
  ctx.fillRect(0, 0, 1200, 800);
  ctx.fillStyle = '#2A2620';
  ctx.font = '48px monospace';
  ctx.fillText(`KVITTO ${idx}`, 60, 120);
  ctx.fillText('ATT BETALA 2 549,00', 60, 220);
  return new Promise((resolve) =>
    c.toBlob((b) => resolve(new File([b!], `kvitto-${idx}.jpg`, { type: 'image/jpeg' })), 'image/jpeg')
  );
}

export default function DevImportReview() {
  const [session, setSession] = useState(() => makeSession(50));

  // Register a real image for the first few rows so the viewer has something.
  useEffect(() => {
    session.proposals.slice(0, 5).forEach((p, idx) => {
      if (p.action.type !== 'import_purchase' || !p.action.attachmentKey) return;
      const key = p.action.attachmentKey;
      void makeLandscapeBlob(idx).then((file) => registerAttachment(key, file));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
