/**
 * Dates, in one form: `20 September 2026`. Unambiguous to both a US and a non-US reader, which
 * matters on a page whose audience includes funders and prospective users outside the country.
 */
const FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** An ISO date or datetime from the export; the string itself if it cannot be parsed. */
export function formatDate(iso: string): string {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? iso : FORMAT.format(new Date(parsed));
}
