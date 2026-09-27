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
 * Nothing is hard-coded: the year, the agency, the grant, the publication and the counts come from
 * whatever export the preview server serves — `samples/export/` by default, the real one under
 * `UWPR_EXPORT_DIR`. The not-found keys are made up on purpose, because the page under test is the
 * one for a key the export lacks. The agency and grant pages (§12.6, §12.7) are walked as a chain,
 * funding → agency → grant → publication and back three times, since only a real History API
 * shows each entry keeping its way back, and are reached cold, where the `404.html` fallback
 * serves them.
 */
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

interface Listing {
  grant: string;
  agencies: string[];
  cited_as?: string[];
  how?: string;
}

interface ExportDocument {
  period: { first_year: number };
  works: { id: string; title: string; year: number; grants?: Listing[] }[];
  /** Absent in a 1.0 export; its `version` is null in a 1.1 export with no funding data. */
  funding?: {
    version: string | null;
    agencies: {
      code: string;
      name: string;
      short_name: string | null;
      parent: string | null;
      group: string;
    }[];
    grants: {
      key: string;
      agency: string;
      number: string;
      title: string | null;
      scope: string;
      fiscal_years: Record<string, number | null> | null;
    }[];
  } | null;
}

async function readExport(page: Page): Promise<ExportDocument> {
  const response = await page.request.get('/data/uwpr_publications.json');
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ExportDocument;
}

const hasFunding = (doc: ExportDocument): boolean => (doc.funding?.version ?? null) !== null;

const views = (page: Page) => page.getByRole('navigation', { name: 'Views' });

/**
 * A publication, one grant it lists that matched a record, and that grant's agency: the chain
 * funding → agency → grant → publication, read from whatever export is served.
 */
function chainOf(doc: ExportDocument) {
  const misc = new Set(
    (doc.funding?.agencies ?? [])
      .filter((agency) => agency.group === 'miscellaneous')
      .map((agency) => agency.code),
  );
  for (const work of doc.works) {
    for (const entry of work.grants ?? []) {
      if (entry.agencies.some((code) => misc.has(code))) continue;
      const grant = doc.funding?.grants.find((candidate) => candidate.key === entry.grant);
      const agency = doc.funding?.agencies.find((candidate) => candidate.code === grant?.agency);
      if (grant && agency) return { work, grant, agency };
    }
  }
  return null;
}

/** The label the funding tables give an agency: its short name, else its name. */
const agencyLabel = (agency: { name: string; short_name: string | null }) =>
  agency.short_name ?? agency.name;

/** An agency page worth checking: one with agencies within it, where there is one. */
function agencyWithChildren(doc: ExportDocument) {
  const agencies = doc.funding?.agencies ?? [];
  return (
    agencies.find((agency) => agencies.some((child) => child.parent === agency.code)) ?? agencies[0]
  );
}

/** A grant page worth checking: one with an amount by fiscal year to draw, where there is one. */
function grantWithYears(doc: ExportDocument) {
  const grants = doc.funding?.grants ?? [];
  return (
    grants.find((grant) =>
      Object.values(grant.fiscal_years ?? {}).some((amount) => amount !== null),
    ) ?? grants[0]
  );
}

/**
 * A root agency every one of whose listings is an institution-wide award, where there is one: with
 * those excluded, its publications match and list nothing in view (docs/09 §12.5's empty states).
 */
function wideOnlyAgency(doc: ExportDocument): string | undefined {
  const scopes = new Map<string, Set<string>>();
  for (const work of doc.works) {
    for (const entry of work.grants ?? []) {
      const root = entry.agencies[0];
      const grant = doc.funding?.grants.find((candidate) => candidate.key === entry.grant);
      if (root === undefined || grant === undefined) continue;
      scopes.set(root, (scopes.get(root) ?? new Set()).add(grant.scope));
    }
  }
  return [...scopes].find(([, seen]) => seen.size === 1 && seen.has('institution-wide'))?.[0];
}

