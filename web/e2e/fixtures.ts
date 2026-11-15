/**
 * The `test` every spec uses: Playwright's own, with the browser's clock pinned to the day the
 * served export was generated.
 *
 * The app states its own staleness once the data is more than 14 days old (docs/06 §7), as a
 * `role="status"` notice above everything else on the overview, method and funding views. With
 * the real clock, every spec that reads the first status on those views began reading that
 * notice instead, two weeks after the export was written: the sample export is dated
 * 2026-09-19, and nine specs failed from 2026-10-03 onwards with no change to the app. The real
 * export does the same whenever the weekly run is late. So the specs run on the export's own
 * day, whichever export the preview server is serving, and the staleness rule is tested where
 * the clock can be injected (`test/`).
 *
 * `setFixedTime` fixes `Date` only; timers keep running, so layout and transitions are as they
 * would be.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test as base } from '@playwright/test';

/** The same directory `vite.config.ts` serves the data from. */
const exportDir =
  process.env.UWPR_EXPORT_DIR ?? resolve(import.meta.dirname, '..', '..', 'samples', 'export');

const { generated_at: generatedAt } = JSON.parse(
  readFileSync(resolve(exportDir, 'uwpr_publications.json'), 'utf-8'),
) as { generated_at: string };

/** The export's own generation time: zero days old, so never stale. */
export const EXPORT_GENERATED_AT = new Date(generatedAt);

export const test = base.extend({
  // Playwright's `use`, named otherwise so the React hooks lint rule does not take it for a hook.
  page: async ({ page }, provide) => {
    await page.clock.setFixedTime(EXPORT_GENERATED_AT);
    await provide(page);
  },
});

export { expect } from '@playwright/test';
