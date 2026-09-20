/**
 * The ranked horizontal bar chart (docs/05 §7.6–§7.9, §7.13, §7.14 through one component).
 *
 * docs/06 §12.2: "Charts at fixed dimensions asserting real SVG … queried by role and accessible
 * name, so the tests fail when the accessibility does."
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  HorizontalBarChart,
  HorizontalBarTable,
  barRowLabel,
  labelColumnWidth,
  truncate,
  type BarRow,
} from '../../src/charts/HorizontalBarChart';
import { expectNoAxeViolations } from '../support/axe';

const rows: BarRow[] = [
  { key: 'a', label: 'Institute for Systems Biology', value: 26 },
  { key: 'b', label: 'Howard Hughes Medical Institute', value: 18 },
];

const unit = { one: 'publication', many: 'publications' };

const draw = (props: Partial<Parameters<typeof HorizontalBarChart>[0]> = {}) =>
  render(
    <HorizontalBarChart
      rows={rows}
      width={800}
      label="Institutions"
      unit={unit}
      valueAxisLabel="Publications"
      {...props}
    />,
  );

describe('rendering', () => {
  it('draws real SVG with one bar per row, sized to the value', () => {
    const { container } = draw();
    expect(screen.getByRole('group', { name: 'Institutions' })).toBeInTheDocument();
    const first = container.querySelector('[data-testid="bar-a"]');
    const second = container.querySelector('[data-testid="bar-b"]');
    expect(Number(first?.getAttribute('width'))).toBeGreaterThan(
      Number(second?.getAttribute('width')),
    );
  });

  it('grows its own height with the number of rows rather than squashing them', () => {
    const { container } = draw();
    const tall = render(
      <HorizontalBarChart
        rows={[...rows, { key: 'c', label: 'Third', value: 1 }]}
        width={800}
        label="More"
        unit={unit}
        valueAxisLabel="Publications"
      />,
    );
    const height = (root: HTMLElement) => Number(root.querySelector('svg')?.getAttribute('height'));
    expect(height(tall.container)).toBeGreaterThan(height(container));
  });

  it('draws the value beside each bar, so the number is never only in a tooltip', () => {
    const { container } = draw();
    expect(container.textContent).toContain('26');
    expect(container.textContent).toContain('18');
  });

  it('shows a row’s tag as text, never as colour alone (docs/06 §8)', () => {
    const { container } = draw({
      rows: [{ key: 'a', label: 'bioRxiv', value: 12, tag: 'preprint server' }],
    });
    expect(container.textContent).toContain('preprint server');
  });
});

describe('each mark says what it is and what it does (docs/06 §9)', () => {
  it('names a bar with its label and its exact value', () => {
    draw({ onSelect: vi.fn() });
    expect(
      screen.getByRole('button', {
        name: 'Institute for Systems Biology: 26 publications. Activate to filter by this.',
      }),
    ).toBeInTheDocument();
  });

  it('uses the caller’s verb, so "filter by this institution" reads as English', () => {
    draw({ onSelect: vi.fn(), selectVerb: 'filter by this institution' });
    expect(screen.getAllByRole('button', { name: /filter by this institution/ })).toHaveLength(2);
  });

  it('shows a selected row as pressed, and says how to remove it', () => {
    draw({ onSelect: vi.fn(), rows: [{ ...(rows[0] as BarRow), selected: true }] });
    const bar = screen.getByRole('button', { name: /Institute for Systems Biology/ });
    expect(bar).toHaveAttribute('aria-pressed', 'true');
    expect(bar).toHaveAccessibleName(/Activate to remove this from the filter/);
  });

  it('is a picture, not a control, when there is no filter behind it', () => {
    draw();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('passes axe', async () => {
    const { container } = draw({ onSelect: vi.fn() });
    await expectNoAxeViolations(container);
  });
});

describe('clicking a mark applies the filter (docs/06 §6)', () => {
  it('reports the row on click', async () => {
    const onSelect = vi.fn();
    draw({ onSelect });
    await userEvent.click(screen.getByRole('button', { name: /Institute for Systems Biology/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ key: 'a' }));
  });

  it('is operable from the keyboard with Enter and with Space', async () => {
    const onSelect = vi.fn();
    draw({ onSelect });
    const bar = screen.getByRole('button', { name: /Howard Hughes/ });
    bar.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onSelect).toHaveBeenCalledTimes(2);
  });
});

describe('the tooltip gives exact values (docs/06 §7)', () => {
  it('appears on hover and on focus, and carries any extra detail', async () => {
    draw({
      onSelect: vi.fn(),
      rows: [{ key: 'a', label: 'A venue', value: 3, detail: [{ label: 'Share', value: '10%' }] }],
    });
    await userEvent.hover(screen.getByRole('button', { name: /A venue/ }));
    const tooltip = screen.getByTestId('chart-tooltip');
    expect(tooltip).toHaveTextContent('A venue');
    expect(tooltip).toHaveTextContent('Share');
    expect(tooltip).toHaveTextContent('10%');
  });
});

describe('long labels', () => {
  it('truncates only the axis, never the accessible name or the table', () => {
    const long = 'Journal of the American Society for Mass Spectrometry and Related Topics';
    expect(truncate(long, 120)).toMatch(/…$/);
    expect(truncate(long, 120).length).toBeLessThan(long.length);
    expect(barRowLabel({ key: 'x', label: long, value: 1 }, unit, false, 'x')).toContain(long);
  });

  it('leaves a short label alone', () => {
    expect(truncate('Nature', 200)).toBe('Nature');
  });

  it('keeps the label column within a third of a wide chart and readable on a narrow one', () => {
    expect(labelColumnWidth(1200)).toBe(260);
    expect(labelColumnWidth(200)).toBe(96);
  });
});

describe('the table alternative (docs/06 §7)', () => {
  it('carries the untruncated labels and the same values', () => {
    render(
      <HorizontalBarTable
        rows={rows}
        caption="Institutions"
        categoryHeader="Institution"
        valueHeader="Publications"
      />,
    );
    expect(screen.getByRole('table', { name: 'Institutions' })).toBeInTheDocument();
    expect(
      screen.getByRole('rowheader', { name: 'Institute for Systems Biology' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Publications' })).toBeInTheDocument();
  });

  it('adds a column for a tag and for any extra detail the rows carry', () => {
    render(
      <HorizontalBarTable
        rows={[
          {
            key: 'a',
            label: 'bioRxiv',
            value: 12,
            tag: 'preprint server',
            detail: [{ label: 'Share', value: '4%' }],
          },
        ]}
        caption="Venues"
        categoryHeader="Venue"
        valueHeader="Publications"
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Note' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Share' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'preprint server' })).toBeInTheDocument();
  });
});
