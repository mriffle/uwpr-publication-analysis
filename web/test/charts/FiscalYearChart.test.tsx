/**
 * The grant page's amount by fiscal year (docs/09 §12.7), and the four `YearSeriesChart` options
 * it needed: an axis title, a partial-period noun, no running total, and a tooltip value in
 * words. Each option's default leaves every chart already drawn as it was, which the existing
 * chart tests hold; these hold the options themselves.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FiscalYearPoint } from '../../src/aggregate/funding';
import type { YearPoint } from '../../src/aggregate/series';
import {
  FISCAL_YEAR_LABEL,
  FiscalYearChart,
  FiscalYearTable,
  describeFiscalYear,
} from '../../src/charts/FiscalYearChart';
import { YearSeriesChart, yearMarkLabel } from '../../src/charts/YearSeriesChart';
import { expectNoAxeViolations } from '../support/axe';

const YEARS: FiscalYearPoint[] = [
  { year: 2023, amountUsd: null, partial: false },
  { year: 2024, amountUsd: 400_000, partial: false },
  { year: 2025, amountUsd: 300_000, partial: false },
  { year: 2026, amountUsd: 200_000, partial: true },
];

const draw = () =>
  render(<FiscalYearChart years={YEARS} width={640} height={280} sourceName="NIH RePORTER" />);

describe('the grant’s amount by fiscal year', () => {
  it('names each year by its amount, a missing one in words and the partial one as so far', () => {
    expect(YEARS.map((year) => describeFiscalYear(year))).toEqual([
      'no amount reported',
      '$400,000 awarded',
      '$300,000 awarded',
      '$200,000 awarded so far',
    ]);
    draw();
    expect(screen.getByRole('img', { name: '2023: no amount reported.' })).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: '2026, a partial year: $200,000 awarded so far.' }),
    ).toBeInTheDocument();
  });

  it('is static, titled for fiscal years, with no running total', () => {
    const { container } = draw();
    expect(
      screen.getByRole('group', {
        name: 'The grant’s amount by fiscal year, as NIH RePORTER records it',
      }),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(container).toHaveTextContent(FISCAL_YEAR_LABEL);
    expect(screen.queryByTestId('cumulative-line')).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent('Cumulative');
    expect(container).toHaveTextContent(
      '2026 is partial: the fiscal year is not over, so the bar is hatched and will grow.',
    );
  });

  it('hatches the partial year and draws no bar for the missing one', () => {
    draw();
    expect(screen.getByTestId('bar-2026')).toHaveAttribute('data-partial', 'true');
    expect(screen.getByTestId('bar-2023')).toHaveAttribute('height', '0');
  });

  it('says a missing year’s amount in words in its tooltip, never $0', async () => {
    draw();
    await userEvent.hover(screen.getByRole('img', { name: '2023: no amount reported.' }));
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent(
      'Awarded in the fiscal yearno amount reported',
    );
    await userEvent.hover(screen.getByRole('img', { name: /^2026/ }));
    const tooltip = screen.getByTestId('chart-tooltip');
    expect(tooltip).toHaveTextContent('2026 (partial fiscal year)');
    expect(tooltip).toHaveTextContent('$200,000');
    expect(tooltip).not.toHaveTextContent('Cumulative');
  });

  it('has a table of the same years', () => {
    render(<FiscalYearTable years={YEARS} sourceName="NIH RePORTER" />);
    const table = screen.getByRole('table', { name: /as NIH RePORTER records it/ });
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual(['2023no amount reported', '2024$400,000', '2025$300,000', '2026 (partial)$200,000']);
  });

  it('thins the year labels of a long grant so that they do not collide', () => {
    const long: FiscalYearPoint[] = Array.from({ length: 41 }, (_, at) => ({
      year: 1986 + at,
      amountUsd: 1_000_000,
      partial: false,
    }));
    const { container } = render(
      <FiscalYearChart years={long} width={960} height={280} sourceName="NIH RePORTER" />,
    );
    const labels = container.querySelectorAll('.visx-axis-bottom .visx-axis-tick');
    // 41 bars in 824 pixels: every second year is labelled, the first among them.
    expect(labels).toHaveLength(21);
    expect(labels[0]).toHaveTextContent('1986');
    // Each bar still names its own year.
    expect(screen.getAllByRole('img', { name: /^\d{4}: \$1,000,000 awarded\.$/ })).toHaveLength(41);
  });

  it('passes axe', async () => {
    const { container } = draw();
    await expectNoAxeViolations(container);
  });
});

/**
 * The years the totals count (docs/09 F17), marked where a reader reads the years: a column of the
 * table, with a sentence in its caption, and each bar's description and tooltip. The bars are
 * drawn alike, so the picture itself is unchanged.
 */
