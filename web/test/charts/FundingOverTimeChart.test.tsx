/**
 * The Funding impact view's over-time charts (docs/09 §12.5 items 3 and 4), over the small
 * funding world of `test/support/fundingWorld.ts`, where every year can be worked out on paper:
 *
 * | year | first listed                          | known      | unknown |
 * |------|---------------------------------------|------------|---------|
 * | 2019 | R01 (and an unmatched number)          | $1,000,000 | 0       |
 * | 2020 | nothing                               | —          | 0       |
 * | 2021 | P01, GRFP                             | $6,500,000 | 0       |
 * | 2022 | NSF project, foreign                  | $750,000   | 1       |
 * | 2023 | nothing (partial)                     | —          | 0       |
 *
 * What is pinned: the year bars are static; an unknown amount never reads as $0; a year or a
 * cell with nothing known is a dash; agencies are filters and "Other" is not.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  cumulativeDollars,
  newGrantsByAgency,
  valueByAgency,
  type FundingYearPoint,
} from '../../src/aggregate/funding';
import type { YearStack } from '../../src/aggregate/stack';
import {
  AgencyStackChart,
  AgencyStackTable,
  FundingOverTimeChart,
  FundingOverTimeTable,
  OTHER_AGENCIES_REASON,
  agencySeries,
  describeYear,
  yearValueCell,
} from '../../src/charts/FundingOverTimeChart';
import { otherColour, seriesColour } from '../../src/charts/palette';
import type { Period } from '../../src/contract/types';
import { expectNoAxeViolations } from '../support/axe';
import { worldScope } from '../support/fundingWorld';

const period: Period = {
  first_year: 2019,
  last_year: 2023,
  complete_through: 2022,
  current_year_partial: true,
  citation_years_from: null,
  citations_before_window: 0,
};

const over = cumulativeDollars(worldScope(), period);
const point = (year: number): FundingYearPoint =>
  over.points.find((entry) => entry.year === year) as FundingYearPoint;

const unknownOnly = (grants: number): FundingYearPoint => ({
  year: 2024,
  count: 0,
  cumulative: 0,
  partial: false,
  grants,
  withAmount: 0,
  withoutAmount: grants,
});

describe('a year in words and in a cell', () => {
  it('says what entered, from how many grants, and how many have no known amount', () => {
    expect(describeYear(point(2019))).toBe('$1,000,000 from 1 grant first listed');
    expect(describeYear(point(2020))).toBe('no grant first listed');
    expect(describeYear(point(2021))).toBe('$6,500,000 from 2 grants first listed');
    expect(describeYear(point(2022))).toBe(
      '$750,000 from 1 grant first listed and 1 more with no known amount',
    );
  });

  it('never gives a year of unknown amounts a figure', () => {
    expect(describeYear(unknownOnly(1))).toBe('1 grant first listed, with no known amount');
    expect(describeYear(unknownOnly(3))).toBe('3 grants first listed, none with a known amount');
    expect(yearValueCell(unknownOnly(3))).toBe('not known');
  });

  it('is a dash with nothing entering, and exact otherwise', () => {
    expect(yearValueCell(point(2020))).toBe('—');
    expect(yearValueCell(point(2022))).toBe('$750,000');
  });
});

describe('the Total view', () => {
  const draw = () => render(<FundingOverTimeChart over={over} width={800} height={320} />);

  it('draws static bars, one per year, named in words', () => {
    draw();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: '2022: $750,000 from 1 grant first listed and 1 more with no known amount, $8,250,000 cumulative.',
      }),
    ).not.toHaveAttribute('tabindex');
    expect(
      screen.getByRole('img', {
        name: '2023, a partial year: no grant first listed, $8,250,000 cumulative.',
      }),
    ).toBeInTheDocument();
  });

  it('counts the grants and the unknowns in the tooltip', async () => {
    draw();
    await userEvent.hover(screen.getByRole('img', { name: /^2022:/ }));
    const tooltip = screen.getByTestId('chart-tooltip');
    expect(tooltip).toHaveTextContent('Value first listed$750,000');
    expect(tooltip).toHaveTextContent('Grants first listed2');
    expect(tooltip).toHaveTextContent('With no known amount1');
    await userEvent.hover(screen.getByRole('img', { name: /^2021:/ }));
    expect(screen.getByTestId('chart-tooltip')).not.toHaveTextContent('With no known amount');
  });

  it('rounds only the axes', () => {
    const { container } = draw();
    expect(container.querySelector('.visx-axis-left')?.textContent).toMatch(/\$\d+(\.\d+)?M/);
  });

  it('has a table with the unknowns beside each year, and dashes for nothing', () => {
    render(<FundingOverTimeTable over={over} />);
    const table = screen.getByRole('table', { name: /first listed in each year/ });
    const row = (year: string) =>
      within(within(table).getByRole('rowheader', { name: year }).closest('tr') as HTMLElement);
    expect(
      row('2022')
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['$750,000', '$8,250,000', '2', '1']);
    expect(row('2020').getAllByRole('cell')[0]).toHaveTextContent('—');
    expect(row('2023 (partial)').getAllByRole('cell')[0]).toHaveTextContent('—');
  });

  it('passes axe', async () => {
    const { container } = draw();
    await expectNoAxeViolations(container);
  });
});

/**
 * The running total before any known amount has entered (W10): the years before hold nothing
 * known, which is not "$0". The world's grants under a filter that starts the frame in 2018 and
 * leaves 2019's R01 an unknown amount, so 2018 enters nothing and 2019 enters only an unknown.
 */
