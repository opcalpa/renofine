/**
 * Datum utan tid ska formateras LOKALT, aldrig via UTC.
 *
 * `new Date(2026, 9, 0)` är lokal midnatt. I Europe/Stockholm (UTC+1/+2) är det
 * föregående dag i UTC, och `toISOString()` konverterar innan strängen klipps.
 * Löneexportens periodslut blev därför näst sista dagen i månaden — varje månad,
 * hela året — och en hantverkare som loggade timmar efter kl 22 fick gårdagens
 * datum förvalt.
 *
 * Nitton ställen använde det mönstret. Testerna nedan är TZ-oberoende: de håller
 * i UTC såväl som i Stockholm, vilket är hela poängen med `formatLocalDate`.
 */
import { test, expect } from '@playwright/test';
import { formatLocalDate, parseLocalDate } from '../src/lib/dateUtils';

test.describe('lokala datum', () => {
  test('månadens sista dag är månadens sista dag, alla tolv månaderna', () => {
    const lastDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for (let month = 1; month <= 12; month++) {
      const d = new Date(2026, month, 0); // dag 0 i nästa månad = sista i denna
      expect(formatLocalDate(d)).toBe(
        `2026-${String(month).padStart(2, '0')}-${lastDays[month - 1]}`,
      );
    }
  });

  test('skottår räknas rätt', () => {
    expect(formatLocalDate(new Date(2028, 2, 0))).toBe('2028-02-29');
  });

  test('sen kväll behåller dagens datum', () => {
    // Det här var LogTimeDialog-buggen: den som rapporterar sina timmar efter
    // kl 22 på sommaren fick gårdagen förvald och märkte det inte.
    expect(formatLocalDate(new Date(2026, 8, 30, 23, 30))).toBe('2026-09-30');
    expect(formatLocalDate(new Date(2026, 0, 31, 22, 15))).toBe('2026-01-31');
  });

  test('datum överlever tur och retur', () => {
    for (const s of ['2026-01-01', '2026-06-15', '2026-12-31']) {
      expect(formatLocalDate(parseLocalDate(s))).toBe(s);
    }
  });

  test('det gamla mönstret var faktiskt fel öster om Greenwich', () => {
    const d = new Date(2026, 9, 0); // 30 september, lokal midnatt
    const viaUtc = d.toISOString().split('T')[0];
    if (d.getTimezoneOffset() < 0) {
      // Positiv UTC-offset (t.ex. Sverige): UTC-strängen tappar en dag.
      expect(viaUtc).not.toBe(formatLocalDate(d));
      expect(viaUtc).toBe('2026-09-29');
    } else {
      test.info().annotations.push({
        type: 'note',
        description: `Kord i ${Intl.DateTimeFormat().resolvedOptions().timeZone} — buggen syns bara vid positiv UTC-offset.`,
      });
    }
  });
});
