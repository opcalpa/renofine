import { test, expect } from '@playwright/test';
import {
  scoreNameMatch,
  matchDocumentToPlanned,
  MATCH_MIN,
  MATCH_STRONG,
  type PlannedMaterial,
} from '../src/services/agent/matchPlannedMaterials';

/**
 * Pure-logic checks for renaida-material-receipt-match — the matcher that lets a
 * scanned receipt consume its planned budget line instead of double-counting.
 * No network: fetchPlannedMaterials is not exercised here.
 */

const planned = (rows: Array<Partial<PlannedMaterial> & { id: string; name: string }>): PlannedMaterial[] =>
  rows.map((r) => ({ taskId: null, roomId: null, plannedAmount: null, ...r }));

test('a shared category word is a strong match; unrelated names do not match', () => {
  expect(scoreNameMatch('Kakel Carrara 30x60 vit', 'Kakel badrum')).toBeGreaterThanOrEqual(MATCH_STRONG);
  expect(scoreNameMatch('Spik 100-pack', 'Kakel badrum')).toBeLessThan(MATCH_MIN);
});

test('compound Swedish words match via substring (klinker ⊂ golvklinker)', () => {
  expect(scoreNameMatch('Golvklinker antracit', 'Klinker')).toBeGreaterThanOrEqual(MATCH_MIN);
});

test('each planned material is claimed by at most one line, highest score first', () => {
  const doc = {
    vendorName: 'Bauhaus',
    lineItems: [
      { description: 'Kakel Carrara 30x60' },
      { description: 'Kakelfix 20kg' }, // weaker "kakel" overlap
      { description: 'Silikon sanitär' },
    ],
  };
  const matches = matchDocumentToPlanned(doc, planned([
    { id: 'p1', name: 'Kakel badrum', taskId: 't1', roomId: 'r1' },
    { id: 'p2', name: 'Silikon', taskId: 't2' },
  ]));

  // p1 (Kakel) claimed by its best line, not stolen by the weaker one.
  const kakel = matches.find((m) => m.plannedId === 'p1');
  expect(kakel?.lineIndex).toBe(0);
  expect(kakel?.taskId).toBe('t1');
  expect(kakel?.roomId).toBe('r1');
  // p2 claimed by the silikon line.
  expect(matches.find((m) => m.plannedId === 'p2')?.lineIndex).toBe(2);
  // No planned material is matched twice.
  const ids = matches.map((m) => m.plannedId);
  expect(new Set(ids).size).toBe(ids.length);
});

test('no planned materials → no matches (plain import path preserved)', () => {
  const matches = matchDocumentToPlanned(
    { vendorName: 'Bauhaus', lineItems: [{ description: 'Kakel' }] },
    [],
  );
  expect(matches).toEqual([]);
});

test('line-less document matches the vendor as a single bulk row (lineIndex -1)', () => {
  const matches = matchDocumentToPlanned(
    { vendorName: 'Golvkakel Sverige AB', lineItems: [] },
    planned([{ id: 'p1', name: 'Kakel' }]),
  );
  expect(matches).toHaveLength(1);
  expect(matches[0].lineIndex).toBe(-1);
  expect(matches[0].plannedId).toBe('p1');
});
