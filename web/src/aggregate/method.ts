/**
 * The aggregates the method page states (docs/05 §10, docs/06 §10).
 *
 * Two of them cannot be computed from the rows. **Full-text status is deliberately not exported
 * per work** (docs/05 §4.3, "cache hashes and full-text status (internal)"), but the *split*
 * between a listed paper whose text was read with no trace found and one that could not be read
 * at all is the whole point of §10 — so the pipeline aggregates it into the `method` block and
 * this module reads it from there. Everything else on the page is derived from the works, and
 * the row-derived counts below exist so a test can assert the two agree, in the same way
 * `summary` is cross-checked against `summarize()` (docs/06 §12.1).
 *
 * Pure (docs/06 B4): no React, no rendering, no colour, and **no display strings** — the labels
 * the segments are drawn with live in the view, next to the rest of the page's prose, so the
 * register of docs/05 §11 is governed in one place.
 */
import type { Method, Work } from '../contract/types';

/** One part of a whole, keyed so the view can attach a label and a colour to it. */
export interface MethodSegment {
  key: string;
  value: number;
}

export interface MethodProportion {
  segments: MethodSegment[];
  total: number;
  /**
   * `total` less the segments, which is 0 whenever the contract is internally consistent.
   *
   * It is carried rather than assumed because a proportion bar drawn from segments that do not
   * sum to their total is a picture that overstates: the reader reads the widths as shares of
   * the whole. `ProportionBar` scales by whichever is larger, and a test asserts this is 0 on
   * both the sample and the real export.
   */
  unaccounted: number;
}

function proportion(total: number, segments: MethodSegment[]): MethodProportion {
  const sum = segments.reduce((running, segment) => running + segment.value, 0);
  return { segments, total, unaccounted: total - sum };
}

/** The segment keys, exported so the view's labels and the tests name the same parts. */
export const INDEPENDENTLY_CONFIRMED = 'independently-confirmed';
export const READ_NO_TRACE = 'read-no-trace';
export const NOT_READABLE = 'not-readable';
export const ON_OFFICIAL_LIST = 'on-official-list';
export const BEYOND_OFFICIAL_LIST = 'beyond-official-list';

/**
 * docs/05 §10, "What is independently confirmed": of the works on the resource's own list, those
 * carrying evidence the pipeline found for itself, and the remainder split into the texts that
 * were read with no trace found and the texts that could not be read at all.
 */
export const confirmationSplit = (method: Method): MethodProportion =>
  proportion(method.official_list_total, [
    { key: INDEPENDENTLY_CONFIRMED, value: method.independently_confirmed },
    { key: READ_NO_TRACE, value: method.listing_only_text_read },
    { key: NOT_READABLE, value: method.listing_only_text_unavailable },
  ]);

/**
 * docs/05 §10, "What the pipeline adds": the corpus split into the works on the resource's own
 * publications page and the works included on evidence that are absent from it.
 */
export const officialListSplit = (method: Method): MethodProportion =>
  proportion(method.official_list_total + method.beyond_official_list, [
    { key: ON_OFFICIAL_LIST, value: method.official_list_total },
    { key: BEYOND_OFFICIAL_LIST, value: method.beyond_official_list },
  ]);

/**
 * The two counts of the split that the rows *can* answer, for the cross-check.
 *
 * They follow the pipeline's definitions exactly (`build_method` in `src/uwpr_pubs/export.py`):
 * a listed work is "listing only" when the inclusion criteria it satisfies are **just** the
 * listing, and "independently confirmed" otherwise. Asserting these against the `method` block
 * is worth what docs/06 §12.1 says the summary cross-check is worth — two independent
 * computations of the same number. The read/unreadable split below them has no row-derived
 * counterpart, which is exactly why the pipeline aggregates it.
 *
 * The other three figures the method page states from the rows — works on the list, works beyond
 * it, works with a staff author — are already defined in `metrics.ts` and are used from there.
 */
const LISTING = 1;

export const worksIndependentlyConfirmed = (works: readonly Work[]): number =>
  works.filter(
    (work) => work.on_official_list && work.criteria.some((criterion) => criterion !== LISTING),
  ).length;

export const worksListedOnly = (works: readonly Work[]): number =>
  works.filter(
    (work) => work.on_official_list && work.criteria.every((criterion) => criterion === LISTING),
  ).length;

export interface SourceTally {
  key: string;
  label: string;
  count: number;
}

export interface EvidenceSources {
  items: SourceTally[];
  /** The works the tally was computed over, which is the denominator of any share. */
  works: number;
  /** The sum of the bars. It exceeds `works`, because a work may carry several sources. */
  total: number;
}

/**
 * docs/05 §10, "Where the numbers come from", as a count rather than a list: how many works
 * carry evidence from each source.
 *
 * A work is counted **once per distinct source**, never once per evidence entry, so the bars are
 * publications and not sentences. They overlap — a paper can be on the resource's list and name
 * it in its acknowledgements — exactly as the criteria of §7.13 do, and the chart says so.
 *
 * The source names are the ones the evidence carries. The app invents none: docs/05's changelog
 * records that `source.name` "is already the human-facing name the page shows", which is also
 * what the `sources_last_read` keys are.
 */
export function evidenceSources(works: readonly Work[]): EvidenceSources {
  const counts = new Map<string, number>();
  for (const work of works) {
    const seen = new Set<string>();
    for (const entry of work.evidence) {
      const name = entry.source.name;
      if (name === '' || seen.has(name)) continue;
      seen.add(name);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  const items = [...counts.entries()]
    .map(([name, count]) => ({ key: name, label: name, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return {
    items,
    works: works.length,
    total: items.reduce((running, item) => running + item.count, 0),
  };
}

export interface SourceRead {
  name: string;
  /** The ISO date the source was last read, from `method.sources_last_read`. */
  date: string;
}

/**
 * docs/05 §10: the sources, "each with the date it was last read".
 *
 * Taken from the export's own map rather than a list the app holds, so a source that produced no
 * evidence this run is absent rather than shown with a stale or invented date.
 */
export const sourcesLastRead = (method: Method): SourceRead[] =>
  Object.entries(method.sources_last_read)
    .map(([name, date]) => ({ name, date }))
    .sort((a, b) => a.name.localeCompare(b.name));
