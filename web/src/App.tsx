/**
 * The app shell: the loading, failure and version states of docs/06 §7, and the overview.
 *
 * "Loading and failure are designed states, not blank screens."
 */
import { exportUrl } from './contract/config';
import { describeFailure } from './contract/load';
import { useExportDocument } from './contract/useExport';
import type { Fetcher } from './contract/load';
import { Overview } from './views/Overview';

export interface AppProps {
  /** Overridden in tests; the browser's `fetch` otherwise. */
  fetcher?: Fetcher;
  url?: string;
  now?: Date;
}

export function App({ fetcher, url = exportUrl(), now }: AppProps) {
  const { state, retry } = useExportDocument(url, fetcher ?? fetch);

  if (state.status === 'loading') {
    // A skeleton layout, not a spinner over an empty page (docs/06 §7).
    return (
      <main className="page">
        <h1>Publications</h1>
        <div className="chart-skeleton" role="status">
          Loading the publication data…
        </div>
      </main>
    );
  }

  if (state.status === 'failed') {
    const { failure } = state;
    return (
      <main className="page">
        <h1>Publications</h1>
        <div className="notice notice-error" role="alert">
          <p>{describeFailure(failure)}</p>
          {failure.kind === 'schema-version' ? null : (
            <button type="button" onClick={retry}>
              Try again
            </button>
          )}
        </div>
      </main>
    );
  }

  return <Overview doc={state.data} {...(now ? { now } : {})} />;
}
