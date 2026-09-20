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
  /**
   * This is the URL a PI follows out of a colleague's email, so it is the likelier way to meet a
   * rejection — and it used to render the barer of the two: a title, the reason label and a bare
   * list of signals, with no explanation and no way to correct it. It now renders the same card
   * `/lookup` does (`components/NotIncludedAnswer`), and these assertions are the ones that would
   * fail if the two ever drift apart again.
   */
  describe('a paper that was considered and not included', () => {
    it('gets the full answer, not a barer one, because this is the likelier way to reach it', async () => {
      const { fetcher } = serving();
      const rejected = required(lookup.not_included[0], 'a rejected candidate');
      at(`/publication/${rejected.id}`, fetcher);

      // The same card, under the same accessible name the lookup gives it.
      const card = await screen.findByRole('region', {
        name: 'This publication was considered and is not included',
      });
      expect(card).toHaveTextContent(rejected.title);
      expect(card).toHaveTextContent(rejected.reason_label);
      // The explanation and the correction path, neither of which this route used to carry.
      expect(card).toHaveTextContent(
        /statement about the record|set aside before any rule|window the searches cover|recorded by a person|earlier version of the rules/,
      );
      expect(card).toHaveTextContent('correction worth reporting');
    });

    it('carries the h1, because here the card is the page (docs/06 §9)', async () => {
      const { fetcher } = serving();
      const rejected = required(lookup.not_included[0], 'a rejected candidate');
      at(`/publication/${rejected.id}`, fetcher);

      await screen.findByRole('region', {
        name: 'This publication was considered and is not included',
      });
      const headings = screen.getAllByRole('heading', { level: 1 });
      expect(headings).toHaveLength(1);
      expect(headings[0]).toHaveTextContent('This publication was considered and is not included');
    });

    it('offers both the list it is not on and the form, which a reader arriving cold has not seen', async () => {
      const { fetcher } = serving();
      const rejected = required(lookup.not_included[0], 'a rejected candidate');
      at(`/publication/${rejected.id}`, fetcher);

      await screen.findByRole('region', {
        name: 'This publication was considered and is not included',
      });
      expect(screen.getByRole('link', { name: 'See all publications' })).toBeInTheDocument();
      const form = screen.getByRole('link', { name: 'Look up another publication' });
      expect(form).toHaveAttribute('href', '/lookup');
      await userEvent.click(form);
      expect(window.location.pathname).toBe('/lookup');
    });

    it('is not styled or announced as a failure (docs/05 §11)', async () => {
      const { fetcher } = serving();
      const rejected = required(lookup.not_included[0], 'a rejected candidate');
      at(`/publication/${rejected.id}`, fetcher);

      await screen.findByRole('region', {
        name: 'This publication was considered and is not included',
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('resolves the same candidate by its DOI, which is the form a permalink carries', async () => {
      const { fetcher } = serving();
      const rejected = required(
        lookup.not_included.find((entry) => entry.ids.doi !== null),
        'a rejected candidate with a DOI',
      );
      at(`/publication/${String(rejected.ids.doi)}`, fetcher);

      const card = await screen.findByRole('region', {
        name: 'This publication was considered and is not included',
      });
      expect(card).toHaveTextContent(rejected.title);
    });
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
