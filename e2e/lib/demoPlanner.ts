/**
 * Opening the demo planner, once, correctly.
 *
 * Three spec files each had their own copy of this, and all three shared the
 * same defect: they "dismissed" the demo guide with
 * `isVisible({ timeout: 5000 })`. Playwright's own types say that option is
 * ignored — isVisible returns immediately and never waits. The guide mounts a
 * moment later, its `fixed inset-0 z-50` backdrop swallows every click, and
 * 28 tests died looking like broken selectors for weeks.
 *
 * The rule this encodes: to WAIT for something, use waitFor/expect. isVisible
 * is a question about right now, not an instruction to be patient.
 */
import { expect, Page } from '@playwright/test';

interface EditorDebug {
  getShapes: () => Array<{ id: string; type: string; area?: number }>;
  execute: (name: string, params: Record<string, unknown>) => unknown;
}

declare global {
  interface Window {
    __rfEditorDebug?: EditorDebug;
  }
}

/** Dismiss the demo page guide, waiting for it properly. */
export async function dismissDemoGuide(page: Page): Promise<void> {
  const guide = page.getByRole('alertdialog');
  const appeared = await guide
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) return;
  await guide.getByRole('button', { name: 'OK' }).click();
  await guide.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}

/**
 * Empty the plan so a test draws on a blank canvas.
 *
 * The demo ships a furnished flat, and most editor tests were written before
 * it did: they place a door on "the wall", or close a loop and expect "the
 * room". With the demo's own geometry present, snapping grabs the seed's walls
 * and the test measures the demo instead of the editor.
 *
 * Safe: the demo never persists anything (guests own no project — see
 * demo-planner-save.spec.ts), so this touches nothing beyond the tab.
 */
export async function clearPlan(page: Page): Promise<void> {
  // NOT via select-all + Delete: the demo's rooms are linked to room entities,
  // so the delete command correctly stops and asks "drawing + room, or drawing
  // only?". That guard is the product working; answering a dialog is not this
  // helper's job. The dev-only debug handle runs the same command with the
  // choice already made.
  await page.evaluate(() => {
    const dbg = window.__rfEditorDebug;
    if (!dbg) return;
    const ids = dbg.getShapes().map((s) => s.id);
    if (ids.length > 0) dbg.execute('shape.delete', { ids, confirmed: true });
  });
  await page
    .waitForFunction(() => (window.__rfEditorDebug?.getShapes().length ?? 0) === 0, undefined, {
      timeout: 10000,
    })
    .catch(() => {});
}

export async function openDemoPlanner(
  page: Page,
  opts: { flag?: 'v2' | 'v1' | 'none'; blank?: boolean } = {}
): Promise<void> {
  const flag = opts.flag ?? 'v2';
  await page.addInitScript((f) => {
    if (f === 'v2') localStorage.setItem('renofine.editorV2', '1');
    if (f === 'v1') localStorage.setItem('renofine.editorV2', '0');
    // f === 'none' leaves it unset → exercises the desktop-first default
    localStorage.setItem('i18nextLng', 'sv');
  }, flag);
  await page.goto('/');
  await page.getByText('Se demoprojekt').first().click();
  await page.waitForURL(/\/projects\//);
  await dismissDemoGuide(page);
  // The URL is the stable contract — these tests are about the editor, not
  // about how the navigation happens to be worded this month.
  await page.goto(`${new URL(page.url()).pathname}?tab=spaceplanner&subtab=floorplan`);
  await dismissDemoGuide(page);
  if (flag === 'v1') return;
  await expect(page.getByTestId('editor-v2-canvas')).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(() => !!window.__rfEditorDebug);
  await waitForDemoPlan(page);
  if (opts.blank) await clearPlan(page);
}

/**
 * The demo ships its own floor plan (walls, rooms, openings) and it hydrates
 * asynchronously. Assertions that count shapes must start after it lands, or
 * they race a moving baseline.
 */
export async function waitForDemoPlan(page: Page): Promise<void> {
  await page
    .waitForFunction(() => (window.__rfEditorDebug?.getShapes().length ?? 0) > 0, undefined, {
      timeout: 15000,
    })
    .catch(() => {});
}

/** How many shapes of a type the plan holds right now. */
export function countShapes(page: Page, type: string): Promise<number> {
  return page.evaluate(
    (t) => (window.__rfEditorDebug?.getShapes() ?? []).filter((s) => s.type === t).length,
    type
  );
}

/** The shape ids of a type, for finding what a gesture ADDED. */
export function shapeIds(page: Page, type: string): Promise<string[]> {
  return page.evaluate(
    (t) => (window.__rfEditorDebug?.getShapes() ?? []).filter((s) => s.type === t).map((s) => s.id),
    type
  );
}
