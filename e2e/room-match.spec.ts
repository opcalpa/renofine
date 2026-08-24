/**
 * The room-matching rules, run against the REAL engine (src/lib/roomMatch.ts).
 *
 * Carl dropped a 100-file folder on an apartment that has exactly two wet
 * rooms — `Badrum` and `Gäst WC` — and the import proposed `Badrum 1`,
 * `Badrum 2`, `WC`, `WC/Dusch` and `Gäst-WC` on top of them. This pins both
 * halves of the fix: what must merge silently, and what must stay a question.
 */
import { test, expect } from '@playwright/test';
import {
  parseRoomName,
  normalizeRoomName,
  fullRoomKey,
  sameRoom,
  similarRoom,
  matchRoom,
  findMergeTarget,
  preferredRoomName,
} from '../src/lib/roomMatch';

test.describe('roomMatch — name parsing', () => {
  const cases: Array<[string, string, string | null]> = [
    ['Badrum', 'badrum', null],
    ['Badrum 1', 'badrum', '1'],
    ['Badrum 2', 'badrum', '2'],
    ['Gäst-WC', 'gäst wc', null],
    ['Gäst WC', 'gäst wc', null],
    ['WC/Dusch', 'wc dusch', null],
    ['Sovrum nr 3', 'sovrum', '3'],
    ['Sovrum II', 'sovrum', '2'],
    ['  kök  ', 'kök', null],
    // A one-word name is never stripped down to nothing.
    ['WC', 'wc', null],
    ['1', '1', null],
  ];

  for (const [input, stem, ordinal] of cases) {
    test(`"${input}" → stem "${stem}", ordinal ${ordinal ?? 'none'}`, () => {
      const parts = parseRoomName(input);
      expect(parts.stem).toBe(stem);
      expect(parts.ordinal).toBe(ordinal);
    });
  }
});

test.describe('roomMatch — what merges on its own', () => {
  test('punctuation and case are spelling, not meaning', () => {
    expect(sameRoom('Gäst-WC', 'Gäst WC')).toBe(true);
    expect(sameRoom('KÖK', 'kök')).toBe(true);
    expect(normalizeRoomName('Gäst-WC')).toBe(normalizeRoomName('Gäst WC'));
  });

  test('a trailing ordinal does not make a second room', () => {
    expect(normalizeRoomName('Badrum 1')).toBe(normalizeRoomName('Badrum'));
  });

  test('but two different ordinals are two different rooms', () => {
    expect(fullRoomKey('Sovrum 1')).not.toBe(fullRoomKey('Sovrum 2'));
    expect(sameRoom('Sovrum 1', 'Sovrum 2')).toBe(false);
  });

  test('the cleaner name wins a merge', () => {
    expect(preferredRoomName('Badrum 1', 'Badrum')).toBe('Badrum');
    expect(preferredRoomName('Badrum', 'Badrum 1')).toBe('Badrum');
  });
});

test.describe('roomMatch — what stays a question', () => {
  test('WC/Dusch is never silently merged into Badrum', () => {
    expect(sameRoom('WC/Dusch', 'Badrum')).toBe(false);
    expect(similarRoom('WC/Dusch', 'Badrum')).toBe(false);
  });

  test('WC is offered as possibly being Gäst WC, never assumed', () => {
    expect(sameRoom('WC', 'Gäst WC')).toBe(false);
    expect(similarRoom('WC', 'Gäst WC')).toBe(true);
  });

  test('a single typo is a suggestion', () => {
    expect(similarRoom('Vardagsrum', 'Vardagsrom')).toBe(true);
    // Short names differing by one letter are different rooms, not typos.
    expect(similarRoom('Kök', 'Kok')).toBe(false);
  });
});

test.describe('matchRoom — against the rooms a project already has', () => {
  const existing = [
    { id: 'r-bad', name: 'Badrum' },
    { id: 'r-gast', name: 'Gäst WC' },
  ];

  test("Carl's case: no duplicate bathrooms are proposed", () => {
    expect(matchRoom('Badrum 1', existing).exact?.id).toBe('r-bad');
    expect(matchRoom('Badrum 2', existing).exact?.id).toBe('r-bad');
    expect(matchRoom('Gäst-WC', existing).exact?.id).toBe('r-gast');
  });

  test('WC and WC/Dusch stay new rooms, WC with a suggestion', () => {
    const wc = matchRoom('WC', existing);
    expect(wc.exact).toBeUndefined();
    expect(wc.similar.map((r) => r.id)).toEqual(['r-gast']);

    const wcDusch = matchRoom('WC/Dusch', existing);
    expect(wcDusch.exact).toBeUndefined();
    expect(wcDusch.similar).toHaveLength(0);
  });

  test('an ambiguous stem is never resolved silently', () => {
    const twoBedrooms = [
      { id: 'r-1', name: 'Sovrum 1' },
      { id: 'r-2', name: 'Sovrum 2' },
    ];
    // Plain "Sovrum" could be either → a question, not a merge.
    const plain = matchRoom('Sovrum', twoBedrooms);
    expect(plain.exact).toBeUndefined();
    expect(plain.similar).toHaveLength(2);
    // The exact one still resolves.
    expect(matchRoom('Sovrum 2', twoBedrooms).exact?.id).toBe('r-2');
  });
});

test.describe('findMergeTarget — folding many documents into one draft', () => {
  test('the same bathroom seen by three files becomes one room', () => {
    const draft = [{ name: 'Badrum', fileName: 'kontrakt.pdf' }];
    expect(findMergeTarget({ name: 'Badrum 1', fileName: 'ritning-a.png' }, draft)).toBe(0);
    expect(findMergeTarget({ name: 'Badrum 2', fileName: 'ritning-b.png' }, draft)).toBe(0);
  });

  test('two bedrooms listed by the SAME file stay two bedrooms', () => {
    const draft = [{ name: 'Sovrum 1', fileName: 'ritning.png' }];
    expect(findMergeTarget({ name: 'Sovrum 2', fileName: 'ritning.png' }, draft)).toBeNull();
  });

  test('an exact repeat merges even within one file', () => {
    const draft = [{ name: 'Kök', fileName: 'ritning.png' }];
    expect(findMergeTarget({ name: 'kök', fileName: 'ritning.png' }, draft)).toBe(0);
  });

  test('an ambiguous stem across files is left alone', () => {
    const draft = [
      { name: 'Sovrum 1', fileName: 'a.png' },
      { name: 'Sovrum 2', fileName: 'a.png' },
    ];
    expect(findMergeTarget({ name: 'Sovrum', fileName: 'b.png' }, draft)).toBeNull();
  });

  test('a genuinely new room is new', () => {
    const draft = [{ name: 'Badrum', fileName: 'a.png' }];
    expect(findMergeTarget({ name: 'Kök', fileName: 'b.png' }, draft)).toBeNull();
  });
});
