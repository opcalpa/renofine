import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end of the Renaida project-creation dialog via the guest path (no
 * credentials): drives the real UI through the guided flow and asserts a
 * project is actually born. The 'other' project type has no add-ons step, so
 * the flow completes without any parse/suggest call. The Fas C+ critic call
 * IS stubbed per test (deterministic — never depends on live LLM output):
 * empty flags → silent auto-skip; one flag → the accept path.
 */

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

async function stubCritic(page: Page, flags: unknown[]) {
  await page.route('**/functions/v1/renaida-critic', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 200, headers: CORS_HEADERS, body: 'ok' });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify({ flags }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'renofine_guest_mode',
      JSON.stringify({ isGuest: true, guestId: 'guest_e2e' }),
    );
    localStorage.setItem('i18nextLng', 'sv');
    // Skip the first-run welcome/language modal so we land straight on Projects.
    localStorage.setItem('guest_onboarding_completed', 'true');
    localStorage.setItem('guest_user_type', 'homeowner');
  });
});

/** Walk the dialog up to (and past) the budget step. */
async function walkToBudget(page: Page) {
  await page.goto('/start');
  await expect(page.getByRole('heading', { name: 'Mina projekt' })).toBeVisible({ timeout: 25000 });

  // Open the dialog (icon + span button — match by its visible text).
  await page.getByText('Skapa med Renaida', { exact: true }).click();

  // describe → skip to the guided questions.
  await page.getByRole('button', { name: 'Guida mig i stället' }).click();

  // type → "Annat" (no add-ons step for this type).
  await page.getByRole('button', { name: 'Annat', exact: true }).click();

  // scope (multi-select) → pick one work type, then continue.
  await page.getByRole('button', { name: 'El', exact: true }).click();
  await page.getByRole('button', { name: /Fortsätt/ }).click();

  // A task with its source chip should now be in the live preview.
  await expect(page.getByText('El', { exact: false }).first()).toBeVisible();

  // Skip the remaining optional steps.
  await page.getByRole('button', { name: 'Vet inte än' }).click(); // size
  await page.getByRole('button', { name: 'Hoppa över' }).click(); // address
  await page.getByRole('button', { name: 'Ingen budget än' }).click(); // budget
}

test('guest builds a project through the Renaida dialog (clean critic → silent skip)', async ({ page }) => {
  await stubCritic(page, []);
  await walkToBudget(page);

  // Clean check → reassurance line, no question, straight to create.
  await expect(page.getByText(/dubbelkollade planen/)).toBeVisible({ timeout: 15000 });

  // Create → a guest project is born and we navigate into it.
  await page.getByRole('button', { name: 'Skapa projektet' }).click();
  await page.waitForURL(/\/projects\//);

  // The guest project persisted to localStorage.
  const projectCount = await page.evaluate(() => {
    const raw = localStorage.getItem('renofine_guest_projects');
    return raw ? (JSON.parse(raw) as unknown[]).length : 0;
  });
  expect(projectCount).toBeGreaterThan(0);
});

test('critic flag renders with its reason and lands as a draft row when accepted', async ({ page }) => {
  await stubCritic(page, [
    { label: 'Tätskikt', workType: 'kakel', roomName: null, reason: 'Krävs i våtrum' },
  ]);
  await walkToBudget(page);

  // The flag chip shows label + reason.
  await expect(page.getByRole('button', { name: /Tätskikt/ })).toBeVisible();
  await expect(page.getByText('Krävs i våtrum')).toBeVisible();

  // Accept it → the row joins the draft (visible in the live preview).
  await page.getByRole('button', { name: /Tätskikt/ }).click();
  await page.getByRole('button', { name: /Lägg till/ }).click();
  await expect(page.getByText('Tätskikt', { exact: true }).first()).toBeVisible();

  // Flow completes and the project is born with the critic row included.
  await page.getByRole('button', { name: 'Skapa projektet' }).click();
  await page.waitForURL(/\/projects\//);
  const hasCriticTask = await page.evaluate(() => {
    const projects = JSON.parse(localStorage.getItem('renofine_guest_projects') ?? '[]') as Array<{ id: string }>;
    if (projects.length === 0) return false;
    return projects.some((p) => {
      const raw = localStorage.getItem(`renofine_guest_tasks_${p.id}`);
      return raw ? (JSON.parse(raw) as Array<{ title?: string }>).some((t) => t.title === 'Tätskikt') : false;
    });
  });
  expect(hasCriticTask).toBe(true);
});

test('addons suggestions render despite network latency (effect self-cancel regression)', async ({ page }) => {
  // 300ms delay: the response must survive the loading re-render — the old
  // cancelled+loading-in-deps effect threw it away and the spinner hung forever.
  await page.route('**/functions/v1/renaida-suggest', async (route) => {
    await new Promise((r) => setTimeout(r, 300));
    await route.fulfill({
      status: 200,
      headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify({ suggestions: [{ label: 'Golvvärme', workType: 'el' }] }),
    });
  });
  await stubCritic(page, []);

  await page.goto('/start');
  await expect(page.getByRole('heading', { name: 'Mina projekt' })).toBeVisible({ timeout: 25000 });
  await page.getByText('Skapa med Renaida', { exact: true }).click();
  await page.getByRole('button', { name: 'Guida mig i stället' }).click();
  await page.getByRole('button', { name: 'Badrum', exact: true }).click();
  await page.getByRole('button', { name: /Kakel/ }).first().click();
  await page.getByRole('button', { name: /Fortsätt/ }).click();

  // The LLM chip appears after the delayed response, can be accepted, and the
  // task joins the draft.
  await page.getByRole('button', { name: 'Golvvärme' }).click();
  await page.getByRole('button', { name: /Fortsätt/ }).click();
  await expect(page.getByText('Vet inte än')).toBeVisible(); // advanced to size
});
