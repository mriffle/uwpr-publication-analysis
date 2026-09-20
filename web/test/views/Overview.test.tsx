/**
 * The overview as far as this slice builds it, and the one behaviour that crosses every layer:
 * clicking a chart mark applies a filter, every figure recomputes under it, and the URL carries
 * it (docs/06 §6, B5).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Overview } from '../../src/views/Overview';
import { applyFilter } from '../../src/filter/predicate';
import { EMPTY_FILTER } from '../../src/filter/state';
import { summarize } from '../../src/aggregate/metrics';
import { sampleExport } from '../support/fixture';
import { expectNoAxeViolations } from '../support/axe';

const doc = sampleExport();

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  // jsdom lays nothing out, so every element reports clientWidth 0 and `ResponsiveChart`
  // correctly declines to draw. Giving it a width is what lets these tests reach the marks;
  // the chart's own tests render it directly at fixed dimensions instead.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

const sentence = (count: number, suffix: string) =>
  `${String(count)} ${count === 1 ? 'publication' : 'publications'} ${suffix}`;

describe('the unfiltered overview', () => {
  it('states that no filter is applied, with the count (docs/06 §6)', () => {
    render(<Overview doc={doc} now={new Date(doc.generated_at)} />);
    expect(
      screen.getByText(sentence(doc.works.length, ', no filter applied.').replace(' ,', ',')),
    ).toBeInTheDocument();
  });

  it('shows the five headline figures of docs/06 §4.2, from the rows', () => {
    render(<Overview doc={doc} now={new Date(doc.generated_at)} />);
    const figures = within(screen.getByRole('list', { name: 'Headline figures' }));
    for (const label of [
      'Publications',
      'Years covered',
      'Citations',
      'Research groups',
      'Journals',
    ]) {
      expect(figures.getByText(label)).toBeInTheDocument();
    }
    // The figures equal the independently computed summary block, which is what §12.1 asserts.
    expect(figures.getByText(String(doc.summary.publications))).toBeInTheDocument();
    expect(
      figures.getByText(`${String(doc.summary.first_year)}–${String(doc.summary.last_year)}`),
    ).toBeInTheDocument();
  });

  it('labels "research groups" as the proxy it is (docs/05 §11.4)', () => {
    render(<Overview doc={doc} now={new Date(doc.generated_at)} />);
    expect(screen.getByText(/A proxy: distinct corresponding authors/)).toBeInTheDocument();
  });

  it('makes no causal claim about the citations (docs/05 §5.1)', () => {
    render(<Overview doc={doc} now={new Date(doc.generated_at)} />);
    expect(screen.getByText(/it does not measure what caused the citations/)).toBeInTheDocument();
  });

  it('passes axe', async () => {
    const { container } = render(<Overview doc={doc} now={new Date(doc.generated_at)} />);
    await expectNoAxeViolations(container);
  });
});

describe('clicking a chart mark filters the page', () => {
  it('recomputes the figures, states the filter and puts it in the URL', async () => {
    render(<Overview doc={doc} now={new Date(doc.generated_at)} />);
    const year = doc.period.last_year;
    const expected = applyFilter(doc.works, { ...EMPTY_FILTER, year: [year] });
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(doc.works.length);

    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${String(year)}[,:]`) }));

    expect(window.location.search).toBe(`?year=${String(year)}`);
    expect(
      screen.getByText(sentence(expected.length, `matching Year: ${String(year)}.`)),
    ).toBeInTheDocument();

    const figures = within(screen.getByRole('list', { name: 'Headline figures' }));
    expect(figures.getByText(String(summarize(expected).citations))).toBeInTheDocument();
  });

  it('clears the filter again, and empties the URL', async () => {
    window.history.replaceState(null, '', `?year=${String(doc.period.last_year)}`);
    render(<Overview doc={doc} now={new Date(doc.generated_at)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(window.location.search).toBe('');
    expect(screen.getByText(/no filter applied/)).toBeInTheDocument();
  });

  it('opens already filtered from a shared link (docs/06 B5)', () => {
    window.history.replaceState(null, '', '?year=2008');
    render(<Overview doc={doc} now={new Date(doc.generated_at)} />);
    const expected = applyFilter(doc.works, { ...EMPTY_FILTER, year: [2008] });
    expect(screen.getByText(sentence(expected.length, 'matching Year: 2008.'))).toBeInTheDocument();
  });
});

describe('an empty result is a designed state (docs/06 §6)', () => {
  it('names the filter responsible and offers to remove the last selection', async () => {
    window.history.replaceState(null, '', '?year=2008&country=ZZ');
    render(<Overview doc={doc} now={new Date(doc.generated_at)} />);
    expect(screen.getByText('No publications match the current filter.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Remove / }));
    expect(screen.queryByText('No publications match the current filter.')).not.toBeInTheDocument();
  });
});

describe('the staleness notice (docs/06 §7, docs/07 O3)', () => {
  it('is absent while the data is current', () => {
    render(<Overview doc={doc} now={new Date(Date.parse(doc.generated_at) + 3 * 86_400_000)} />);
    expect(screen.queryByText(/it is out of date/)).not.toBeInTheDocument();
  });

  it('says so once two weekly runs have been missed', () => {
    render(<Overview doc={doc} now={new Date(Date.parse(doc.generated_at) + 20 * 86_400_000)} />);
    expect(screen.getByText(/20 days ago/)).toBeInTheDocument();
    expect(screen.getByText(/it is out of date/)).toBeInTheDocument();
  });
});

describe('back and forward (docs/06 §6: state survives reload, back and forward, and sharing)', () => {
  it('re-reads the filter from the URL when the reader goes back', async () => {
    render(<Overview doc={doc} now={new Date(doc.generated_at)} />);
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(`^${String(doc.period.last_year)}[,:]`) }),
    );
    expect(window.location.search).not.toBe('');

    act(() => {
      window.history.replaceState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByText(/no filter applied/)).toBeInTheDocument();
  });
});