describe('the fiscal years counted in the totals', () => {
  const COUNTED = new Set([2024, 2025]);

  it('says in each year’s sentence whether it is counted', () => {
    expect(YEARS.map((year) => describeFiscalYear(year, COUNTED))).toEqual([
      'no amount reported, not counted in the totals',
      '$400,000 awarded, counted in the totals',
      '$300,000 awarded, counted in the totals',
      '$200,000 awarded so far, not counted in the totals',
    ]);
  });

  it('names each bar so, and adds the tooltip row, leaving the bars alike', async () => {
    render(
      <FiscalYearChart
        years={YEARS}
        width={640}
        height={280}
        sourceName="NIH RePORTER"
        counted={COUNTED}
      />,
    );
    expect(
      screen.getByRole('img', { name: '2024: $400,000 awarded, counted in the totals.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: '2026, a partial year: $200,000 awarded so far, not counted in the totals.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('bar-2024').getAttribute('fill')).toBe(
      screen.getByTestId('bar-2025').getAttribute('fill'),
    );
    await userEvent.hover(screen.getByRole('img', { name: /^2024:/ }));
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('In the totalsCounted');
    await userEvent.hover(screen.getByRole('img', { name: /^2023:/ }));
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('In the totalsNot counted');
  });

  it('marks each row of the table, and says so in its caption', () => {
    render(<FiscalYearTable years={YEARS} sourceName="NIH RePORTER" counted={COUNTED} />);
    const table = screen.getByRole('table', {
      name: /The years counted in the totals are marked: the site’s totals count only those\.$/,
    });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Fiscal year', 'Awarded', 'In the totals']);
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual([
      '2023no amount reportedNot counted',
      '2024$400,000Counted',
      '2025$300,000Counted',
      '2026 (partial)$200,000Not counted',
    ]);
  });

  it('adds nothing when it is not told which years are counted', () => {
    render(<FiscalYearTable years={YEARS} sourceName="NIH RePORTER" />);
    expect(screen.queryByRole('columnheader', { name: 'In the totals' })).toBeNull();
    expect(screen.getByRole('table')).not.toHaveAccessibleName(/counted in the totals/);
  });

  it('passes axe, marked', async () => {
    const { container } = render(
      <>
        <FiscalYearChart
          years={YEARS}
          width={640}
          height={280}
          sourceName="NIH RePORTER"
          counted={COUNTED}
        />
        <FiscalYearTable years={YEARS} sourceName="NIH RePORTER" counted={COUNTED} />
      </>,
    );
    await expectNoAxeViolations(container);
  });
});

describe('the year chart’s options keep their defaults', () => {
  const point: YearPoint = { year: 2020, count: 3, cumulative: 7, partial: false };

  it('names the running total unless told there is none', () => {
    expect(
      yearMarkLabel(point, false, { one: 'grant', many: 'grants' }, { selectable: false }),
    ).toBe('2020: 3 grants, 7 cumulative.');
    expect(
      yearMarkLabel(
        point,
        false,
        { one: 'grant', many: 'grants' },
        { selectable: false, cumulative: false },
      ),
    ).toBe('2020: 3 grants.');
  });

  it('titles the axis "Year" and a partial point a partial year by default', async () => {
    const { container } = render(
      <YearSeriesChart
        points={[point, { year: 2021, count: 1, cumulative: 8, partial: true }]}
        width={640}
        height={280}
        label="A series"
        unit={{ one: 'grant', many: 'grants' }}
        valueAxisLabel="Grants"
      />,
    );
    expect(within(container).getByText('Year', { selector: 'text' })).toBeInTheDocument();
    expect(screen.getByTestId('cumulative-line')).toBeInTheDocument();
    await userEvent.hover(screen.getByRole('img', { name: /^2021/ }));
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('2021 (partial year)');
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('Grants1');
  });
});
