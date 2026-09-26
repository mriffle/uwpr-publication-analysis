/**
 * One number format for the whole page (docs/06 §8: "Charts read as one system. One axis
 * treatment, one tooltip, one legend, one number format, from the shared kit").
 *
 * The locale is fixed to `en-US` rather than the reader's, so that a figure quoted from the page
 * into a report reads the same as the figure in the export and in the pipeline's own reports.
 *
 * The strings come from the platform's ICU data, and unit tests pin them under Node's. The
 * compact currency format is the likeliest to differ between engines and ICU versions, so
 * end-to-end tests, which run in a browser, read exact values rather than compact ones.
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

/*
 * Money. Grant totals are whole dollars in the contract, so no format shows cents.
 *
 * A negative amount is not expected, but must still read correctly: "-$5". What must never
 * appear is "-$0", which Intl writes for -0 and for a tiny negative that rounds to zero, so a
 * value that rounds to zero is formatted as zero. (`signDisplay: 'negative'` does the same, but
 * is ES2023 and outside this build's `lib`.)
 */
const WHOLE_MONEY = {
  style: 'currency',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
} as const;

const USD = new Intl.NumberFormat('en-US', { ...WHOLE_MONEY, currency: 'USD' });
const USD_COMPACT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumSignificantDigits: 3,
});

/** Zero for anything whole-unit rounding would show as zero, so it never reads "-$0". */
const wholeOrZero = (value: number): number => (Math.abs(value) < 0.5 ? 0 : value);

/** "$6,219,845,123": the exact figure, for tables, tooltips and accessible names (docs/06 §7). */
export const formatUsd = (value: number): string => USD.format(wholeOrZero(value));

/**
 * "$6.22B": three significant figures, **for axes and large headline figures only**. It rounds,
 * so the exact `formatUsd` value must also be available wherever this one is shown — in the
 * tooltip, the accessible name or the table (docs/06 §7: "Tooltips give exact values").
 */
export const formatUsdCompact = (value: number): string =>
  USD_COMPACT.format(Object.is(value, -0) ? 0 : value);

const MONEY = new Map<string, Intl.NumberFormat>();

/**
 * An amount in the currency it was awarded in: "£1,234,567", "SEK 2,000,000" (with a no-break
 * space). The platform's currency data decides symbol or code, so a currency whose symbol would
 * be ambiguous in English — the three Scandinavian crowns are all "kr" — reads as its ISO code.
 *
 * A code the platform rejects outright is shown as written beside the number rather than
 * throwing: the page must not fail over one malformed field.
 */
export function formatMoney(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  let format = MONEY.get(code);
  if (format === undefined) {
    try {
      format = new Intl.NumberFormat('en-US', { ...WHOLE_MONEY, currency: code });
    } catch {
      return `${currency} ${formatCount(wholeOrZero(amount))}`;
    }
    MONEY.set(code, format);
  }
  return format.format(wholeOrZero(amount));
}