describe('the running total before a known amount enters', () => {
  const early: Period = { ...period, first_year: 2018 };
  const scope = worldScope();
  const unknownFirst = {
    ...scope,
    grants: scope.grants.map((entry) =>
      entry.firstYear === 2019
        ? { ...entry, grant: { ...entry.grant, amount_usd: null, amount_original: null } }
        : entry,
    ),
  };
  const before = cumulativeDollars(unknownFirst, early);

  it('names those years "no known amount yet", never "$0 cumulative"', () => {
    const { container } = render(<FundingOverTimeChart over={before} width={800} height={320} />);
    expect(
      screen.getByRole('img', {
        name: '2018: no grant first listed, no known amount yet in the running total.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: '2019: 1 grant first listed, with no known amount, no known amount yet in the running total.',
      }),
    ).toBeInTheDocument();
    // Once an amount is known, the running total is the sum, as any running total is.
    expect(
      screen.getByRole('img', {
        name: /^2021: \$6,500,000 from 2 grants first listed, \$6,500,000 cumulative\.$/,
      }),
    ).toBeInTheDocument();
    for (const bar of screen.getAllByRole('img', { name: /^\d{4}/ })) {
      expect(bar.getAttribute('aria-label')).not.toMatch(/\$0 cumulative/);
    }
    expect(container.textContent).not.toMatch(/\$0 cumulative/);
  });

  it('says the same in its tooltip and its table: a dash, never "$0"', async () => {
    render(<FundingOverTimeChart over={before} width={800} height={320} />);
    await userEvent.hover(screen.getByRole('img', { name: /^2019:/ }));
    const tooltip = screen.getByTestId('chart-tooltip');
    expect(tooltip).toHaveTextContent('Value first listednot known');
    expect(tooltip).toHaveTextContent('Cumulative—');
    expect(tooltip.textContent).not.toMatch(/\$0(?![\d.,])/);

    render(<FundingOverTimeTable over={before} />);
    const table = screen.getByRole('table', {
      name: /A dash is no known amount, which is not \$0/,
    });
    const row = within(
      within(table).getByRole('rowheader', { name: '2019' }).closest('tr') as HTMLElement,
    );
    expect(row.getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      'not known',
      '—',
      '1',
      '1',
    ]);
  });
});

