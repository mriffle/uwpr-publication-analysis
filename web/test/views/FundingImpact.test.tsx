/**
 * The Funding impact view, placed (docs/09 §12.5): every section in order over the committed
 * sample, which carries real funding data (§11.8), and each of its states.
 *
 * Rendered through `Router`, because the filter, the institution-wide position, the switch and
 * the agency and grant pages all cross the URL. Nothing is hard-coded: every figure is read from
 * the document under test, and the headline figures are held to `funding.summary`, which the
 * pipeline computed independently — so the same assertions hold against the real export
 * (`UWPR_EXPORT_DIR`). Every state is put through axe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from '../../src/App';
import { UNFILTERED, fundingScope, grantKinds } from '../../src/aggregate/funding';
import { fundingOf } from '../../src/contract/funding';
import type { ExportDocument } from '../../src/contract/types';
import { formatUsd } from '../../src/format/number';
import { FUNDING_DEFINITION_IDS } from '../../src/method/definitions';
import { expectNoAxeViolations } from '../support/axe';
import { sampleExport } from '../support/fixture';
import { legacyDocument } from '../support/funding';

const doc = sampleExport();
const summary = doc.funding.summary;
const index = fundingOf(doc);

const at = (path: string, document_: ExportDocument = doc) => {
  window.history.replaceState(null, '', path);
  return render(
    <Router
      doc={document_}
      fetcher={() => Promise.reject(new Error('the funding view needs no second fetch'))}
      lookupHref="/data/lookup_index.json"
      now={new Date(document_.generated_at)}
      searchDebounceMs={0}
    />,
  );
};

const here = () => `${window.location.pathname}${window.location.search}`;
const status = () => screen.getAllByRole('status')[0];
const region = (name: string | RegExp) => screen.getByRole('region', { name });
const plural = (count: number, one: string, many = `${one}s`) =>
  `${String(count)} ${count === 1 ? one : many}`;

/** The root agencies whose every listing is an institution-wide award: EU and ANID in the sample. */
const wideOnlyAgency = (): string | undefined => {
  const scopes = new Map<string, Set<string>>();
  for (const work of doc.works) {
    for (const listing of work.grants) {
      const root = listing.agencies[0];
      const grant = index?.grants.get(listing.grant);
      if (root === undefined || grant === undefined) continue;
      scopes.set(root, (scopes.get(root) ?? new Set()).add(grant.scope));
    }
  }
  return [...scopes].find(([, seen]) => seen.size === 1 && seen.has('institution-wide'))?.[0];
};

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('the sample, unfiltered', () => {
  it('has §12.5’s sections in order, under one h1', () => {
    at('/funding');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Headline figures',
      'Grant funding over time',
      'Agencies',
      'Grant types',
      'All grants',
      'Coverage',
    ]);
    expect(screen.getByRole('contentinfo')).toHaveTextContent(doc.run_id);
  });

  it('states the funding sentence in the live region, from the scope', () => {
    at('/funding');
    expect(status()).toHaveTextContent(
      `${plural(summary.grants, 'grant')} listed on ${String(summary.works_with_listings)} of ${plural(doc.works.length, 'publication')}, no filter applied.`,
    );
  });

  it('shows the headline figures the pipeline computed apart (the cross-check, on the page)', () => {
    at('/funding');
    const figures = within(screen.getByRole('list', { name: 'Funding figures' }));
    expect(figures.getByText(formatUsd(summary.amount_usd))).toBeInTheDocument();
    expect(
      figures.getByText(`${String(summary.works_with_grants)} of ${String(doc.works.length)}`),
    );
    expect(
      figures.getByText(
        new RegExp(`Including ${String(summary.grants_institution_wide)} institution-wide awards`),
      ),
    ).toBeInTheDocument();
    expect(figures.getByText(/not money spent on this work/)).toBeInTheDocument();
  });

  it('links every figure to its definition on the method page', () => {
    at('/funding');
    const figures = within(screen.getByRole('list', { name: 'Funding figures' }));
    const hrefs = figures
      .getAllByRole('link')
      .map((link) => link.getAttribute('href') ?? '')
      .filter((href) => href.startsWith('/method#'));
    expect(new Set(hrefs)).toEqual(new Set(FUNDING_DEFINITION_IDS.map((id) => `/method#${id}`)));
  });

  it('passes axe', async () => {
    const { container } = at('/funding');
    await expectNoAxeViolations(container);
  }, 30_000);
});

