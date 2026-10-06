import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a running stack (web + API + Postgres with pgvector).
 *
 *   E2E_BASE_URL   the web app        (default http://localhost:3000)
 *   E2E_API_URL    the API            (default http://localhost:8000/api/v1)
 *   E2E_CHANNEL    "msedge" | "chrome" to use an installed browser instead of
 *                  Playwright's own (npx playwright install chromium)
 *   E2E_GRANT_CMD  command that grants a role: `<cmd> <email> <ROLE>`; defaults
 *                  to the API's grant_role script run from ../api
 *
 * The API must run with PAYMENT_STUB_ENABLED=true for the checkout flow.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    channel: process.env.E2E_CHANNEL || undefined,
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], channel: process.env.E2E_CHANNEL || undefined } }],
});
