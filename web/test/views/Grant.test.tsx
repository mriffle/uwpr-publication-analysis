/**
 * The grant page (docs/09 §12.7), per case: a grant with a partial fiscal year and still active,
 * one with no amount (the VA's, whose record reports none), a fiscal year with no amount beside
 * years with one, a converted amount, a grant older than FY1985, an institution-wide award, an
 * override and a corrected reference among its publications, an unmatched number, a grant with
 * no title, and a key the export does not have — each with axe — and the way out, cold and
 * opened in the app. Beside the lifetime total, what the totals count of each (docs/09 F17): every
 * rule in its own terms, a spread amount as an estimate, and the counted fiscal years marked.
 *
 * The committed sample's real and synthetic grants are the cases (docs/09 §11.8). The failures
 * this guards against are §12.11's: a "$0" for unknown, a person's name made a link, a grant
 * counted as often as it is listed, and what the paper wrote hidden behind the grant it reached.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GrantDetail } from '../../src/aggregate/funding';
import type { ExportDocument, Work } from '../../src/contract/types';
import { Grant, unmatchedSentence } from '../../src/views/Grant';
import { expectNoAxeViolations } from '../support/axe';
import { isSampleExport, sampleExport } from '../support/fixture';
import { fundingBlock, fundingDocument, grant, listing, reporterSource } from '../support/funding';
import { recordingLinks } from '../support/fundingWorld';

const sample = sampleExport();

function show(
  key: string,
  options: { doc?: ExportDocument; inApp?: boolean; methodHref?: string | null } = {},
) {
  const { links, opened } = recordingLinks();
  const publications: string[] = [];
  const onClose = vi.fn();
  const methodHref = options.methodHref === undefined ? '/method' : options.methodHref;
  const view = render(
    <Grant
      doc={options.doc ?? sample}
      grantKey={key}
      fundingHref="/funding?year=2024"
      links={links}
      publicationHref={(work: Work) => `/publication/${work.id}?year=2024`}
      onOpenPublication={(work: Work) => {
        publications.push(work.id);
      }}
      {...(methodHref === null ? {} : { methodHref })}
      {...(options.inApp ? { onClose, backLabel: 'Back to the agency' } : {})}
    />,
  );
  return { ...view, opened, publications, onClose };
}

/** The counted fact's words, less the link to the method page that ends it. */
const COUNTED = 'Counted in the totals';
const LINK = ' How grant funding is counted';
const counted = (): string => (fact(COUNTED) ?? '').replace(LINK, '');

/** What every counted fact ends with: the page ignores the filter, and it is not money spent. */
const OVER_EVERY =
  'It counts every publication listing the grant, whatever the filter, and is not money spent on the work that lists it.';

/** A fact of the facts list: the text of the `dd` its term names, or undefined without one. */
function fact(term: string): string | null | undefined {
  const dt = screen.queryByText(term, { selector: 'dt' });
  return dt === null ? undefined : dt.nextElementSibling?.textContent;
}

/** "$0" as a figure: never shown for an unknown amount (§12.11 rule 3). */
const ZERO_DOLLARS = /\$0(?![\d.,])/;

/** The page's words, less its charts, whose value axis rightly starts at "$0". */
function words(container: HTMLElement): string {
  const copy = container.cloneNode(true) as HTMLElement;
  for (const svg of copy.querySelectorAll('svg')) svg.remove();
  return copy.textContent ?? '';
}

/** A grant's publications list it; an unmatched number's give it, since it is no grant. */
const publicationsList = () =>
  screen.getByRole('list', { name: /^Publications (listing this grant|giving this number)$/ });

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------------------------------------
 * Hand-built: a grant with a partial fiscal year and a null one, with no sample dependence.
 * --------------------------------------------------------------------------------------------- */

const BUILT = grant({
  key: 'NIH:R01GM000001',
  title: 'A RESEARCH PROJECT',
  start_year: 2023,
  end_year: 2027,
  amount_usd: 900_000,
  amount_original: 900_000,
  fiscal_years: { '2023': null, '2024': 400_000, '2025': 300_000, '2026': 200_000 },
  flags: ['active'],
});

/**
 * BUILT listed by two works, of 2024 and 2025: its fiscal years through 2025 are counted, the one
 * in progress, 2026, is not. The years are set here so that the case holds on any export.
 */
