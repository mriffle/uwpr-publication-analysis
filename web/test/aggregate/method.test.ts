/**
 * The method page's aggregates, and the cross-check that matters most among them.
 *
 * docs/06 §12.1 calls the summary cross-check "the single highest-value test in the suite: two
 * independent computations of the same number". The `method` block deserves the same treatment
 * and gets it here: the pipeline's `build_method` and the app's own pass over the rows must
 * agree on how many listed works the project confirmed for itself, on how many rest on the
 * listing alone, and on the four criteria counts.
 *
 * **The read/unreadable split deliberately has no row-derived counterpart.** Full-text status is
 * not exported per work (docs/05 §4.3), which is precisely why the pipeline aggregates it; the
 * test below asserts the parts sum to their whole instead, because a proportion bar drawn from
 * parts that do not is a picture that overstates.
 *
 * Every expectation is read from whichever export is loaded — nothing is hard-coded — so the
 * same assertions hold over the 16-work sample and the real 339-work export.
 */
import { describe, expect, it } from 'vitest';
import { criteriaBars } from '../../src/aggregate/categories';
import {
  BEYOND_OFFICIAL_LIST,
  INDEPENDENTLY_CONFIRMED,
  NOT_READABLE,
  ON_OFFICIAL_LIST,
  READ_NO_TRACE,
  confirmationSplit,
  evidenceSources,
  officialListSplit,
  sourcesLastRead,
  worksIndependentlyConfirmed,
  worksListedOnly,
} from '../../src/aggregate/method';
import {
  beyondOfficialList,
  onOfficialList,
  worksWithStaffAuthor,
} from '../../src/aggregate/metrics';
import { CRITERION_LABELS } from '../../src/filter/describe';
import { sampleExport } from '../support/fixture';

const doc = sampleExport();
const { method, works } = doc;

describe('the app’s own pass over the rows equals the exported method block', () => {
  it('agrees on how many works are on the resource’s own list', () => {
    expect(onOfficialList(works)).toBe(method.official_list_total);
  });

  it('agrees on how many of those the project confirmed for itself', () => {
    expect(worksIndependentlyConfirmed(works)).toBe(method.independently_confirmed);
  });

  it('agrees on how many rest on the listing alone', () => {
    expect(worksListedOnly(works)).toBe(method.listing_only);
  });

  it('agrees on how many works are beyond the list', () => {
    expect(beyondOfficialList(works)).toBe(method.beyond_official_list);
  });

  it('agrees on how many works have a staff author', () => {
    expect(worksWithStaffAuthor(works)).toBe(method.works_with_staff_author);
  });

  it('agrees on every criterion count, and on how many works overlap (docs/05 §7.13)', () => {
    const bars = criteriaBars(works, CRITERION_LABELS);
    const counted = Object.fromEntries(bars.items.map((item) => [item.key, item.count]));
    expect(counted).toEqual(method.criteria);
    expect(bars.overlapping).toBe(method.works_with_multiple_criteria);
  });

  it('is checking a non-trivial corpus', () => {
    // A vacuous pass — everything zero on both sides — would be worse than no test at all.
    expect(works.length).toBeGreaterThan(0);
    expect(method.official_list_total).toBeGreaterThan(0);
  });
});

describe('the confirmation split (docs/05 §10)', () => {
  const split = confirmationSplit(method);

  it('divides the works on the list, and its parts account for all of them', () => {
    expect(split.total).toBe(method.official_list_total);
    expect(split.unaccounted).toBe(0);
  });

  it('carries the three parts §10 names, in the order it names them', () => {
    expect(split.segments).toEqual([
      { key: INDEPENDENTLY_CONFIRMED, value: method.independently_confirmed },
      { key: READ_NO_TRACE, value: method.listing_only_text_read },
      { key: NOT_READABLE, value: method.listing_only_text_unavailable },
    ]);
  });

  it('splits exactly the listing-only works into read and unreadable', () => {
    expect(method.listing_only_text_read + method.listing_only_text_unavailable).toBe(
      method.listing_only,
    );
  });
});

describe('the corpus against the resource’s own list (docs/05 §10)', () => {
  const split = officialListSplit(method);

  it('divides every work, and its parts account for all of them', () => {
    expect(split.total).toBe(works.length);
    expect(split.unaccounted).toBe(0);
  });

  it('carries the list and what is beyond it', () => {
    expect(split.segments).toEqual([
      { key: ON_OFFICIAL_LIST, value: method.official_list_total },
      { key: BEYOND_OFFICIAL_LIST, value: method.beyond_official_list },
    ]);
  });
});

describe('a proportion whose parts exceed its whole is reported, not hidden', () => {
  it('carries the shortfall rather than silently rescaling', () => {
    const broken = confirmationSplit({ ...method, official_list_total: 0 });
    expect(broken.unaccounted).toBe(-(method.independently_confirmed + method.listing_only));
  });
});

describe('where the evidence was found (docs/05 §10)', () => {
  const sources = evidenceSources(works);

  it('counts each work once per source, never once per evidence entry', () => {
    for (const item of sources.items) {
      const expected = works.filter((work) =>
        work.evidence.some((entry) => entry.source.name === item.key),
      ).length;
      expect(item.count).toBe(expected);
      expect(item.count).toBeLessThanOrEqual(works.length);
    }
  });

  it('names exactly the sources the export dates, and no others', () => {
    // `sources_last_read` is derived from the same evidence, so the two must name the same set.
    // A source appearing in one and not the other is a contract drift, not a display detail.
    expect(sources.items.map((item) => item.key).sort()).toEqual(
      Object.keys(method.sources_last_read).sort(),
    );
  });

  it('sums to more than the corpus, because the sources overlap', () => {
    expect(sources.works).toBe(works.length);
    expect(sources.total).toBe(sources.items.reduce((sum, item) => sum + item.count, 0));
    expect(sources.total).toBeGreaterThanOrEqual(works.length);
  });

  it('ranks descending by count, then by name', () => {
    const ordered = [...sources.items].sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label),
    );
    expect(sources.items).toEqual(ordered);
  });

  it('counts nothing over an empty corpus', () => {
    expect(evidenceSources([])).toEqual({ items: [], works: 0, total: 0 });
  });
});

describe('the sources with the date each was last read (docs/05 §10)', () => {
  it('reads them from the export rather than from a list the app holds', () => {
    const read = sourcesLastRead(method);
    expect(read.map((row) => row.name)).toEqual(
      Object.keys(method.sources_last_read).sort((a, b) => a.localeCompare(b)),
    );
    for (const row of read) expect(row.date).toBe(method.sources_last_read[row.name]);
  });

  it('is empty when the export dates nothing, rather than guessing', () => {
    expect(sourcesLastRead({ ...method, sources_last_read: {} })).toEqual([]);
  });
});