/**
 * One publication per kind of listing its Funding section words differently (docs/09 §12.8): an
 * override, a reference the paper wrote otherwise (`cited_as`), an NIH link, an unmatched number,
 * and none at all — each a different structure for axe to see.
 */
function worksByListing(doc: ExportDocument): string[] {
  const misc = new Set(
    (doc.funding?.agencies ?? [])
      .filter((agency) => agency.group === 'miscellaneous')
      .map((agency) => agency.code),
  );
  const kinds: ((entries: Listing[]) => boolean)[] = [
    (entries) => entries.some((entry) => entry.how === 'override'),
    (entries) => entries.some((entry) => entry.cited_as !== undefined),
    (entries) => entries.some((entry) => entry.how === 'nih_link'),
    (entries) => entries.some((entry) => entry.agencies.some((code) => misc.has(code))),
    (entries) => entries.length === 0,
  ];
  const ids = kinds.map((kind) => doc.works.find((work) => kind(work.grants ?? []))?.id);
  return [...new Set(ids.filter((id): id is string => id !== undefined))];
}

/**
 * Serve the export changed, for a state the served one does not show: the app loads it once per
 * page load, so the change holds from the next `goto`.
 */
async function serveChanged(
  page: Page,
  change: (doc: Record<string, unknown> & { works: Record<string, unknown>[] }) => unknown,
) {
  await page.route('**/data/uwpr_publications.json', async (route) => {
    const response = await route.fetch();
    const doc = (await response.json()) as Parameters<typeof change>[0];
    await route.fulfill({ response, json: change(doc) });
  });
}

/**
 * The export as the pipeline writes it while the store holds no funding (docs/09 §11.1, §12.10):
 * the block there, its `version` null, and no work listing a grant — today's real export, so the
 * no-data states are checked in CI too, where only the sample is served.
 */
const withoutFunding = (doc: Record<string, unknown> & { works: Record<string, unknown>[] }) => ({
  ...doc,
  funding: {
    ...(doc.funding as Record<string, unknown>),
    version: null,
    as_of: null,
    sources: [],
    exchange_rates: [],
    agencies: [],
    grants: [],
  },
  works: doc.works.map((work) => ({ ...work, grants: [] })),
});

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