describe('grant funding over time', () => {
  it('draws static year bars, which never apply a filter (§12.5 item 3)', () => {
    at('/funding');
    const card = region('Grant funding over time');
    expect(within(card).queryAllByRole('button', { name: /^\d{4}/ })).toHaveLength(0);
    const bars = within(card).getAllByRole('img', { name: /^\d{4}(, a partial year)?:/ });
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) expect(bar).not.toHaveAttribute('tabindex');
    const first = String(summary.first_year);
    const bar = within(card).getByRole('img', { name: new RegExp(`^${first}:`) });
    fireEvent.click(bar);
    fireEvent.keyDown(bar, { key: 'Enter' });
    expect(here()).toBe('/funding');
  });

  it('names each year by its known value and its grants, never an unknown as $0', () => {
    at('/funding');
    const first = summary.first_year as number;
    const year = summary.by_first_year[String(first)];
    expect(
      within(region('Grant funding over time')).getByRole('img', {
        name: new RegExp(
          `^${String(first)}: ${formatUsd(year?.amount_usd ?? 0).replace('$', '\\$')} from`,
        ),
      }),
    ).toBeInTheDocument();
  });

  it('switches to the stacked view by agency, whose segments apply the agency filter', async () => {
    at('/funding');
    const card = region('Grant funding over time');
    await userEvent.click(within(card).getByRole('button', { name: 'By agency' }));
    const stacked = region('Grant funding by agency over time');
    const segment = within(stacked).getAllByRole('button', {
      name: /Activate to filter by this agency/,
    })[0];
    await userEvent.click(segment as HTMLElement);
    expect(window.location.search).toMatch(/^\?agency=[^&]+$/);
    expect(status()).toHaveTextContent(/matching Funding agency:/);
  });
});

describe('agencies', () => {
  it('ranks root agencies by value, and a bar applies the agency filter (§12.5 item 4)', async () => {
    at('/funding');
    const card = region('Funding agencies');
    const bars = within(card).getAllByRole('button', { name: /Activate to filter by this agency/ });
    expect(bars.length).toBeGreaterThan(0);
    // The largest known total is NIH's in the sample; whatever it is, its bar names it first.
    await userEvent.click(bars[0] as HTMLElement);
    const search = new URLSearchParams(window.location.search);
    const code = search.get('agency') ?? '';
    expect(search.getAll('agency')).toHaveLength(1);
    const name = index?.agencies.get(code)?.name ?? code;
    const listing = doc.works.filter((work) =>
      work.grants.some((entry) => (entry.agencies as readonly string[]).includes(code)),
    ).length;
    expect(status()).toHaveTextContent(
      new RegExp(
        `listed on \\d+ of ${plural(listing, 'publication')} matching Funding agency: ${name}\\.$`,
      ),
    );
    // The scope rule: every grant left in the table is one of that agency's.
    const table = within(screen.getByRole('table', { name: /Every grant listed/ }));
    const rows = table.getAllByRole('rowheader').map((cell) => cell.textContent);
    const keys = [...(index?.grants.values() ?? [])]
      .filter((grant) => index?.chains.get(grant.agency)?.includes(code))
      .map((grant) => grant.number);
    for (const number of rows) expect(keys).toContain(number);
  });

  it('keeps Miscellaneous out of the value ranking, and shows it as its own bar by grants', async () => {
    at('/funding');
    const card = region('Funding agencies');
    expect(within(card).queryByRole('button', { name: /^Miscellaneous/ })).not.toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'By grants' }));
    const misc = within(card).getByRole('button', { name: /^Miscellaneous \(unmatched numbers\)/ });
    await userEvent.click(misc);
    expect(window.location.search).toBe('?agency=MISC');
  });

  it('draws new grants by agency with "Other" as plain text in the legend', () => {
    at('/funding');
    const card = region('New grants by agency over time');
    const legend = within(within(card).getByRole('list', { name: 'Agencies' }));
    expect(legend.getByText('Other').closest('button')).toBeNull();
    expect(legend.getByRole('button', { name: /^Miscellaneous/ })).toBeInTheDocument();
    expect(
      within(card).getAllByRole('img', { name: /^Other,.*Not a filter/ }).length,
    ).toBeGreaterThan(0);
  });

  it('opens an agency and a grant in the app, with the way back recorded', async () => {
    at('/funding?year=2021');
    const table = within(screen.getByRole('table', { name: /The agencies of the grants listed/ }));
    const link = table.getAllByRole('link')[0] as HTMLElement;
    const href = link.getAttribute('href') ?? '';
    expect(href).toMatch(/^\/funding\/agency\/[^?]+\?year=2021$/);
    await userEvent.click(link);
    expect(here()).toBe(href);
    expect(window.history.state).toEqual({ back: 'funding' });
    expect(screen.getByRole('button', { name: 'Back to funding impact' })).toBeInTheDocument();
  });
});

