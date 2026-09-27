/**
 * The agency page (docs/09 §12.6): an agency across the whole corpus — its facts, its figures
 * "not affected by the filter", a breakdown by the agencies within it with the remainder
 * assigned to none, its value over time (static), its grants, its publications, and the two ways
 * into a view with the agency added to the reader's filter. Miscellaneous is a page too.
 *
 * Rendered directly, with the handlers the Router gives it recorded, so each case says exactly
 * what a link opens; `test/routing/entity-chain.test.tsx` walks the same pages through the Router.
 * The committed sample carries real funding (docs/09 §11.8), so its agencies are the cases; the
 * one it lacks — an NIH grant assigned to no institute — is built by hand.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { agencyDetail } from '../../src/aggregate/funding';
import type { SiteView } from '../../src/components/SiteHeader';
import { fundingOf } from '../../src/contract/funding';
import type { ExportDocument, Work } from '../../src/contract/types';
import { formatCount } from '../../src/format/number';
import { Agency } from '../../src/views/Agency';
import { expectNoAxeViolations } from '../support/axe';
import { isSampleExport, sampleExport } from '../support/fixture';
import {
  agency,
  fundingBlock,
  fundingDocument,
  grant,
  listing,
  miscellaneous,
  nigms,
  unresolvedGrant,
} from '../support/funding';
import { recordingLinks } from '../support/fundingWorld';

const sample = sampleExport();

interface Shown {
  opened: string[];
  switched: SiteView[];
  publications: string[];
  onClose: ReturnType<typeof vi.fn>;
}

function show(
  code: string,
  options: { doc?: ExportDocument; inApp?: boolean; backLabel?: string } = {},
): Shown & ReturnType<typeof render> {
  const { links, opened } = recordingLinks();
  const switched: SiteView[] = [];
  const publications: string[] = [];
  const onClose = vi.fn();
  const view = render(
    <Agency
      doc={options.doc ?? sample}
      agencyKey={code}
      fundingHref="/funding?year=2024"
      links={links}
      publicationHref={(work: Work) => `/publication/${work.id}?year=2024`}
      onOpenPublication={(work: Work) => {
        publications.push(work.id);
      }}
      withAgency={{
        hrefs: {
          publications: `/?year=2024&agency=${code}`,
          funding: `/funding?year=2024&agency=${code}`,
        },
        onSwitch: (to) => {
          switched.push(to);
        },
      }}
      methodHref="/method"
      {...(options.inApp ? { onClose } : {})}
      {...(options.backLabel === undefined ? {} : { backLabel: options.backLabel })}
    />,
  );
  return { ...view, opened, switched, publications, onClose };
}

/** A fact of the page's facts list: the text of the `dd` its term names. */
const fact = (term: string): string | null | undefined =>
  screen.getByText(term, { selector: 'dt' }).nextElementSibling?.textContent;

/** "$0" as a figure: never shown for an unknown amount (§12.11 rule 3). */
const ZERO_DOLLARS = /\$0(?![\d.,])/;

