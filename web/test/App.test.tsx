/**
 * The designed states of docs/06 §7: "Loading and failure are designed states, not blank
 * screens."
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import type { Fetcher } from '../src/contract/load';
import { sampleExport } from './support/fixture';
import { expectNoAxeViolations } from './support/axe';

const URL_UNDER_TEST = '/data/uwpr_publications.json';

const serving =
  (body: unknown, status = 200): Fetcher =>
  () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

describe('while loading', () => {
  it('shows a skeleton, not a spinner over an empty page', () => {
    render(<App url={URL_UNDER_TEST} fetcher={() => new Promise(() => undefined)} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading the publication data…');
  });
});

describe('when the data fails to load', () => {
  it('names the file and offers a retry, with no partial page pretending to be complete', async () => {
    const fetcher = vi.fn<Fetcher>(() => Promise.reject(new Error('offline')));
    render(<App url={URL_UNDER_TEST} fetcher={fetcher} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(URL_UNDER_TEST);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();

    fetcher.mockImplementation(serving(sampleExport()));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/publications/i);
    });
  });
});

describe('when the schema version is one the app does not know', () => {
  it('names both versions and renders nothing else (docs/06 §7)', async () => {
    render(
      <App url={URL_UNDER_TEST} fetcher={serving({ ...sampleExport(), schema_version: '2.0' })} />,
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('version 2.0');
    expect(alert).toHaveTextContent('version 1.x');
    // "A wrong render is worse than none": no retry, because retrying cannot help, and no chart.
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});

describe('when the data loads', () => {
  it('renders the overview under one h1', async () => {
    const doc = sampleExport();
    render(<App url={URL_UNDER_TEST} fetcher={serving(doc)} />);
    // The resource's name comes from the export, never from the app (docs/05 §1.1 principle 5).
    await screen.findByRole('heading', { level: 1, name: new RegExp(doc.resource.name) });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  // Past the 5 s default for the same reason as `views/Overview.test.tsx`: axe walks the whole
  // document, which under `UWPR_EXPORT_DIR` is the real 339-work overview rather than the
  // sample's 16.
  it('passes axe', async () => {
    const { container } = render(<App url={URL_UNDER_TEST} fetcher={serving(sampleExport())} />);
    await screen.findByRole('heading', { level: 1 });
    await expectNoAxeViolations(container);
  }, 30_000);
});