describe('the view’s own switches and links', () => {
  it('buckets new grants by agency in three-year periods, or single years on request', async () => {
    at('/funding');
    const card = region('New grants by agency over time');
    expect(within(card).getByRole('group', { name: /in 3-year periods/ })).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Single years' }));
    expect(within(card).getByRole('group', { name: /by year/ })).toBeInTheDocument();
    expect(here()).toBe('/funding');
  });

  it('measures grant types by count on request, still static', async () => {
    at('/funding');
    const card = region('Grant types');
    await userEvent.click(within(card).getByRole('button', { name: 'By grants' }));
    const kinds = grantKinds(fundingScope(doc.works, index, UNFILTERED));
    expect(within(card).getAllByRole('img', { name: /: \d+ grants?, Known total/ })).toHaveLength(
      kinds.filter((row) => row.grants > 0).length,
    );
  });

  it('keeps the institution-wide position when the filter is cleared', async () => {
    at('/funding?year=2021&institution_wide=exclude');
    await userEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(here()).toBe('/funding?institution_wide=exclude');
  });

  it('opens a grant in the app, keeping the query, with the way back recorded', async () => {
    at('/funding?year=2021');
    const table = within(screen.getByRole('table', { name: /Every grant listed/ }));
    const link = within(table.getAllByRole('rowheader')[0] as HTMLElement).getByRole('link');
    expect(link.getAttribute('href')).toMatch(/^\/funding\/grant\/[^?]+\?year=2021$/);
    await userEvent.click(link);
    expect(here()).toBe(link.getAttribute('href'));
    expect(window.history.state).toEqual({ back: 'funding' });
  });
});

describe('grant types, all grants and coverage', () => {
  it('draws grant types as static bars, said not to be filters (§12.5 item 5)', () => {
    at('/funding');
    const card = region('Grant types');
    expect(within(card).queryAllByRole('button', { name: /Activate/ })).toHaveLength(0);
    expect(within(card).getAllByRole('img', { name: /known/ }).length).toBeGreaterThan(0);
    expect(card).toHaveTextContent('These bars are not filters');
  });

  it('lists every grant in scope once, with a CSV of exactly the rows shown', () => {
    at('/funding');
    expect(screen.getByRole('table', { name: /Every grant listed/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: `Download these ${String(summary.grants)} grants as CSV`,
      }),
    ).toBeInTheDocument();
  });

  it('links the Miscellaneous sentence to the view of only the unmatched numbers', async () => {
    const misc = index?.miscellaneous?.code ?? 'MISC';
    at('/funding?institution_wide=exclude');
    const link = screen.getByRole('link', { name: 'Show only the unmatched numbers' });
    expect(link).toHaveAttribute('href', `/funding?agency=${misc}&institution_wide=exclude`);
    await userEvent.click(link);
    expect(here()).toBe(`/funding?agency=${misc}&institution_wide=exclude`);
    // Already showing only them, the sentence offers nothing more.
    expect(
      screen.queryByRole('link', { name: 'Show only the unmatched numbers' }),
    ).not.toBeInTheDocument();
  });

  it('states the institution-wide position, FY1985 and the active grants', () => {
    const { container } = at('/funding');
    const coverage = container.querySelector('.funding-coverage');
    expect(coverage).toHaveTextContent(/Including \d+ institution-wide awards/);
    expect(coverage).toHaveTextContent(/FY1985/);
    expect(coverage).toHaveTextContent(/still active/);
  });
});

