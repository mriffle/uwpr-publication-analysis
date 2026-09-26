/**
 * The loading and failure shells are titled for the page the address asks for (docs/06 §7).
 *
 * The app parses the route before the data arrives, so a reader who followed a link to the
 * funding view is not told, while it loads, that they are on the publications page.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../src/App';

const URL_UNDER_TEST = '/data/uwpr_publications.json';

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('while loading', () => {
  it.each([
    ['/', 'Publications'],
    ['/funding', 'Funding impact'],
    ['/funding/agency/NIH', 'Funding agency'],
    ['/funding/grant/NIH%3AR01GM086688', 'Grant'],
    ['/method', 'How this was assembled'],
    ['/lookup', 'Look up a publication'],
    ['/publication/W-000001', 'Publication'],
    ['/nowhere', 'Publications'],
  ])('titles %s "%s"', (path, title) => {
    window.history.replaceState(null, '', path);
    render(<App url={URL_UNDER_TEST} fetcher={() => new Promise(() => undefined)} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title);
    expect(screen.getByRole('status')).toHaveTextContent('Loading the publication data…');
  });
});

describe('when the data fails to load', () => {
  it('keeps the route’s title over the failure', async () => {
    window.history.replaceState(null, '', '/funding');
    render(<App url={URL_UNDER_TEST} fetcher={() => Promise.reject(new Error('offline'))} />);
    await screen.findByRole('alert');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Funding impact');
  });
});
