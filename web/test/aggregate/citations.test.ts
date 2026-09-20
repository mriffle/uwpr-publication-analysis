/**
 * The citation profile of docs/05 §7.10 and §7.11.
 *
 * The one requirement in §7.11 is the one easiest to lose: "the zero-citation works need their
 * own bucket since a log axis has no zero".
 */
import { describe, expect, it } from 'vitest';
import { citationBuckets, mostCited } from '../../src/aggregate/citations';
import { work } from '../support/works';
import { isSampleExport, sampleExport } from '../support/fixture';

const cited = (total: number, extra: { year?: number; title?: string } = {}) =>
  work({
    ...(extra.year === undefined ? {} : { year: extra.year }),
    ...(extra.title === undefined ? {} : { title: extra.title }),
    citations: { total, by_year: {}, fwci: null, percentile: null, as_of: '2026-09-20' },
  });

describe('most cited (docs/05 §7.10)', () => {
  it('ranks by citations and takes the top n', () => {
    const works = [cited(3), cited(100), cited(50)];
    expect(mostCited(works, 2).map((item) => item.citations.total)).toEqual([100, 50]);
  });

  it('breaks ties deterministically, so a weekly refresh does not reshuffle the list', () => {
    const a = cited(10, { year: 2020, title: 'B' });
    const b = cited(10, { year: 2020, title: 'A' });
    expect(mostCited([a, b]).map((item) => item.title)).toEqual(['A', 'B']);
    expect(mostCited([b, a]).map((item) => item.title)).toEqual(['A', 'B']);
  });

  it('prefers the newer work when citations tie, which is the more useful ordering', () => {
    const old = cited(10, { year: 2010, title: 'A' });
    const recent = cited(10, { year: 2024, title: 'Z' });
    expect(mostCited([old, recent])[0]?.year).toBe(2024);
  });

  it('never returns more rows than there are works', () => {
    expect(mostCited([cited(1)], 15)).toHaveLength(1);
    expect(mostCited([], 15)).toEqual([]);
  });

  it('leaves the input array alone', () => {
    const works = [cited(1), cited(9)];
    const copy = [...works];
    mostCited(works);
    expect(works).toEqual(copy);
  });
});

describe('the citation distribution (docs/05 §7.11)', () => {
  it('gives works with no citations a bucket of their own, because a log axis has no zero', () => {
    const buckets = citationBuckets([cited(0), cited(0), cited(5)]);
    const zero = buckets.find((bucket) => bucket.zero);
    expect(zero?.count).toBe(2);
    expect(zero?.label).toBe('0');
    expect(buckets.filter((bucket) => bucket.zero)).toHaveLength(1);
  });

  it('bands the rest on half-decade boundaries, so each bar is the same log width', () => {
    const buckets = citationBuckets([cited(1), cited(2), cited(3), cited(9), cited(10)]);
    const labels = buckets.filter((bucket) => !bucket.zero).map((bucket) => bucket.label);
    expect(labels).toEqual(['1–2', '3–9', '10+']);
    expect(buckets.find((bucket) => bucket.label === '1–2')?.count).toBe(2);
    expect(buckets.find((bucket) => bucket.label === '3–9')?.count).toBe(2);
  });

  it('stops where the data stops rather than drawing a row of empty bands', () => {
    const buckets = citationBuckets([cited(4)]);
    expect(buckets.at(-1)?.max).toBeNull();
    expect(buckets).toHaveLength(3); // zero, 1–2, 3+
  });

  it('accounts for every work exactly once', () => {
    const works = [0, 1, 2, 3, 9, 10, 30, 31, 99, 100, 1650].map((total) => cited(total));
    const buckets = citationBuckets(works);
    expect(buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(works.length);
  });

  it('produces only the zero bucket for an empty corpus', () => {
    const buckets = citationBuckets([]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.count).toBe(0);
  });
});

describe.skipIf(!isSampleExport)('against the committed sample export', () => {
  it('accounts for every work in the corpus', () => {
    const doc = sampleExport();
    const buckets = citationBuckets(doc.works);
    expect(buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(doc.works.length);
  });
});
