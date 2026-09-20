/**
 * One number format for the whole page (docs/06 §8: "Charts read as one system. One axis
 * treatment, one tooltip, one legend, one number format, from the shared kit").
 *
 * The locale is fixed to `en-US` rather than the reader's, so that a figure quoted from the page
 * into a report reads the same as the figure in the export and in the pipeline's own reports.
 */
const INTEGER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const PERCENT = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 0,
});

export const formatCount = (value: number): string => INTEGER.format(value);

export const formatDecimal = (value: number): string => DECIMAL.format(value);

/** A share, always shown with its counts alongside (docs/06 §4.6, docs/05 §7.12). */
export const formatShare = (value: number): string => PERCENT.format(value);

/** `null` is "known to be absent" throughout the contract, and reads as such. */
export const formatOptional = (value: number | null, format: (value: number) => string): string =>
  value === null ? 'not available' : format(value);

/** "3 publications" / "1 publication". */
export const pluralize = (count: number, singular: string, plural = `${singular}s`): string =>
  `${formatCount(count)} ${count === 1 ? singular : plural}`;