function builtDocument(): ExportDocument {
  const base = sampleExport();
  return fundingDocument({
    funding: fundingBlock({ grants: [BUILT], sources: [reporterSource({ partial_year: 2026 })] }),
    works: base.works.map((work, position) => ({
      ...work,
      ...(position < 2 ? { year: 2025 - position } : {}),
      grants: position < 2 ? [listing()] : [],
    })),
  });
}

describe('a grant with fiscal years, one in progress and one with no amount', () => {
  const doc = builtDocument();

  it('is titled by its title in the one h1, which takes focus, with its identity line', () => {
    show(BUILT.key, { doc });
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('A RESEARCH PROJECT');
    expect(heading).toHaveFocus();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const identity = screen.getByText(/· R01GM000001/);
    expect(within(identity).getByRole('link', { name: 'NIGMS' })).toHaveAttribute(
      'href',
      '/funding/agency/NIGMS',
    );
    expect(within(identity).getByRole('link', { name: 'NIH' })).toHaveAttribute(
      'href',
      '/funding/agency/NIH',
    );
  });

  it('states the total with its source, what the source adds up, and its date', () => {
    show(BUILT.key, { doc });
    expect(fact('Lifetime total')).toBe(
      '$900,000, the sum of the grant’s award actions over every fiscal year NIH RePORTER holds, its sub-projects left out so that nothing is counted twice, read on 26 September 2026. It is what the award is worth, not money spent on the work that lists it. It is counted once, however many publications list it.',
    );
    expect(fact('Status')).toBe('Active — the total still grows');
  });

  it('states what the totals count of it, over every publication, beside the lifetime total', () => {
    show(BUILT.key, { doc });
    // FY2023 (no amount) to FY2025, the year of the later of its two works: not FY2026.
    expect(counted()).toBe(
      `$700,000 for FY2023–FY2025, its fiscal years from 2006, when UWPR began, through 2025, the year of the latest publication listing it. ${OVER_EVERY}`,
    );
    const terms = screen.getAllByRole('term').map((term) => term.textContent);
    expect(terms.indexOf(COUNTED)).toBe(terms.indexOf('Lifetime total') + 1);
    expect(screen.getByRole('link', { name: 'How grant funding is counted' })).toHaveAttribute(
      'href',
      '/method#funding-counting',
    );
  });

  it('says how it was counted with no link when there is no method page to link', () => {
    show(BUILT.key, { doc, methodHref: null });
    expect(fact(COUNTED)).toMatch(/^\$700,000 for FY2023–FY2025/);
    expect(screen.queryByRole('link', { name: 'How grant funding is counted' })).toBeNull();
  });

  it('draws the fiscal years as static bars, the partial year and the missing amount in words', () => {
    show(BUILT.key, { doc });
    const card = screen.getByRole('region', { name: 'Amount by fiscal year' });
    expect(card).toHaveTextContent('Fiscal year (October to September)');
    expect(within(card).queryAllByRole('button', { name: /Activate/ })).toHaveLength(0);
    expect(
      within(card).getByRole('img', {
        name: '2023: no amount reported, counted in the totals.',
      }),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole('img', { name: '2024: $400,000 awarded, counted in the totals.' }),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole('img', {
        name: '2026, a partial year: $200,000 awarded so far, not counted in the totals.',
      }),
    ).toBeInTheDocument();
    expect(card).toHaveTextContent('2026 is partial: the fiscal year is not over');
    expect(card).toHaveTextContent('Fiscal year 2026 is still in progress');
    expect(card).toHaveTextContent('1 fiscal year reports no amount');
    expect(card).toHaveTextContent(
      'The 3 with an amount add up to the lifetime total. The 3 fiscal years counted in the totals are marked in the table.',
    );
    // No running total, whose "$0 so far" would read as a figure.
    expect(within(card).queryByTestId('cumulative-line')).not.toBeInTheDocument();
  });

  it('says the same in its table, the missing year never $0, the counted years marked', async () => {
    show(BUILT.key, { doc });
    const card = screen.getByRole('region', { name: 'Amount by fiscal year' });
    await userEvent.click(within(card).getByRole('button', { name: 'View as table' }));
    const table = within(card).getByRole('table');
    expect(table).toHaveAccessibleName(/The years counted in the totals are marked/);
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.textContent);
    expect(rows).toEqual([
      '2023no amount reportedCounted',
      '2024$400,000Counted',
      '2025$300,000Counted',
      '2026 (partial)$200,000Not counted',
    ]);
  });

  it('shows the tooltip’s value in words for a year with no amount', async () => {
    show(BUILT.key, { doc });
    const card = screen.getByRole('region', { name: 'Amount by fiscal year' });
    await userEvent.hover(within(card).getByRole('img', { name: /^2023: no amount reported/ }));
    const tooltip = screen.getByTestId('chart-tooltip');
    expect(tooltip).toHaveTextContent('no amount reported');
    expect(tooltip.textContent).not.toMatch(ZERO_DOLLARS);
  });

  it('names its investigators as published, with no link to any person (§12.11 rule 9)', () => {
    show(BUILT.key, { doc });
    expect(fact('Principal investigators')).toBe('A. Investigator, as the funder publishes them');
    expect(screen.queryByRole('link', { name: /Investigator/ })).not.toBeInTheDocument();
  });

  it('links the funder’s own page, labelled as the export labels it', () => {
    show(BUILT.key, { doc });
    expect(screen.getByRole('link', { name: 'NIH RePORTER project page' })).toHaveAttribute(
      'href',
      BUILT.url,
    );
  });

  it('lists the publications that list it, counted once, and opens one in place', async () => {
    const { publications } = show(BUILT.key, { doc });
    const items = within(publicationsList()).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(
      screen.getByText(
        /The grant is counted once in every total, however many publications list it/,
      ),
    ).toBeInTheDocument();
    const [first] = items;
    const link = within(first!).getByRole('link');
    await userEvent.click(link);
    expect(publications).toHaveLength(1);
    expect(link).toHaveAttribute('href', `/publication/${publications[0]!}?year=2024`);
  });

  it('opens its agency in place', async () => {
    const { opened } = show(BUILT.key, { doc });
    await userEvent.click(screen.getByRole('link', { name: 'NIGMS' }));
    expect(opened).toEqual(['agency:NIGMS']);
  });

  it('passes axe', async () => {
    const { container } = show(BUILT.key, { doc });
    await expectNoAxeViolations(container);
  }, 30_000);
});

