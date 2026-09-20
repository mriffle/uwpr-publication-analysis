/**
 * THE cross-check (docs/06 §12.1).
 *
 * "The app's unfiltered aggregates must equal the exported `summary` block, which the pipeline
 * computes independently (docs/05 §1.2). A metric implemented to a different definition than the
 * pipeline used. This is the single highest-value test in the suite: two independent
 * computations of the same number."
 *
 * Every expectation is read from whichever export is loaded, never hard-coded, so this test is
 * equally valid against the 16-work sample and the 339-work real export.
 */
import { describe, expect, it } from 'vitest';
import { summarize } from '../../src/aggregate/metrics';
import { citationsInWindow, totalCitations, yearSpan } from '../../src/aggregate/metrics';
import { publicationsPerYear } from '../../src/aggregate/series';
import { sampleExport } from '../support/fixture';

const doc = sampleExport();
const computed = summarize(doc.works);

describe('the app’s unfiltered aggregates equal the exported summary block', () => {
  it('agrees on every field at once', () => {
    expect(computed).toEqual(doc.summary);
  });

  // Field by field as well, so a failure names the metric whose definition drifted rather than
  // printing two seventeen-key objects.
  const fields = Object.keys(doc.summary) as (keyof typeof doc.summary)[];
  it.each(fields)('agrees on summary.%s', (field) => {
    expect(computed[field]).toStrictEqual(doc.summary[field]);
  });

  it('is checking a non-trivial corpus', () => {
    // A vacuous pass — an empty works array equalling an all-zero summary — would be worse than
    // no test at all, so the fixture's own scale is asserted rather than assumed.
    expect(doc.works.length).toBeGreaterThan(0);
    expect(doc.summary.publications).toBe(doc.works.length);
  });
});

describe('the period block agrees with the rows', () => {
  it('spans the same years the works do', () => {
    const span = yearSpan(doc.works);
    expect(span).not.toBeNull();
    expect(span?.first).toBe(doc.period.first_year);
    expect(span?.last).toBe(doc.period.last_year);
  });

  it('accounts for every citation outside the by-year window (docs/05 §7.3)', () => {
    expect(totalCitations(doc.works) - citationsInWindow(doc.works)).toBe(
      doc.period.citations_before_window,
    );
  });

  it('draws a cumulative series ending at the publication count', () => {
    const points = publicationsPerYear(doc.works, doc.period);
    expect(points.at(-1)?.cumulative).toBe(doc.summary.publications);
  });

  it('marks exactly the years after the last complete one as partial', () => {
    const points = publicationsPerYear(doc.works, doc.period);
    const partial = points.filter((point) => point.partial).map((point) => point.year);
    const expected = doc.period.current_year_partial
      ? points.map((p) => p.year).filter((year) => year > doc.period.complete_through)
      : [];
    expect(partial).toEqual(expected);
  });
});
