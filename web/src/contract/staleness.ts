/**
 * How current the data is (docs/06 §7 and §4.1, added 2026-09-20 by docs/07 O3).
 *
 * "The app must state its own staleness when the data is more than 14 days old — two missed
 * weekly runs — where the reader will see it, rather than presenting old figures as current."
 * The run's own alerting cannot report a run that never happened, so this is the layer that
 * catches the schedule silently stopping.
 */

/** Two missed weekly runs. */
export const STALE_AFTER_DAYS = 14;

const MS_PER_DAY = 86_400_000;

/** Whole days between the export's `generated_at` and `now`; negative clamps to 0. */
export function dataAgeInDays(generatedAt: string, now: Date): number {
  const generated = Date.parse(generatedAt);
  if (Number.isNaN(generated)) return 0;
  return Math.max(0, Math.floor((now.getTime() - generated) / MS_PER_DAY));
}

export function isStale(generatedAt: string, now: Date): boolean {
  return dataAgeInDays(generatedAt, now) > STALE_AFTER_DAYS;
}
