/**
 * The publication explorer (docs/06 §4.8).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PublicationExplorer, abbreviatedAuthors } from '../../src/components/PublicationExplorer';
import { DEFAULT_SORT } from '../../src/aggregate/explorer';
import type { Work } from '../../src/contract/types';
import { expectNoAxeViolations } from '../support/axe';
import { author, work } from '../support/works';

const row = (overrides: Partial<Work>) =>
  work({
    citations: { total: 1, by_year: {}, fwci: null, percentile: null, as_of: '2026-09-20' },
    ...overrides,
  });

const works = [row({ title: 'Beta paper', year: 2020 }), row({ title: 'Alpha paper', year: 2024 })];

afterEach(() => {
  // A test that installs fake timers and fails before restoring them would hang every test
  // after it, which reads as a failure in the wrong place.
  vi.useRealTimers();
});

const show = (props: Partial<Parameters<typeof PublicationExplorer>[0]> = {}) =>
  render(
    <PublicationExplorer
      works={works}
      sort={DEFAULT_SORT}
      onSort={vi.fn()}
      search=""
      onSearch={vi.fn()}
      href={(item) => `/publication/${item.id}`}
      debounceMs={0}
      {...props}
    />,
  );

describe('the list', () => {
  it('is a plain ordered list — no virtualisation at this size (docs/06 §4.8)', () => {
    show();
    const list = screen.getByRole('list', { name: 'Publications under the current filter' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });

  it('carries the title as a link, the authors abbreviated, the venue, the year and the citations', () => {
    show({
      works: [
        row({
          title: 'A paper',
          year: 2021,
          authors: [author({ name: 'X Y' })],
          author_count: 4,
          venue: { name: 'Journal of Tests', issn_l: '0000-0001' },
        }),
      ],
    });
    expect(screen.getByRole('link', { name: 'A paper' })).toBeInTheDocument();
    expect(screen.getByText('X Y and 3 more')).toBeInTheDocument();
    expect(screen.getByText('Journal of Tests')).toBeInTheDocument();
    expect(screen.getByText('2021')).toBeInTheDocument();
    expect(screen.getByText('1 citation')).toBeInTheDocument();
  });

  it('marks preprint-only, open access and retraction with text, not colour alone', () => {
    show({
      works: [
        row({
          is_preprint: true,
          retracted: true,
          oa: { status: 'gold', url: null, license: null },
        }),
      ],
    });
    expect(screen.getByText('preprint')).toBeInTheDocument();
    expect(screen.getByText('open access')).toBeInTheDocument();
    expect(screen.getByText('retracted')).toBeInTheDocument();
  });

  it('shows no open-access mark on a closed work', () => {
    show({ works: [row({ oa: { status: 'closed', url: null, license: null } })] });
    expect(screen.queryByText('open access')).not.toBeInTheDocument();
  });

  it('renders a filename title as stored (docs/06 §5)', () => {
    show({ works: [row({ title: '1_manuscript_2020-04-14.pdf' })] });
    expect(screen.getByRole('link', { name: '1_manuscript_2020-04-14.pdf' })).toBeInTheDocument();
  });

  it('is a designed empty state, not a blank panel', () => {
    show({ works: [] });
    expect(screen.getByRole('status')).toHaveTextContent(
      'No publications match the current filter',
    );
  });

  it('opens a publication on click without a page load', async () => {
    const onOpen = vi.fn();
    show({ onOpen });
    await userEvent.click(screen.getByRole('link', { name: 'Alpha paper' }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ title: 'Alpha paper' }));
  });

  it('leaves a modified click to the browser, so the row is a real link', () => {
    const onOpen = vi.fn();
    show({ onOpen });
    fireEvent.click(screen.getByRole('link', { name: 'Alpha paper' }), { metaKey: true });
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe('sorting (docs/06 §4.8)', () => {
  it('offers year, citations and title, and says which is active and which way', () => {
    show({ sort: { key: 'citations', direction: 'asc' } });
    const active = screen.getByRole('button', { name: /^Citations/ });
    expect(active).toHaveAttribute('aria-pressed', 'true');
    expect(active).toHaveAccessibleName(/sorted ascending/);
    expect(screen.getByRole('button', { name: /^Year/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the column the reader picked', async () => {
    const onSort = vi.fn();
    show({ onSort });
    await userEvent.click(screen.getByRole('button', { name: /^Title/ }));
    expect(onSort).toHaveBeenCalledWith('title');
  });

  it('draws the rows in the order it is given', () => {
    show({ sort: { key: 'title', direction: 'asc' } });
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveTextContent('Alpha paper');
  });
});

describe('the search box (docs/06 §4.8, §10)', () => {
  it('filters on title, author and venue by writing into the filter state', async () => {
    const onSearch = vi.fn();
    show({ onSearch });
    await userEvent.type(screen.getByLabelText('Search title, author or venue'), 'casanovo');
    await waitFor(() => {
      expect(onSearch).toHaveBeenCalledWith('casanovo');
    });
  });

  it('is debounced, so a filter is not recomputed on every keystroke', () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    render(
      <PublicationExplorer
        works={works}
        sort={DEFAULT_SORT}
        onSort={vi.fn()}
        search=""
        onSearch={onSearch}
        href={(item) => `/publication/${item.id}`}
        debounceMs={200}
      />,
    );
    const box = screen.getByLabelText('Search title, author or venue');
    fireEvent.change(box, { target: { value: 'a' } });
    fireEvent.change(box, { target: { value: 'ab' } });
    fireEvent.change(box, { target: { value: 'abc' } });
    expect(onSearch).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('abc');
  });

  it('follows the filter when it changes from elsewhere — a chip removed, the back button', () => {
    const { rerender } = show({ search: 'first' });
    expect(screen.getByLabelText('Search title, author or venue')).toHaveValue('first');
    rerender(
      <PublicationExplorer
        works={works}
        sort={DEFAULT_SORT}
        onSort={vi.fn()}
        search=""
        onSearch={vi.fn()}
        href={(item) => `/publication/${item.id}`}
        debounceMs={0}
      />,
    );
    expect(screen.getByLabelText('Search title, author or venue')).toHaveValue('');
  });
});

describe('abbreviatedAuthors', () => {
  it('names the first few and states the true count', () => {
    const many = work({
      authors: [author({ name: 'A' }), author({ name: 'B' }), author({ name: 'C' })],
      author_count: 10,
    });
    expect(abbreviatedAuthors(many)).toBe('A, B, C and 7 more');
  });

  it('names them all when there are few enough', () => {
    const one = work({ authors: [author({ name: 'Only' })], author_count: 1 });
    expect(abbreviatedAuthors(one)).toBe('Only');
  });
});

describe('accessibility', () => {
  it('passes axe', async () => {
    const { container } = show();
    await expectNoAxeViolations(container);
  });
});
