/**
 * The ranked bar chart with values that are not counts of a unit — dollars, for one — where the
 * accessible name must carry the exact value in words (docs/06 §7, §9) and the default wording
 * must stay exactly what HorizontalBarChart.test.tsx pins.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  HorizontalBarChart,
  barRowLabel,
  describeBarValue,
  type BarRow,
} from '../../src/charts/HorizontalBarChart';
import { RankedBarCard } from '../../src/charts/RankedBarCard';
import { formatUsd, formatUsdCompact } from '../../src/format/number';
import { expectNoAxeViolations } from '../support/axe';

const rows: BarRow[] = [
  { key: 'nih', label: 'National Institutes of Health', value: 6_219_845_123 },
  { key: 'nsf', label: 'National Science Foundation', value: 1_000_000 },
];

const inGrants = (value: number) => `${formatUsd(value)} in grants listed`;

describe('describeValue', () => {
  it('names each mark with the exact value in words, in place of the unit', () => {
    render(
      <HorizontalBarChart
        rows={rows}
        width={800}
        label="Agencies by grant funding"
        valueAxisLabel="Grant funding"
        formatValue={formatUsdCompact}
        describeValue={inGrants}
        onSelect={vi.fn()}
        selectVerb="filter by this agency"
      />,
    );
    expect(
      screen.getByRole('button', {
        name: 'National Institutes of Health: $6,219,845,123 in grants listed. Activate to filter by this agency.',
      }),
    ).toBeInTheDocument();
  });

  it('lets the axis and the bar’s own label round while the name stays exact', () => {
    const { container } = render(
      <HorizontalBarChart
        rows={rows}
        width={800}
        label="Agencies"
        valueAxisLabel="Grant funding"
        formatValue={formatUsdCompact}
        describeValue={inGrants}
      />,
    );
    expect(container.textContent).toContain('$6.22B');
    expect(screen.getByRole('img', { name: /\$6,219,845,123/ })).toBeInTheDocument();
    // The hover title carries the same exact sentence, without the action.
    expect(container.querySelector('title')?.textContent).toBe(
      'National Institutes of Health: $6,219,845,123 in grants listed.',
    );
  });

  it('rounds the axis and the bar’s label with markFormat, and keeps the tooltip exact', async () => {
    const { container } = render(
      <HorizontalBarChart
        rows={rows}
        width={800}
        label="Agencies"
        valueAxisLabel="Grant funding"
        formatValue={formatUsd}
        markFormat={formatUsdCompact}
        describeValue={inGrants}
      />,
    );
    expect(container.querySelector('.visx-axis-bottom')?.textContent).toContain('$4B');
    expect(container.textContent).toContain('$6.22B');
    await userEvent.hover(screen.getByRole('img', { name: /^National Institutes of Health/ }));
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('$6,219,845,123');
  });

  it('falls back to formatValue where there is neither describeValue nor a unit', () => {
    render(
      <HorizontalBarChart rows={rows} width={800} label="Agencies" valueAxisLabel="Funding" />,
    );
    expect(
      screen.getByRole('img', { name: 'National Science Foundation: 1,000,000.' }),
    ).toBeInTheDocument();
  });

  it('keeps the unit’s wording as the default, whatever formatValue is', () => {
    render(
      <HorizontalBarChart
        rows={[{ key: 'a', label: 'A', value: 3 }]}
        width={800}
        label="L"
        unit={{ one: 'grant', many: 'grants' }}
        valueAxisLabel="Grants"
        formatValue={(value) => `${String(value)}!`}
      />,
    );
    expect(screen.getByRole('img', { name: 'A: 3 grants.' })).toBeInTheDocument();
  });

  it('passes axe', async () => {
    const { container } = render(
      <HorizontalBarChart
        rows={rows}
        width={800}
        label="Agencies"
        valueAxisLabel="Grant funding"
        describeValue={inGrants}
        onSelect={vi.fn()}
      />,
    );
    await expectNoAxeViolations(container);
  });
});

describe('barRowLabel and describeBarValue', () => {
  it('reads exactly as before without a describeValue', () => {
    expect(
      barRowLabel({ key: 'a', label: 'A', value: 1 }, { one: 'x', many: 'xs' }, true, 'go'),
    ).toBe('A: 1 x. Activate to go.');
  });

  it('uses the describeValue it is given', () => {
    expect(barRowLabel({ key: 'a', label: 'A', value: 5 }, undefined, false, 'go', inGrants)).toBe(
      'A: $5 in grants listed.',
    );
  });

  it('describes with the unit where there is one, and the formatted value where not', () => {
    expect(describeBarValue({ one: 'grant', many: 'grants' })(2)).toBe('2 grants');
    expect(describeBarValue(undefined, formatUsd)(2)).toBe('$2');
    expect(describeBarValue(undefined)(2000)).toBe('2,000');
  });
});

describe('RankedBarCard passes describeValue through', () => {
  it('to the chart’s accessible names, with the table in exact figures', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    render(
      <RankedBarCard
        title="Agencies"
        description="Grant funding by agency."
        rows={rows}
        valueAxisLabel="Grant funding"
        categoryHeader="Agency"
        tableCaption="Grant funding by agency"
        formatValue={formatUsd}
        describeValue={inGrants}
      />,
    );
    expect(
      screen.getByRole('img', {
        name: 'National Science Foundation: $1,000,000 in grants listed.',
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'View as table' }));
    const table = screen.getByRole('table', { name: 'Grant funding by agency' });
    expect(within(table).getByRole('cell', { name: '$6,219,845,123' })).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('passes markFormat to the chart, and keeps the table exact', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    const { container } = render(
      <RankedBarCard
        title="Agencies"
        description="Grant funding by agency."
        rows={rows}
        valueAxisLabel="Grant funding"
        categoryHeader="Agency"
        tableCaption="Grant funding by agency"
        formatValue={formatUsd}
        markFormat={formatUsdCompact}
        describeValue={inGrants}
      />,
    );
    expect(container.textContent).toContain('$6.22B');
    await userEvent.click(screen.getByRole('button', { name: 'View as table' }));
    const table = screen.getByRole('table', { name: 'Grant funding by agency' });
    expect(within(table).getByRole('cell', { name: '$6,219,845,123' })).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
