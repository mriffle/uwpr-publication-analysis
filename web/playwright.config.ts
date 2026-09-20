/**
 * End-to-end tests (docs/06 §12.2).
 *
 * The specs cover only the journeys that have no unit-test equivalent: deep-linking a filtered
 * view, opening a detail view and returning with filters intact, resolving a retired work ID,
 * and resolving a DOI permalink from cold. Everything else the spec lists — cross-filtering from
 * a chart, the empty states, the evidence wording — is asserted in `test/` against real SVG and
 * real accessible names, where a failure names the component rather than a page.
 *
 * They run against the **built** app served by `vite preview`, not the dev server, because two
 * of the four are about how a deep link resolves on a static host: the `404.html` fallback of
 * docs/06 §3 and the on-demand lookup fetch of §7 only exist in a real build.
 *
 * `UWPR_EXPORT_DIR` points the preview server's data path at another export, which is how the
 * same specs run against the real 339-work one.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4173);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list']],
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npx vite preview --port ${String(PORT)} --strictPort`,
    url: `http://localhost:${String(PORT)}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
