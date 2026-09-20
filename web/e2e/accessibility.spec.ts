/**
 * axe on every route, against the app as actually served (docs/06 §9, §12.2).
 *
 * §12.2 asks for "`axe` assertions in component tests **and on every route in end-to-end**". The
 * component tests are the other half and they cannot stand in for this one: jsdom resolves no
 * colours, lays nothing out and has no focus ring, so the three things §9 names last — contrast
 * in both themes, a visible focus indicator, and real landmarks over a real document — are only
 * checkable here. These run behind `vite preview` for the same reason every other spec does: it
 * is the built app, with the `404.html` fallback and the on-demand lookup fetch that only a
 * static host has.
 *
 * "Automated checks catch perhaps half of what matters and are not sufficient on their own"
 * (§9), so this is a floor, paired with the keyboard walkthrough before release.
 *
 * Every route means every route the router can reach, and every state of the one route that has
 * more than one: the overview, a publication detail, a rejection reached by permalink, the
 * method page, the lookup before a question and in each of its four answers, and the address
 * that is no route at all.
 *
 * Nothing is hard-coded: each identifier is read from whatever export the preview server is
 * serving — `samples/export/` by default, the real 339-work one under `UWPR_EXPORT_DIR`.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

interface Work {
  id: string;
  title: string;
  ids: { doi: string | null };
}

interface Row {
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

/**
 * WCAG 2.1 AA, which is the standard docs/06 §9 sets, rather than axe's whole rule set: the
 * extras are best-practice advice and holding the gate to the written requirement keeps a failure
 * here meaning what it says.
 */
const audit = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);

/** The violations as something readable, so a failure names the rule and the node, not a count. */
const format = (violations: { id: string; help: string; nodes: { target: unknown[] }[] }[]) =>
  violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} (${String(violation.nodes.length)} node(s): ${violation.nodes
        .map((node) => JSON.stringify(node.target))
        .join(', ')})`,
  );

async function expectClean(page: Page) {
  const { violations } = await audit(page).analyze();
  expect(format(violations)).toEqual([]);
}

/**
 * Both themes, because docs/06 §8 requires light and dark and §9 requires AA contrast "in both
 * themes". The app follows the system preference with an explicit override, so the emulated
 * preference is what a real reader's OS supplies.
 */
const THEMES = ['light', 'dark'] as const;

async function ask(page: Page, term: string) {
  await page.getByRole('textbox', { name: 'Publication identifier' }).fill(term);
  await page.getByRole('button', { name: 'Look up' }).click();
}

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });

    test('the overview', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toContainText('publications');
      // The charts draw after layout; auditing before they are on the page would audit an
      // emptier document than the reader ever sees.
      await expect(page.getByRole('region', { name: 'Publications per year' })).toBeVisible();
      await expectClean(page);
    });

    test('the overview under a filter, where the empty state and the chips live', async ({
      page,
    }) => {
      await page.goto('/?year=1900');
      await expect(page.getByRole('status').first()).toContainText('0 publications');
      await expectClean(page);
    });

    test('a publication detail', async ({ page }) => {
      const { works } = await readExport(page);
      const target = works[0];
      expect(target, 'the export must carry a work').toBeDefined();

      await page.goto(`/publication/${String(target?.id)}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(target?.title ?? '');
      await expectClean(page);
    });

    test('a rejection reached by permalink, which is the likelier way to meet one', async ({
      page,
    }) => {
      const { not_included: rows } = await readLookup(page);
      const row = rows.find((entry) => entry.ids.doi !== null) ?? rows[0];
      expect(row, 'the index must carry a rejected candidate').toBeDefined();

      await page.goto(`/publication/${String(row?.ids.doi ?? row?.id)}`);
      await expect(
        page.getByRole('region', { name: 'This publication was considered and is not included' }),
      ).toBeVisible();
      await expectClean(page);
    });

    test('the method page', async ({ page }) => {
      await page.goto('/method');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectClean(page);
    });

    test('the lookup, before anything is asked', async ({ page }) => {
      await page.goto('/lookup');
      await expect(page.getByRole('textbox', { name: 'Publication identifier' })).toBeVisible();
      await expectClean(page);
    });

    test('the lookup, answering "included"', async ({ page }) => {
      const { works } = await readExport(page);
      const target = works.find((work) => work.ids.doi !== null);
      expect(target, 'the export must carry a work with a DOI').toBeDefined();

      await page.goto('/lookup');
      await ask(page, String(target?.ids.doi));
      await expect(
        page.getByRole('region', { name: 'This publication is included' }),
      ).toBeVisible();
      await expectClean(page);
    });

    test('the lookup, answering "considered, not included"', async ({ page }) => {
      const { not_included: rows } = await readLookup(page);
      // The richest of the rejections: one carrying near-miss signals, so the list and its
      // heading are on the page and not skipped.
      const row = rows.find((entry) => entry.ids.doi !== null) ?? rows[0];
      expect(row, 'the index must carry a rejected candidate').toBeDefined();

      await page.goto('/lookup');
      await ask(page, String(row?.ids.doi ?? row?.id));
      await expect(
        page.getByRole('region', { name: 'This publication was considered and is not included' }),
      ).toBeVisible();
      await expectClean(page);
    });

    test('the lookup, answering "not in the data"', async ({ page }) => {
      await page.goto('/lookup');
      await ask(page, '10.9999/not-a-real-paper');
      await expect(
        page.getByRole('region', { name: 'This identifier is not in this project’s data' }),
      ).toBeVisible();
      await expectClean(page);
    });

    test('the lookup, when the index itself cannot be loaded', async ({ page }) => {
      await page.route('**/lookup_index.json', (route) => route.abort());
      await page.goto('/lookup');
      await ask(page, '10.9999/not-a-real-paper');
      await expect(page.getByRole('alert')).toContainText('lookup_index.json');
      await expectClean(page);
    });

    test('the lookup, when the identifier is not one at all', async ({ page }) => {
      await page.goto('/lookup');
      await ask(page, 'my paper about proteins');
      await expect(page.getByRole('alert')).toContainText('not a DOI');
      await expectClean(page);
    });

    test('an address that is no route at all', async ({ page }) => {
      await page.goto('/nowhere');
      await expect(page.getByRole('alert')).toContainText('There is no page at this address.');
      await expectClean(page);
    });

    test('an identifier no channel ever nominated, reached by permalink', async ({ page }) => {
      await page.goto('/publication/10.9999/not-a-real-paper');
      await expect(page.getByRole('alert')).toContainText('No publication was found');
      await expectClean(page);
    });
  });
}
