/**
 * The four journeys that have no unit-test equivalent (docs/06 §12.2).
 *
 * Each of them depends on something only a real browser and a real build provide: the History
 * API across a full page load, the `404.html` deep-link fallback of docs/06 §3, and the
 * on-demand `lookup_index.json` fetch of §7. A jsdom test can assert the components; it cannot
 * assert that a pasted URL resolves on a static host.
 *
 * The fixture is whatever export the preview server is serving — `samples/export/` by default,
 * the real one under `UWPR_EXPORT_DIR` — so nothing here hard-codes a work, a DOI or a figure.
 * Each spec reads what it needs from the served file first.
 */
import { expect, test, type Page } from '@playwright/test';

interface Work {
  id: string;
  aliases: string[];
  title: string;
  year: number;
  ids: { doi: string | null };
}

async function readExport(page: Page): Promise<{ works: Work[] }> {
  const response = await page.request.get('/data/uwpr_publications.json');
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { works: Work[] };
}

test('a filtered view is linkable and reproducible (docs/06 B5)', async ({ page }) => {
  const { works } = await readExport(page);
  const year = works[0]?.year ?? 2020;
  const expected = works.filter((work) => work.year === year).length;

  await page.goto(`/?year=${String(year)}`);

  // The filter survives a cold load: it is read from the URL, stated in words, and shown as a
  // removable chip.
  await expect(page.getByRole('status').first()).toHaveText(
    new RegExp(`^${String(expected)} publications? matching Year: ${String(year)}\\.$`),
  );
  await expect(page.getByRole('list', { name: 'Active filters' }).getByRole('button')).toHaveCount(
    1,
  );

  // And every chart is drawn under it, not over the whole corpus.
  await expect(page.getByRole('region', { name: 'Publications per year' })).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Publications under the current filter' }).getByRole('listitem'),
  ).toHaveCount(expected);
});

test('opening a publication and returning keeps the filter (docs/06 §3)', async ({ page }) => {
  const { works } = await readExport(page);
  const target = works[0];
  expect(target).toBeDefined();
  const year = target?.year ?? 2020;

  await page.goto(`/?year=${String(year)}`);
  await page
    .getByRole('list', { name: 'Publications under the current filter' })
    .getByRole('link', { name: target?.title ?? '', exact: true })
    .first()
    .click();

  await expect(page).toHaveURL(new RegExp(`/publication/${String(target?.id)}`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(target?.title ?? '');
  await expect(page.getByRole('heading', { name: 'Why this is a UWPR publication' })).toBeVisible();

  await page.getByRole('button', { name: 'Back to the publications' }).click();
  await expect(page).toHaveURL(new RegExp(`\\?year=${String(year)}$`));
  await expect(page.getByRole('status').first()).toHaveText(
    new RegExp(`matching Year: ${String(year)}\\.$`),
  );

  // The browser's own back button lands on the same filtered view, not on an unfiltered one.
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/publication/${String(target?.id)}`));
  await page.goBack();
  await expect(page.getByRole('status').first()).toHaveText(
    new RegExp(`matching Year: ${String(year)}\\.$`),
  );
});

test('a retired work ID opens the work it merged into (docs/06 §7)', async ({ page }) => {
  const { works } = await readExport(page);
  const merged = works.find((work) => work.aliases.length > 0);
  expect(merged, 'the export must carry a retired work ID').toBeDefined();
  const retired = merged?.aliases[0] ?? '';

  // Deep-linked cold, which is what exercises the 404.html fallback of docs/06 §3.
  await page.goto(`/publication/${retired}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(merged?.title ?? '');
  await expect(page.getByRole('status').first()).toContainText(retired);
  await expect(page.getByRole('status').first()).toContainText(merged?.id ?? '');
  // Cold, so there is no overview underneath: the way out is a link, not a back button.
  await expect(page.getByRole('link', { name: 'See all publications' })).toBeVisible();
});

test('a DOI permalink works from cold, fetching the lookup index first (docs/06 §7)', async ({
  page,
}) => {
  const { works } = await readExport(page);
  const target = works.find((work) => work.ids.doi !== null);
  expect(target, 'the export must carry a work with a DOI').toBeDefined();

  const fetched: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('lookup_index.json')) fetched.push(request.url());
  });

  await page.goto(`/publication/${String(target?.ids.doi)}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(target?.title ?? '');
  expect(fetched).toHaveLength(1);

  // docs/06 §10: the index "loads on demand, not on first paint". The overview must not pay for
  // the one case that needs it.
  fetched.length = 0;
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('publications');
  expect(fetched).toHaveLength(0);
});
