/**
 * "The data is more than 14 days old: say so, in place, near the 'data as of' date and the
 * headline figures" (docs/06 §7, added 2026-09-20 by docs/07 O3).
 *
 * Two missed weekly runs means something is wrong, and the run's own alerting cannot report a
 * run that never happened. Register per docs/05 §11: it states the fact and its consequence,
 * and claims nothing about the cause.
 */
import { dataAgeInDays, STALE_AFTER_DAYS } from '../contract/staleness';
import { formatDate } from '../format/date';
import { pluralize } from '../format/number';

export interface StalenessNoticeProps {
  generatedAt: string;
  now?: Date;
}

export function StalenessNotice({ generatedAt, now = new Date() }: StalenessNoticeProps) {
  const age = dataAgeInDays(generatedAt, now);
  if (age <= STALE_AFTER_DAYS) return null;
  return (
    <p className="notice" role="status">
      These figures were generated on {formatDate(generatedAt)}, {pluralize(age, 'day')} ago. The
      data is normally refreshed weekly, so it is out of date and newer publications and citation
      counts are missing.
    </p>
  );
}
