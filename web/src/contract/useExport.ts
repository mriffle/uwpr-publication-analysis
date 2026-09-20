/**
 * The export as React state: loading, ready, or a designed failure with a retry (docs/06 §7).
 */
import { useCallback, useEffect, useState } from 'react';
import { loadExport, type Fetcher, type LoadFailure } from './load';
import type { ExportDocument } from './types';

export type ExportState =
  | { status: 'loading' }
  | { status: 'ready'; data: ExportDocument }
  | { status: 'failed'; failure: LoadFailure };

export interface UseExport {
  state: ExportState;
  retry: () => void;
}

export function useExportDocument(url: string, fetcher: Fetcher = fetch): UseExport {
  const [state, setState] = useState<ExportState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    void loadExport(url, fetcher).then((result) => {
      if (!live) return;
      setState(
        result.ok
          ? { status: 'ready', data: result.data }
          : { status: 'failed', failure: result.failure },
      );
    });
    return () => {
      live = false;
    };
  }, [url, fetcher, attempt]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  return { state, retry };
}
