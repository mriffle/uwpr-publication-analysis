/**
 * The Funding impact view's over-time charts (docs/09 §12.5 items 3 and 4), over the small
 * funding world of `test/support/fundingWorld.ts`, where every year can be worked out on paper.
 *
 * Counted funding by the year awarded (F17), the view's chart, from 2006 whatever the filter:
 *
 * | year      | awarded, counted                                     | grants | cumulative |
 * |-----------|------------------------------------------------------|--------|------------|
 * | 2006–2018 | nothing                                              | 0      | —          |
 * | 2019      | R01 $500,000, FOREIGN $150,000 = $650,000             | 2      | $650,000   |
 * | 2020      | R01 $500,000, P01 $1,000,000, GRFP $2,000,000,        | 4      | $4,300,000 |
 * |           | FOREIGN $150,000 = $3,650,000                         |        |            |
 * | 2021      | P01 $1,500,000, GRFP $2,000,000, FOREIGN $150,000     | 3      | $7,950,000 |
 * | 2022      | FOREIGN $150,000 (listed 2022: its 2023 is not counted) | 1      | $8,100,000 |
 * | 2023      | nothing (partial)                                    | 0      | $8,100,000 |
 *
 * What is pinned: the year bars are static; an unknown amount never reads as $0; a year or a
 * cell with nothing awarded is a dash; agencies are filters and "Other" is not.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  UNFILTERED,
  countedByAgency,
  countedOverTime,
  fundingScope,
  newGrantsByAgency,
  type CountedYearPoint,
} from '../../src/aggregate/funding';
import type { YearStack } from '../../src/aggregate/stack';
import {
  AgencyStackChart,
  AgencyStackTable,
  CountedOverTimeChart,
  CountedOverTimeTable,
  OTHER_AGENCIES_REASON,
  agencySeries,
  awardYearCell,
  describeAwardYear,
} from '../../src/charts/FundingOverTimeChart';
import { otherColour, seriesColour } from '../../src/charts/palette';
import type { Period } from '../../src/contract/types';
import { expectNoAxeViolations } from '../support/axe';
import { counting } from '../support/funding';
import { worldIndex, worldScope, worldWorks } from '../support/fundingWorld';

const period: Period = {
  first_year: 2019,
  last_year: 2023,
  complete_through: 2022,
  current_year_partial: true,
  citation_years_from: null,
  citations_before_window: 0,
};

const counted = countedOverTime(worldScope(), period, counting());
const awarded = (year: number): CountedYearPoint =>
  counted.points.find((entry) => entry.year === year) as CountedYearPoint;

describe('counted funding by the year awarded (F17)', () => {
  it('says what was awarded each year, from how many grants, and a dash for none', () => {
    expect(describeAwardYear(awarded(2019))).toBe('$650,000 awarded, from 2 grants');
    expect(describeAwardYear(awarded(2022))).toBe('$150,000 awarded, from 1 grant');
    expect(describeAwardYear(awarded(2023))).toBe('no counted funding awarded');
    expect(awardYearCell(awarded(2020))).toBe('$3,650,000');
    expect(awardYearCell(awarded(2010))).toBe('—');
  });

  it('starts at 2006, before the first publication, and ends at the counted total', () => {
    expect(counted.points[0]?.year).toBe(2006);
    expect(counted.points.at(-1)).toMatchObject({ year: 2023, cumulative: 8_100_000 });
    expect(counted.countedUsd).toBe(8_100_000);
  });

  it('starts at 2006 under a filter too', () => {
    const index = worldIndex();
    const [, , w2022] = worldWorks(index);
    const filtered = countedOverTime(fundingScope([w2022!], index, UNFILTERED), period, counting());
    expect(filtered.points[0]?.year).toBe(2006);
    // Shown only 2022, FOREIGN counts its spread to 2022: $600,000.
    expect(filtered.countedUsd).toBe(600_000);
  });

  const draw = () => render(<CountedOverTimeChart over={counted} width={800} height={320} />);

  it('draws static bars named in words, never "$0" for a year or a running total', () => {
    const { container } = draw();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: '2022: $150,000 awarded, from 1 grant, $8,100,000 cumulative.',
      }),
    ).not.toHaveAttribute('tabindex');
    expect(
      screen.getByRole('img', {
        name: '2023, a partial year: no counted funding awarded, $8,100,000 cumulative.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: '2006: no counted funding awarded, nothing counted yet.' }),
    ).toBeInTheDocument();
    for (const bar of screen.getAllByRole('img', { name: /^\d{4}/ })) {
      expect(bar.getAttribute('aria-label')).not.toMatch(/\$0(?![\d,])/);
    }
    expect(container.querySelector('.visx-axis-left')?.textContent).toMatch(/\$\d+(\.\d+)?M/);
  });

  it('names the grants contributing in the tooltip, and a dash for a year with none', async () => {
    draw();
    await userEvent.hover(screen.getByRole('img', { name: /^2020:/ }));
    const tooltip = screen.getByTestId('chart-tooltip');
    expect(tooltip).toHaveTextContent('Awarded in the year$3,650,000');
    expect(tooltip).toHaveTextContent('Cumulative$4,300,000');
    expect(tooltip).toHaveTextContent('Grants contributing4');
    await userEvent.hover(screen.getByRole('img', { name: /^2006:/ }));
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('Awarded in the year—');
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('Cumulative—');
  });

  it('has a table of the award years, the running total and the grants contributing', () => {
    render(<CountedOverTimeTable over={counted} />);
    const table = screen.getByRole('table', { name: /by the year it was awarded/ });
    const row = (year: string) =>
      within(within(table).getByRole('rowheader', { name: year }).closest('tr') as HTMLElement)
        .getAllByRole('cell')
        .map((cell) => cell.textContent);
    expect(row('2021')).toEqual(['$3,650,000', '$7,950,000', '3']);
    expect(row('2006')).toEqual(['—', '—', '0']);
    expect(row('2023 (partial)')).toEqual(['—', '$8,100,000', '0']);
  });

  it('passes axe', async () => {
    const { container } = draw();
    await expectNoAxeViolations(container);
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

  it('draws the world’s counted funding by agency and year awarded, from 2006', () => {
    const values = countedByAgency(worldScope(), period, counting());
    expect(values.buckets[0]?.startYear).toBe(2006);
    const { container } = render(
      <AgencyStackChart
        stack={values}
        measure="value"
        width={800}
        height={340}
        onSelectAgency={vi.fn()}
      />,
    );
    // GRFP's FY2020, NSF's only amount that year.
    expect(
      screen.getByRole('button', {
        name: 'NSF, 2020: $2,000,000 awarded. Activate to filter by this agency.',
      }),
    ).toBeInTheDocument();
    expect(container.querySelector('.visx-axis-left')?.textContent).toMatch(/\$\d(\.\d+)?M/);
    expect(
      screen.getByRole('group', { name: /^Grant funding counted, by agency and the year awarded/ }),
    ).toBeInTheDocument();
  });

  it('shows a year with nothing awarded as a dash in the value table, never $0', () => {
    const values = countedByAgency(worldScope(), period, counting());
    render(<AgencyStackTable stack={values} measure="value" />);
    const table = screen.getByRole('table', {
      name: /by agency and the year it was awarded\. A dash is none awarded then/,
    });
    const row = within(
      within(table).getByRole('rowheader', { name: '2006' }).closest('tr') as HTMLElement,
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
