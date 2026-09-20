/**
 * The partial-period mark, shared by every chart with a time axis (docs/05 §4.2).
 *
 * > The store's most recent year is incomplete … Drawn without a flag, **every time-series chart
 * > shows a sharp decline in the current year that is an artifact of the calendar**. The app must
 * > mark the current year as partial in every chart that includes it. **This is a requirement,
 * > not a suggestion.**
 *
 * "Every chart" is why it lives in the kit rather than in the one chart that needed it first.
 * Three charts carry a time axis and each needs the mark in a different form: a bar whose whole
 * fill can be hatched, a stack of coloured segments that can only be hatched *over*, and a group
 * of years bucketed together. `PartialPattern` serves the first two — `filled` decides whether
 * the hatch brings its own background — and `PartialKey` is the sentence under the chart, because
 * docs/06 §8 forbids carrying the fact in the drawing alone.
 */
export interface PartialPatternProps {
  id: string;
  /**
   * True where the hatch *is* the mark's fill; false where it is drawn over a coloured mark and
   * must let the colour through.
   */
  filled?: boolean;
}

export function PartialPattern({ id, filled = true }: PartialPatternProps) {
  return (
    <defs>
      <pattern
        id={id}
        width={6}
        height={6}
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        {filled ? <rect width={6} height={6} fill="var(--chart-partial-bg)" /> : null}
        <line
          x1={0}
          y1={0}
          x2={0}
          y2={6}
          stroke="var(--chart-partial-line)"
          strokeWidth={filled ? 3 : 2}
        />
      </pattern>
    </defs>
  );
}

export interface PartialKeyProps {
  /** What is partial: the years, or the periods containing them. */
  labels: readonly string[];
  /** The noun the sentence uses: "year" for a year axis, "period" for bucketed years. */
  noun?: string;
}

/** The sentence under a chart saying which periods are not over, so colour is never the only channel. */
export function PartialKey({ labels, noun = 'year' }: PartialKeyProps) {
  if (labels.length === 0) return null;
  const one = labels.length === 1;
  return (
    <p className="chart-partial-key">
      <span className="chart-partial-swatch" aria-hidden="true" />
      {labels.join(', ')} {one ? 'is' : 'are'} partial: the {one ? `${noun} is` : `${noun}s are`}{' '}
      not over, so the {one ? 'bar is' : 'bars are'} hatched and will grow.
    </p>
  );
}