/** A stack with every role, to see the colours and which series are filters. */
const stack: YearStack = {
  series: [
    { key: 'NIH', label: 'NIH', role: 'ranked', total: 3, members: ['NIH'] },
    { key: 'NSF', label: 'NSF', role: 'ranked', total: 2, members: ['NSF'] },
    { key: 'MISC', label: 'Miscellaneous', role: 'pinned', total: 1, members: ['MISC'] },
    { key: 'Other', label: 'Other', role: 'other', total: 1, members: ['A', 'B'] },
  ],
  buckets: [
    {
      key: '2019-2021',
      label: '2019–2021',
      startYear: 2019,
      endYear: 2021,
      partial: false,
      values: [2, 2, 1, 0],
      total: 5,
    },
    {
      key: '2022-2023',
      label: '2022–2023',
      startYear: 2022,
      endYear: 2023,
      partial: true,
      values: [1, 0, 0, 1],
      total: 2,
    },
  ],
  bucketYears: 3,
  total: 7,
};

describe('the agency stacks', () => {
  it('colours ranked agencies in order, Miscellaneous in the sixth colour, "Other" grey', () => {
    expect(agencySeries(stack).map(({ colour, selectable }) => [colour, selectable])).toEqual([
      [seriesColour(0), true],
      [seriesColour(1), true],
      [seriesColour(5), true],
      [otherColour(), false],
    ]);
    expect(agencySeries(stack)[3]?.notSelectableReason).toBe(OTHER_AGENCIES_REASON);
  });

  it('applies an agency, Miscellaneous included, from a segment and the legend; never "Other"', async () => {
    const onSelectAgency = vi.fn();
    render(
      <AgencyStackChart
        stack={stack}
        measure="grants"
        width={800}
        height={340}
        selectedAgencies={['NSF']}
        onSelectAgency={onSelectAgency}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Miscellaneous, 2019–2021: 1 grant first listed. Activate to filter by this agency.',
      }),
    );
    expect(onSelectAgency).toHaveBeenLastCalledWith('MISC');
    expect(screen.getByRole('button', { name: /^NSF, 2019–2021/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('img', {
        name: `Other, 2022–2023, which includes a partial year: 1 grant first listed. ${OTHER_AGENCIES_REASON}`,
      }),
    ).toBeInTheDocument();
    const legend = within(screen.getByRole('list', { name: 'Agencies' }));
    expect(legend.getAllByRole('button')).toHaveLength(3);
    expect(legend.getByText('Other').closest('button')).toBeNull();
    expect(
      screen.getByRole('group', { name: /New grants by agency over time, in 3-year periods/ }),
    );
  });

  it('is static without a handler', () => {
    render(<AgencyStackChart stack={stack} measure="grants" width={800} height={340} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('draws the world’s value by agency with rounded axes and exact names', () => {
    const values = valueByAgency(worldScope(), period);
    const { container } = render(
      <AgencyStackChart
        stack={values}
        measure="value"
        width={800}
        height={340}
        onSelectAgency={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', {
        name: 'NSF, 2021: $4,000,000 first listed. Activate to filter by this agency.',
      }),
    ).toBeInTheDocument();
    expect(container.querySelector('.visx-axis-left')?.textContent).toMatch(/\$\d(\.\d+)?M/);
    expect(screen.getByRole('group', { name: /Grant funding by agency over time, by year/ }));
  });

  it('shows a cell with no known value as a dash in the value table, never $0', () => {
    const values = valueByAgency(worldScope(), period);
    render(<AgencyStackTable stack={values} measure="value" />);
    const table = screen.getByRole('table', { name: /A dash is no known amount/ });
    const row = within(
      within(table).getByRole('rowheader', { name: '2020' }).closest('tr') as HTMLElement,
    );
    for (const cell of row.getAllByRole('cell')) expect(cell).toHaveTextContent('—');
    expect(within(table).queryByRole('cell', { name: '$0' })).not.toBeInTheDocument();
  });

  it('counts grants in the grants table, Miscellaneous its own column', () => {
    const grants = newGrantsByAgency(worldScope(), period);
    render(<AgencyStackTable stack={grants} measure="grants" />);
    const table = screen.getByRole('table', { name: /New grants by agency and period/ });
    expect(within(table).getByRole('columnheader', { name: 'Miscellaneous' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'All grants' })).toBeInTheDocument();
  });

  it('passes axe', async () => {
    const { container } = render(
      <AgencyStackChart
        stack={stack}
        measure="grants"
        width={800}
        height={340}
        onSelectAgency={vi.fn()}
      />,
    );
    await expectNoAxeViolations(container);
  });
});
