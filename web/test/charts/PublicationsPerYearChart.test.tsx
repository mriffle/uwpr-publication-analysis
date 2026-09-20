/**
 * The one chart, end to end through the shared kit (docs/06 §15).
 *
 * docs/06 §12.2: "Charts at fixed dimensions asserting real SVG … queried by role and accessible
 * name, so the tests fail when the accessibility does." Fixed dimensions are possible because
 * visx takes width and height as props (§11.2) — the reason it was chosen over a library whose
 * responsive container measures the DOM and renders nothing under jsdom.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PublicationsPerYearChart,
  PublicationsPerYearTable,
  barLabel,
} from '../../src/charts/PublicationsPerYearChart';
import type { Period } from '../../src/contract/types';
import { sampleExport } from '../support/fixture';
import { expectNoAxeViolations } from '../support/axe';
import { work } from '../support/works';

const period: Period = {
  first_year: 2008,
  last_year: 2026,
  complete_through: 2025,
  current_year_partial: true,
  citation_years_from: 2012,
  citations_before_window: 458,
};

const works = [
  work({ year: 2008 }),
  work({ year: 2019 }),
  work({ year: 2019 }),
  work({ year: 2026 }),
];

const draw = (props: Partial<Parameters<typeof PublicationsPerYearChart>[0]> = {}) =>
  render(
    <PublicationsPerYearChart works={works} period={period} width={800} height={320} {...props} />,
  );

describe('rendering', () => {
  it('draws real SVG at the dimensions it is given', () => {
    const { container } = draw();
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('width')).toBe('800');
    expect(svg?.getAttribute('height')).toBe('320');
  });

  it('draws one bar per year of the whole period, not only the years with publications', () => {
    const { container } = draw();
    const bars = container.querySelectorAll('rect[data-partial]');
    expect(bars).toHaveLength(2026 - 2008 + 1);
  });

  it('gives each bar a height proportional to its count', () => {
    const { container } = draw();
    const height = (year: number) =>
      Number(
        container.querySelector(`rect[data-testid="bar-${String(year)}"]`)?.getAttribute('height'),
      );
    expect(height(2019)).toBeGreaterThan(height(2008));
    expect(height(2010)).toBe(0);
  });

  it('draws the cumulative series as a line on the second axis', () => {
    const { container } = draw();
    const line = container.querySelector('[data-testid="cumulative-line"]');
    expect(line).not.toBeNull();
    // A real path, not an empty one: nineteen points make a long `d`.
    expect((line?.getAttribute('d') ?? '').length).toBeGreaterThan(50);
  });

  it('starts the axis at the first recorded year (docs/05 §4.2)', () => {
    const { container } = draw();
    expect(container.querySelector('rect[data-testid="bar-2007"]')).toBeNull();
    expect(container.querySelector('rect[data-testid="bar-2008"]')).not.toBeNull();
  });
});

describe('the partial year is a requirement, not a suggestion (docs/05 §4.2)', () => {
  it('draws the current year differently from a complete one', () => {
    const { container } = draw();
    const partial = container.querySelector('rect[data-testid="bar-2026"]');
    const complete = container.querySelector('rect[data-testid="bar-2019"]');
    expect(partial?.getAttribute('data-partial')).toBe('true');
    expect(complete?.getAttribute('data-partial')).toBe('false');
    // Hatched, never a full bar of the series colour.
    expect(partial?.getAttribute('fill')).toMatch(/^url\(#/);
    expect(complete?.getAttribute('fill')).toBe('var(--chart-1)');
  });

  it('says so in words, not by colour alone (docs/06 §8)', () => {
    draw();
    expect(screen.getByText(/2026 is partial/)).toBeInTheDocument();
  });

  it('says so in the bar’s accessible name as well', () => {
    draw();
    expect(screen.getByRole('button', { name: /^2026, a partial year:/ })).toBeInTheDocument();
  });

  it('marks nothing partial when the export says the year is complete', () => {
    const { container } = draw({ period: { ...period, current_year_partial: false } });
    expect(container.querySelector('rect[data-partial="true"]')).toBeNull();
    expect(screen.queryByText(/is partial/)).not.toBeInTheDocument();
  });
});

describe('each mark is reachable and says what it is (docs/06 §9)', () => {
  it('names every bar with its year, its count and its running total', () => {
    draw();
    expect(
      screen.getByRole('button', {
        name: '2019: 2 publications, 3 cumulative. Activate to filter by this year.',
      }),
    ).toBeInTheDocument();
  });

  it('uses the singular for a year with one publication', () => {
    draw();
    expect(screen.getByRole('button', { name: /^2008: 1 publication,/ })).toBeInTheDocument();
  });

  it('keeps a year with no publications reachable', () => {
    draw();
    expect(screen.getByRole('button', { name: /^2012: 0 publications,/ })).toBeInTheDocument();
  });

  it('shows a selected year as pressed, and says how to remove it', () => {
    draw({ selectedYears: [2019] });
    const bar = screen.getByRole('button', { name: /^2019:/ });
    expect(bar).toHaveAttribute('aria-pressed', 'true');
    expect(bar.getAttribute('aria-label')).toContain(
      'Activate to remove this year from the filter',
    );
  });

  it('passes axe', async () => {
    const { container } = draw();
    await expectNoAxeViolations(container);
  });
});

describe('clicking a mark applies the filter (docs/06 §6)', () => {
  it('reports the year on click', async () => {
    const onSelectYear = vi.fn();
    draw({ onSelectYear });
    await userEvent.click(screen.getByRole('button', { name: /^2019:/ }));
    expect(onSelectYear).toHaveBeenCalledWith(2019);
  });

  it('is operable from the keyboard with Enter and with Space', async () => {
    const onSelectYear = vi.fn();
    draw({ onSelectYear });
    const bar = screen.getByRole('button', { name: /^2019:/ });
    bar.focus();
    expect(bar).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onSelectYear).toHaveBeenCalledTimes(2);
    expect(onSelectYear).toHaveBeenCalledWith(2019);
  });

  it('is tabbable, so every mark is reachable without a mouse', async () => {
    draw();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: /^2008:/ })).toHaveFocus();
  });
});

describe('the tooltip gives exact values (docs/06 §7)', () => {
  it('appears on hover and goes away again', async () => {
    draw();
    const bar = screen.getByRole('button', { name: /^2019:/ });
    expect(screen.queryByTestId('chart-tooltip')).not.toBeInTheDocument();
    await userEvent.hover(bar);
    const tooltip = screen.getByTestId('chart-tooltip');
    expect(tooltip).toHaveTextContent('2019');
    expect(tooltip).toHaveTextContent('Publications');
    expect(tooltip).toHaveTextContent('Cumulative');
    await userEvent.unhover(bar);
    expect(screen.queryByTestId('chart-tooltip')).not.toBeInTheDocument();
  });

  it('appears on keyboard focus too, and labels a partial year as one', () => {
    draw();
    fireEvent.focus(screen.getByRole('button', { name: /^2026,/ }));
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('2026 (partial year)');
  });
});

describe('the table alternative shows the same numbers (docs/06 §7)', () => {
  it('has a caption and one row per year', () => {
    render(<PublicationsPerYearTable works={works} period={period} />);
    const table = screen.getByRole('table', { name: /Publications per year/ });
    expect(table).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(2026 - 2008 + 2); // header + 19 years
  });

  it('carries the same counts the chart draws, and marks the partial year', () => {
    render(<PublicationsPerYearTable works={works} period={period} />);
    const row = screen.getByRole('rowheader', { name: '2019' }).closest('tr');
    expect(row?.textContent).toContain('2');
    expect(screen.getByRole('rowheader', { name: '2026 (partial)' })).toBeInTheDocument();
  });

  it('passes axe', async () => {
    const { container } = render(<PublicationsPerYearTable works={works} period={period} />);
    await expectNoAxeViolations(container);
  });
});

describe('against the committed sample export', () => {
  it('draws the real fixture without special-casing it', () => {
    const doc = sampleExport();
    const { container } = render(
      <PublicationsPerYearChart works={doc.works} period={doc.period} width={800} height={320} />,
    );
    const bars = container.querySelectorAll('rect[data-partial]');
    expect(bars).toHaveLength(doc.period.last_year - doc.period.first_year + 1);
  });
});

describe('barLabel', () => {
  it('is the same text the tooltip and the table carry', () => {
    expect(barLabel({ year: 2020, count: 1, cumulative: 10, partial: false }, false)).toBe(
      '2020: 1 publication, 10 cumulative. Activate to filter by this year.',
    );
    expect(barLabel({ year: 2026, count: 13, cumulative: 339, partial: true }, true)).toBe(
      '2026, a partial year: 13 publications, 339 cumulative. Selected. Activate to remove this year from the filter.',
    );
  });
});
