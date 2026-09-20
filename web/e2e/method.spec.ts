/**
 * The method page's end-to-end journeys (docs/06 §10, §12.2).
 *
 * Two of them exist nowhere else. A headline figure links to its definition **by fragment**
 * (docs/06 §4.2), which is a full navigation on a static host: the app boots, the browser's own
 * fragment handling has already run and found nothing, and the page has to land the reader on
 * the definition itself. jsdom cannot show that, and neither can the dev server — the deep link
 * to `/method` resolves through the `404.html` fallback of §3.
 *
 * In a separate file from `journeys.spec.ts` so the route's specs live with the route.
 *
 * The fixture is whatever export the preview server serves — `samples/export/` by default, the
 * real one under `UWPR_EXPORT_DIR` — so nothing here hard-codes a figure.
 */
import { expect, test, type Page } from '@playwright/test';

interface ExportDocument {
  works: { year: number }[];
  method: {
    official_list_total: number;
    independently_confirmed: number;
    listing_only_text_read: number;
    listing_only_text_unavailable: number;
    beyond_official_list: number;
    sources_last_read: Record<string, string>;
  };
}

async function readExport(page: Page): Promise<ExportDocument> {
  const response = await page.request.get('/data/uwpr_publications.json');
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ExportDocument;
}

test('a headline figure links to its definition on the method page (docs/06 §4.2)', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('list', { name: 'Headline figures' })
    .getByRole('link', { name: 'Research groups: how this figure is defined' })
    .click();

  await expect(page).toHaveURL(/\/method#research-groups$/);
  // The fragment target is focused, so a keyboard reader carries on from the definition rather
  // than from the top of a page they have just jumped down.
  const definition = page.locator('#research-groups');
  await expect(definition).toBeVisible();
  await expect(definition).toBeFocused();
  await expect(definition).toContainText('A proxy, and not a count of groups');
});

test('the method page resolves as a deep link and states the split (docs/06 §3, §10)', async ({
  page,
}) => {
  const { method } = await readExport(page);

  // Cold, which is what exercises the 404.html fallback on a static host.
  await page.goto('/method');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How this was assembled');

  const chart = page.getByRole('region', { name: /publications on the resource/i });
  for (const [label, value] of [
    ['Evidence found in the publication itself', method.independently_confirmed],
    ['Full text read, no mention found', method.listing_only_text_read],
    ['Full text could not be read', method.listing_only_text_unavailable],
  ] as const) {
    await expect(
      chart.getByRole('img', {
        name: new RegExp(`^${label}: ${String(value)} of ${String(method.official_list_total)} `),
      }),
    ).toBeAttached();
  }

  // Every source the export dates is listed with that date. The source is the row's header, so
  // a reader hearing a date hears which source it belongs to.
  for (const name of Object.keys(method.sources_last_read)) {
    await expect(page.getByRole('rowheader', { name, exact: true })).toBeVisible();
  }
});

test('the method page keeps the reader’s filter across the visit (docs/06 §3)', async ({
  page,
}) => {
  const { works, method } = await readExport(page);
  const year = works[0]?.year ?? 2020;
  const expected = works.filter((work) => work.year === year).length;

  await page.goto(`/?year=${String(year)}`);
  await page.getByRole('link', { name: 'How this was assembled' }).click();

  // The page describes the whole corpus, so its own URL carries no filter…
  await expect(page).toHaveURL(/\/method$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How this was assembled');

  // …and going back restores the exact filtered view, rather than an unfiltered one.
  await page.getByRole('button', { name: 'Back to the publications' }).click();
  await expect(page).toHaveURL(new RegExp(`\\?year=${String(year)}$`));
  await expect(page.getByRole('status').first()).toHaveText(
    new RegExp(`^${String(expected)} publications? matching Year: ${String(year)}\\.$`),
  );

  // And a criterion link from the method page opens the list already filtered by it.
  await page.goto('/method');
  await page.getByRole('link', { name: /Show the \d+ not on the list/ }).click();
  await expect(page).toHaveURL(/\?list=no$/);
  await expect(page.getByRole('status').first()).toHaveText(
    new RegExp(`^${String(method.beyond_official_list)} publications? matching`),
  );
});
