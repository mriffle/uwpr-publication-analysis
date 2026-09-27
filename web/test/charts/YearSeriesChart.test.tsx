/**
 * The year-series frame's two new modes: static, for a year axis that is not the publication
 * year, and values other than counts, such as dollars (docs/06 §7: exact values in the
 * accessible name, the tooltip and the table; only the axes may round).
 *
 * The default mode is pinned by PublicationsPerYearChart.test.tsx and charts.test.tsx, which
 * this change leaves untouched.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { YearPoint } from '../../src/aggregate/series';
import {
  YearSeriesChart,
  YearSeriesTable,
  ignoreYear,
  yearMarkLabel,
} from '../../src/charts/YearSeriesChart';
import { formatUsd, formatUsdCompact } from '../../src/format/number';
import { expectNoAxeViolations } from '../support/axe';

const points: YearPoint[] = [
  { year: 2019, count: 1_200_000, cumulative: 1_200_000, partial: false },
  { year: 2020, count: 0, cumulative: 1_200_000, partial: false },
  { year: 2021, count: 6_219_845_123, cumulative: 6_221_045_123, partial: true },
];

const dollars = {
  formatValue: formatUsd,
  describeValue: (value: number) => `${formatUsd(value)} in grants first listed`,
};

const draw = (props: Partial<Parameters<typeof YearSeriesChart>[0]> = {}) =>
  render(
    <YearSeriesChart
      points={points}
      width={800}
      height={320}
      label="Grant funding by the year a grant is first listed"
      valueAxisLabel="Grant funding"
      {...dollars}
      {...props}
    />,
  );

describe('static mode: no onSelectYear', () => {
  it('draws pictures of numbers, not controls', () => {
    draw();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(points.length);
  });

  it('keeps every mark out of the tab order and unpressable', () => {
    draw();
    for (const mark of screen.getAllByRole('img')) {
      expect(mark).not.toHaveAttribute('tabindex');
      expect(mark).not.toHaveAttribute('aria-pressed');
      expect(mark).toHaveClass('is-static');
    }
  });

  it('says nothing about activating a mark, because nothing happens', () => {
    draw();
    for (const mark of screen.getAllByRole('img')) {
      expect(mark.getAttribute('aria-label')).not.toMatch(/Activate|Selected/);
    }
  });

  it('ignores a selection it cannot act on', () => {
    draw({ selectedYears: [2019] });
    expect(screen.getByRole('img', { name: /^2019:/ })).not.toHaveClass('is-selected');
  });

  it('does nothing from the keyboard, and the tab key passes over it', async () => {
    draw();
    await userEvent.tab();
    expect(document.body).toHaveFocus();
    const mark = screen.getByRole('img', { name: /^2019:/ });
    fireEvent.keyDown(mark, { key: 'Enter' });
    fireEvent.click(mark);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('still shows the tooltip on hover, with exact values', async () => {
    draw();
    await userEvent.hover(screen.getByRole('img', { name: /^2021,/ }));
    const tooltip = screen.getByTestId('chart-tooltip');
    expect(tooltip).toHaveTextContent('2021 (partial year)');
    expect(tooltip).toHaveTextContent('$6,219,845,123');
    expect(tooltip).toHaveTextContent('$6,221,045,123');
  });

  it('still marks the partial year', () => {
    const { container } = draw();
    expect(container.querySelector('[data-testid="bar-2021"]')?.getAttribute('data-partial')).toBe(
      'true',
    );
    expect(screen.getByText(/2021 is partial/)).toBeInTheDocument();
  });

  it('passes axe', async () => {
    const { container } = draw();
    await expectNoAxeViolations(container);
  });
});

describe('dollar mode: exact values everywhere but the axes', () => {
  it('names each mark with describeValue and the exact running total', () => {
    draw();
    expect(
      screen.getByRole('img', {
        name: '2019: $1,200,000 in grants first listed, $1,200,000 cumulative.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: '2021, a partial year: $6,219,845,123 in grants first listed, $6,221,045,123 cumulative.',
      }),
    ).toBeInTheDocument();
  });

  it('keeps the action text when the chart is a filter', () => {
    const onSelectYear = vi.fn();
    draw({ onSelectYear, selectedYears: [2020] });
    expect(
      screen.getByRole('button', {
        name: '2019: $1,200,000 in grants first listed, $1,200,000 cumulative. Activate to filter by this year.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^2020:/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('falls back to formatValue where no describeValue or unit is given', () => {
    render(
      <YearSeriesChart
        points={points}
        width={800}
        height={320}
        label="Grant funding"
        valueAxisLabel="Grant funding"
        formatValue={formatUsd}
      />,
    );
    expect(
      screen.getByRole('img', { name: '2019: $1,200,000, $1,200,000 cumulative.' }),
    ).toBeInTheDocument();
  });

  it('rounds the axes with the tick formatters it is given, on both sides', () => {
    const { container } = draw({ yTickFormat: (value) => formatUsdCompact(Number(value)) });
    const left = container.querySelector('.visx-axis-left');
    expect(left?.textContent).toContain('$6B');
    expect(left?.textContent).not.toContain('6,000,000,000');
    const { container: both } = draw({
      yTickFormat: (value) => formatUsdCompact(Number(value)),
      rightTickFormat: (value) => `R${formatUsdCompact(Number(value))}`,
    });
    expect(both.querySelector('.visx-axis-right')?.textContent).toContain('R$6B');
  });

  it('draws its axes as grouped integers by default, as before', () => {
    const { container } = draw();
    expect(container.querySelector('.visx-axis-left')?.textContent).toContain('6,000,000,000');
  });
});

describe('what a point carries beyond its value', () => {
  it('gives describeValue the point, so a year can say more than its value', () => {
    draw({
      describeValue: (value, point) =>
        point.year === 2020 ? 'nothing known' : `${formatUsd(value)} known`,
    });
    expect(
      screen.getByRole('img', { name: '2020: nothing known, $1,200,000 cumulative.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: '2019: $1,200,000 known, $1,200,000 cumulative.' }),
    ).toBeInTheDocument();
  });

  it('adds the caller’s tooltip rows after the value and the running total', async () => {
    draw({ tooltipRows: (point) => [{ label: 'Grants', value: String(point.year - 2018) }] });
    await userEvent.hover(screen.getByRole('img', { name: /^2020:/ }));
    const tooltip = screen.getByTestId('chart-tooltip');
    expect(tooltip).toHaveTextContent('Grant funding$0');
    expect(tooltip).toHaveTextContent('Cumulative$1,200,000');
    expect(tooltip).toHaveTextContent('Grants2');
  });
});

describe('the table alternative in dollars', () => {
  it('carries the exact values the tooltip does', () => {
    render(
      <YearSeriesTable
        points={points}
        caption="Grant funding by year first listed"
        valueHeader="Grant funding"
        formatValue={formatUsd}
      />,
    );
    const table = screen.getByRole('table', { name: 'Grant funding by year first listed' });
    const row = within(table).getByRole('rowheader', { name: '2021 (partial)' }).closest('tr');
    expect(row).not.toBeNull();
    expect(within(row!).getByRole('cell', { name: '$6,219,845,123' })).toBeInTheDocument();
    expect(within(row!).getByRole('cell', { name: '$6,221,045,123' })).toBeInTheDocument();
  });
});

describe('yearMarkLabel', () => {
  const point: YearPoint = { year: 2020, count: 3, cumulative: 10, partial: false };
  const unit = { one: 'grant', many: 'grants' };

  it('reads as before with a unit and no options', () => {
    expect(yearMarkLabel(point, false, unit)).toBe(
      '2020: 3 grants, 10 cumulative. Activate to filter by this year.',
    );
  });

  it('drops the action for a static mark', () => {
    expect(yearMarkLabel(point, true, unit, { selectable: false })).toBe(
      '2020: 3 grants, 10 cumulative.',
    );
  });

  it('prefers describeValue to the unit', () => {
    expect(
      yearMarkLabel(point, false, unit, {
        selectable: false,
        describeValue: (value) => `${String(value)} awards`,
      }),
    ).toBe('2020: 3 awards, 10 cumulative.');
  });
});

describe('ignoreYear', () => {
  it('is the do-nothing handler that keeps a publication-year chart a control', () => {
    expect(ignoreYear(2020)).toBeUndefined();
  });
});
