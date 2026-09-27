/**
 * docs/09 §14's "App" bullet and §11.8's sample cases, each mapped to the test that holds it (W10).
 *
 * W1–W9 built the funding views slice by slice, each with its own tests. This file is the audit
 * of the whole against the spec: the map below says where each item is held, and the tests after
 * it close the gaps the audit found. "Here" is this file.
 *
 * §14, App:
 *
 * | Item                                    | Test                                                     |
 * |-----------------------------------------|----------------------------------------------------------|
 * | routes                                  | routing/funding-route.test.ts; routing/route.test.ts     |
 * | the back-label map                      | routing/navigation.test.ts › the back labels;            |
 * |                                         | routing/back.test.tsx; routing/entity-chain.test.tsx     |
 * | filter state and predicate              | filter/state, url, describe, predicate .test.ts;         |
 * |                                         | views/FundingFilter.test.tsx                             |
 * | the scope rule                          | filter/funding.test.ts (agency, grant, institution-wide, |
 * |                                         | Miscellaneous)                                           |
 * | aggregate/funding.ts: de-duplication    | aggregate/funding.test.ts › counts a grant listed by two |
 * |                                         | works once, at its earliest year                         |
 * | …first year under a filter              | › recomputes the first year under a filter; › moves a    |
 * |                                         | grant’s value to its first year under the filter         |
 * | …unknown never $0                       | › reads as not known — null, never $0; › says "not       |
 * |                                         | known", never $0; charts/FundingOverTimeChart.test.tsx   |
 * |                                         | › the running total before a known amount enters         |
 * | …Miscellaneous pinned, top five + Other | › keeps the top five, pins Miscellaneous, and never      |
 * |                                         | merges it into Other                                     |
 * | …cumulative ending at the total         | › enters each grant once, in its first year, and ends    |
 * |                                         | exactly at the total; funding-crosscheck › draws value   |
 * |                                         | over time ending at the headline total                   |
 * | …partial year                           | › marks the partial year; › marks the partial fiscal     |
 * |                                         | year from RePORTER’s source; here › partial years        |
 * | the CSV writer                          | download/csv.test.ts; download/grants.test.ts            |
 * | the currency formatters                 | format/money.test.ts; format/funding.test.ts             |
 * | builders validated by Ajv               | contract/funding-builders.test.ts                        |
 * | the funding cross-check and first year  | aggregate/funding-crosscheck.test.ts                     |
 * | view tests with axe for every state     | views/Funding, FundingImpact, Agency, Grant,             |
 * |                                         | PublicationDetailFunding, MethodFunding .test.tsx;       |
 * |                                         | components/FundingFigures, FundingSection, GrantsTable,  |
 * |                                         | AgencyTable .test.tsx                                    |
 * | e2e: the switch keeps the filter        | e2e/funding.spec.ts › the switch keeps the filter both   |
 * |                                         | ways                                                     |
 * | e2e: an agency bar filters              | › an agency bar applies the agency filter                |
 * | e2e: funding → agency → grant →         | › funding → agency → grant → publication, and back three |
 * | publication → back three times          | times, each named                                        |
 * | e2e: cold deep links                    | › the funding view resolves from cold; › an agency and a |
 * |                                         | grant resolve from cold (both tests)                     |
 * | e2e: a corrected reference              | › a corrected reference shows what the paper wrote       |
 * | e2e: CSV rows equal to the table        | › the grants CSV holds exactly the rows the table shows  |
 * | e2e: accessibility in both themes       | e2e/funding.spec.ts's theme blocks, every funding route  |
 * |                                         | and state (W10 added the exclusion, the empty states,    |
 * |                                         | an agency not found, every kind of listing, and no       |
 * |                                         | funding data); e2e/method-funding.spec.ts › the method   |
 * |                                         | page, funding section and all, passes axe                |
 *
 * §11.8, every case of `uwpr_pubs.sample.FUNDING_CASES`, where a reader sees it (a test below holds
 * this list to the Python one, so a case added there without a row here fails):
 *
 * | Case                                                          | Test                                   |
 * |---------------------------------------------------------------|----------------------------------------|
 * | "a contract"                                                  | here › a contract, on its grant page   |
 * | "a task order"                                                | here › a task order, on its grant page |
 * | "an unresolved NIH-format string in Miscellaneous"            | views/Grant › an unmatched number is a |
 * |                                                               | page…; views/Agency › Miscellaneous;   |
 * |                                                               | views/PublicationDetailFunding ›       |
 * |                                                               | …beside an unmatched number (W-000104) |
 * | "a grant override with attribution"                           | views/PublicationDetailFunding › an    |
 * |                                                               | override gives its reason (W-000105);  |
 * |                                                               | views/Grant › an override gives its    |
 * |                                                               | reason, by whom and when               |
 * | "a corrected near-miss"                                       | views/PublicationDetailFunding › a     |
 * |                                                               | corrected reference says what the      |
 * |                                                               | paper wrote; e2e › a corrected         |
 * |                                                               | reference shows what the paper wrote   |
 * | "a corrected form beside the exact one (cited_as with how:    | views/Grant › a corrected reference    |
 * | listed)"                                                      | and a listed one each show what the    |
 * |                                                               | paper wrote                            |
 * | "a CLP amount converted by the OECD rate"                     | here › a CLP amount…                   |
 * | "an amount in a currency no rate table covers, unconverted"   | here › an amount in a currency…        |
 * | "a work with no grants"                                       | views/PublicationDetailFunding › a     |
 * |                                                               | work listing nothing still has the     |
 * |                                                               | section (W-000103)                     |
 * | "one grant listed by two works in different years"            | here › one grant listed by two works…  |
 * | "a grant with a null amount"                                  | views/Grant › a grant with no amount   |
 * |                                                               | reported (the VA’s); › a grant with no |
 * |                                                               | title is headed by its number (DFG)    |
 * | "a sub-agency with a parent"                                  | views/Agency › an institute in the     |
 * |                                                               | sample (NIGMS); › NIH in the sample    |
 * | "real: a multi-project grant valued from its parent rows      | views/Grant › an active grant through  |
 * | alone"                                                        | the fiscal year in progress            |
 * |                                                               | (P30DK017047)                          |
 * | "real: an NSF grant valued by the NSF Award API"              | views/Grant › an institution-wide      |
 * |                                                               | award says so; views/Agency › NSF      |
 * | "real: a NASA grant valued by USAspending"                    | here › a NASA grant…                   |
 * | "real: OpenAlex amounts in SEK and EUR, converted"            | views/Grant › a converted amount shows |
 * |                                                               | its original (SEK); here › a EUR…      |
 * | "real: institution-wide awards"                               | views/Grant › an institution-wide      |
 * |                                                               | award says so; views/FundingImpact ›   |
 * |                                                               | institution-wide awards excluded       |
 * | "real: a grant starting before FY1985"                        | views/Grant › a grant older than       |
 * |                                                               | FY1985…                                |
 * | "real: a grant known only by an NIH link"                     | here › a grant known only by an NIH    |
 * |                                                               | link…                                  |
 * | "real: a DFG grant left without an amount"                    | views/Grant › a grant with no title…;  |
 * |                                                               | views/Agency › an agency whose every   |
 * |                                                               | amount is unknown (DFG)                |
 * | "real: an NIH institute under its parent"                     | views/Agency › an institute in the     |
 * |                                                               | sample (NIGMS)                         |
 *
 * The cases are found by the app's own reading of each, not a copy of the Python predicates, and
 * rendered through `Router` at the address a reader would open, as `FundingImpact.test.tsx` does.
 * The honesty rules of §12.11 that no view test held on the committed sample are held here too,
 * on whichever export is loaded.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Router } from '../src/App';
import { fundingOf } from '../src/contract/funding';
import type { Grant } from '../src/contract/types';
import { formatDate } from '../src/format/date';
import { AMOUNT_BASIS_TEXT } from '../src/format/funding';
import { formatUsd, pluralize } from '../src/format/number';
import { SCHEMA_DIR, isSampleExport, sampleExport } from './support/fixture';

const doc = sampleExport();
const index = fundingOf(doc);
const grants = doc.funding.grants;

const at = (path: string) => {
  window.history.replaceState(null, '', path);
  return render(
    <Router
      doc={doc}
      fetcher={() => Promise.reject(new Error('the funding pages need no second fetch'))}
      lookupHref="/data/lookup_index.json"
      now={new Date(doc.generated_at)}
      searchDebounceMs={0}
    />,
  );
};

const grantPage = (grant: Grant) => at(`/funding/grant/${encodeURIComponent(grant.key)}`);

/** A fact of a page's facts list: the text of the `dd` its term names. */
const fact = (term: string): string | null | undefined =>
  screen.getByText(term, { selector: 'dt' }).nextElementSibling?.textContent;

