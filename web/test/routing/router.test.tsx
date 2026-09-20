/**
 * Routing and identifier resolution end to end (docs/06 §3 and §7).
 *
 * The behaviour under test is the order docs/06 §7 spells out:
 *
 * > The export's own `aliases` resolve **retired work IDs** only … An external identifier in a
 * > permalink resolves only through `lookup_index.json`, which §10 loads on demand. So: try the
 * > export first; if the URL carries an identifier it cannot resolve, **fetch the lookup index
 * > before deciding**, and only then show a not-found state. **A DOI permalink must work from
 * > cold.**
 *
 * So the fetch counter matters as much as the rendering: a lookup fetch on first paint would be
 * a regression against docs/06 §10, and no lookup fetch before a not-found state would be a
 * regression against §7.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from '../../src/App';
import type { Fetcher } from '../../src/contract/load';
import { sampleExport, sampleLookup } from '../support/fixture';

const doc = sampleExport();
const lookup = sampleLookup();
const LOOKUP_URL = '/data/lookup_index.json';

/** The fixture is asserted to carry each case elsewhere; this keeps the types honest here. */
function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`the sample export must carry ${what}`);
  return value;
}

const serving = () => {
  const calls: string[] = [];
  const fetcher: Fetcher = (input) => {
    calls.push(input);
    return Promise.resolve(
      new Response(JSON.stringify(lookup), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };
  return { calls, fetcher };
};

const at = (path: string, fetcher: Fetcher) => {
  window.history.replaceState(null, '', path);
  return render(
    <Router
      doc={doc}
      fetcher={fetcher}
      lookupHref={LOOKUP_URL}
      now={new Date(doc.generated_at)}
      searchDebounceMs={0}
    />,
  );
};

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('the overview never fetches the lookup index (docs/06 §10)', () => {
  it('loads on demand, not on first paint', () => {
    const { calls } = serving();
    at('/', serving().fetcher);
    expect(calls).toEqual([]);
  });
});

describe('opening a publication from the overview (docs/06 §3)', () => {
  it('keeps the filter, so the reader does not lose one they spent a minute building', async () => {
    const { calls, fetcher } = serving();
    const target = required(doc.works[0], 'at least one work');
    at(`/?year=${String(target.year)}`, fetcher);

    const link = screen.getAllByRole('link', { name: target.title })[0] as HTMLElement;
    await userEvent.click(link);

    expect(window.location.pathname).toBe(`/publication/${target.id}`);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(target.title);
    // The export answered, so nothing was fetched.
    expect(calls).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Back to the publications' }));
    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe(`?year=${String(target.year)}`);
    expect(
      screen.getByText(new RegExp(`matching Year: ${String(target.year)}`)),
    ).toBeInTheDocument();
  });

  it('carries the filter on the link itself, so a middle-click keeps it too', () => {
    const { fetcher } = serving();
    const target = required(doc.works[0], 'at least one work');
    at(`/?year=${String(target.year)}`, fetcher);
    const link = screen.getAllByRole('link', { name: target.title })[0] as HTMLElement;
    expect(link.getAttribute('href')).toBe(`/publication/${target.id}?year=${String(target.year)}`);
  });
});

describe('reached cold from a link (docs/06 §3)', () => {
  it('stands alone with a route back to an unfiltered overview', () => {
    const { fetcher } = serving();
    const target = required(doc.works[0], 'at least one work');
    at(`/publication/${target.id}`, fetcher);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(target.title);
    expect(screen.getByRole('link', { name: 'See all publications' })).toHaveAttribute('href', '/');
    expect(
      screen.queryByRole('button', { name: 'Back to the publications' }),
    ).not.toBeInTheDocument();
  });
});

describe('a retired work ID (docs/06 §7, 37 works carry one)', () => {
  it('resolves from the export alone, with no extra fetch, and says which ID was followed', async () => {
    const { calls, fetcher } = serving();
    const merged = required(
      doc.works.find((item) => item.aliases.length > 0),
      'a retired work ID',
    );
    const retired = required(merged.aliases[0], 'a retired work ID');
    at(`/publication/${retired}`, fetcher);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(merged.title);
    expect(screen.getByRole('status')).toHaveTextContent(retired);
    await waitFor(() => {
      expect(calls).toEqual([]);
    });
  });
});

describe('a DOI permalink must work from cold (docs/06 §7)', () => {
  it('fetches the lookup index, then opens the work', async () => {
    const { calls, fetcher } = serving();
    const target = required(
      doc.works.find((item) => item.ids.doi !== null),
      'a work with a DOI',
    );
    at(`/publication/${String(target.ids.doi)}`, fetcher);

    // Before the fetch resolves the page says what it is doing, rather than showing not-found.
    expect(screen.getByRole('status')).toHaveTextContent(/Looking up/);
    await screen.findByRole('heading', { level: 1, name: target.title });
    expect(calls).toEqual([LOOKUP_URL]);
  });

  it('works for an encoded DOI as well, which is how the app writes one', async () => {
    const { fetcher } = serving();
    const target = required(
      doc.works.find((item) => item.ids.doi !== null),
      'a work with a DOI',
    );
    at(`/publication/${encodeURIComponent(String(target.ids.doi))}`, fetcher);
    await screen.findByRole('heading', { level: 1, name: target.title });
  });
});

describe('the three outcomes of docs/05 §8', () => {
  it('reports a paper that was considered and not included, with its reason', async () => {
    const { fetcher } = serving();
    const rejected = required(lookup.not_included[0], 'a rejected candidate');
    at(`/publication/${rejected.id}`, fetcher);
    await screen.findByText(new RegExp(rejected.reason_label));
    expect(screen.getByText(rejected.title)).toBeInTheDocument();
  });

  it('says an unknown identifier says nothing about the paper', async () => {
    const { fetcher } = serving();
    at('/publication/10.9999/nothing-here', fetcher);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('10.9999/nothing-here');
    expect(alert).toHaveTextContent(/says nothing about the paper itself/);
  });

  it('says the answer is incomplete when the lookup index itself cannot be loaded', async () => {
    const failing: Fetcher = () => Promise.reject(new Error('offline'));
    at('/publication/10.9999/nothing-here', failing);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not be loaded, so this answer is incomplete/);
  });
});

describe('an address that is no route at all', () => {
  it('is a designed state with a way back, not a blank page', () => {
    const { fetcher } = serving();
    at('/nowhere', fetcher);
    expect(screen.getByRole('alert')).toHaveTextContent('There is no page at this address.');
    expect(screen.getByRole('link', { name: 'See all publications' })).toBeInTheDocument();
  });
});