describe('institution-wide awards excluded', () => {
  it('says so in the sentence, the figure and the switch, and the total drops by their value', () => {
    at('/funding?institution_wide=exclude');
    expect(status()).toHaveTextContent(/Institution-wide awards are excluded\.$/);
    const figures = within(screen.getByRole('list', { name: 'Funding figures' }));
    expect(
      figures.getByText(formatUsd(summary.amount_usd - summary.amount_usd_institution_wide)),
    ).toBeInTheDocument();
    expect(
      figures.getByText(
        new RegExp(`Excluding ${String(summary.grants_institution_wide)} institution-wide awards`),
      ),
    ).toBeInTheDocument();
    expect(figures.getByRole('button', { name: 'Exclude' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('is undone by the switch, which drops the parameter and keeps the filter', async () => {
    at('/funding?year=2020&institution_wide=exclude');
    await userEvent.click(screen.getByRole('button', { name: 'Include' }));
    expect(here()).toBe('/funding?year=2020');
    await userEvent.click(screen.getByRole('button', { name: 'Exclude' }));
    expect(here()).toBe('/funding?year=2020&institution_wide=exclude');
  });

  it('passes axe', async () => {
    const { container } = at('/funding?institution_wide=exclude');
    await expectNoAxeViolations(container);
  }, 30_000);
});

describe('empty states', () => {
  it('when no publication matches, shows the overview’s empty state and offers to clear', async () => {
    const { container } = at(`/funding?year=${String(doc.period.first_year - 1)}`);
    expect(status()).toHaveTextContent(/^0 grants listed on 0 of 0 publications matching Year:/);
    expect(screen.getByText('No publications match the current filter.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Grant funding over time' })).toBeNull();
    await expectNoAxeViolations(container);
    await userEvent.click(screen.getByRole('button', { name: /^Remove Year:/ }));
    expect(here()).toBe('/funding');
  }, 30_000);

  it('when publications match but none lists a grant, says so in its own words', async () => {
    const bare: ExportDocument = {
      ...doc,
      works: doc.works.map((work) => ({ ...work, grants: [] })),
    };
    const { container } = at('/funding', bare);
    const state = region('No grant listed');
    expect(state).toHaveTextContent(/lists a grant in the funding statements read/);
    expect(state).toHaveTextContent(/not a finding that the work had no funding/);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  }, 30_000);

  it('when every grant in view is an excluded institution-wide award, points at the switch', () => {
    const code = wideOnlyAgency();
    expect(code).toBeDefined();
    at(`/funding?agency=${code ?? ''}&institution_wide=exclude`);
    expect(region('No grant listed')).toHaveTextContent(/only institution-wide awards/);
  });

  it('with a 1.0 export, shows the plain no-data notice and draws nothing', async () => {
    const { container } = at('/funding', legacyDocument());
    expect(region('No funding data in this export')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  }, 30_000);
});

describe('the switch, and where focus goes', () => {
  const views = () => screen.getByRole('navigation', { name: 'Views' });

  it('keeps the filter and the position both ways', async () => {
    at('/funding?agency=NIH&institution_wide=exclude');
    await userEvent.click(within(views()).getByRole('link', { name: 'Publications' }));
    expect(here()).toBe('/?agency=NIH&institution_wide=exclude');
    await userEvent.click(within(views()).getByRole('link', { name: 'Funding impact' }));
    expect(here()).toBe('/funding?agency=NIH&institution_wide=exclude');
  });

  it('focuses the publications heading when the switch opens it, and not otherwise', async () => {
    at('/');
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveFocus();
    await userEvent.click(within(views()).getByRole('link', { name: 'Funding impact' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    await userEvent.click(within(views()).getByRole('link', { name: 'Publications' }));
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('publications');
    expect(heading).toHaveFocus();
  });

  it('does not take focus again on a return from a publication', async () => {
    at('/funding');
    await userEvent.click(within(views()).getByRole('link', { name: 'Publications' }));
    const year = screen.getAllByRole('button', { name: /Activate to filter by this year/ })[0];
    await userEvent.click(year as HTMLElement);
    const explorer = within(
      screen.getByRole('list', { name: 'Publications under the current filter' }),
    );
    await userEvent.click(explorer.getAllByRole('link')[0] as HTMLElement);
    expect(window.location.pathname).toMatch(/^\/publication\//);
    window.history.back();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('publications');
    });
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveFocus();
  });
});
