/**
 * Dropping the SAME folder twice must not duplicate the project.
 *
 * Re-dropping is the normal case: you add three files to the folder and drop
 * the whole thing again. Before this, that re-read all 100 files (200–300 model
 * calls) and then created a second copy of every task, invoice and drawing they
 * described — and the duplicated invoices doubled the budget.
 *
 * Two defences, tested here: a file the project already holds is recognised
 * BEFORE it is read (so it costs nothing at all), and anything that still gets
 * through is matched against what exists and pre-unchecked.
 */
import { test, expect } from '@playwright/test';
import {
  fileFingerprint,
  originalNameFromStored,
  purchaseKeys,
  taskKey,
} from '../src/lib/importKeys';

test.describe('file fingerprint — the cheapest call is the one never made', () => {
  test('the upload timestamp is not part of the identity', () => {
    expect(originalNameFromStored('1787605536722-offert.pdf')).toBe('offert.pdf');
    expect(originalNameFromStored('offert.pdf')).toBe('offert.pdf');
    // A name that merely starts with digits is not a timestamp.
    expect(originalNameFromStored('2024-rapport.pdf')).toBe('2024-rapport.pdf');
  });

  test('a re-dropped file matches what storage rewrote its name to', () => {
    // Storage replaces anything outside [a-zA-Z0-9._-], so "offert höst.pdf"
    // is stored as "offert_h_st.pdf" — the fingerprint must survive that.
    const stored = originalNameFromStored('1787605536722-offert_h_st.pdf');
    expect(fileFingerprint('offert höst.pdf', 5120)).toBe(fileFingerprint(stored, 5120));
  });

  test('same name but a different size is a different file', () => {
    expect(fileFingerprint('offert.pdf', 5120)).not.toBe(fileFingerprint('offert.pdf', 5121));
  });

  test('case does not create a false new file', () => {
    expect(fileFingerprint('Offert.PDF', 100)).toBe(fileFingerprint('offert.pdf', 100));
  });
});

test.describe('purchase keys — the duplicate that costs money', () => {
  const invoice = {
    vendorName: 'SLD Platt AB',
    invoiceNumber: '1534',
    total: 43846,
    date: '2025-07-16',
  };

  test('same supplier and invoice number is the same invoice', () => {
    const a = purchaseKeys(invoice);
    const b = purchaseKeys({ ...invoice, vendorName: '  sld  platt ab ' });
    expect(a.some((k) => b.includes(k))).toBe(true);
  });

  test('a receipt without an invoice number falls back to supplier + date + amount', () => {
    const receipt = { vendorName: 'Bauhaus', invoiceNumber: null, total: 1299.5, date: '2025-07-16' };
    const keys = purchaseKeys(receipt);
    expect(keys).toEqual(['amt:bauhaus:2025-07-16:129950']);
    // Öre matter: a different amount the same day is a different purchase.
    expect(purchaseKeys({ ...receipt, total: 1299.51 })).not.toEqual(keys);
  });

  test('a different supplier with the same number is not a duplicate', () => {
    const a = purchaseKeys(invoice);
    const b = purchaseKeys({ ...invoice, vendorName: 'Annan Firma AB' });
    expect(a.some((k) => b.includes(k))).toBe(false);
  });

  test('nothing to key on yields no keys rather than a false match', () => {
    expect(purchaseKeys({ vendorName: null, invoiceNumber: null, total: null, date: null })).toEqual([]);
    // A vendor alone must never match — that would swallow every purchase
    // from the same shop.
    expect(purchaseKeys({ vendorName: 'Bauhaus', invoiceNumber: null, total: null, date: null })).toEqual([]);
  });
});

test.describe('task keys — same work, same room', () => {
  test('whitespace and case are not new work', () => {
    expect(taskKey('  Kakel   Badrum ', 'r-1')).toBe(taskKey('kakel badrum', 'r-1'));
  });

  test('the same work in a different room is different work', () => {
    expect(taskKey('Målning', 'r-1')).not.toBe(taskKey('Målning', 'r-2'));
  });

  test('a task with no room keys consistently', () => {
    expect(taskKey('Etablering', null)).toBe(taskKey('Etablering', undefined));
  });
});
