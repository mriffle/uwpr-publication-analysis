/**
 * The one way the app reads the export's funding data (docs/09).
 *
 * **An export may carry none.** Data and app are published separately (docs/07 O2), so the app
 * meets exports older than itself: for a while after every deploy, and after any rollback of the
 * data. `load.ts` accepts any 1.x export, so a missing funding block reaches the views, and every
 * funding read goes through here so that "this export has no funding data" is one designed state
 * rather than a crash wherever a view first reaches for it. That state has two shapes (docs/09
 * §12.10): a 1.0 export with no `funding` block at all, and a 1.1 export whose block has a null
 * `version`, which is what the pipeline writes while a store holds no funding.
 *
 * Still untyped: the generated types carry the block from contract 1.1, and narrowing this to
 * them is the next step (W3). Nothing that calls it changes then.
 */
import type { ExportDocument } from './types';

/** The export's funding block, or null when this export has no funding data. */
export function fundingOf(doc: ExportDocument): object | null {
  const value: unknown = (doc as { funding?: unknown }).funding;
  if (typeof value !== 'object' || value === null) return null;
  const version: unknown = (value as { version?: unknown }).version;
  return version === null || version === undefined ? null : value;
}
