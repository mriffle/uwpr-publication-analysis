/**
 * The way back, through the whole router (docs/06 §3, §6).
 *
 * Three properties, each of which the old in-memory flag got wrong somewhere:
 *
 * - **Closing pops.** "Closing a detail pops its history entry rather than pushing another"
 *   (docs/06 §6), so the history is no longer after a round trip than after the open alone.
 * - **The label names the page behind.** A publication opened from `/lookup` used to say "Back
 *   to the publications" and then go back to the lookup.
 * - **It belongs to the entry.** Reload, back and forward all bring an entry back with its state,
 *   so the offer comes back with it — and an entry the app did not open offers a link instead.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from '../../src/App';
import type { Fetcher } from '../../src/contract/load';
import { sampleExport, sampleLookup } from '../support/fixture';

const doc = sampleExport();
const lookup = sampleLookup();

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`the sample export must carry ${what}`);
  return value;
}

const fetcher: Fetcher = () =>
  Promise.resolve(
    new Response(JSON.stringify(lookup), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

const at = (path: string, state: unknown = null) => {
  window.history.replaceState(state, '', path);
  return render(
    <Router
      doc={doc}
      fetcher={fetcher}
      lookupHref="/data/lookup_index.json"
      now={new Date(doc.generated_at)}
      searchDebounceMs={0}
    />,
  );
};

const target = required(doc.works[0], 'at least one work');
const year = String(target.year);

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('closing pops the entry it opened (docs/06 §6)', () => {
  it('returns to the filtered overview without adding to the history', async () => {
    at(`/?year=${year}`);
    const start = window.history.length;

    await userEvent.click(screen.getAllByRole('link', { name: target.title })[0] as HTMLElement);
    expect(window.location.pathname).toBe(`/publication/${target.id}`);
    expect(window.history.length).toBe(start + 1);

    await userEvent.click(screen.getByRole('button', { name: 'Back to the publications' }));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/');
    });
    expect(window.location.search).toBe(`?year=${year}`);
    // A pop, not a push: the history is exactly as long as the open made it.
    expect(window.history.length).toBe(start + 1);
    expect(screen.getByText(new RegExp(`matching Year: ${year}`))).toBeInTheDocument();
  });

  it('offers the way back again when the reader goes forward to the entry', async () => {
    at(`/?year=${year}`);
    await userEvent.click(screen.getAllByRole('link', { name: target.title })[0] as HTMLElement);
    await userEvent.click(screen.getByRole('button', { name: 'Back to the publications' }));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/');
    });

    window.history.forward();
    await screen.findByRole('heading', { level: 1, name: target.title });
    expect(screen.getByRole('button', { name: 'Back to the publications' })).toBeInTheDocument();
  });

  it('closes on Escape by popping as well', async () => {
    at(`/?year=${year}`);
    await userEvent.click(screen.getAllByRole('link', { name: target.title })[0] as HTMLElement);
    const back = vi.spyOn(window.history, 'back');
    await userEvent.keyboard('{Escape}');
    expect(back).toHaveBeenCalledTimes(1);
  });
});

describe('the label names the page behind', () => {
  it('says "Back to the lookup" for a publication opened from the lookup', async () => {
    at('/lookup');
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Publication identifier' }),
      `${target.id}{Enter}`,
    );
    await screen.findByRole('region', { name: 'This publication is included' });
    await userEvent.click(screen.getByRole('link', { name: target.title }));

    expect(window.location.pathname).toBe(`/publication/${target.id}`);
    expect(
      screen.queryByRole('button', { name: 'Back to the publications' }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back to the lookup' }));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/lookup');
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Look up a publication');
  });

  it('says "Back to the publications" on the lookup opened from the overview', async () => {
    at(`/?year=${year}`);
    await userEvent.click(screen.getByRole('link', { name: 'Why is a paper not here?' }));
    expect(window.location.pathname).toBe('/lookup');
    // The lookup, like the method page, carries no filter of its own (docs/06 §3).
    expect(window.location.search).toBe('');
    await userEvent.click(screen.getByRole('button', { name: 'Back to the publications' }));
    await waitFor(() => {
      expect(window.location.search).toBe(`?year=${year}`);
    });
  });

  it('says "Back to funding impact" on the method page opened from the funding view', async () => {
    at(`/funding?year=${year}`);
    await userEvent.click(screen.getByRole('link', { name: 'How this was assembled' }));
    expect(window.location.pathname).toBe('/method');
    expect(window.location.search).toBe('');
    await userEvent.click(screen.getByRole('button', { name: 'Back to funding impact' }));
    await waitFor(() => {
      expect(`${window.location.pathname}${window.location.search}`).toBe(`/funding?year=${year}`);
    });
  });

  it('says "Back to the publication" on the lookup opened from a rejection’s permalink', async () => {
    const rejected = required(lookup.not_included[0], 'a rejected candidate');
    at(`/publication/${rejected.id}`);
    await userEvent.click(await screen.findByRole('link', { name: 'Look up another publication' }));
    expect(window.location.pathname).toBe('/lookup');
    await userEvent.click(screen.getByRole('button', { name: 'Back to the publication' }));
    await waitFor(() => {
      expect(window.location.pathname).toBe(`/publication/${rejected.id}`);
    });
  });
});

describe('the way back belongs to the entry', () => {
  it('survives a reload, which keeps the entry’s state', () => {
    at(`/publication/${target.id}?year=${year}`, { back: 'overview' });
    expect(screen.getByRole('button', { name: 'Back to the publications' })).toBeInTheDocument();
  });

  it('is labelled from the entry, whichever page wrote it', () => {
    at(`/publication/${target.id}`, { back: 'grant' });
    expect(screen.getByRole('button', { name: 'Back to the grant' })).toBeInTheDocument();
  });

  it.each([
    ['an entry the browser made', null],
    ['a way back to a page that does not exist', { back: 'elsewhere' }],
    ['state some other code left', 'overview'],
  ])('is a link to the parent for %s', (_label, state) => {
    at(`/publication/${target.id}?year=${year}`, state);
    expect(screen.getByRole('link', { name: 'See all publications' })).toHaveAttribute(
      'href',
      `/?year=${year}`,
    );
    expect(screen.queryByRole('button', { name: /^Back to/ })).not.toBeInTheDocument();
  });

  it('gives the lookup a link to the publications when it is reached cold', () => {
    at('/lookup');
    expect(screen.getByRole('link', { name: 'See all publications' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button', { name: /^Back to/ })).not.toBeInTheDocument();
  });

  it('stores nothing for a peer step, so the view switched to offers no way back', async () => {
    at(`/?year=${year}`);
    await userEvent.click(screen.getByRole('link', { name: 'Funding impact' }));
    expect(window.history.state).toBeNull();
    expect(screen.queryByRole('button', { name: /^Back to/ })).not.toBeInTheDocument();
  });
});