/** "$0" as a figure (§12.11 rule 3). */
const ZERO_DOLLARS = /\$0(?![\d.,])/;

/** The page's words, less its charts, whose value axis rightly starts at "$0". */
function words(element: HTMLElement): string {
  const copy = element.cloneNode(true) as HTMLElement;
  for (const svg of copy.querySelectorAll('svg')) svg.remove();
  return copy.textContent ?? '';
}

/** A money figure however `Intl` writes its separator: an ordinary or a no-break space. */
const spaced = (text: string) => text.replace(/ /g, '\\s');

const find = (description: string, keep: (grant: Grant) => boolean): Grant => {
  const found = grants.find(keep);
  if (found === undefined) throw new Error(`the sample has no ${description}`);
  return found;
};

const grantsTable = () => screen.getByRole('table', { name: /Every grant listed/ });

/** The grants table's row for a grant, found by its number, the row's header. */
const rowOf = (grant: Grant) =>
  within(grantsTable())
    .getAllByRole('rowheader')
    .filter((cell) => cell.textContent === grant.number)
    .map((cell) => cell.closest('tr') as HTMLElement);

/** A row's cells by column header, as the table labels them. */
function cells(row: HTMLElement): Record<string, string> {
  const headers = within(grantsTable())
    .getAllByRole('columnheader')
    .map((cell) => cell.textContent.replace(/[↑↓]/g, '').trim());
  const values = [...row.querySelectorAll('th, td')].map((cell) => cell.textContent);
  return Object.fromEntries(headers.map((header, at_) => [header, values[at_] ?? '']));
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

/* ------------------------------------------------------------------------------------------------
 * The map is complete: every case the pipeline's sample must exhibit has a row above.
 * --------------------------------------------------------------------------------------------- */

describe('the coverage map', () => {
  const root = resolve(SCHEMA_DIR, '..');
  const python = readFileSync(resolve(root, 'src/uwpr_pubs/sample.py'), 'utf8');
  const self = readFileSync(resolve(root, 'web/test/funding-coverage.test.tsx'), 'utf8');

  /** The keys of one of `sample.py`'s case mappings, as written. */
  const keysOf = (name: string): string[] => {
    const block = new RegExp(`^${name}: Mapping\\[[^\\n]*\\{\\n([\\s\\S]*?)\\n\\}`, 'm').exec(
      python,
    )?.[1];
    if (block === undefined) throw new Error(`sample.py has no ${name}`);
    return [...block.matchAll(/^ {4}"([^"]+)":/gm)].map((match) => match[1] ?? '');
  };

  it('names every case of FUNDING_CASES, synthetic and real', () => {
    const cases = [...keysOf('FUNDING_CASES'), ...keysOf('REAL_FUNDING_CASES')];
    expect(cases).toHaveLength(21);
    // The first column of the map's rows, a wrapped case name joined back into one line.
    const firstColumn = self
      .slice(0, self.indexOf('*/'))
      .split('\n')
      .map((line) => /^ \* \|([^|]*)\|/.exec(line)?.[1] ?? '')
      .join(' ')
      .replace(/\s+/g, ' ');
    for (const name of cases) expect(firstColumn, name).toContain(`"${name}"`);
  });
});

/* ------------------------------------------------------------------------------------------------
 * §11.8's cases the view tests did not show on the sample, each where a reader would see it.
 * --------------------------------------------------------------------------------------------- */

describe.runIf(isSampleExport)('every §11.8 case renders where a reader would see it', () => {
  it('a contract, on its grant page: its type, and what its total adds up', () => {
    const contract = find(
      'contract',
      (g) => g.category === 'contract' && g.key.split(':').length === 2,
    );
    grantPage(contract);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(contract.title ?? '');
    expect(screen.getByText(new RegExp(`· ${contract.number}`))).toBeInTheDocument();
    expect(fact('Type')).toBe('Contract');
    expect(fact('Lifetime total')).toContain(
      `${formatUsd(contract.amount_usd ?? 0)}, ${AMOUNT_BASIS_TEXT.reporter_contract}`,
    );
    expect(screen.getByRole('region', { name: 'Amount by fiscal year' })).toBeInTheDocument();
  });

  it('a task order, on its grant page: its own number and total, apart from the contract', () => {
    const order = find(
      'task order',
      (g) => g.category === 'contract' && g.key.split(':').length === 3,
    );
    grantPage(order);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(order.title ?? '');
    expect(screen.getByText(new RegExp(`· ${order.number}`))).toBeInTheDocument();
    expect(fact('Type')).toBe('Contract');
    expect(fact('Lifetime total')).toContain(
      `${formatUsd(order.amount_usd ?? 0)}, ${AMOUNT_BASIS_TEXT.reporter_task_order}`,
    );
  });

  it('a CLP amount converted by the OECD rate, with its original and rate year', () => {
    const clp = find('CLP grant', (g) => g.currency === 'CLP' && g.amount_usd !== null);
    const original = `CLP ${(clp.amount_original ?? 0).toLocaleString('en-US')}`;
    const converted = new RegExp(
      `^converted from ${spaced(original)} at the ${String(clp.rate_year)} rate$`,
    );
    grantPage(clp);
    expect(fact('Lifetime total')).toMatch(new RegExp(`^\\${formatUsd(clp.amount_usd ?? 0)},`));
    expect(fact('Original amount')).toMatch(converted);
  });

  it('…and in the grants table, the dollars with the original beneath them', () => {
    const clp = find('CLP grant', (g) => g.currency === 'CLP' && g.amount_usd !== null);
    at('/funding');
    const [row] = rowOf(clp);
    expect(cells(row!).Total).toMatch(
      new RegExp(`^\\${formatUsd(clp.amount_usd ?? 0)}converted from CLP`),
    );
  });

  it('an amount in a currency no rate table covers: no dollars, the original, out of the totals', () => {
    const foreign = find(
      'unconverted amount',
      (g) => g.flags.includes('unconverted_currency') && g.amount_usd === null,
    );
    const original = `${foreign.currency ?? ''} ${(foreign.amount_original ?? 0).toLocaleString('en-US')}`;
    const { container } = grantPage(foreign);
    expect(fact('Lifetime total')).toMatch(/^Not known: no exchange rate covers its currency\./);
    expect(fact('Original amount')).toMatch(
      new RegExp(`^${spaced(original)}, not converted to US dollars$`),
    );
    expect(screen.getByText('not converted', { selector: '.badge' })).toBeInTheDocument();
    expect(words(container)).not.toMatch(ZERO_DOLLARS);
  });

  it('…and on the funding view: "not known" in the table, and a sentence in the coverage', () => {
    const foreign = find(
      'unconverted amount',
      (g) => g.flags.includes('unconverted_currency') && g.amount_usd === null,
    );
    const { container } = at('/funding');
    const [row] = rowOf(foreign);
    const total = cells(row!).Total;
    expect(total).toMatch(/^not known/);
    expect(total).toContain('not converted to US dollars');
    expect(within(row!).getByText('not converted', { selector: '.badge' })).toBeInTheDocument();
    expect(container.querySelector('.funding-coverage')).toHaveTextContent(
      /1 grant is in a currency no exchange-rate table here covers, so it has no amount in US dollars\./,
    );
    // Out of the total: the headline is the sum of the known amounts alone, as the pipeline's is.
    const known = grants.reduce((sum, grant) => sum + (grant.amount_usd ?? 0), 0);
    expect(doc.funding.summary.amount_usd).toBe(known);
    const figures = within(screen.getByRole('list', { name: 'Funding figures' }));
    expect(figures.getByText(formatUsd(known))).toBeInTheDocument();
  });

  it('one grant listed by two works in different years: counted once, at the earlier year', () => {
    const years = new Map<string, Set<number>>();
    for (const work of doc.works) {
      for (const listing of work.grants) {
        years.set(listing.grant, (years.get(listing.grant) ?? new Set()).add(work.year));
      }
    }
    const [key, seen] = [...years].find(([, set]) => set.size > 1) ?? [];
    const shared = find('grant listed in two years', (g) => g.key === key);
    const [earlier, later] = [Math.min(...(seen ?? [])), Math.max(...(seen ?? []))];
    const listing = (year?: number) =>
      doc.works.filter(
        (work) =>
          (year === undefined || work.year === year) &&
          work.grants.some((entry) => entry.grant === shared.key),
      ).length;

    const unfiltered = at('/funding');
    const rows = rowOf(shared);
    expect(rows).toHaveLength(1);
    expect(cells(rows[0]!)['First listed']).toBe(String(earlier));
    expect(cells(rows[0]!).Publications).toBe(String(listing()));
    unfiltered.unmount();

    // Under a filter to the later year alone, its first year is recomputed, not read.
    at(`/funding?year=${String(later)}`);
    expect(cells(rowOf(shared)[0]!)['First listed']).toBe(String(later));
    expect(cells(rowOf(shared)[0]!).Publications).toBe(String(listing(later)));
  });

  it('…and on its grant page: first listed in the earlier year, each publication listed', () => {
    const shared = find(
      'grant listed in two years',
      (g) =>
        new Set(
          doc.works
            .filter((work) => work.grants.some((entry) => entry.grant === g.key))
            .map((work) => work.year),
        ).size > 1,
    );
    const years = doc.works
      .filter((work) => work.grants.some((entry) => entry.grant === shared.key))
      .map((work) => work.year);
    grantPage(shared);
    expect(fact('First listed')).toBe(String(Math.min(...years)));
    expect(
      within(screen.getByRole('list', { name: 'Publications listing this grant' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(years.length);
    expect(
      screen.getByText(/counted once in every total, however many publications list it/),
    ).toBeInTheDocument();
  });

  it('a NASA grant valued by USAspending, its total said to be the award’s obligation', () => {
    const nasa = find(
      'NASA grant',
      (g) => g.agency === 'NASA' && g.amount_source?.name === 'USAspending',
    );
    const agency = index!.agencies.get(nasa.agency)!;
    grantPage(nasa);
    expect(screen.getByRole('link', { name: agency.short_name ?? agency.name })).toHaveAttribute(
      'href',
      '/funding/agency/NASA',
    );
    expect(fact('Lifetime total')).toContain(
      `${formatUsd(nasa.amount_usd ?? 0)}, ${AMOUNT_BASIS_TEXT.usaspending_obligation}, read on ${formatDate(nasa.amount_source?.as_of ?? '')}`,
    );
    expect(
      screen.getByText(
        'USAspending reports a lifetime total for this grant, not an amount for each fiscal year.',
      ),
    ).toBeInTheDocument();
  });

  it('a EUR amount from OpenAlex, converted, with its original and rate year', () => {
    const eur = find(
      'EUR grant',
      (g) =>
        g.currency === 'EUR' &&
        g.amount_usd !== null &&
        g.rate_year !== null &&
        g.amount_source?.basis === 'openalex_amount',
    );
    grantPage(eur);
    expect(fact('Lifetime total')).toMatch(
      new RegExp(`^\\${formatUsd(eur.amount_usd ?? 0)}, ${AMOUNT_BASIS_TEXT.openalex_amount}`),
    );
    expect(fact('Original amount')).toMatch(
      new RegExp(`^converted from (€|EUR\\s)[\\d,]+ at the ${String(eur.rate_year)} rate$`),
    );
  });

  it('a grant known only by an NIH link, said so on the publication that lists it', () => {
    const work = doc.works.find(
      (entry) =>
        !entry.title.startsWith('SAMPLE') && entry.grants.some((row) => row.how === 'nih_link'),
    );
    expect(work).toBeDefined();
    const linked = work!.grants.find((row) => row.how === 'nih_link')!;
    const grant = index!.grants.get(linked.grant)!;
    at(`/publication/${work!.id}`);
    const section = screen.getByRole('region', { name: 'Funding listed in this publication' });
    const item = within(section).getByText(grant.number, { selector: 'a' }).closest('li')!;
    expect(item).toHaveTextContent(
      'The funder’s own publication records link this grant to the publication; the funding statements read here do not name it.',
    );
  });
});

/* ------------------------------------------------------------------------------------------------
 * §12.11's honesty rules, where no view test held them: on every page of whichever export is
 * loaded, the sample's or the real one's (R1a). Every grant page of the real export's 755 takes
 * about 4 s in jsdom, and every publication's Funding section about 2 s.
 * --------------------------------------------------------------------------------------------- */

/**
 * Rule 1: never "funding generated, attracted, enabled or supported by" the resource. The list
 * is the one `MethodFunding.test.tsx` holds the method page's funding section to, each matched as
 * a word, so that "known" is not caught for "won".
 */
const CREDIT_OR_CAUSE = [
  'generated',
  'generating',
  'attracted',
  'attract',
  'enabled',
  'enable',
  'brought in',
  'bring in',
  'thanks to',
  'supported by',
  'support',
  'leveraged',
  'leverage',
  'secured',
  'won',
  'earned',
  'caused',
  'resulted in',
  'led to',
  'drove',
  'credit',
  'because of',
  'due to',
  'return on',
];

/**
 * The export's own words, which the page quotes and the rule is not about: a real grant is called
 * "Cancer Center Support Grant", and a paper's title may say what "led to" what. Longest first,
 * so a title is removed before a shorter name inside it.
 */
const QUOTED = [
  ...grants.flatMap((grant) => [grant.title, grant.organization, ...grant.pis.map((p) => p.name)]),
  ...doc.funding.agencies.map((agency) => agency.name),
  ...doc.works.map((work) => work.title),
]
  .filter((text): text is string => text !== null && text !== '')
  .map((text) => text.toLowerCase())
  .sort((a, b) => b.length - a.length);

const expectNoCreditOrCause = (element: HTMLElement) => {
  // "Data generated 19 September 2026" says when the export was written, not what funding did.
  let text = (element.textContent ?? '')
    .toLowerCase()
    .replace(/\bgenerated \d{1,2} [a-z]+ \d{4}/g, '');
  for (const quoted of QUOTED) text = text.split(quoted).join(' ');
  for (const phrase of CREDIT_OR_CAUSE) {
    expect(text, phrase).not.toMatch(new RegExp(`\\b${phrase}\\b`));
  }
};

describe('the honesty rules on every funding page (§12.11)', () => {
  it('rule 1: no wording of credit or cause on the view, an agency or a grant page', () => {
    const paths = [
      '/funding',
      '/funding?institution_wide=exclude',
      '/funding/agency/NIH',
      `/funding/agency/${index?.miscellaneous?.code ?? 'MISC'}`,
      ...grants.map((grant) => `/funding/grant/${encodeURIComponent(grant.key)}`),
    ];
    for (const path of paths) {
      const { unmount } = at(path);
      expectNoCreditOrCause(screen.getByRole('main'));
      unmount();
    }
  }, 30_000);

  it('rule 1: none in any publication’s Funding section either', () => {
    for (const work of doc.works) {
      const { unmount } = at(`/publication/${work.id}`);
      expectNoCreditOrCause(
        screen.getByRole('region', { name: 'Funding listed in this publication' }),
      );
      unmount();
    }
  }, 30_000);

  it('rule 2: the headline carries its definition, its as-of date and what it is not', () => {
    at('/funding');
    const figures = screen.getByRole('list', { name: 'Funding figures' });
    expect(figures).toHaveTextContent(`as of ${formatDate(doc.funding.as_of ?? '')}`);
    expect(figures).toHaveTextContent('not money spent on this work');
    expect(
      within(figures).getByRole('link', {
        name: 'Total value of grants listed: how this figure is defined',
      }),
    ).toHaveAttribute('href', '/method#funding-total');
  });

  it('rule 4: the headline states the institution-wide position, either way', () => {
    const awards = pluralize(doc.funding.summary.grants_institution_wide, 'institution-wide award');
    const { unmount } = at('/funding');
    expect(screen.getByRole('list', { name: 'Funding figures' })).toHaveTextContent(
      `Including ${awards}`,
    );
    unmount();
    at('/funding?institution_wide=exclude');
    expect(screen.getByRole('list', { name: 'Funding figures' })).toHaveTextContent(
      `Excluding ${awards}`,
    );
  });

  /**
   * Rule 3 wherever amounts accumulate: the view and every agency page, charts and tables. The
   * real export's first year with a grant (2008) comes after its first publication year, and many
   * agencies' first grants have no known amount, so a year with nothing known is common there,
   * and neither its value nor a running total with nothing in it may read "$0" — in the words,
   * or in the name a mark announces (W8, W10).
   */
  it('rule 3: unknown is never $0 on the view or any agency page, as charts or as tables', () => {
    // The page's own statements of the rule ("never as $0", "which is not $0") are not figures.
    const figures = (text: string) => text.replace(/\b(?:never|not)(?: as)? \$0(?![\d.,])/g, '');
    const paths = [
      '/funding',
      '/funding?institution_wide=exclude',
      ...doc.funding.agencies.map((agency) => `/funding/agency/${encodeURIComponent(agency.code)}`),
    ];
    for (const path of paths) {
      const { unmount } = at(path);
      const main = screen.getByRole('main');
      for (const mark of main.querySelectorAll('[aria-label]')) {
        expect(figures(mark.getAttribute('aria-label') ?? ''), path).not.toMatch(ZERO_DOLLARS);
      }
      expect(figures(words(main)), path).not.toMatch(ZERO_DOLLARS);
      for (const toggle of screen.queryAllByRole('button', { name: 'View as table' })) {
        fireEvent.click(toggle);
      }
      expect(figures(words(main)), `${path}, as tables`).not.toMatch(ZERO_DOLLARS);
      unmount();
    }
  }, 30_000);

  it('rule 6: the partial publication year is marked on the view’s chart', () => {
    expect(doc.period.current_year_partial).toBe(true);
    at('/funding');
    expect(
      within(screen.getByRole('region', { name: 'Grant funding over time' })).getByRole('img', {
        name: new RegExp(`^${String(doc.period.last_year)}, a partial year:`),
      }),
    ).toBeInTheDocument();
  });

  it('rule 7: a grant is one row however many publications list it, and the table says so', () => {
    at('/funding');
    const hrefs = within(grantsTable())
      .getAllByRole('rowheader')
      .map((cell) => within(cell).getByRole('link').getAttribute('href'));
    expect(hrefs).toHaveLength(doc.funding.summary.grants);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(
      screen.getByText(
        `${String(hrefs.length)} grants, each listed once however many publications list it.`,
      ),
    ).toBeInTheDocument();
  });

  it('rule 10: the resource’s own code is never a grant, on the view or in the index', () => {
    const code = doc.resource.identifier;
    expect(grants.some((grant) => grant.key.includes(code) || grant.number.includes(code))).toBe(
      false,
    );
    at('/funding');
    expect(grantsTable()).not.toHaveTextContent(code);
  });
});