/** The page's words, less its charts, whose value axis rightly starts at "$0". */
function words(container: HTMLElement): string {
  const copy = container.cloneNode(true) as HTMLElement;
  for (const svg of copy.querySelectorAll('svg')) svg.remove();
  return copy.textContent ?? '';
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------------------------------------
 * A hand-built NIH with a grant of its own, assigned to no institute (docs/09 §12.6).
 * --------------------------------------------------------------------------------------------- */

const OWN = grant({
  key: 'NIH:OD000001',
  agency: 'NIH',
  number: 'OD000001',
  title: 'AN AWARD OF NIH ITSELF',
  amount_usd: 250_000,
  amount_original: 250_000,
  fiscal_years: { '2021': 250_000 },
});

function remainderDocument(): ExportDocument {
  const base = sampleExport();
  const works = base.works.map((work, position) => ({
    ...work,
    grants:
      position === 0
        ? [listing(), listing({ grant: OWN.key, agencies: ['NIH'] })]
        : position === 1
          ? [listing({ grant: 'MISC:R01GM999999', agencies: ['MISC'] })]
          : [],
  }));
  return fundingDocument({
    funding: fundingBlock({
      agencies: [agency(), nigms(), miscellaneous()],
      grants: [grant(), OWN, unresolvedGrant()],
    }),
    works,
  });
}

describe('an agency with institutes, one grant its own', () => {
  const doc = remainderDocument();

  it('breaks its grants down by institute, with the remainder assigned to none', () => {
    show('NIH', { doc });
    const table = screen.getByRole('table', { name: /by the agency within it/ });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual([
      'NIGMS National Institute of General Medical Sciences',
      'Assigned to no institute',
    ]);
    expect(within(rows[0]!).getByRole('link', { name: 'NIGMS' })).toHaveAttribute(
      'href',
      '/funding/agency/X'.replace('X', 'NIGMS'),
    );
    // The remainder is the agency itself, so it is not a link to another page.
    expect(within(rows[1]!).queryByRole('link')).not.toBeInTheDocument();
    expect(rows[0]).toHaveTextContent('$1,000,000');
    expect(rows[1]).toHaveTextContent('$250,000');
  });

  it('opens an institute in place', async () => {
    const { opened } = show('NIH', { doc });
    const table = screen.getByRole('table', { name: /by the agency within it/ });
    await userEvent.click(within(table).getByRole('link', { name: 'NIGMS' }));
    expect(opened).toEqual(['agency:NIGMS']);
  });

  it('counts both grants, NIH’s own included, and leaves the unmatched number out', () => {
    show('NIH', { doc });
    const grants = screen.getByRole('table', { name: /Every grant of NIH/ });
    expect(
      within(grants)
        .getAllByRole('rowheader')
        .map((cell) => cell.textContent),
    ).toEqual(['R01GM000001', 'OD000001']);
    expect(screen.getByText('$1,250,000')).toBeInTheDocument();
  });

  it('has no breakdown when it has no institutes', () => {
    show('NIGMS', { doc });
    expect(screen.queryByRole('table', { name: /by the agency within it/ })).toBeNull();
    expect(screen.queryByText('Assigned to no institute')).not.toBeInTheDocument();
  });

  it('passes axe', async () => {
    const { container } = show('NIH', { doc });
    await expectNoAxeViolations(container);
  }, 30_000);
});

/* ------------------------------------------------------------------------------------------------
 * The committed sample's agencies.
 * --------------------------------------------------------------------------------------------- */

describe.runIf(isSampleExport)('an agency in the sample (NSF)', () => {
  const index = fundingOf(sample);
  const detail = agencyDetail('NSF', sample.works, index, sample.period)!;

  it('is named by the one h1, which takes focus (docs/06 §9)', () => {
    show('NSF');
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('National Science Foundation');
    expect(heading).toHaveFocus();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('states its facts: parent, country and kind', () => {
    show('NSF');
    expect(screen.getByText(/^Funding agency · NSF$/)).toBeInTheDocument();
    expect(fact('Part of')).toBe('No larger agency: it is the top of its chain');
    expect(fact('Country')).toBe('United States');
    expect(fact('Kind')).toBe('US federal');
  });

  it('states its figures as over every publication, not affected by the filter', () => {
    show('NSF');
    expect(screen.getByText(/so these figures are not affected by the filter/)).toBeInTheDocument();
    const figures = screen.getByRole('list', { name: 'Funding figures' });
    // One agency by construction, so the agencies figure says nothing and is left out.
    expect(within(figures).queryByText('Funding agencies')).not.toBeInTheDocument();
    expect(figures).toHaveTextContent(
      `${formatCount(detail.figures.withGrants)} of ${formatCount(sample.works.length)}`,
    );
    expect(figures).toHaveTextContent('Of every publication here, whatever the filter.');
    // The institution-wide position is stated wherever the total is (§12.11 rule 4), with no
    // switch: the page counts every award.
    expect(figures).toHaveTextContent(
      `Including ${formatCount(detail.figures.institutionWide.grants)} institution-wide awards`,
    );
    expect(within(figures).queryByRole('group')).not.toBeInTheDocument();
    // Each figure links to its definition.
    expect(
      within(figures).getByRole('link', {
        name: 'Total value of grants listed: how this figure is defined',
      }),
    ).toHaveAttribute('href', '/method#funding-total');
  });

  it('draws its value over time as static bars', () => {
    show('NSF');
    const card = screen.getByRole('region', { name: 'Grant funding over time' });
    expect(within(card).queryAllByRole('button', { name: /Activate/ })).toHaveLength(0);
    expect(within(card).getAllByRole('img').length).toBeGreaterThan(1);
  });

  it('lists its grants once each, and opens one in place', async () => {
    const { opened } = show('NSF');
    const table = screen.getByRole('table', { name: /Every grant of NSF listed on a publication/ });
    const numbers = within(table).getAllByRole('rowheader');
    expect(numbers).toHaveLength(detail.scope.grants.length);
    await userEvent.click(within(numbers[0]!).getByRole('link'));
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatch(/^grant:NSF:/);
  });

  it('lists its publications as links, newest first, and opens one in place', async () => {
    const { publications } = show('NSF');
    const list = screen.getByRole('list', { name: 'Publications listing its grants' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(detail.publications.length);
    const first = detail.publications[0]!;
    const link = within(items[0]!).getByRole('link', { name: first.title });
    expect(link).toHaveAttribute('href', `/publication/${first.id}?year=2024`);
    await userEvent.click(link);
    expect(publications).toEqual([first.id]);
  });

  it('offers the reader’s filter with the agency added, in either view', async () => {
    const { switched } = show('NSF');
    const publications = screen.getByRole('link', {
      name: 'Filter the publications by this agency',
    });
    expect(publications).toHaveAttribute('href', '/?year=2024&agency=NSF');
    const funding = screen.getByRole('link', { name: 'See funding impact for this agency' });
    expect(funding).toHaveAttribute('href', '/funding?year=2024&agency=NSF');
    await userEvent.click(publications);
    await userEvent.click(funding);
    expect(switched).toEqual(['publications', 'funding']);
  });

  it('leaves a modified click to the browser', async () => {
    const { switched } = show('NSF');
    const user = userEvent.setup();
    await user.keyboard('{Meta>}');
    await user.click(screen.getByRole('link', { name: 'See funding impact for this agency' }));
    await user.keyboard('{/Meta}');
    expect(switched).toEqual([]);
  });

  it('never shows $0', () => {
    const { container } = show('NSF');
    expect(words(container)).not.toMatch(ZERO_DOLLARS);
  });

  it('passes axe', async () => {
    const { container } = show('NSF');
    await expectNoAxeViolations(container);
  }, 30_000);
});

describe.runIf(isSampleExport)('an institute in the sample (NIGMS)', () => {
  it('links to its parent, which opens in place', async () => {
    const { opened } = show('NIGMS');
    const parent = screen.getByText('Part of', { selector: 'dt' }).nextElementSibling!;
    await userEvent.click(
      within(parent as HTMLElement).getByRole('link', { name: 'National Institutes of Health' }),
    );
    expect(opened).toEqual(['agency:NIH']);
  });
});

describe.runIf(isSampleExport)('NIH in the sample, its grants all under institutes', () => {
  it('lists each institute with a grant, largest known total first, and no remainder', () => {
    const detail = agencyDetail('NIH', sample.works, fundingOf(sample), sample.period)!;
    show('NIH');
    const table = screen.getByRole('table', { name: /by the agency within it/ });
    // Each institute by its short name, its full name beneath it (R1b).
    const index = fundingOf(sample)!;
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((cell) => cell.textContent),
    ).toEqual(
      detail.children.map((child) => `${child.label} ${index.agencies.get(child.code)!.name}`),
    );
    expect(detail.unassigned).toBeNull();
    expect(screen.queryByText('Assigned to no institute')).not.toBeInTheDocument();
  });

  it('passes axe', async () => {
    const { container } = show('NIH');
    await expectNoAxeViolations(container);
  }, 30_000);
});

describe.runIf(isSampleExport)('an agency whose every amount is unknown (DFG)', () => {
  it('says there is no value to draw, and shows no $0', () => {
    const { container } = show('DFG');
    expect(screen.getByText(/None of its grants listed has a known amount/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Grant funding over time' })).toBeNull();
    const figures = screen.getByRole('list', { name: 'Funding figures' });
    expect(figures).toHaveTextContent('Not known');
    expect(words(container)).not.toMatch(ZERO_DOLLARS);
  });
});

describe.runIf(isSampleExport)('Miscellaneous', () => {
  it('is a page, found by its group, saying it is not an agency', () => {
    show('MISC');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Miscellaneous');
    expect(screen.getByText(/^Not a funding agency/)).toBeInTheDocument();
    expect(screen.queryByText('Part of', { selector: 'dt' })).not.toBeInTheDocument();
    // No figure a grant would have: no total, no over-time chart.
    expect(screen.queryByText('Total value of grants listed')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Grant funding over time' })).toBeNull();
  });

  it('counts and lists the unmatched numbers as the papers wrote them', () => {
    show('MISC');
    const figures = screen.getByRole('list', { name: 'Unmatched numbers' });
    expect(figures).toHaveTextContent('1Unmatched numbers');
    const table = screen.getByRole('table', { name: /Every unmatched number/ });
    const [row] = within(table).getAllByRole('rowheader');
    expect(row).toHaveTextContent('R01 GM999999');
    expect(within(table).getByText('unmatched number')).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('list', { name: 'Publications giving an unmatched number' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(1);
  });

  it('offers the filter set to the unmatched numbers', () => {
    show('MISC');
    expect(
      screen.getByRole('link', {
        name: 'Filter the publications to those giving an unmatched number',
      }),
    ).toHaveAttribute('href', '/?year=2024&agency=MISC');
    expect(
      screen.getByRole('link', { name: 'See funding impact for the unmatched numbers' }),
    ).toHaveAttribute('href', '/funding?year=2024&agency=MISC');
  });

  it('passes axe', async () => {
    const { container } = show('MISC');
    await expectNoAxeViolations(container);
  }, 30_000);
});

/* ------------------------------------------------------------------------------------------------
 * Not found, and the way out.
 * --------------------------------------------------------------------------------------------- */

describe('an agency the export does not have', () => {
  it('is the designed not-found state', () => {
    show('NOT-AN-AGENCY');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Funding agency not found');
    expect(screen.getByText('NOT-AN-AGENCY')).toBeInTheDocument();
  });

  it('is not found in an export with no funding data, whatever its code', () => {
    const doc = { ...sample, funding: { ...sample.funding, version: null } };
    show(sample.funding.agencies[0]?.code ?? 'NIH', { doc });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Funding agency not found');
    expect(screen.getByText(/This export has no funding data at all/)).toBeInTheDocument();
  });
});

describe('the way out (docs/09 §12.3)', () => {
  const doc = remainderDocument();

  it('reached cold, links to the funding view with the reader’s query', () => {
    show('NIH', { doc });
    expect(screen.getByRole('link', { name: 'See funding impact' })).toHaveAttribute(
      'href',
      '/funding?year=2024',
    );
    expect(screen.queryByRole('button', { name: /^Back to/ })).not.toBeInTheDocument();
  });

  it('reached cold, ignores Escape, with nowhere in the site to go back to', async () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const { onClose } = show('NIH', { doc });
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });

  it('opened in the app, goes back to the page it names, by button or Escape', async () => {
    const { onClose } = show('NIH', { doc, inApp: true, backLabel: 'Back to the grant' });
    expect(screen.queryByRole('link', { name: 'See funding impact' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back to the grant' }));
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('opened in the app, says "Back to funding impact" unless told otherwise', () => {
    show('NIH', { doc, inApp: true });
    expect(screen.getByRole('button', { name: 'Back to funding impact' })).toBeInTheDocument();
  });

  it('does not close on Escape typed into the grants search, which clears the box', async () => {
    const { onClose } = show('NIH', { doc, inApp: true });
    const search = screen.getByRole('searchbox');
    await userEvent.type(search, 'OD{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('passes axe opened in the app', async () => {
    const { container } = show('NIH', { doc, inApp: true });
    await expectNoAxeViolations(container);
  }, 30_000);
});
