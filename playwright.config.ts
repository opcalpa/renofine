import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Load .env.local into process.env so the auth helper actually sees
 * E2E_USER_EMAIL / E2E_USER_PASSWORD. Without this the credentials sit in the
 * file and every signed-in test silently skips — which is exactly what
 * happened before 2026-08-24.
 *
 * Zero-dependency on purpose (dotenv is not a dependency of this project).
 * Never overwrites a variable already exported in the shell, and .env.local is
 * gitignored so secrets stay out of the repo.
 */
function loadEnvLocal() {
  try {
    for (const raw of readFileSync('.env.local', 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      if (process.env[key] !== undefined) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // No .env.local — signed-in tests skip, which is the documented behaviour.
  }
}
loadEnvLocal();

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5002',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5002',
    reuseExistingServer: true,
  },
});
