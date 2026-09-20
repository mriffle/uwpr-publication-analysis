/**
 * The remaining charts of docs/05 §7, each asserted against the constraint that shaped it.
 *
 * The constraints are the point: each of these was specified the way it was because a
 * measurement said the obvious version would mislead, so each test names the constraint rather
 * than the pixels.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { researchAreasOverTime } from '../../src/aggregate/areas';
import {
  CitationsPerYearChart,
  CitationsPerYearTable,
  citationBarLabel,
} from '../../src/charts/CitationsPerYearChart';
import {
  CitationDistributionChart,
  CitationDistributionTable,
  bucketLabel,
} from '../../src/charts/CitationDistributionChart';
import { ChartLegend } from '../../src/charts/ChartLegend';
import { MostCitedList, MostCitedTable } from '../../src/charts/MostCitedChart';
import {
  OpenAccessOverTimeChart,
  OpenAccessOverTimeTable,
  openAccessMarkLabel,
} from '../../src/charts/OpenAccessOverTimeChart';
import { RankedBarCard } from '../../src/charts/RankedBarCard';
import {
  ResearchAreasOverTimeChart,
  ResearchAreasOverTimeTable,
  segmentLabel,
} from '../../src/charts/ResearchAreasOverTimeChart';
import type { Period, Topic, Work } from '../../src/contract/types';
import { expectNoAxeViolations } from '../support/axe';
import { work } from '../support/works';

const period: Period = {
  first_year: 2008,
  last_year: 2016,
  complete_through: 2015,
  current_year_partial: true,
  citation_years_from: 2012,
  citations_before_window: 458,
};

const cited = (year: number, byYear: Record<string, number>, total?: number): Work =>
  work({
    year,
    citations: {
      total: total ?? Object.values(byYear).reduce((sum, value) => sum + value, 0),
      by_year: byYear,
      fwci: null,
      percentile: null,
      as_of: '2026-09-20',
    },
  });

const topic = (field: string): Topic => ({
  domain: 'D',
  field,
  subfield: `${field} sub`,
  topic: `${field} topic`,
  score: 0.5,
  primary: true,
});

/* --- §7.3 / §7.4 citations received per year ------------------------------------------- */

describe('citations received per year (docs/05 §7.3, §7.4)', () => {
  const works = [cited(2008, { '2012': 5, '2013': 7 })];

  it('starts the axis at the window the export states, not where publications start', () => {
    const { container } = render(
      <CitationsPerYearChart works={works} period={period} width={800} height={320} />,
    );
    expect(container.querySelector('[data-testid="bar-2008"]')).toBeNull();
    expect(container.querySelector('[data-testid="bar-2012"]')).not.toBeNull();
  });

  it('names the chart as citations, not publications, so the toggle is unambiguous', () => {
    render(<CitationsPerYearChart works={works} period={period} width={800} height={320} />);
    expect(
      screen.getByRole('group', { name: /Citations received per year, 2012 to 2016/ }),
    ).toBeInTheDocument();
  });

  it('counts in citations in every mark’s accessible name', () => {
    render(<CitationsPerYearChart works={works} period={period} width={800} height={320} />);
    expect(screen.getByRole('button', { name: /^2012: 5 citations,/ })).toBeInTheDocument();
    expect(citationBarLabel({ year: 2012, count: 1, cumulative: 1, partial: false }, false)).toBe(
      '2012: 1 citation, 1 cumulative. Activate to filter by this year.',
    );
  });

  it('marks the partial year, like the publications series', () => {
    const { container } = render(
      <CitationsPerYearChart works={works} period={period} width={800} height={320} />,
    );
    expect(container.querySelector('[data-testid="bar-2016"]')?.getAttribute('data-partial')).toBe(
      'true',
    );
  });

  it('applies the year filter from a click', async () => {
    const onSelectYear = vi.fn();
    render(
      <CitationsPerYearChart
        works={works}
        period={period}
        width={800}
        height={320}
        onSelectYear={onSelectYear}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /^2013:/ }));
    expect(onSelectYear).toHaveBeenCalledWith(2013);
  });

  it('has a table carrying the same numbers', () => {
    render(<CitationsPerYearTable works={works} period={period} />);
    expect(screen.getByRole('table', { name: /Citations received per year/ })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: '2016 (partial)' })).toBeInTheDocument();
  });
});

/* --- §7.5 research areas over time ------------------------------------------------------ */

