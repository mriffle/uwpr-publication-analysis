/**
 * The shared kit itself (docs/06 §11.2): the frame, the table control, and the empty and loading
 * states, built once so that "swapping the rendering layer later would touch only the chart
 * components".
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { scaleBand, scaleLinear } from 'd3-scale';
import { ChartCard } from '../../src/charts/ChartCard';
import { ChartEmpty } from '../../src/charts/ChartEmpty';
import { ChartFrame } from '../../src/charts/ChartFrame';
import { ChartTable } from '../../src/charts/ChartTable';
import { ResponsiveChart } from '../../src/charts/ResponsiveChart';
import { CATEGORICAL, MAX_CATEGORIES, otherColour, seriesColour } from '../../src/charts/palette';
import { expectNoAxeViolations } from '../support/axe';

describe('ChartCard', () => {
  const card = (props: Partial<Parameters<typeof ChartCard>[0]> = {}) =>
    render(
      <ChartCard
        title="Publications per year"
        description="One bar per year."
        chart={<p>the chart</p>}
        table={<p>the table</p>}
        {...props}
      />,
    );

  it('names the chart and describes what it shows (docs/06 §9)', () => {
    card();
    const section = screen.getByRole('region', { name: 'Publications per year' });
    expect(section).toHaveAccessibleDescription('One bar per year.');
  });

  it('offers the table alternative, and switches to it (docs/06 §7)', async () => {
    card();
    expect(screen.getByText('the chart')).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'View as table' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(screen.getByText('the table')).toBeInTheDocument();
    expect(screen.queryByText('the chart')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'View as chart' }));
    expect(screen.getByText('the chart')).toBeInTheDocument();
  });

  it('shows a skeleton while loading, not a blank panel (docs/06 §7)', () => {
    card({ loading: true });
    expect(screen.getByRole('status')).toHaveTextContent(/Loading publications per year/);
    expect(screen.queryByText('the chart')).not.toBeInTheDocument();
  });

  it('shows the empty state in place of the chart', () => {
    card({ empty: <p>nothing matches</p> });
    expect(screen.getByText('nothing matches')).toBeInTheDocument();
    expect(screen.queryByText('the chart')).not.toBeInTheDocument();
  });

  it('carries an honesty note where a chart needs one (docs/05 §11.5)', () => {
    card({ note: 'Nothing is recorded before 2008.' });
    expect(screen.getByText('Nothing is recorded before 2008.')).toBeInTheDocument();
  });

  it('passes axe', async () => {
    const { container } = card();
    await expectNoAxeViolations(container);
  });
});

describe('ChartEmpty', () => {
  it('names the filters responsible and offers to remove the last one (docs/06 §6)', async () => {
    const onClearLast = vi.fn();
    render(
      <ChartEmpty
        filterSentence="0 publications matching Year: 2019; Country: DE."
        onClearLast={onClearLast}
        clearLastLabel="Country: DE"
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Year: 2019; Country: DE');
    await userEvent.click(screen.getByRole('button', { name: 'Remove Country: DE' }));
    expect(onClearLast).toHaveBeenCalled();
  });

  it('offers nothing to remove when there is nothing to remove', () => {
    render(<ChartEmpty filterSentence="0 publications, no filter applied." />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('ChartTable', () => {
  it('is a real table with a caption, row headers and numeric alignment', async () => {
    const { container } = render(
      <ChartTable
        caption="Two rows"
        rows={[
          { year: 2019, count: 3 },
          { year: 2020, count: 4 },
        ]}
        rowKey={(row) => String(row.year)}
        columns={[
          { key: 'year', header: 'Year', value: (row) => String(row.year) },
          { key: 'count', header: 'Count', numeric: true, value: (row) => String(row.count) },
        ]}
      />,
    );
    expect(screen.getByRole('table', { name: 'Two rows' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Year' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: '2019' })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});

describe('ChartFrame', () => {
  const frame = () =>
    render(
      <ChartFrame
        width={400}
        height={200}
        label="A frame"
        xScale={scaleBand<string>().domain(['a', 'b']).range([0, 288])}
        yScale={scaleLinear().domain([0, 10]).range([148, 0])}
        rightScale={scaleLinear().domain([0, 100]).range([148, 0])}
        xLabel="X"
        yLabel="Y"
        rightLabel="Right"
      >
        {({ innerWidth, innerHeight }) => (
          <rect data-testid="inner" width={innerWidth} height={innerHeight} />
        )}
      </ChartFrame>,
    );

  it('gives the chart an accessible name and an inner area inside its margins', () => {
    const { container } = frame();
    expect(screen.getByRole('group', { name: 'A frame' })).toBeInTheDocument();
    const inner = container.querySelector('[data-testid="inner"]');
    expect(Number(inner?.getAttribute('width'))).toBe(400 - 56 - 56);
    expect(Number(inner?.getAttribute('height'))).toBe(200 - 8 - 44);
  });

  it('draws both axes, a grid and the axis labels', () => {
    const { container } = frame();
    expect(container.querySelector('.visx-axis-bottom')).not.toBeNull();
    expect(container.querySelector('.visx-axis-left')).not.toBeNull();
    expect(container.querySelector('.visx-axis-right')).not.toBeNull();
    expect(container.querySelector('.visx-rows')).not.toBeNull();
    expect(container.textContent).toContain('Right');
  });

  it('hides the axis furniture from assistive technology, which the table repeats', () => {
    const { container } = frame();
    expect(
      container.querySelector('.visx-axis-bottom')?.closest('[aria-hidden="true"]'),
    ).not.toBeNull();
  });

  it('never produces a negative inner area at a tiny width', () => {
    const { container } = render(
      <ChartFrame
        width={10}
        height={10}
        label="Tiny"
        xScale={scaleBand<string>().domain(['a']).range([0, 1])}
        yScale={scaleLinear().domain([0, 1]).range([1, 0])}
      >
        {({ innerWidth, innerHeight }) => (
          <rect data-testid="inner" width={innerWidth} height={innerHeight} />
        )}
      </ChartFrame>,
    );
    const inner = container.querySelector('[data-testid="inner"]');
    expect(Number(inner?.getAttribute('width'))).toBe(0);
    expect(Number(inner?.getAttribute('height'))).toBe(0);
  });
});

describe('ResponsiveChart', () => {
  it('renders nothing until it has a width, rather than drawing at zero', () => {
    const { container } = render(
      <ResponsiveChart height={100}>{({ width }) => <p>drawn at {width}</p>}</ResponsiveChart>,
    );
    // jsdom reports clientWidth 0 for every element, which is exactly the case this guards.
    expect(container.textContent).toBe('');
  });

  it('draws once a width is available, never below the minimum', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);
    render(
      <ResponsiveChart height={100} minWidth={240}>
        {({ width, height }) => (
          <p>
            {width}×{height}
          </p>
        )}
      </ResponsiveChart>,
    );
    expect(screen.getByText('240×100')).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});

describe('palette (docs/06 §8)', () => {
  it('offers at most six categorical colours plus "Other"', () => {
    expect(MAX_CATEGORIES).toBe(6);
    expect(CATEGORICAL).toHaveLength(6);
  });

  it('returns CSS custom properties, so one chart serves both themes', () => {
    expect(seriesColour(0)).toBe('var(--chart-1)');
    expect(seriesColour(5)).toBe('var(--chart-6)');
    expect(otherColour()).toBe('var(--chart-other)');
  });

  it('wraps rather than returning undefined past the sixth', () => {
    expect(seriesColour(6)).toBe('var(--chart-1)');
  });

  it('defines every colour in both themes', () => {
    for (const colour of [...CATEGORICAL]) {
      expect(colour.light).toMatch(/^#[0-9a-f]{6}$/);
      expect(colour.dark).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
