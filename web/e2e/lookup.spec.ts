/**
 * The lookup, for all three outcomes (docs/06 §12.2, docs/05 §8).
 *
 * docs/06 §12.3: Playwright runs against the **built** app behind `vite preview`, because the
 * two behaviours it exists to cover — the `404.html` fallback of §3 and the on-demand
 * `lookup_index.json` fetch of §7 — do not exist in the dev server. The second one is the whole
 * point here: the index must be fetched when this route is opened and never by the overview
 * (docs/06 §10), and only a real network panel can prove which requests were made.
 *
 * Nothing is hard-coded. Each identifier is read out of whatever export the preview server is
 * serving — `samples/export/` by default, the real 339-work one under `UWPR_EXPORT_DIR`.
 */
import { expect, test, type Page } from '@playwright/test';

interface Row {
  id: string;
  title: string;
  reason: string;
  signals: string[];
  ids: { doi: string | null; pmid: string | null };
}

interface Work {
  id: string;
  title: string;
  ids: { doi: string | null };
}

async function readExport(page: Page): Promise<{ works: Work[] }> {
  const response = await page.request.get('/data/uwpr_publications.json');
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { works: Work[] };
}

async function readLookup(page: Page): Promise<{ not_included: Row[] }> {
  const response = await page.request.get('/data/lookup_index.json');
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { not_included: Row[] };
}

/** What a reader would paste for a rejected candidate: its DOI, or its work identifier. */
const identifierFor = (row: Row): string => row.ids.doi ?? row.id;

async function ask(page: Page, term: string) {
  await page.getByRole('textbox', { name: 'Publication identifier' }).fill(term);
  await page.getByRole('button', { name: 'Look up' }).click();
}

test('the index is fetched on the lookup and never on the overview (docs/06 §10)', async ({
  page,
}) => {
  const fetched: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('lookup_index.json')) fetched.push(request.url());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('publications');
  expect(fetched).toHaveLength(0);

  await page.getByRole('link', { name: 'Why is a paper not here?' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Look up a publication');
  await expect.poll(() => fetched.length).toBe(1);
});

test('outcome one: an included publication, with its evidence (docs/05 §8)', async ({ page }) => {
  const { works } = await readExport(page);
  const target = works.find((work) => work.ids.doi !== null);
  expect(target, 'the export must carry a work with a DOI').toBeDefined();

  await page.goto('/lookup');
  await ask(page, String(target?.ids.doi));

  const card = page.getByRole('region', { name: 'This publication is included' });
  await expect(card).toBeVisible();
  await expect(card.getByText(target?.title ?? '', { exact: true })).toBeVisible();
  // The evidence is shown, not summarised, by the same component the detail view uses.
  await expect(
    card.getByRole('list', { name: 'Evidence that this publication used the resource' }),
  ).toBeVisible();

  await card.getByRole('link', { name: 'See the full record for this publication' }).click();
  await expect(page).toHaveURL(new RegExp(`/publication/${String(target?.id)}`));
});

test('outcome two: considered and not included, with the reason (docs/05 §8)', async ({ page }) => {
  const { not_included: rows } = await readLookup(page);
  const row = rows.find((entry) => entry.reason === 'no_rule_fired');
  expect(row, 'the index must carry a candidate where no rule fired').toBeDefined();

  await page.goto('/lookup');
  await ask(page, identifierFor(row as Row));

  const card = page.getByRole('region', {
    name: 'This publication was considered and is not included',
  });
  await expect(card).toBeVisible();
  await expect(card).toContainText(row?.title ?? '');
  // The statement the styling cannot make: this is about the record, not about the work.
  await expect(card).toContainText('a statement about the record, not about the work');
  await expect(card).toContainText('correction worth reporting');
  // A rejection is not an error state.
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('outcome two, with the near-miss signals shown as signals (docs/05 §8)', async ({ page }) => {
  const { not_included: rows } = await readLookup(page);
  const row = rows.find((entry) => entry.signals.length > 0);
  expect(row, 'the index must carry a candidate with a signal').toBeDefined();

  await page.goto('/lookup');
  await ask(page, identifierFor(row as Row));

  const card = page.getByRole('region', {
    name: 'This publication was considered and is not included',
  });
  await expect(card.getByRole('listitem')).toHaveCount(row?.signals.length ?? 0);
  await expect(card).toContainText('the rules deliberately do not count on its own');
});

test('outcome three: an identifier no channel ever nominated (docs/05 §8)', async ({ page }) => {
  await page.goto('/lookup');
  await ask(page, 'https://doi.org/10.9999/not-a-real-paper');

  const card = page.getByRole('region', {
    name: 'This identifier is not in this project’s data',
  });
  await expect(card).toBeVisible();
  await expect(card).toContainText('DOI 10.9999/not-a-real-paper');
  await expect(card).toContainText('It has not been examined and not been rejected');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a failed index fetch says so, and is never read as "not in the data"', async ({ page }) => {
  await page.route('**/lookup_index.json', (route) => route.abort());
  await page.goto('/lookup');
  await ask(page, '10.9999/not-a-real-paper');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('lookup_index.json');
  await expect(alert).toContainText('not a finding about the paper');
  await expect(
    page.getByRole('region', { name: 'This identifier is not in this project’s data' }),
  ).toHaveCount(0);
});

test('the lookup is reachable by a deep link, from cold (docs/06 §3)', async ({ page }) => {
  // The 404.html fallback: a static host has no rewrite rule, so this is the only thing that
  // makes a pasted /lookup URL resolve.
  await page.goto('/lookup');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Look up a publication');
  await expect(page.getByRole('textbox', { name: 'Publication identifier' })).toBeVisible();
});