/**
 * An override can keep a string unmatched (docs/09 B9), as the real export's `MISC:1780131` is.
 * Its reason is shown with the publication, and a decision that matched nothing is not called a
 * match, which the shared listing notes did before R1a.
 */
describe('an unmatched number an override kept', () => {
  const doc = fundingDocument({
    works: sampleExport().works.map((work, position) => ({
      ...work,
      grants:
        position === 0
          ? [
              listing({
                grant: 'MISC:R01GM999999',
                agencies: ['MISC'],
                how: 'override',
                cited_as: ['R01 GM999999'],
                override: {
                  reason: 'OpenAlex matches this string to an unrelated grant.',
                  by: 'mriffle',
                  date: '2026-09-27',
                },
              }),
            ]
          : [],
    })),
  });

  it('gives the decision with its publication, and does not call it a match', () => {
    show('MISC:R01GM999999', { doc });
    const item = within(publicationsList()).getByRole('listitem');
    expect(item).toHaveTextContent('Kept unmatched by a recorded decision, not by a rule');
    expect(item).not.toHaveTextContent('Matched by a recorded decision');
    expect(item).toHaveTextContent('OpenAlex matches this string to an unrelated grant.');
    expect(item).toHaveTextContent('Decided by mriffle on 27 September 2026');
  });

  // R1b: the real export's MISC:1780131 said "No funder's record matched this number", which is
  // not why it is unmatched: OpenAlex matched it, and a decision kept it apart.
  it('says a decision kept the number unmatched, not that no record matched it', () => {
    show('MISC:R01GM999999', { doc });
    expect(
      screen.getByText(
        'A recorded decision, not a rule, kept this number unmatched, and gives its reason with the publication below; so it has no agency, title or amount, and it is counted in no figure as a grant. It is kept as the publication wrote it, in Miscellaneous.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No funder’s record matched/)).toBeNull();
    expect(publicationsList()).toHaveAccessibleName('Publications giving this number');
    // The number is its heading, written as the paper wrote it: "also written as" it is no news.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('R01 GM999999');
    expect(within(publicationsList()).getByRole('listitem')).not.toHaveTextContent(
      'Also written in the paper',
    );
  });
});

describe('why an unmatched number is unmatched, in words', () => {
  const listingWith = (override: boolean) => ({
    listing: override
      ? { grant: 'MISC:X', agencies: ['MISC'], override: { reason: 'r', by: 'b', date: 'd' } }
      : { grant: 'MISC:X', agencies: ['MISC'] },
  });
  const sentence = (...overrides: boolean[]) =>
    unmatchedSentence({
      listings: overrides.map(listingWith) as unknown as GrantDetail['listings'],
    });

  it('says no record matched when no listing was decided', () => {
    expect(sentence(false)).toMatch(
      /^No funder’s record matched this number, .* the publication below wrote it/,
    );
    expect(sentence(false, false)).toMatch(/the publications below wrote it, in Miscellaneous\.$/);
  });

  it('gives the decision when every listing was decided', () => {
    expect(sentence(true, true)).toMatch(
      /^A recorded decision, not a rule, kept this number unmatched, and gives its reason with the publications below;/,
    );
  });

  it('says both when some listings were decided and some not', () => {
    expect(sentence(true, false)).toMatch(
      /^No funder’s record matched this number, and where a publication below says so, a recorded decision kept it unmatched;/,
    );
  });
});

/* ------------------------------------------------------------------------------------------------
 * The committed sample's grants.
 * --------------------------------------------------------------------------------------------- */

describe.runIf(isSampleExport)('the sample’s grants', () => {
  it('an active grant through the fiscal year in progress (P30DK017047)', () => {
    show('NIH:P30DK017047');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Diabetes Research Center');
    expect(fact('Lifetime total')).toMatch(/^\$52,843,525, the sum of/);
    expect(fact('Status')).toBe('Active — the total still grows');
    const card = screen.getByRole('region', { name: 'Amount by fiscal year' });
    expect(card).toHaveTextContent('2026 is partial: the fiscal year is not over');
    expect(card).toHaveTextContent('Every fiscal year shown reports an amount.');
  });

  it('a grant with no amount reported (the VA’s): not known, never $0, its years still listed', () => {
    const { container } = show('VA:I01BX999001');
    expect(fact('Lifetime total')).toBe(
      'Not known: the funder’s record holds the grant but reports no amount. It is counted once, however many publications list it.',
    );
    expect(counted()).toBe(
      'Not known, since its amount is not: it is counted beside every total, never in one.',
    );
    // No year is marked as counted or not: with no amount, none is counted.
    expect(screen.queryByRole('columnheader', { name: 'In the totals' })).toBeNull();
    expect(screen.getByText(/reports no amount for any of them/)).toBeInTheDocument();
    // Nothing to draw: a chart of empty bars would read as $0 a year.
    expect(screen.queryByRole('region', { name: 'Amount by fiscal year' })).toBeNull();
    const rows = within(screen.getByRole('table'))
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.textContent);
    expect(rows).toEqual(['2019no amount reported', '2020no amount reported']);
    // The funder's page is linked whether or not there is an amount.
    expect(screen.getByRole('link', { name: 'NIH RePORTER project page' })).toBeInTheDocument();
    expect(words(container)).not.toMatch(ZERO_DOLLARS);
  });

  it('a converted amount shows its original and the rate year (§12.11 rule 5)', () => {
    show('VR:201805851');
    expect(fact('Lifetime total')).toMatch(/^\$2,898,384, the amount OpenAlex records/);
    expect(fact('Original amount')).toMatch(/^converted from SEK\s25,200,000 at the 2018 rate$/);
    expect(
      screen.getByText(
        'OpenAlex reports a lifetime total for this grant, not an amount for each fiscal year.',
      ),
    ).toBeInTheDocument();
    // No page to link: the export gives no url, so there is no link rather than an empty one.
    expect(screen.queryByRole('link', { name: /page/ })).not.toBeInTheDocument();
  });

  it('a grant older than FY1985 says its total leaves the earlier years out', () => {
    show('NIH:T32GM007750');
    expect(fact('Where the amounts begin')).toBe(
      'The grant began before fiscal year 1985, where NIH RePORTER’s amounts begin, so its total leaves out the years before it.',
    );
    expect(screen.getByText('amounts from FY1985')).toBeInTheDocument();
  });

  it('an institution-wide award says so, with its reason', () => {
    show('NSF:2140004');
    expect(fact('Scope')).toMatch(
      /^Institution-wide: an award to run a programme for many projects/,
    );
    expect(screen.getByText('institution-wide', { selector: '.badge' })).toBeInTheDocument();
    expect(fact('Lifetime total')).toMatch(/NSF’s estimated total|what NSF obligated/);
  });

  it('a corrected reference and a listed one each show what the paper wrote (§12.11 rule 8)', () => {
    show('NIH:P01HL999001');
    const items = within(publicationsList()).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item).toHaveTextContent('Also written in the paper as “P01 HL99900”.');
    }
    expect(
      screen.getAllByText('Matched to this grant by correcting the number as the paper wrote it.'),
    ).toHaveLength(1);
    // A fiscal year with no amount, beside years with one.
    const card = screen.getByRole('region', { name: 'Amount by fiscal year' });
    expect(
      within(card).getByRole('img', { name: '2016: no amount reported, counted in the totals.' }),
    ).toBeInTheDocument();
  });

  it('an override gives its reason, by whom and when', () => {
    show('NIH:U19AG999002');
    const item = within(publicationsList()).getByRole('listitem');
    expect(item).toHaveTextContent('Matched by a recorded decision, not by a rule');
    expect(item).toHaveTextContent('Decided by sample on 26 September 2026');
    expect(item).toHaveTextContent('Also written in the paper as “U19AG9990”.');
  });

  it('an unmatched number is a page that says it matched nothing, and shows what was written', () => {
    const { container } = show('MISC:R01GM999999');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('R01 GM999999');
    expect(screen.getByText(/No funder’s record matched this number/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Miscellaneous' })).toHaveAttribute(
      'href',
      '/funding/agency/MISC',
    );
    expect(screen.queryByText('Lifetime total')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Amount by fiscal year' })).toBeNull();
    expect(within(publicationsList()).getAllByRole('listitem')).toHaveLength(1);
    expect(words(container)).not.toMatch(ZERO_DOLLARS);
  });

  it('a grant with no title is headed by its number', () => {
    show('DFG:16LW0243K');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('16LW0243K');
    expect(fact('Lifetime total')).toMatch(/^Not known: no source read here reports an amount/);
    expect(
      screen.getByText(
        'No source read here reports an amount for this grant, by fiscal year or in total.',
      ),
    ).toBeInTheDocument();
  });

  it.each([
    'NIH:P30DK017047',
    'VA:I01BX999001',
    'VR:201805851',
    'NIH:P01HL999001',
    'NIH:U19AG999002',
    'MISC:R01GM999999',
    'NIH:R01GM999004',
    'F4399999998:SMRF99901',
  ])(
    '%s passes axe',
    async (key) => {
      const { container } = show(key);
      await expectNoAxeViolations(container);
    },
    30_000,
  );
});

/* ------------------------------------------------------------------------------------------------
 * What the totals count of a grant (docs/09 F17): each rule on the sample's real and synthetic
 * grants, in the rule's own terms. Each amount is the export's own `counted_usd`.
 * --------------------------------------------------------------------------------------------- */

describe.runIf(isSampleExport)('what the totals count of each of the sample’s grants', () => {
  const exported = (key: string) => sample.funding.grants.find((entry) => entry.key === key);

  it.each([
    ['NIH:P30DK017047', 'window'],
    ['NIH:R01GM999004', 'began_after'],
    ['NIH:S10OD999001', 'full_amount'],
    ['NIH:T32GM999003', 'ended_before'],
    ['F4399999998:SMRF99902', 'undated'],
    ['F4399999998:SMRF99901', 'window'],
  ])('%s is counted by its rule, %s, as the pipeline counted it', (key, rule) => {
    expect(exported(key)?.counted_rule).toBe(rule);
  });

  it('a grant counted from 2006 through its latest listing publication, by fiscal year', () => {
    show('NIH:P30DK017047');
    // FY1986–FY2027 in all; FY2006–FY2026 counted, 2026 being its latest listing work's year.
    expect(counted()).toBe(
      `$31,755,035 for FY2006–FY2026, its fiscal years from 2006, when UWPR began, through 2026, the year of the latest publication listing it. ${OVER_EVERY}`,
    );
    expect(fact('Lifetime total')).toMatch(/^\$52,843,525, /);
    const card = screen.getByRole('region', { name: 'Amount by fiscal year' });
    expect(card).toHaveTextContent('The 21 fiscal years counted in the totals are marked');
  });

  it('a grant that began after its latest listing publication: $0, and why', () => {
    const { container } = show('NIH:R01GM999004');
    expect(counted()).toBe(
      `$0: its funding began in FY2022, after 2019, the year of the latest publication listing it, so none of it is counted. ${OVER_EVERY}`,
    );
    const card = screen.getByRole('region', { name: 'Amount by fiscal year' });
    expect(card).toHaveTextContent('No fiscal year shown is counted in the totals');
    // Its one "$0" is the known zero, and says why; there is no other.
    expect(words(container).match(/\$0(?![\d.,])/g)).toEqual(['$0']);
  });

  it('an instrument, counted in full with years after its latest listing publication', () => {
    show('NIH:S10OD999001');
    expect(counted()).toBe(
      `$750,000, counted in full: an instrument is bought once and used for years. ${OVER_EVERY}`,
    );
    expect(screen.getByRole('region', { name: 'Amount by fiscal year' })).toHaveTextContent(
      'Every fiscal year shown is counted in the totals',
    );
  });

  it('a grant whose funding ended before 2006, phrased by its last fiscal year', () => {
    show('NIH:T32GM999003');
    // Its years run to 2004, but its last fiscal year with funding is FY2003.
    expect(fact('Years')).toBe('1996–2004');
    expect(counted()).toBe(
      `$575,000: its funding ended in FY2003, before 2006, so its last five years, FY1999–FY2003, are counted. ${OVER_EVERY}`,
    );
  });

  it('an amount with no end year, counted whole', () => {
    show('F4399999998:SMRF99902');
    expect(counted()).toBe(
      `$300,000, counted whole: there is no yearly breakdown or end year to divide it by. ${OVER_EVERY}`,
    );
  });

  it('an amount spread evenly over its years, counted to its latest listing and an estimate', () => {
    show('F4399999998:SMRF99901');
    expect(counted()).toBe(
      `$714,289 for 2017–2021, its years from 2006, when UWPR began, through 2021, the year of the latest publication listing it. Its amount is spread evenly over the award’s years, 2017–2023: an estimate. ${OVER_EVERY}`,
    );
    // It has no fiscal years, so no table marks its years; the fact names them.
    expect(screen.queryByRole('region', { name: 'Amount by fiscal year' })).toBeNull();
  });

  it('counts every publication listing it: the exported counted_usd, whatever the filter', () => {
    for (const key of ['NIH:P30DK017047', 'F4399999998:SMRF99901', 'NIH:T32GM999003']) {
      const { unmount } = show(key);
      const grant = exported(key);
      expect(counted().startsWith(`$${(grant?.counted_usd ?? -1).toLocaleString('en-US')}`)).toBe(
        true,
      );
      unmount();
    }
  });
});

/* ------------------------------------------------------------------------------------------------
 * Not found, and the way out.
 * --------------------------------------------------------------------------------------------- */

describe('a grant the export does not have', () => {
  it('is the designed not-found state', () => {
    show('NIH:R01XX000000');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Grant not found');
    expect(screen.getByText('NIH:R01XX000000')).toBeInTheDocument();
  });

  it('is not found in an export with no funding data', () => {
    const doc = { ...builtDocument() };
    show(BUILT.key, { doc: { ...doc, funding: { ...doc.funding, version: null } } });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Grant not found');
  });
});

describe('the way out (docs/09 §12.3)', () => {
  const doc = builtDocument();

  it('reached cold, links to the funding view and ignores Escape', async () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const { onClose } = show(BUILT.key, { doc });
    expect(screen.getByRole('link', { name: 'See funding impact' })).toHaveAttribute(
      'href',
      '/funding?year=2024',
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });

  it('opened in the app, goes back to the page it names, by button or Escape', async () => {
    const { onClose } = show(BUILT.key, { doc, inApp: true });
    expect(screen.queryByRole('link', { name: 'See funding impact' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back to the agency' }));
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('passes axe opened in the app', async () => {
    const { container } = show(BUILT.key, { doc, inApp: true });
    await expectNoAxeViolations(container);
  }, 30_000);
});