test.describe('the Funding impact view', () => {
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

  test('funding → agency → grant → publication, and back three times, each named (§12.3)', async ({
    page,
  }) => {
    const doc = await readExport(page);
    const chain = chainOf(doc);
    test.skip(chain === null, 'The served export lists no matched grant.');
    const { work, grant, agency } = chain!;
    const query = `?year=${String(work.year)}`;
    const agencyPath = `/funding/agency/${encodeURIComponent(agency.code)}${query}`;
    const grantPath = `/funding/grant/${encodeURIComponent(grant.key)}${query}`;
    const h1 = page.getByRole('heading', { level: 1 });

    await page.goto(`/funding${query}`);
    await page
      .getByRole('table', { name: /The agencies of the grants listed/ })
      .getByRole('rowheader')
      .getByRole('link', { name: agencyLabel(agency), exact: true })
      .click();
    await expect(page).toHaveURL(agencyPath);
    await expect(h1).toHaveText(agency.name);
    await expect(h1).toBeFocused();

    await page
      .getByRole('table', { name: /Every grant of/ })
      .getByRole('rowheader')
      .getByRole('link', { name: grant.number, exact: true })
      .click();
    await expect(page).toHaveURL(grantPath);
    await expect(h1).toHaveText(grant.title ?? grant.number);
    await expect(h1).toBeFocused();

    await page
      .getByRole('list', { name: 'Publications listing this grant' })
      .getByRole('link', { name: work.title, exact: true })
      .click();
    await expect(page).toHaveURL(`/publication/${work.id}${query}`);
    await expect(h1).toHaveText(work.title);

    await page.getByRole('button', { name: 'Back to the grant' }).click();
    await expect(page).toHaveURL(grantPath);
    await expect(h1).toHaveText(grant.title ?? grant.number);
    await page.getByRole('button', { name: 'Back to the agency' }).click();
    await expect(page).toHaveURL(agencyPath);
    await expect(h1).toHaveText(agency.name);
    await page.getByRole('button', { name: 'Back to funding impact' }).click();
    await expect(page).toHaveURL(`/funding${query}`);
    await expect(h1).toContainText('funding impact');
  });

  test('an agency and a grant resolve from cold, each linking to the funding view', async ({
    page,
  }) => {
    const doc = await readExport(page);
    const chain = chainOf(doc);
    test.skip(chain === null, 'The served export lists no matched grant.');
    const { grant, agency } = chain!;
    const parent = page.getByRole('link', { name: 'See funding impact', exact: true });

    await page.goto(`/funding/agency/${encodeURIComponent(agency.code)}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(agency.name);
    await expect(parent).toHaveAttribute('href', '/funding');
    await expect(page.getByRole('button', { name: /^Back to/ })).toHaveCount(0);

    const grantPath = `/funding/grant/${encodeURIComponent(grant.key)}?year=2020`;
    await page.goto(grantPath);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(grant.title ?? grant.number);
    await expect(parent).toHaveAttribute('href', '/funding?year=2020');
    // Arrived cold, Escape has nowhere in the site to go back to, so it goes nowhere.
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(grantPath);
  });

  test('a corrected reference shows what the paper wrote on the publication (§12.11)', async ({
    page,
  }) => {
    const doc = await readExport(page);
    const work = doc.works.find((entry) =>
      (entry.grants ?? []).some((listing) => listing.cited_as),
    );
    test.skip(work === undefined, 'No listing in the served export carries cited_as.');
    const written = (work!.grants ?? []).find((listing) => listing.cited_as)?.cited_as?.[0] ?? '';

    await page.goto(`/publication/${work!.id}`);
    await expect(
      page.getByRole('region', { name: 'Funding listed in this publication' }),
    ).toContainText(`Also written in the paper as “${written}”`);
  });

  for (const theme of ['light', 'dark'] as const) {
    test.describe(`${theme} theme`, () => {
      test.use({ colorScheme: theme });

      test('an agency page passes axe, as charts and as tables', async ({ page }) => {
        const doc = await readExport(page);
        const agency = agencyWithChildren(doc);
        test.skip(!hasFunding(doc) || agency === undefined, 'No funding data is served.');
        await page.goto(`/funding/agency/${encodeURIComponent(agency!.code)}`);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(agency!.name);
        await expectClean(page);
        const toTable = page.getByRole('button', { name: 'View as table' });
        while ((await toTable.count()) > 0) await toTable.first().click();
        await expectClean(page);
      });

      test('a grant page passes axe, as a chart and as a table', async ({ page }) => {
        const doc = await readExport(page);
        const grant = grantWithYears(doc);
        test.skip(!hasFunding(doc) || grant === undefined, 'No funding data is served.');
        await page.goto(`/funding/grant/${encodeURIComponent(grant!.key)}`);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(
          grant!.title ?? grant!.number,
        );
        await expectClean(page);
        const toTable = page.getByRole('button', { name: 'View as table' });
        while ((await toTable.count()) > 0) await toTable.first().click();
        await expectClean(page);
      });

      test('the Miscellaneous page passes axe', async ({ page }) => {
        const doc = await readExport(page);
        const misc = doc.funding?.agencies.find((agency) => agency.group === 'miscellaneous');
        test.skip(misc === undefined, 'The served export has no unmatched numbers.');
        await page.goto(`/funding/agency/${encodeURIComponent(misc!.code)}`);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(misc!.name);
        await expectClean(page);
      });

      test('a publication’s Funding section passes axe', async ({ page }) => {
        const doc = await readExport(page);
        const chain = chainOf(doc);
        test.skip(chain === null, 'The served export lists no matched grant.');
        await page.goto(`/publication/${chain!.work.id}`);
        await expect(
          page.getByRole('region', { name: 'Funding listed in this publication' }),
        ).toBeVisible();
        await expectClean(page);
      });

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

      test('an agency not found passes axe', async ({ page }) => {
        await page.goto('/funding/agency/NOT-A-FUNDER');
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(
          'Funding agency not found',
        );
        await expectClean(page);
      });

      test('the funding view passes axe with institution-wide awards excluded', async ({
        page,
      }) => {
        const doc = await readExport(page);
        test.skip(!hasFunding(doc), 'The served export carries no funding data.');
        await page.goto('/funding?institution_wide=exclude');
        await expect(sentence(page)).toContainText('Institution-wide awards are excluded.');
        await expectClean(page);
      });

      test('the funding view’s empty states pass axe (§12.5)', async ({ page }) => {
        const doc = await readExport(page);
        test.skip(!hasFunding(doc), 'The served export carries no funding data.');

        // No publication matches: the year before the first.
        await page.goto(`/funding?year=${String(doc.period.first_year - 1)}`);
        await expect(page.getByText('No publications match the current filter.')).toBeVisible();
        await expectClean(page);

        // Publications match, and every grant they list is an excluded institution-wide award.
        const wide = wideOnlyAgency(doc);
        if (wide !== undefined) {
          await page.goto(`/funding?agency=${encodeURIComponent(wide)}&institution_wide=exclude`);
          await expect(page.getByRole('region', { name: 'No grant listed' })).toContainText(
            'only institution-wide awards',
          );
          await expectClean(page);
        }

        // Publications match and list no grant at all, which the served export never shows.
        await serveChanged(page, (served) => ({
          ...served,
          works: served.works.map((work) => ({ ...work, grants: [] })),
        }));
        await page.goto('/funding');
        await expect(page.getByRole('region', { name: 'No grant listed' })).toContainText(
          'not a finding that the work had no funding',
        );
        await expectClean(page);
      });

      test('a publication’s Funding section passes axe with every kind of listing', async ({
        page,
      }) => {
        const doc = await readExport(page);
        const ids = worksByListing(doc);
        test.skip(!hasFunding(doc) || ids.length === 0, 'The served export lists no grant.');
        for (const id of ids) {
          await page.goto(`/publication/${id}`);
          await expect(
            page.getByRole('region', { name: 'Funding listed in this publication' }),
          ).toBeVisible();
          await expectClean(page);
        }
      });

      test('with no funding data, every funding page passes axe and nothing throws', async ({
        page,
      }) => {
        const doc = await readExport(page);
        const chain = chainOf(doc);
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await serveChanged(page, withoutFunding);
        const h1 = page.getByRole('heading', { level: 1 });

        await page.goto('/funding');
        await expect(
          page.getByRole('region', { name: 'No funding data in this export' }),
        ).toBeVisible();
        await expectClean(page);

        await page.goto(`/funding/agency/${encodeURIComponent(chain?.agency.code ?? 'NIH')}`);
        await expect(h1).toHaveText('Funding agency not found');
        await expect(page.getByText(/This export has no funding data at all/)).toBeVisible();
        await expectClean(page);

        await page.goto(
          `/funding/grant/${encodeURIComponent(chain?.grant.key ?? 'NIH:R01GM086688')}`,
        );
        await expect(h1).toHaveText('Grant not found');
        await expectClean(page);

        const work = chain?.work ?? doc.works[0]!;
        await page.goto(`/publication/${work.id}`);
        await expect(h1).toHaveText(work.title);
        await expect(
          page.getByRole('heading', { name: 'Funding listed in this publication' }),
        ).toHaveCount(0);
        await expectClean(page);

        await page.goto('/method#funding');
        await expect(
          page.getByRole('region', { name: 'How the funding figures are assembled' }),
        ).toContainText('This export carries no funding data');
        await expectClean(page);

        expect(errors).toEqual([]);
      });
    });
  }

  /*
   * R1b: on the real export the grants table drew 755 rows, a desktop page pushed its totals off
   * the right-hand edge, and on a phone the chart tables and a publication's topics scrolled the
   * whole page sideways. Each holds for any export: the page never scrolls sideways at 390 pixels,
   * whatever table is open, and a caption stays within the width that shows.
   */
  test.describe('at phone width', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    async function expectNoSidewaysScroll(page: Page, where: string) {
      // Every chart's table alternative open, and the stacked view of value by agency.
      const byAgency = page.getByRole('button', { name: 'By agency', exact: true });
      if ((await byAgency.count()) > 0) await byAgency.first().click();
      const toTable = page.getByRole('button', { name: 'View as table' });
      while ((await toTable.count()) > 0) await toTable.first().click();
      const widths = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        view: document.documentElement.clientWidth,
        captions: [...document.querySelectorAll('caption')].map((caption) =>
          Math.round(caption.getBoundingClientRect().right),
        ),
      }));
      expect(widths.page, `${where} scrolls sideways`).toBeLessThanOrEqual(widths.view);
      for (const right of widths.captions) {
        expect(right, `a caption on ${where} runs off the screen`).toBeLessThanOrEqual(widths.view);
      }
    }

    test('no funding page scrolls sideways, whatever table is open', async ({ page }) => {
      const doc = await readExport(page);
      test.skip(!hasFunding(doc), 'The served export carries no funding data.');
      const agency = agencyWithChildren(doc);
      const grant = grantWithYears(doc);
      const misc = doc.funding?.agencies.find((entry) => entry.group === 'miscellaneous');
      const most = [...doc.works].sort(
        (a, b) => (b.grants?.length ?? 0) - (a.grants?.length ?? 0),
      )[0]!;
      const paths = [
        '/funding',
        `/funding/agency/${encodeURIComponent(agency!.code)}`,
        `/funding/grant/${encodeURIComponent(grant!.key)}`,
        ...(misc === undefined ? [] : [`/funding/agency/${encodeURIComponent(misc.code)}`]),
        `/publication/${most.id}`,
        '/method#funding',
      ];
      for (const path of paths) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expectNoSidewaysScroll(page, path);
      }
    });
  });

  test('the grants table draws the first 50, and its CSV holds every grant', async ({ page }) => {
    const doc = await readExport(page);
    test.skip(!hasFunding(doc), 'The served export carries no funding data.');
    const all = doc.funding?.grants.length ?? 0;
    await page.goto('/funding');
    const table = page.getByRole('table', { name: /Every grant listed/ });
    await expect(table.getByRole('rowheader')).toHaveCount(Math.min(all, 50));
    // On a desktop the totals are on the page, not beyond the table's right-hand edge.
    const width = await table.evaluate((element) => ({
      table: element.getBoundingClientRect().width,
      box: (element.parentElement as HTMLElement).clientWidth,
    }));
    expect(width.table).toBeLessThanOrEqual(width.box);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page
        .getByRole('button', { name: /^Download (this grant|these [\d,]+ grants) as CSV$/ })
        .click(),
    ]);
    const [, ...rows] = parseCsv(readFileSync(await download.path(), 'utf8').slice(1));
    expect(rows).toHaveLength(all);

    // An institution's name breaks between words, never inside one ("NORTHWESTE / RN").
    const brokenWords = () =>
      table.evaluate((element) => {
        const probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
        document.body.append(probe);
        const broken: string[] = [];
        for (const cell of element.querySelectorAll<HTMLElement>('td.grants-organisation')) {
          const style = getComputedStyle(cell);
          probe.style.font = style.font;
          const room =
            cell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
          for (const word of (cell.textContent ?? '').split(/[\s-]+/).filter(Boolean)) {
            probe.textContent = word;
            if (probe.getBoundingClientRect().width > room + 0.5) broken.push(word);
          }
        }
        probe.remove();
        return broken;
      });
    expect(await brokenWords()).toEqual([]);

    if (all > 50) {
      await page.getByRole('button', { name: /^Show all [\d,]+ grants$/ }).click();
      await expect(table.getByRole('rowheader')).toHaveCount(all);
      // Every row drawn, the table still fits its column (docs/09 R1b).
      expect(
        await table.evaluate(
          (element) =>
            element.getBoundingClientRect().width <=
            (element.parentElement as HTMLElement).clientWidth,
        ),
      ).toBe(true);
      expect(await brokenWords()).toEqual([]);
    }
  });
});
