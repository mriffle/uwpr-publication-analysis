/**
 * Resolving a work identifier from a URL (docs/06 §7).
 *
 * "A work referenced by URL does not exist: resolve it through the export's alias map first —
 * 37 works carry a retired identifier — and only then show a not-found state."
 *
 * Work IDs are permanent (docs/02), but a merge retires the higher ID into the lower one
 * (docs/01 §8), so every permalink the app has ever issued has to keep opening.
 */
import type { ExportDocument, Work } from './types';

export type WorkIndex = ReadonlyMap<string, Work>;

/** Every work keyed by its own ID and by each retired ID that merged into it. */
export function buildWorkIndex(doc: Pick<ExportDocument, 'works'>): WorkIndex {
  const index = new Map<string, Work>();
  for (const work of doc.works) index.set(work.id, work);
  // Aliases are applied second so a live ID always wins over a retired one, whatever the order
  // of the array.
  for (const work of doc.works) {
    for (const alias of work.aliases) if (!index.has(alias)) index.set(alias, work);
  }
  return index;
}

export function resolveWork(index: WorkIndex, id: string): Work | null {
  return index.get(id) ?? null;
}

/** True when `id` opened a work only by way of a retired identifier. */
export function isRetiredId(index: WorkIndex, id: string): boolean {
  const work = index.get(id);
  return work !== undefined && work.id !== id;
}
