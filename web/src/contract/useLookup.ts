/**
 * The lookup index, fetched **on demand** (docs/06 §10, §7).
 *
 * "The lookup index loads on demand, not on first paint — it is more than half the uncompressed
 * weight of the data file and answers a question most readers never ask."
 *
 * The question it answers here is docs/06 §7's: a permalink carrying an external identifier the
 * export cannot resolve. "Fetch the lookup index before deciding, and only then show a not-found
 * state. A DOI permalink must work from cold, at the cost of one extra fetch in the case that
 * needs it." So this hook starts idle and fetches only when `needed` becomes true, and the
 * result is kept for the rest of the session — a reader following one old link often follows
 * another.
 */
import { useEffect, useState } from 'react';
import { loadLookupIndex, type Fetcher, type LoadFailure } from './load';
import type { LookupIndexDocument } from './types';

export type LookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: LookupIndexDocument }
  | { status: 'failed'; failure: LoadFailure };

type Settled = Extract<LookupState, { status: 'ready' | 'failed' }>;

const IDLE: LookupState = { status: 'idle' };
const LOADING: LookupState = { status: 'loading' };

export function useLookupIndex(needed: boolean, url: string, fetcher: Fetcher): LookupState {
  // Only the answer is state. Idle and loading follow from it and from `needed`, so the effect
  // never has to set state before its fetch returns (react-hooks/set-state-in-effect).
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!needed) return;
    let live = true;
    void loadLookupIndex(url, fetcher).then((result) => {
      if (!live) return;
      setSettled(
        result.ok
          ? { status: 'ready', data: result.data }
          : { status: 'failed', failure: result.failure },
      );
    });
    return () => {
      live = false;
    };
  }, [needed, url, fetcher]);

  return settled ?? (needed ? LOADING : IDLE);
}
