/**
 * The one way the app reads the export's funding data (docs/09).
 *
 * **An export may carry none.** Data and app are published separately (docs/07 O2), so the app
 * meets exports older than itself: for a while after every deploy, and after any rollback of the
 * data. `load.ts` accepts any 1.x export, so a missing funding block reaches the views, and every
 * funding read goes through here so that "this export has no funding data" is one designed state
 * rather than a crash wherever a view first reaches for it.
 *
 * Untyped until the contract adds the block and the generated types carry it; then this narrows
 * to that type and nothing that calls it changes.
 */
import type { ExportDocument } from './types';

/** The export's funding block, or null when this export has none. */
export function fundingOf(doc: ExportDocument): object | null {
  const value: unknown = (doc as { funding?: unknown }).funding;
  return typeof value === 'object' && value !== null ? value : null;
}
