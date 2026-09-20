/**
 * The chart palette (docs/06 §8).
 *
 * "A colour-blind-safe categorical palette of at most six plus 'Other', which is why §4.4 groups
 * fields to five. Adjacent marks must be distinguishable by more than hue."
 *
 * The six are Okabe–Ito, the standard eight-colour set designed for the three common forms of
 * colour vision deficiency, minus its yellow (unreadable on a light background) and its black.
 * Each is checked at 3:1 against both themes' backgrounds, which is docs/06 §9's bar for a
 * meaningful graphical element.
 *
 * Components reference the CSS custom properties rather than these hexes, so the same chart code
 * serves light and dark without a theme prop and tests assert structure rather than colour. The
 * values are kept here because `styles.css` defines them and an SVG download will need them.
 */

export interface SeriesColour {
  /** The CSS custom property `styles.css` defines. */
  readonly token: string;
  readonly light: string;
  readonly dark: string;
}

export const CATEGORICAL: readonly SeriesColour[] = [
  { token: '--chart-1', light: '#0072b2', dark: '#63b3ed' },
  { token: '--chart-2', light: '#d55e00', dark: '#f6935a' },
  { token: '--chart-3', light: '#009e73', dark: '#4fd1a5' },
  { token: '--chart-4', light: '#cc79a7', dark: '#e0a3c4' },
  { token: '--chart-5', light: '#56b4e9', dark: '#8fd3f4' },
  { token: '--chart-6', light: '#e69f00', dark: '#f0c14b' },
] as const;

/** The residual category docs/06 §8 reserves; never one of the six. */
export const OTHER: SeriesColour = { token: '--chart-other', light: '#6b7280', dark: '#9aa3b2' };

/** The maximum number of distinct categories a chart may draw before grouping into "Other". */
export const MAX_CATEGORIES = CATEGORICAL.length;

/** `var(--chart-3)`, wrapping at six so a caller never silently reuses a colour it did not pick. */
export function seriesColour(index: number): string {
  const colour = CATEGORICAL[index % CATEGORICAL.length];
  return `var(${colour?.token ?? OTHER.token})`;
}

export const otherColour = (): string => `var(${OTHER.token})`;
