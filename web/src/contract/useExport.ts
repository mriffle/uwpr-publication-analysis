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

const LOADING: ExportState = { status: 'loading' };

export function useExportDocument(url: string, fetcher: Fetcher = fetch): UseExport {
  const [attempt, setAttempt] = useState(0);
  // Which request an answer belongs to. The state is loading until the answer to the current
  // request arrives, which follows from this rather than being set when the effect starts
  // (react-hooks/set-state-in-effect); a retry or a new URL is a new request.
  const request = `${String(attempt)} ${url}`;
  const [settled, setSettled] = useState<{ request: string; state: ExportState } | null>(null);

  useEffect(() => {
    let live = true;
    void loadExport(url, fetcher).then((result) => {
      if (!live) return;
      setSettled({
        request,
        state: result.ok
          ? { status: 'ready', data: result.data }
          : { status: 'failed', failure: result.failure },
      });
    });
    return () => {
      live = false;
    };
  }, [url, fetcher, request]);

  const state = settled?.request === request ? settled.state : LOADING;

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  return { state, retry };
}
