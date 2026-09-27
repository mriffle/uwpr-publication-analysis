/**
 * The production build, which leaves the Funding impact view out until it is released
 * (`VITE_FUNDING`, docs/09).
 *
 * "Off" has to mean off everywhere a reader could find the view: no switch in the header, the
 * three routes answering as the address that is no route — exactly as they did before the view
 * existed — and no loading shell claiming to be it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App, Router } from '../../src/App';
import { fundingEnabled } from '../../src/contract/config';
import { sampleExport } from '../support/fixture';

const doc = sampleExport();

const at = (path: string) => {
  window.history.replaceState(null, '', path);
  return render(
    <Router
      doc={doc}
      fetcher={() => Promise.reject(new Error('no fetch expected'))}
      lookupHref="/data/lookup_index.json"
      now={new Date(doc.generated_at)}
      searchDebounceMs={0}
    />,
  );
};

beforeEach(() => {
  vi.stubEnv('VITE_FUNDING', '');
  window.history.replaceState(null, '', '/');
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('a build without the Funding impact view', () => {
  it('is what the flag says', () => {
    expect(fundingEnabled()).toBe(false);
    vi.stubEnv('VITE_FUNDING', '1');
    expect(fundingEnabled()).toBe(true);
  });

  it('has no switch in the header, and no link to the view anywhere', () => {
    at('/');
    expect(screen.queryByRole('navigation', { name: 'Views' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Funding impact' })).not.toBeInTheDocument();
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href') ?? '').not.toMatch(/funding/);
    }
  });

  it.each(['/funding', '/funding/agency/NIH', '/funding/grant/NIH%3AR01GM086688'])(
    'answers %s as the address that is no route',
    (path) => {
      at(path);
      expect(screen.getByRole('alert')).toHaveTextContent('There is no page at this address.');
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Publications');
    },
  );

  it('titles the loading shell as the publications, not as the view it does not have', () => {
    window.history.replaceState(null, '', '/funding');
    render(<App url="/data/uwpr_publications.json" fetcher={() => new Promise(() => undefined)} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Publications');
  });

  it('gives a publication no Funding section, and so no link to an agency or grant', () => {
    // Every work in the sample: the section would appear on each with the flag on (§12.8).
    for (const work of doc.works) {
      const view = at(`/publication/${work.id}`);
      expect(
        screen.queryByRole('heading', { name: 'Funding listed in this publication' }),
      ).not.toBeInTheDocument();
      for (const link of screen.getAllByRole('link')) {
        expect(link.getAttribute('href') ?? '').not.toMatch(/funding/);
      }
      view.unmount();
    }
  });
});