describe('research areas over time (docs/05 §7.5)', () => {
  const works = [
    work({ year: 2009, topics: [topic('Chemistry'), topic('Medicine')] }),
    work({ year: 2012, topics: [topic('Chemistry')] }),
    work({ year: 2016, topics: [topic('Medicine')] }),
  ];
  const areas = researchAreasOverTime(works, period);

  const draw = (props: Partial<Parameters<typeof ResearchAreasOverTimeChart>[0]> = {}) =>
    render(<ResearchAreasOverTimeChart areas={areas} width={800} height={340} {...props} />);

  it('labels the axis "topic assignments", not publications', () => {
    const { container } = draw();
    expect(container.textContent).toContain('Topic assignments');
  });

  it('draws one segment per field per bucket, and none for an empty cell', () => {
    const { container } = draw();
    expect(container.querySelector('[data-testid="segment-2008-2010-Chemistry"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="segment-2014-2016-Chemistry"]')).toBeNull();
  });

  it('names a segment with its field, its period and both denominators', () => {
    draw({ onSelectField: vi.fn() });
    expect(
      screen.getByRole('button', {
        name: 'Chemistry, 2008–2010: 1 topic assignment over 1 publication. Activate to filter by this field.',
      }),
    ).toBeInTheDocument();
  });

  it('says a bucket includes a partial year', () => {
    draw({ onSelectField: vi.fn() });
    expect(
      screen.getByRole('button', { name: /2014–2016, which includes a partial year/ }),
    ).toBeInTheDocument();
  });

  it('applies the field filter from a segment and from the legend', async () => {
    const onSelectField = vi.fn();
    draw({ onSelectField });
    await userEvent.click(screen.getByRole('button', { name: /^Chemistry, 2008–2010/ }));
    expect(onSelectField).toHaveBeenCalledWith('Chemistry');
    const legend = within(screen.getByRole('list', { name: 'Research fields' }));
    await userEvent.click(legend.getByRole('button', { name: /Chemistry/ }));
    expect(onSelectField).toHaveBeenCalledTimes(2);
  });

  it('never makes "Other" a filter, because it is a residue and not a value', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F'].map((field) =>
      work({ year: 2009, topics: [topic(field)] }),
    );
    const grouped = researchAreasOverTime(many, period);
    render(
      <ResearchAreasOverTimeChart
        areas={grouped}
        width={800}
        height={340}
        onSelectField={vi.fn()}
      />,
    );
    expect(screen.getByRole('img', { name: /^Other, 2008–2010/ })).toHaveAccessibleName(
      /Not a filter/,
    );
  });

  it('shows a segment as pressed when its field is selected', () => {
    draw({ onSelectField: vi.fn(), selectedFields: ['Chemistry'] });
    expect(screen.getByRole('button', { name: /^Chemistry, 2008–2010/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('has a table with one column per field and the totals beside them', () => {
    render(<ResearchAreasOverTimeTable areas={areas} />);
    const table = screen.getByRole('table', { name: /Topic assignments by research field/ });
    expect(within(table).getByRole('columnheader', { name: 'Chemistry' })).toBeInTheDocument();
    expect(
      within(table).getByRole('columnheader', { name: 'Topic assignments' }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('rowheader', { name: '2014–2016 (includes a partial year)' }),
    ).toBeInTheDocument();
  });

  it('builds the same sentence the tooltip shows', () => {
    const bucket = areas.buckets[0];
    expect(bucket).toBeDefined();
    expect(segmentLabel(bucket!, 'Chemistry', 2, false, false)).toContain('2 topic assignments');
  });

  it('passes axe', async () => {
    const { container } = draw({ onSelectField: vi.fn() });
    await expectNoAxeViolations(container);
  });
});

/* --- §7.11 citation distribution -------------------------------------------------------- */

describe('citation distribution (docs/05 §7.11)', () => {
  const works = [cited(2010, {}, 0), cited(2010, {}, 0), cited(2010, {}, 5), cited(2010, {}, 900)];

  it('gives works with no citations their own bucket, drawn apart from the log bands', () => {
    const { container } = render(
      <CitationDistributionChart works={works} width={800} height={280} />,
    );
    const zero = container.querySelector('[data-testid="bucket-zero"]');
    expect(zero?.getAttribute('data-zero')).toBe('true');
    expect(zero?.getAttribute('fill')).toBe('var(--chart-other)');
    expect(
      container.querySelector('[data-testid="bucket-band-1"]')?.getAttribute('data-zero'),
    ).toBe('false');
  });

  it('says the axis is logarithmic, in the chart’s accessible name', () => {
    render(<CitationDistributionChart works={works} width={800} height={280} />);
    expect(
      screen.getByRole('group', {
        name: /logarithmic bands.*no citations in a bucket of their own/,
      }),
    ).toBeInTheDocument();
  });

  it('names each bar with its range and its count, and is not a control', () => {
    render(<CitationDistributionChart works={works} width={800} height={280} />);
    expect(
      screen.getByRole('img', { name: 'no citations yet: 2 publications.' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(bucketLabel({ key: 'k', label: '3–9', min: 3, max: 9, count: 1, zero: false })).toBe(
      '3 to 9 citations: 1 publication.',
    );
    expect(bucketLabel({ key: 'k', label: '10+', min: 10, max: null, count: 4, zero: false })).toBe(
      '10 citations or more: 4 publications.',
    );
  });

  it('has a table that names the zero bucket for what it is', () => {
    render(<CitationDistributionTable works={works} />);
    expect(screen.getByRole('rowheader', { name: '0 (no citations yet)' })).toBeInTheDocument();
  });

  it('passes axe', async () => {
    const { container } = render(
      <CitationDistributionChart works={works} width={800} height={280} />,
    );
    await expectNoAxeViolations(container);
  });
});

/* --- §7.12 open access over time -------------------------------------------------------- */

describe('open access over time (docs/05 §7.12)', () => {
  const works = [
    work({ year: 2010, oa: { status: 'gold', url: null, license: null } }),
    work({ year: 2010, oa: { status: 'closed', url: null, license: null } }),
    work({ year: 2016, oa: { status: 'green', url: null, license: null } }),
  ];

  it('formats the share axis as a share, not as a count', () => {
    const { container } = render(
      <OpenAccessOverTimeChart works={works} period={period} width={800} height={320} />,
    );
    // An integer formatter would render a 0–1 axis as a column of zeros and ones.
    const right = container.querySelector('.visx-axis-right');
    expect(right?.textContent).toContain('%');
  });

  it('marks the partial year over the stack, and says so in words (docs/05 §4.2)', () => {
    const { container } = render(
      <OpenAccessOverTimeChart works={works} period={period} width={800} height={320} />,
    );
    expect(container.querySelector('[data-testid="partial-2016"]')?.getAttribute('fill')).toMatch(
      /^url\(#/,
    );
    expect(container.querySelector('[data-testid="partial-2015"]')).toBeNull();
    expect(container.textContent).toContain('2016 is partial');
  });

  it('draws the counts as well as the share, which is the measured constraint', () => {
    const { container } = render(
      <OpenAccessOverTimeChart works={works} period={period} width={800} height={320} />,
    );
    expect(container.querySelector('[data-testid="open-2010"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="closed-2010"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="share-line"]')).not.toBeNull();
  });

  it('gives the share with both counts in every mark’s accessible name', () => {
    render(<OpenAccessOverTimeChart works={works} period={period} width={800} height={320} />);
    expect(
      screen.getByRole('button', {
        name: '2010: 50% open access — 1 of 2 publications, 1 closed. Activate to filter by this year.',
      }),
    ).toBeInTheDocument();
  });

  it('says a year with no publications has no share, rather than a share of zero', () => {
    render(<OpenAccessOverTimeChart works={works} period={period} width={800} height={320} />);
    expect(
      screen.getByRole('button', { name: /^2011: no publications, so no share/ }),
    ).toBeInTheDocument();
    expect(
      openAccessMarkLabel(
        { year: 2011, open: 0, closed: 0, total: 0, share: null, partial: false },
        false,
      ),
    ).toContain('no publications, so no share');
  });

  it('applies the year filter from a click', async () => {
    const onSelectYear = vi.fn();
    render(
      <OpenAccessOverTimeChart
        works={works}
        period={period}
        width={800}
        height={320}
        onSelectYear={onSelectYear}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /^2010:/ }));
    expect(onSelectYear).toHaveBeenCalledWith(2010);
  });

  it('has a table with the counts, the total and the share', () => {
    render(<OpenAccessOverTimeTable works={works} period={period} />);
    const table = screen.getByRole('table', { name: /Open-access publications per year/ });
    expect(within(table).getByRole('columnheader', { name: 'Open access' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Share' })).toBeInTheDocument();
  });

  it('passes axe', async () => {
    const { container } = render(
      <OpenAccessOverTimeChart works={works} period={period} width={800} height={320} />,
    );
    await expectNoAxeViolations(container);
  });
});

/* --- §7.10 most cited ------------------------------------------------------------------- */

describe('most cited publications (docs/05 §7.10)', () => {
  const works = [cited(2020, {}, 100), cited(2021, {}, 5)];

  it('is a ranked list whose every row links to its detail', () => {
    render(<MostCitedList works={works} href={(item) => `/publication/${item.id}`} />);
    const list = screen.getByRole('list', { name: /Most cited publications/ });
    const links = within(list).getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]?.getAttribute('href')).toMatch(/^\/publication\/W-/);
  });

  it('opens a publication in the app rather than reloading the page', async () => {
    const onOpen = vi.fn();
    render(
      <MostCitedList works={works} href={(item) => `/publication/${item.id}`} onOpen={onOpen} />,
    );
    await userEvent.click(within(screen.getByRole('list')).getAllByRole('link')[0] as HTMLElement);
    expect(onOpen).toHaveBeenCalled();
  });

  it('states the citation count as text, not only as a bar', () => {
    const { container } = render(
      <MostCitedList works={works} href={(item) => `/publication/${item.id}`} />,
    );
    expect(container.textContent).toContain('100');
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('100 citations');
  });

  it('has a table alternative', () => {
    render(<MostCitedTable works={works} />);
    expect(screen.getByRole('table', { name: /most cited publications/i })).toBeInTheDocument();
  });

  it('passes axe', async () => {
    const { container } = render(
      <MostCitedList works={works} href={(item) => `/publication/${item.id}`} />,
    );
    await expectNoAxeViolations(container);
  });
});

/* --- the kit pieces the charts above share ----------------------------------------------- */

describe('the legend (docs/06 §8)', () => {
  it('names every series in text beside its swatch', () => {
    render(
      <ChartLegend
        label="Research fields"
        entries={[{ key: 'a', label: 'Chemistry', colour: 'var(--chart-1)', value: '12' }]}
      />,
    );
    const list = screen.getByRole('list', { name: 'Research fields' });
    expect(within(list).getByText('Chemistry')).toBeInTheDocument();
    expect(within(list).getByText('12')).toBeInTheDocument();
  });

  it('is a set of buttons when it can filter, and plain text when it cannot', async () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <ChartLegend
        label="Fields"
        entries={[{ key: 'a', label: 'Chemistry', colour: 'var(--chart-1)' }]}
        onSelect={onSelect}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Chemistry/ }));
    expect(onSelect).toHaveBeenCalled();
    rerender(
      <ChartLegend
        label="Fields"
        entries={[{ key: 'a', label: 'Chemistry', colour: 'var(--chart-1)' }]}
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says a selected series is selected', () => {
    render(
      <ChartLegend
        label="Fields"
        entries={[{ key: 'a', label: 'Chemistry', colour: 'var(--chart-1)', selected: true }]}
        onSelect={vi.fn()}
      />,
    );
    const button = screen.getByRole('button', { name: /Chemistry/ });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAccessibleName(/Selected/);
  });
});

describe('the ranked bar card (the frame six charts share)', () => {
  it('carries the heading, the description, the note, the controls and the table', async () => {
    render(
      <RankedBarCard
        title="Institutions"
        description="Institutions on the publications shown."
        note="The University of Washington is excluded."
        rows={[{ key: 'a', label: 'ISB', value: 26 }]}
        unit={{ one: 'publication', many: 'publications' }}
        valueAxisLabel="Publications"
        categoryHeader="Institution"
        tableCaption="Institutions by number of publications."
        controls={<button type="button">A control</button>}
      />,
    );
    const card = screen.getByRole('region', { name: 'Institutions' });
    expect(card).toHaveAccessibleDescription('Institutions on the publications shown.');
    expect(screen.getByText('The University of Washington is excluded.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'A control' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'View as table' }));
    expect(
      screen.getByRole('table', { name: 'Institutions by number of publications.' }),
    ).toBeInTheDocument();
  });

  it('shows the empty state in place of the chart when nothing matches', () => {
    render(
      <RankedBarCard
        title="Institutions"
        description="d"
        rows={[]}
        unit={{ one: 'publication', many: 'publications' }}
        valueAxisLabel="Publications"
        categoryHeader="Institution"
        tableCaption="c"
        empty={<p>nothing matches</p>}
      />,
    );
    expect(screen.getByText('nothing matches')).toBeInTheDocument();
  });
});
