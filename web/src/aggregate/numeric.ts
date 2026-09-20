/**
 * The numeric primitives the metric definitions are built from.
 *
 * Two of them exist to agree bit-for-bit with the pipeline, because docs/06 §12.1 asserts that
 * the app's unfiltered aggregates *equal* the exported `summary` block. Two independent
 * computations of the same number are only a useful check if they round the same way.
 */

/**
 * Python's `round(x, 4)`, which `uwpr_pubs.export.build_summary` applies to both field-weighted
 * impact figures.
 *
 * `Math.round(x * 1e4) / 1e4` is *not* the same function: the sample's median is 1.19675, which
 * Python renders 1.1967 and `Math.round` renders 1.1968. Python rounds the exact binary value of
 * the double, and `Number.prototype.toFixed` does the same, so this agrees wherever the value is
 * not an exact decimal tie — and an exact tie requires a dyadic rational, which a ratio of
 * citation counts effectively never is.
 */
export function round4(value: number): number {
  return Number(value.toFixed(4));
}

/**
 * Neumaier-compensated summation, matching Python's `math.fsum` used by `statistics.fmean`.
 *
 * A naive left fold over floats can differ in the last bits, and the cross-check compares
 * rounded means for equality rather than for closeness.
 */
export function exactSum(values: readonly number[]): number {
  let sum = 0;
  let compensation = 0;
  for (const value of values) {
    const next = sum + value;
    compensation += Math.abs(sum) >= Math.abs(value) ? sum - next + value : value - next + sum;
    sum = next;
  }
  return sum + compensation;
}

/** `statistics.median`: the middle value, or the mean of the two middle values. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[middle] as number;
  return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

/** `statistics.fmean`: the arithmetic mean, summed exactly. */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return exactSum(values) / values.length;
}

/** Distinct values of `key` over `items`, skipping null and undefined. */
export function distinct<T>(
  items: Iterable<T>,
  key: (item: T) => string | null | undefined,
): number {
  const seen = new Set<string>();
  for (const item of items) {
    const value = key(item);
    if (value !== null && value !== undefined) seen.add(value);
  }
  return seen.size;
}
