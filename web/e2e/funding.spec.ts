/**
 * The Funding impact routes end to end (docs/09 §12; docs/06 §3, §12.2).
 *
 * What only a real browser and a real build can show: the view switch keeping the reader's
 * filter across a real History API in both directions, the browser's own back and forward
 * retracing the switches, the `404.html` fallback resolving `/funding` and an agency or grant
 * address from cold, a chart mark applying a filter that the other view then honours, the grants
 * CSV as the browser actually saves it, and axe against resolved colours in both themes — the
 * contrast half of the check jsdom cannot make for the funding components.
 *
 * The view exists only in a build made with `VITE_FUNDING=1` (`src/contract/config.ts`), which is
 * how CI builds it. Without the flag the view's specs are skipped, and one spec checks the other
 * half of the promise: that such a build has no funding entry point at all.
 *
 * Nothing is hard-coded: the year, the agency and the counts come from whatever export the
 * preview server serves — `samples/export/` by default, the real one under `UWPR_EXPORT_DIR`. The
 * not-found keys are made up on purpose, because the page under test is the one for a key the
 * export lacks.
 */
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const FUNDING = process.env.VITE_FUNDING === '1';

interface ExportDocument {
  works: { year: number; grants?: { grant: string; agencies: string[] }[] }[];
  /** Absent in a 1.0 export; its `version` is null in a 1.1 export with no funding data. */
  funding?: {
    version: string | null;
    agencies: { code: string; name: string }[];
  } | null;
}

async function readExport(page: Page): Promise<ExportDocument> {
  const response = await page.request.get('/data/uwpr_publications.json');
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ExportDocument;
}

const hasFunding = (doc: ExportDocument): boolean => (doc.funding?.version ?? null) !== null;

const views = (page: Page) => page.getByRole('navigation', { name: 'Views' });

/** The live region: the filter bar's sentence, the first status on either view (docs/06 §9). */
const sentence = (page: Page) => page.getByRole('status').first();

/** The filter sentence of the publications view. */
const filtered = (count: number, year: number) =>
  new RegExp(`^${String(count)} publications? matching Year: ${String(year)}\\.$`);

