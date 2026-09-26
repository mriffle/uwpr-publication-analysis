/**
 * The generic stacked-by-bucket chart that research areas over time is now a reading of.
 * The areas chart's own behaviour is pinned, unchanged, in charts.test.tsx; this pins what the
 * generalisation adds: series that are and are not filters, a pinned series that is one, and
 * values that are not counts.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  StackedBucketChart,
  StackedBucketTable,
  stackedSegmentLabel,
  type StackedBucket,
  type StackedSeries,
} from '../../src/charts/StackedBucketChart';
import { otherColour, seriesColour } from '../../src/charts/palette';
import { formatUsd, formatUsdCompact } from '../../src/format/number';
import { expectNoAxeViolations } from '../support/axe';

interface GrantBucket extends StackedBucket {
  grants: number;
}

const series: StackedSeries[] = [
  { key: 'nih', label: 'NIH', colour: seriesColour(0), selectable: true },
  { key: 'misc', label: 'Miscellaneous', colour: seriesColour(1), selectable: true },
  {
    key: 'other',
    label: 'Other',
    colour: otherColour(),
    selectable: false,
    notSelectableReason: 'Not a filter: "Other" is whatever falls outside the largest agencies.',
  },
];

const buckets: GrantBucket[] = [
  {
    key: '2008-2010',
    label: '2008–2010',
    partial: false,
    values: [1_000_000, 0, 250_000],
    total: 1_250_000,
    grants: 3,
  },
  {
    key: '2011-2013',
    label: '2011–2013',
    partial: true,
    values: [2_000_000, 500_000, 0],
    total: 2_500_000,
    grants: 4,
  },
];

const draw = (props: Partial<Parameters<typeof StackedBucketChart<GrantBucket>>[0]> = {}) =>
  render(
    <StackedBucketChart<GrantBucket>
      buckets={buckets}
      series={series}
      width={800}
      height={340}
      label="Grant funding by agency over time"
      xLabel="Period (3 years)"
      yLabel="Grant funding"
      legendLabel="Agencies"
      partialNoun="period"
      formatValue={formatUsd}
      yTickFormat={(value) => formatUsdCompact(Number(value))}
      totalLabel="All agencies"
      tooltipRows={(bucket) => [{ label: 'Grants', value: String(bucket.grants) }]}
      {...props}
    />,
  );

describe('selectable and non-selectable series', () => {
  it('makes a selectable series a control, including a pinned one such as Miscellaneous', () => {
    draw({ onSelectSeries: vi.fn(), selectVerb: 'filter by this agency' });
    expect(
      screen.getByRole('button', {
        name: 'NIH, 2008–2010: $1,000,000. Activate to filter by this agency.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Miscellaneous, 2011–2013/ })).toHaveAttribute(
      'tabindex',
      '0',
    );
  });

  it('never makes "Other" a control, and says why', () => {
    draw({ onSelectSeries: vi.fn() });
    const other = screen.getByRole('img', { name: /^Other, 2008–2010/ });
    expect(other).toHaveAccessibleName(
      'Other, 2008–2010: $250,000. Not a filter: "Other" is whatever falls outside the largest agencies.',
    );
    expect(other).not.toHaveAttribute('tabindex');
    expect(other).toHaveClass('is-static');
  });

  it('applies a selectable series from a segment, from the keyboard and from the legend', async () => {
    const onSelectSeries = vi.fn();
    draw({ onSelectSeries });
    await userEvent.click(screen.getByRole('button', { name: /^Miscellaneous, 2011–2013/ }));
    expect(onSelectSeries).toHaveBeenLastCalledWith('misc');
    const nih = screen.getByRole('button', { name: /^NIH, 2008–2010/ });
    nih.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelectSeries).toHaveBeenLastCalledWith('nih');
    const legend = within(screen.getByRole('list', { name: 'Agencies' }));
    await userEvent.click(legend.getByRole('button', { name: /Miscellaneous/ }));
    expect(onSelectSeries).toHaveBeenCalledTimes(3);
  });

  it('never applies "Other", from a segment or from the legend', async () => {
    const onSelectSeries = vi.fn();
    draw({ onSelectSeries });
    fireEvent.click(screen.getByRole('img', { name: /^Other,/ }));
    fireEvent.keyDown(screen.getByRole('img', { name: /^Other,/ }), { key: 'Enter' });
    const legend = within(screen.getByRole('list', { name: 'Agencies' }));
    await userEvent.click(legend.getByText('Other'));
    expect(onSelectSeries).not.toHaveBeenCalled();
  });

  it('shows a selected series as pressed', () => {
    draw({ onSelectSeries: vi.fn(), selectedSeries: ['nih'] });
    const nih = screen.getByRole('button', { name: /^NIH, 2011–2013/ });
    expect(nih).toHaveAttribute('aria-pressed', 'true');
    expect(nih).toHaveAccessibleName(/Selected. Activate to remove this from the filter/);
  });

  it('is entirely static without a handler, with no action text and no reasons', () => {
    draw();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Other, 2008–2010/ })).toHaveAccessibleName(
      'Other, 2008–2010: $250,000.',
    );
  });

  it('passes axe', async () => {
    const { container } = draw({ onSelectSeries: vi.fn() });
    await expectNoAxeViolations(container);
  });
});

describe('drawing', () => {
  it('draws one segment per non-zero cell, with the series key in its test id', () => {
    const { container } = draw();
    expect(container.querySelector('[data-testid="segment-2008-2010-nih"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="segment-2008-2010-misc"]')).toBeNull();
    expect(container.querySelector('[data-testid="segment-2011-2013-other"]')).toBeNull();
  });

  it('colours each segment with its series colour', () => {
    const { container } = draw();
    expect(
      container.querySelector('[data-testid="segment-2008-2010-other"]')?.getAttribute('fill'),
    ).toBe('var(--chart-other)');
  });

  it('hatches a partial bucket and says so with the caller’s noun', () => {
    const { container } = draw();
    expect(container.querySelector('[data-testid="partial-2011-2013"]')).not.toBeNull();
    expect(screen.getByText(/2011–2013 is partial: the period is not over/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^NIH, 2011–2013, which includes a partial year/ }));
  });

  it('rounds only the axis', () => {
    const { container } = draw();
    expect(container.querySelector('.visx-axis-left')?.textContent).toContain('$2.5M');
  });

  it('gives exact values in the tooltip, with the total and the caller’s rows', async () => {
    draw();
    await userEvent.hover(screen.getByRole('img', { name: /^NIH, 2011–2013/ }));
    const tooltip = screen.getByTestId('chart-tooltip');
    expect(tooltip).toHaveTextContent('2011–2013 (includes a partial year)');
    expect(tooltip).toHaveTextContent('NIH$2,000,000');
    expect(tooltip).toHaveTextContent('All agencies$2,500,000');
    expect(tooltip).toHaveTextContent('Grants4');
    await userEvent.unhover(screen.getByRole('img', { name: /^NIH, 2011–2013/ }));
    expect(screen.queryByTestId('chart-tooltip')).not.toBeInTheDocument();
  });

  it('totals each series in the legend, exactly', () => {
    draw();
    const legend = within(screen.getByRole('list', { name: 'Agencies' }));
    expect(legend.getByText('$3,000,000')).toBeInTheDocument();
    expect(legend.getByText('$250,000')).toBeInTheDocument();
  });

  it('uses describeValue in the default accessible name, and describeSegment over it', () => {
    draw({ describeValue: (value) => `${formatUsd(value)} in grants` });
    expect(screen.getByRole('img', { name: 'NIH, 2008–2010: $1,000,000 in grants.' }));
    draw({ describeSegment: ({ series: item, bucket }) => `${item.key}@${bucket.key}` });
    expect(screen.getByRole('img', { name: 'misc@2011-2013' })).toBeInTheDocument();
  });
});

describe('stackedSegmentLabel', () => {
  const bucket = buckets[0]!;
  const nih = series[0]!;

  it('counts by default, and says nothing of a filter in a static chart', () => {
    expect(
      stackedSegmentLabel({
        bucket,
        series: nih,
        value: 2,
        selected: false,
        selectable: false,
        interactive: false,
      }),
    ).toBe('NIH, 2008–2010: 2.');
  });

  it('says nothing for a non-selectable series with no reason given', () => {
    expect(
      stackedSegmentLabel({
        bucket,
        series: { ...nih, selectable: false },
        value: 2,
        selected: false,
        selectable: false,
        interactive: true,
      }),
    ).toBe('NIH, 2008–2010: 2.');
  });
});

describe('the table alternative', () => {
  it('has one column per series, the total, the caller’s columns, and exact values', () => {
    render(
      <StackedBucketTable<GrantBucket>
        buckets={buckets}
        series={series}
        caption="Grant funding by agency and period"
        bucketHeader="Period"
        totalHeader="All agencies"
        formatValue={formatUsd}
        extraColumns={[{ key: 'grants', header: 'Grants', value: (b) => String(b.grants) }]}
      />,
    );
    const table = screen.getByRole('table', { name: 'Grant funding by agency and period' });
    for (const header of ['Period', 'NIH', 'Miscellaneous', 'Other', 'All agencies', 'Grants']) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
    const row = within(table)
      .getByRole('rowheader', { name: '2011–2013 (includes a partial year)' })
      .closest('tr');
    expect(within(row!).getByRole('cell', { name: '$2,500,000' })).toBeInTheDocument();
    expect(within(row!).getAllByRole('cell', { name: '$0' })).toHaveLength(1);
  });

  it('counts by default', () => {
    render(
      <StackedBucketTable<GrantBucket>
        buckets={buckets}
        series={series}
        caption="Counts"
        bucketHeader="Period"
        totalHeader="Total"
      />,
    );
    expect(screen.getByRole('cell', { name: '1,250,000' })).toBeInTheDocument();
  });
});
