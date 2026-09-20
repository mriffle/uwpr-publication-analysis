/**
 * The overview (docs/06 §4), as a whole page.
 *
 * It is rendered through `Router`, which owns the URL, because the behaviours worth testing here
 * cross every layer: clicking a chart mark applies a filter, every figure and every chart
 * recomputes under it, the filter is stated in words, and the URL carries it (docs/06 §6, B5).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from '../../src/App';
import { worksAtInstitution, worksInCountry, worksOutside } from '../../src/aggregate/categories';
import { summarize } from '../../src/aggregate/metrics';
import { countryName } from '../../src/format/country';
import { applyFilter } from '../../src/filter/predicate';
import { EMPTY_FILTER } from '../../src/filter/state';
import { sampleExport } from '../support/fixture';
import { expectNoAxeViolations } from '../support/axe';

const doc = sampleExport();

const show = () =>
  render(
    <Router
      doc={doc}
      fetcher={() => Promise.reject(new Error('the overview needs no second fetch'))}
      lookupHref="/data/lookup_index.json"
      now={new Date(doc.generated_at)}
      searchDebounceMs={0}
    />,
  );

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  // jsdom lays nothing out, so every element reports clientWidth 0 and `ResponsiveChart`
  // correctly declines to draw. Giving it a width is what lets these tests reach the marks;
  // each chart's own tests render it directly at fixed dimensions instead.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

const sentence = (count: number, suffix: string) =>
  `${String(count)} ${count === 1 ? 'publication' : 'publications'} ${suffix}`;

describe('the unfiltered overview', () => {
  it('states that no filter is applied, with the count (docs/06 §6)', () => {
    show();
    expect(
      screen.getByText(sentence(doc.works.length, ', no filter applied.').replace(' ,', ',')),
    ).toBeInTheDocument();
  });

  it('shows the five headline figures of docs/06 §4.2, from the rows', () => {
    show();
    const figures = within(screen.getByRole('list', { name: 'Headline figures' }));
    for (const label of [
      'Publications',
      'Years covered',
      'Citations',
      'Research groups',
      'Journals',
    ]) {
      expect(figures.getByText(label)).toBeInTheDocument();
    }
    expect(figures.getByText(String(doc.summary.publications))).toBeInTheDocument();
    expect(
      figures.getByText(`${String(doc.summary.first_year)}–${String(doc.summary.last_year)}`),
    ).toBeInTheDocument();
  });

  it('labels "research groups" as the proxy it is (docs/05 §11.4)', () => {
    show();
    expect(screen.getByText(/A proxy: distinct corresponding authors/)).toBeInTheDocument();
  });

  it('makes no causal claim about the citations (docs/05 §5.1)', () => {
    show();
    expect(screen.getByText(/it does not measure what caused the citations/)).toBeInTheDocument();
  });

  it('draws every chart of docs/05 §7, each with a name and a description', () => {
    show();
    for (const name of [
      'Publications per year',
      'Research areas over time',
      'Research areas overall',
      'Researchers appearing most often',
      'Institutions',
      'Countries',
      'Journals',
      'Open access over time',
      'Citation distribution',
      'Most cited publications',
    ]) {
      expect(screen.getByRole('region', { name })).toHaveAccessibleDescription();
    }
  });

  it('offers a table alternative on every chart (docs/06 §7)', () => {
    show();
    const toggles = screen.getAllByRole('button', { name: 'View as table' });
    expect(toggles.length).toBe(10);
  });

  it('leaves §7.13’s chart to the method page, and links there instead', () => {
    show();
    // docs/05 §7.13: it "belongs on the method page", and docs/06 §4's enumeration of this view
    // does not include it. The link is docs/06 §4.1's, and every headline figure carries one too.
    expect(
      screen.queryByRole('region', { name: 'How each publication is known' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'How this was assembled' })).toHaveAttribute(
      'href',
      '/method',
    );
  });

  it('links every headline figure to its definition on the method page (docs/06 §4.2)', () => {
    show();
    const figures = within(screen.getByRole('list', { name: 'Headline figures' }));
    for (const [label, id] of [
      ['Publications', 'publications'],
      ['Years covered', 'years-covered'],
      ['Citations', 'citations'],
      ['Research groups', 'research-groups'],
      ['Journals', 'journals'],
    ] as const) {
      expect(
        figures.getByRole('link', { name: `${label}: how this figure is defined` }),
      ).toHaveAttribute('href', `/method#${id}`);
    }
  });

  it('passes axe', async () => {
    const { container } = show();
    await expectNoAxeViolations(container);
  });
});

describe('the honesty constraints each chart carries (docs/05 §7)', () => {
  it('says the topic-assignment axis is not a publication count (§7.5)', () => {
    show();
    const card = screen.getByRole('region', { name: 'Research areas over time' });
    expect(card).toHaveTextContent(/The axis counts topic assignments, not publications/);
    expect(card).toHaveTextContent(/exceeds the/);
  });

  it('names the institution it excludes and why (§7.8)', () => {
    show();
    const institutions = screen.getByRole('region', { name: 'Institutions' });
    const home = doc.resource.home_institution;
    // The excluded value is the one the contract names, not the most frequent one, and the note
    // states the figure that justifies leaving it out.
    expect(institutions).toHaveTextContent(`${home.name} is excluded`);
    expect(institutions).toHaveTextContent(
      new RegExp(`${String(worksAtInstitution(doc.works, home.ror))} of `),
    );
    expect(institutions).toHaveTextContent(/would flatten the chart to one bar and a fringe/);
    // Named once, in the note that says it is left out — never again as a bar or a table row.
    expect((institutions.textContent ?? '').split(home.name)).toHaveLength(2);
  });

  it('states there is no map, and counts the works with an author abroad (§7.14)', () => {
    show();
    const card = screen.getByRole('region', { name: 'Countries' });
    const home = countryName(doc.resource.home_country);
    expect(card).toHaveTextContent(/There is no map/);
    expect(card).toHaveTextContent(
      `${String(worksOutside(doc.works, doc.resource.home_country))} publications of the`,
    );
    expect(card).toHaveTextContent(`have an author outside ${home}, the resource’s own country`);
    expect(card).toHaveTextContent(
      new RegExp(`${String(worksInCountry(doc.works, doc.resource.home_country))} of `),
    );
  });

  it('says the citation distribution is not selectable, because there is no such filter (§7.11)', () => {
    show();
    expect(screen.getByRole('region', { name: 'Citation distribution' })).toHaveTextContent(
      /not one of the dimensions the page filters by/,
    );
  });
});

describe('the toggles docs/06 §4 specifies', () => {
  it('switches the same frame to citations received per year (§4.3)', async () => {
    show();
    const frame = within(screen.getByRole('region', { name: 'Publications per year' }));
    await userEvent.click(frame.getByRole('button', { name: 'Citations' }));
    expect(screen.getByRole('region', { name: 'Citations received per year' })).toBeInTheDocument();
    expect(screen.getByText(/OpenAlex reports citations by year only from/)).toBeInTheDocument();
    expect(
      screen.getByText(/were received before that and are not in this chart/),
    ).toBeInTheDocument();
  });

  it('switches research areas between three-year periods and single years (§4.4)', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Single years' }));
    const card = screen.getByRole('region', { name: 'Research areas over time' });
    expect(within(card).getByRole('group', { name: /by year/ })).toBeInTheDocument();
  });

  it('includes resource staff in the researcher chart on request (§4.5)', async () => {
    show();
    expect(screen.getByText(/Resource staff are excluded by default/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Include staff' }));
    expect(screen.getByText(/Resource staff are included and marked/)).toBeInTheDocument();
  });
});

describe('clicking a chart mark filters the page', () => {
  it('recomputes the figures, states the filter and puts it in the URL', async () => {
    show();
    const year = doc.period.last_year;
    const expected = applyFilter(doc.works, { ...EMPTY_FILTER, year: [year] });
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(doc.works.length);

    const frame = within(screen.getByRole('region', { name: 'Publications per year' }));
    await userEvent.click(frame.getByRole('button', { name: new RegExp(`^${String(year)}[,:]`) }));

    expect(window.location.search).toBe(`?year=${String(year)}`);
    expect(
      screen.getByText(sentence(expected.length, `matching Year: ${String(year)}.`)),
    ).toBeInTheDocument();

    const figures = within(screen.getByRole('list', { name: 'Headline figures' }));
    expect(figures.getByText(String(summarize(expected).citations))).toBeInTheDocument();
  });

  it('filters by a research field from the legend of the areas chart', async () => {
    show();
    const legend = within(screen.getByRole('list', { name: 'Research fields' }));
    const first = legend.getAllByRole('button')[0] as HTMLElement;
    const field = first.textContent ?? '';
    await userEvent.click(first);
    expect(window.location.search).toContain('field=');
    expect(screen.getByText(/matching Research field:/)).toBeInTheDocument();
    expect(field).not.toBe('');
  });

  it('still filters by a criterion, from a shared link (docs/05 §9)', () => {
    // §7.13's chart moved to the method page, which links back here with each criterion applied.
    // The dimension itself is unchanged and a link carrying it must still open filtered.
    window.history.replaceState(null, '', '?criterion=1');
    show();
    const expected = applyFilter(doc.works, { ...EMPTY_FILTER, criterion: [1] });
    expect(
      screen.getByText(
        sentence(expected.length, "matching How it is known: Listed on UWPR's publications page."),
      ),
    ).toBeInTheDocument();
  });

  it('clears the filter again, and empties the URL', async () => {
    window.history.replaceState(null, '', `?year=${String(doc.period.last_year)}`);
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(window.location.search).toBe('');
    expect(screen.getByText(/no filter applied/)).toBeInTheDocument();
  });

  it('removes one selection from its chip, leaving the rest (docs/06 §6)', async () => {
    window.history.replaceState(null, '', '?year=2008&year=2026');
    show();
    const chips = within(screen.getByRole('list', { name: 'Active filters' }));
    await userEvent.click(chips.getByRole('button', { name: /Year: 2008/ }));
    expect(window.location.search).toBe('?year=2026');
  });

  it('opens already filtered from a shared link (docs/06 B5)', () => {
    window.history.replaceState(null, '', '?year=2008');
    show();
    const expected = applyFilter(doc.works, { ...EMPTY_FILTER, year: [2008] });
    expect(screen.getByText(sentence(expected.length, 'matching Year: 2008.'))).toBeInTheDocument();
  });
});

describe('the explorer (docs/06 §4.8)', () => {
  it('lists every publication under the filter and sorts them', async () => {
    show();
    const list = screen.getByRole('list', { name: 'Publications under the current filter' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(doc.works.length);
    await userEvent.click(screen.getByRole('button', { name: /^Title/ }));
    expect(window.location.search).toContain('sort=title');
  });

  it('narrows the whole page from the search box, and shows it as a chip', async () => {
    show();
    const term = (doc.works[0]?.title ?? '').slice(0, 12);
    await userEvent.type(screen.getByLabelText('Search title, author or venue'), term);
    await waitFor(() => {
      expect(window.location.search).toContain('q=');
    });
    expect(screen.getByRole('list', { name: 'Active filters' })).toHaveTextContent('Search:');
  });
});

describe('an empty result is a designed state (docs/06 §6)', () => {
  it('names the filter responsible and offers to remove the last selection', async () => {
    window.history.replaceState(null, '', '?year=2008&country=ZZ');
    show();
    expect(screen.getAllByText('No publications match the current filter.').length).toBeGreaterThan(
      0,
    );
    await userEvent.click(screen.getAllByRole('button', { name: /^Remove / })[0] as HTMLElement);
    expect(screen.queryByText('No publications match the current filter.')).not.toBeInTheDocument();
  });
});

describe('the staleness notice (docs/06 §7, docs/07 O3)', () => {
  const at = (offsetDays: number) =>
    render(
      <Router
        doc={doc}
        fetcher={() => Promise.reject(new Error('no fetch'))}
        lookupHref="/data/lookup_index.json"
        now={new Date(Date.parse(doc.generated_at) + offsetDays * 86_400_000)}
        searchDebounceMs={0}
      />,
    );

  it('is absent while the data is current', () => {
    at(3);
    expect(screen.queryByText(/it is out of date/)).not.toBeInTheDocument();
  });

  it('says so once two weekly runs have been missed', () => {
    at(20);
    expect(screen.getByText(/20 days ago/)).toBeInTheDocument();
    expect(screen.getByText(/it is out of date/)).toBeInTheDocument();
  });
});

describe('back and forward (docs/06 §6: state survives reload, back and forward, and sharing)', () => {
  it('re-reads the filter from the URL when the reader goes back', async () => {
    show();
    const frame = within(screen.getByRole('region', { name: 'Publications per year' }));
    await userEvent.click(
      frame.getByRole('button', { name: new RegExp(`^${String(doc.period.last_year)}[,:]`) }),
    );
    expect(window.location.search).not.toBe('');

    act(() => {
      window.history.replaceState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByText(/no filter applied/)).toBeInTheDocument();
  });
});