const plural = (count: number, one: string) => `${String(count)} ${one}${count === 1 ? '' : 's'}`;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** RFC 4180, as `download/csv.ts` writes it: quoted fields may hold commas, quotes and CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (quoted) {
      if (char === '"' && text[at + 1] === '"') {
        field += '"';
        at += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r' && text[at + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      at += 1;
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

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

test.describe('a build with the Funding impact view', () => {
  test.skip(!FUNDING, 'The Funding impact view is built only with VITE_FUNDING=1 (docs/09).');

  test('the switch keeps the filter both ways, and back and forward retrace it (docs/09)', async ({
    page,
  }) => {
    const doc = await readExport(page);
    const year = doc.works[0]?.year ?? 2020;
    const expected = doc.works.filter((work) => work.year === year).length;
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
    // The funding view states the same filter, over the same publications, in its own sentence.
    if (hasFunding(doc)) {
      await expect(sentence(page)).toHaveText(
        new RegExp(
          `^\\d+ grants? listed on \\d+ of ${plural(expected, 'publication')} matching Year: ${String(year)}\\.$`,
        ),
      );
    }

    await views(page).getByRole('link', { name: 'Publications' }).click();
    await expect(page).toHaveURL(overview);
    await expect(sentence(page)).toHaveText(filtered(expected, year));
    // …and the publications heading takes focus too, having been opened by the switch.
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();

    // The browser's own buttons walk the same two switches, each with its filter intact.
    await page.goBack();
    await expect(page).toHaveURL(funding);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('funding impact');
    await page.goBack();
    await expect(page).toHaveURL(overview);
    await expect(sentence(page)).toHaveText(filtered(expected, year));
    await page.goForward();
    await expect(page).toHaveURL(funding);
    await page.goForward();
    await expect(page).toHaveURL(overview);
    await expect(sentence(page)).toHaveText(filtered(expected, year));
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
    if (!hasFunding(doc)) {
      await expect(
        page.getByRole('region', { name: 'No funding data in this export' }),
      ).toBeVisible();
    } else {
      await expect(page.getByRole('list', { name: 'Funding figures' })).toBeVisible();
    }
  });

  test('an agency bar applies the agency filter, which the publications view honours', async ({
    page,
  }) => {
    const doc = await readExport(page);
    test.skip(!hasFunding(doc), 'The served export carries no funding data.');

    await page.goto('/funding');
    const card = page.getByRole('region', { name: 'Funding agencies' });
    await card
      .getByRole('button', { name: /Activate to filter by this agency/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/funding\?agency=[^&]+$/);
    const code = decodeURIComponent(new URL(page.url()).searchParams.get('agency') ?? '');
    const name = doc.funding?.agencies.find((agency) => agency.code === code)?.name ?? code;
    const listing = doc.works.filter((work) =>
      (work.grants ?? []).some((entry) => entry.agencies.includes(code)),
    ).length;
    expect(listing).toBeGreaterThan(0);
    // Every publication listing the agency lists one of its grants, so K is all of N.
    await expect(sentence(page)).toHaveText(
      new RegExp(
        `^\\d+ grants? listed on ${String(listing)} of ${plural(listing, 'publication')} matching Funding agency: ${escapeRegExp(name)}\\.$`,
      ),
    );

    await views(page).getByRole('link', { name: 'Publications' }).click();
    await expect(sentence(page)).toHaveText(
      `${plural(listing, 'publication')} matching Funding agency: ${name}.`,
    );
  });

  test('the grants CSV holds exactly the rows the table shows', async ({ page }) => {
    const doc = await readExport(page);
    test.skip(!hasFunding(doc), 'The served export carries no funding data.');

    await page.goto('/funding');
    const table = page.getByRole('table', { name: /Every grant listed/ });
    await expect(table).toBeVisible();
    // Narrow the table by a search, so "exactly the visible rows" is tested, not "every row".
    const first = (await table.getByRole('rowheader').first().textContent()) ?? '';
    await page.getByRole('searchbox').fill(first);
    await expect(page.getByText(/ grants? match the search\.$/)).toBeVisible();
    await expect(table.getByRole('rowheader').first()).toHaveText(first);
    const numbers = await table.getByRole('rowheader').allTextContents();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page
        .getByRole('button', { name: /^Download (this grant|these [\d,]+ grants) as CSV$/ })
        .click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/-grants-\d{4}-\d{2}-\d{2}\.csv$/);
    const text = readFileSync(await download.path(), 'utf8');
    expect(text.startsWith('﻿')).toBe(true);
    const [header, ...rows] = parseCsv(text.slice(1));
    const number = header?.indexOf('Number') ?? -1;
    expect(number).toBeGreaterThanOrEqual(0);
    expect(rows.map((row) => row[number])).toEqual(numbers);
  });

  test('an agency opens in the app and goes back to the funding view, filter and all', async ({
    page,
  }) => {
    const doc = await readExport(page);
    test.skip(!hasFunding(doc), 'The served export carries no funding data.');
    const year = doc.works[0]?.year ?? 2020;

    await page.goto(`/funding?year=${String(year)}`);
    const agencies = page.getByRole('table', { name: /The agencies of the grants listed/ });
    await agencies.getByRole('rowheader').first().getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/funding/agency/[^?]+\\?year=${String(year)}$`));
    await page.getByRole('button', { name: 'Back to funding impact' }).click();
    await expect(page).toHaveURL(new RegExp(`/funding\\?year=${String(year)}$`));
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

  test('an agency and a grant resolve from cold, to a designed not-found state', async ({
    page,
  }) => {
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

      test('the funding view passes axe excluded, by agency and as tables', async ({ page }) => {
        const doc = await readExport(page);
        test.skip(!hasFunding(doc), 'The served export carries no funding data.');
        await page.goto('/funding?institution_wide=exclude');
        await expect(page.getByRole('button', { name: 'Exclude' })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await page.getByRole('button', { name: 'By agency' }).click();
        await expect(
          page.getByRole('region', { name: 'Grant funding by agency over time' }),
        ).toBeVisible();
        // The selected state of a bar, a segment and a legend entry, once a filter is applied.
        await page
          .getByRole('region', { name: 'Funding agencies' })
          .getByRole('button', { name: /Activate to filter by this agency/ })
          .first()
          .click();
        await expect(page).toHaveURL(/agency=/);
        await expectClean(page);
        // Each toggle renames itself once pressed, so press the first one left until none is.
        const toTable = page.getByRole('button', { name: 'View as table' });
        while ((await toTable.count()) > 0) await toTable.first().click();
        await expect(page.getByRole('table', { name: /Funding agencies by/ })).toBeVisible();
        await expectClean(page);
      });

      test('a grant not found passes axe', async ({ page }) => {
        await page.goto('/funding/grant/NOT-A-FUNDER%3A0000');
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Grant not found');
        await expectClean(page);
      });
    });
  }
});

test.describe('a build without the Funding impact view', () => {
  test.skip(FUNDING, 'Only a build without VITE_FUNDING=1 leaves the view out (docs/09 §12.12).');

  test('has no funding entry point, and /funding is no route', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Publications per year' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Views' })).toHaveCount(0);
    for (const href of await page
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))) {
      expect(href).not.toMatch(/funding/);
    }

    for (const path of ['/funding', '/funding/agency/NIH', '/funding/grant/NIH%3AR01GM086688']) {
      await page.goto(path);
      await expect(page.getByRole('alert')).toContainText('There is no page at this address.');
    }
  });
});
