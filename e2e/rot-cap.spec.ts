/**
 * ROT har ett tak, och dokumenten måste känna till det.
 *
 * Fram till 2026-09-03 räknade sju ytor `rotEligibleTotal * 1.25 * 0.3` var för
 * sig, helt utan årstaket. Över 133 333 kr arbetskostnad ex moms fick kunden
 * ett papper med ett slutpris som inte går att uppnå — och upptäckte det först
 * vid deklarationen. Vid 300 000 kr var offerten 62 500 kr fel.
 *
 * Siffrorna nedan är exakt de som beskrev buggen. De ligger kvar som test för
 * att taket ska bita även när någon bygger nästa dokumentyta.
 */
import { test, expect } from '@playwright/test';
import {
  capRot,
  rotCapacity,
  rotFromLaborNet,
  ROT_DEFAULT_YEARLY_LIMIT,
} from '../src/lib/rot';

test.describe('ROT-taket', () => {
  test('en offert på 300 000 kr arbete kapas till årets tak', () => {
    const uncapped = rotFromLaborNet(300000);
    expect(uncapped).toBe(112500); // 30 % av beloppet ink moms

    const rot = capRot(uncapped);
    expect(rot.deduction).toBe(50000);
    expect(rot.isCapped).toBe(true);
    // Det var precis det här beloppet kunden lovades men inte kunde få.
    expect(uncapped - rot.deduction).toBe(62500);
  });

  test('brytpunkten ligger vid 133 333 kr arbetskostnad ex moms', () => {
    expect(capRot(rotFromLaborNet(133333)).isCapped).toBe(false);
    expect(capRot(rotFromLaborNet(133400)).isCapped).toBe(true);
  });

  test('två personer delar avdraget och får dubbelt utrymme', () => {
    const capacity = rotCapacity([
      { personnummer: '19800101-0000' },
      { personnummer: '19850202-0000' },
    ]);
    expect(capacity.totalLimit).toBe(100000);
    expect(capacity.personCount).toBe(2);
    expect(capRot(rotFromLaborNet(300000), capacity).deduction).toBe(100000);
  });

  test('samma person på två rader räknas en gång', () => {
    const capacity = rotCapacity([
      { personnummer: '19800101-0000', name: 'Anna' },
      { personnummer: '19800101-0000', name: 'Anna Andersson' },
    ]);
    expect(capacity.totalLimit).toBe(50000);
    expect(capacity.personCount).toBe(1);
  });

  test('den som redan förbrukat en del av året bidrar med sitt eget tak', () => {
    const capacity = rotCapacity([
      { personnummer: 'A', custom_yearly_limit: 12000 },
      { personnummer: 'B' },
    ]);
    expect(capacity.totalLimit).toBe(62000);
  });

  test('utan registrerade personer antas EN person på årets tak', () => {
    // Konservativt med flit: gissar vi fel underskattar vi avdraget, och kunden
    // betalar för mycket i stället för att få ett papper som inte går att lösa in.
    expect(rotCapacity([]).totalLimit).toBe(ROT_DEFAULT_YEARLY_LIMIT);
    expect(rotCapacity(null).personCount).toBe(1);
  });

  test('inget ROT-berättigat arbete ger inget avdrag och inget tak-meddelande', () => {
    const rot = capRot(0);
    expect(rot.deduction).toBe(0);
    expect(rot.isCapped).toBe(false);
  });
});
