/**
 * The Funding impact routes end to end (docs/09; docs/06 §3, §12.2), at placeholder level.
 *
 * What only a real browser and a real build can show: the view switch keeping the reader's
 * filter across a real History API in both directions, the browser's own back and forward
 * retracing the switches, the `404.html` fallback resolving `/funding` and an agency or grant
 * address from cold, and axe against resolved colours in both themes for the new controls.
 *
 * The view exists only in a build made with `VITE_FUNDING=1` (`src/contract/config.ts`), which is
 * how CI builds it; without the flag these specs have nothing to test and are skipped.
 *
 * Nothing is hard-coded: the year comes from whatever export the preview server serves —
 * `samples/export/` by default, the real one under `UWPR_EXPORT_DIR`. The agency and grant keys
 * are made up on purpose, because the page under test is the one for a key the export lacks.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.skip(
  process.env.VITE_FUNDING !== '1',
  'The Funding impact view is built only with VITE_FUNDING=1 (docs/09).',
);

interface ExportDocument {
  works: { year: number }[];
  /** Absent in a 1.0 export; its `version` is null in a 1.1 export with no funding data. */
  funding?: { version: string | null } | null;
}

async function readExport(page: Page): Promise<ExportDocument> {
  const response = await page.request.get('/data/uwpr_publications.json');
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ExportDocument;
}

const views = (page: Page) => page.getByRole('navigation', { name: 'Views' });

/** The filter sentence of the publications view, which is its live region (docs/06 §9). */
const filtered = (count: number, year: number) =>
  new RegExp(`^${String(count)} publications? matching Year: ${String(year)}\\.$`);

test('the switch keeps the filter both ways, and back and forward retrace it (docs/09)', async ({
  page,
}) => {
  const { works } = await readExport(page);
  const year = works[0]?.year ?? 2020;
  const expected = works.filter((work) => work.year === year).length;
  const overview = new RegExp(`/\\?year=${String(year)}$`);
  const funding = new RegExp(`/funding\\?year=${String(year)}$`);

  await page.goto(`/?year=${String(year)}`);
  await expect(views(page).getByRole('link', { name: 'Publications' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await views(page).getByRole('link', { name: 'Funding impact' }).click();
  await expect(page).toHaveURL(funding);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('funding impact');
  await expect(views(page).getByRole('link', { name: 'Funding impact' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  // The heading takes focus, so a screen reader announces where the switch landed.
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();

  await views(page).getByRole('link', { name: 'Publications' }).click();
  await expect(page).toHaveURL(overview);
  await expect(page.getByRole('status').first()).toHaveText(filtered(expected, year));

  // The browser's own buttons walk the same two switches, each with its filter intact.
  await page.goBack();
  await expect(page).toHaveURL(funding);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('funding impact');
  await page.goBack();
  await expect(page).toHaveURL(overview);
  await expect(page.getByRole('status').first()).toHaveText(filtered(expected, year));
  await page.goForward();
  await expect(page).toHaveURL(funding);
  await page.goForward();
  await expect(page).toHaveURL(overview);
  await expect(page.getByRole('status').first()).toHaveText(filtered(expected, year));
});

test('the funding view resolves from cold, and says when the export has no funding data', async ({
  page,
}) => {
  const doc = await readExport(page);
  const year = doc.works[0]?.year ?? 2020;

  // Cold, which is what exercises the 404.html fallback on a static host.
  await page.goto(`/funding?year=${String(year)}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('funding impact');
  await expect(views(page).getByRole('link', { name: 'Publications' })).toHaveAttribute(
    'href',
    `/?year=${String(year)}`,
  );
  if ((doc.funding?.version ?? null) === null) {
    await expect(
      page.getByRole('region', { name: 'No funding data in this export' }),
    ).toBeVisible();
  }
});

test('the method page opened from the funding view goes back to it, filter and all', async ({
  page,
}) => {
  const { works } = await readExport(page);
  const year = works[0]?.year ?? 2020;

  await page.goto(`/funding?year=${String(year)}`);
  await page.getByRole('link', { name: 'How this was assembled' }).click();
  await expect(page).toHaveURL(/\/method$/);
  await page.getByRole('button', { name: 'Back to funding impact' }).click();
  await expect(page).toHaveURL(new RegExp(`/funding\\?year=${String(year)}$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('funding impact');
});

test('an agency and a grant resolve from cold, to a designed not-found state', async ({ page }) => {
  const key = 'NOT-A-FUNDER:0000/1';
  await page.goto(`/funding/grant/${encodeURIComponent(key)}?year=2020`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Grant not found');
  await expect(page.getByText(key, { exact: true })).toBeVisible();
  // Cold, so there is nothing behind it: the way out is a link, carrying the reader's query.
  await expect(page.getByRole('link', { name: 'See funding impact' })).toHaveAttribute(
    'href',
    '/funding?year=2020',
  );

  await page.goto(`/funding/agency/${encodeURIComponent('NOT-A-FUNDER')}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Funding agency not found');
});

/** WCAG 2.1 AA, as `accessibility.spec.ts` holds every other route to. */
async function expectClean(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    violations.map(
      (violation) =>
        `${violation.id}: ${violation.help} (${violation.nodes
          .map((node) => JSON.stringify(node.target))
          .join(', ')})`,
    ),
  ).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });

    test('the overview’s view switch passes axe', async ({ page }) => {
      await page.goto('/');
      await expect(views(page)).toBeVisible();
      await expect(page.getByRole('region', { name: 'Publications per year' })).toBeVisible();
      await expectClean(page);
    });

    test('the funding view passes axe', async ({ page }) => {
      await page.goto('/funding');
      await expect(page.getByRole('heading', { level: 1 })).toContainText('funding impact');
      await expectClean(page);
    });

    test('a grant not found passes axe', async ({ page }) => {
      await page.goto('/funding/grant/NOT-A-FUNDER%3A0000');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Grant not found');
      await expectClean(page);
    });
  });
}
