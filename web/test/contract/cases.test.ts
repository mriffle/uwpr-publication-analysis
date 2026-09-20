/**
 * docs/06 §12.1, the third project-specific check: "Every case in docs/05 §13 renders."
 *
 * "The states that exist in the data but are rare enough that nobody meets them while
 * developing. The retraction case in particular has no instance in the real store, so only the
 * sample exercises it — and citation metadata refreshes weekly, so a real one can appear any
 * week."
 *
 * This slice builds the contract, aggregate, filter and chart layers; the publication detail
 * view, where most of the twelve cases are *displayed*, is a later slice. So this file does two
 * things now, and the file is where the rest is added when that view lands:
 *
 *  1. asserts the sample export still carries an instance of each of the twelve, so a later
 *     regeneration that loses one is caught here rather than in a detail view nobody tested;
 *  2. asserts the layers that exist today handle each case rather than assuming it away — a work
 *     with no field-weighted impact is excluded from the median, one with no open-access link is
 *     still counted open access, a retracted work is still an ordinary row in every aggregate,
 *     a merged pair counts once, and a retired identifier resolves.
 *
 * Each predicate is the app's own reading of the case, not a copy of `uwpr_pubs.sample`'s.
 */
import { describe, expect, it } from 'vitest';
import { summarize } from '../../src/aggregate/metrics';
import { buildWorkIndex, resolveWork } from '../../src/contract/resolve';
import type { Work } from '../../src/contract/types';
import { applyFilter } from '../../src/filter/predicate';
import { EMPTY_FILTER } from '../../src/filter/state';
import { isSampleExport, sampleExport } from '../support/fixture';

const doc = sampleExport();
const find = (predicate: (work: Work) => boolean): Work | undefined => doc.works.find(predicate);

/** The twelve of docs/05 §13, each as a predicate over the exported rows. */
const CASES: Record<string, (work: Work) => boolean> = {
  'a preprint-only work': (work) => work.is_preprint,
  'a merged preprint-and-article pair': (work) => !work.is_preprint && work.versions.length > 0,
  'evidence that is the site listing, with no excerpt': (work) =>
    work.evidence.some((entry) => entry.rule === 'R1' && entry.excerpt === null),
  'a full-text-index match, with no excerpt': (work) =>
    work.evidence.some((entry) => entry.rule === 'R6' && entry.excerpt === null),
  'an override with its attribution': (work) =>
    work.evidence.some((entry) => {
      const detail = entry.detail as Record<string, unknown>;
      return entry.rule === 'override' && Boolean(detail.by) && Boolean(detail.date);
    }),
  'a work with no open-access link': (work) => work.oa.url === null,
  'a work with no field-weighted impact': (work) => work.citations.fwci === null,
  'a retracted work': (work) => work.retracted,
  'a work with a single author': (work) => work.author_count === 1,
  'a work with more than fifty authors': (work) => work.author_count > 50,
  'an author with no ROR-resolved affiliation': (work) =>
    work.authors.some((person) => person.institutions.length === 0),
  'a retired work ID in aliases': (work) => work.aliases.length > 0,
};

describe.skipIf(!isSampleExport)('the sample export covers every case of docs/05 §13', () => {
  it.each(Object.keys(CASES))('has %s', (name) => {
    const predicate = CASES[name];
    expect(predicate).toBeDefined();
    expect(doc.works.some((work) => predicate?.(work) ?? false)).toBe(true);
  });
});

describe.skipIf(!isSampleExport)(
  'the layers this slice builds handle each case rather than assuming it away',
  () => {
    it('counts a preprint-only work once, and labels it by the flag not the venue', () => {
      const preprint = find(CASES['a preprint-only work'] as (work: Work) => boolean);
      expect(preprint?.is_preprint).toBe(true);
      expect(summarize([preprint as Work]).preprint_only).toBe(1);
      // A preprint server is a venue and is counted as a journal (docs/05 §5, §7.9).
      expect(summarize([preprint as Work]).journals).toBe(preprint?.venue === null ? 0 : 1);
    });

    it('counts a merged pair as one publication, not two', () => {
      const merged = find(CASES['a merged preprint-and-article pair'] as (work: Work) => boolean);
      expect(merged?.versions.length).toBeGreaterThan(0);
      expect(summarize([merged as Work]).publications).toBe(1);
    });

    it('keeps evidence with no excerpt, so the app can choose its wording per case', () => {
      for (const name of [
        'evidence that is the site listing, with no excerpt',
        'a full-text-index match, with no excerpt',
      ]) {
        const work = find(CASES[name] as (work: Work) => boolean);
        const entry = work?.evidence.find((item) => item.excerpt === null);
        // Null, never an empty string: "the app must not render an empty quotation" (docs/06 §5).
        expect(entry?.excerpt).toBeNull();
        expect(entry?.label).not.toBe('');
      }
    });

    it('carries an override as a judgement rather than a measurement', () => {
      const work = find(CASES['an override with its attribution'] as (work: Work) => boolean);
      const entry = work?.evidence.find((item) => item.rule === 'override');
      expect(entry?.criterion).toBeNull();
      expect(entry?.section).toBe('override');
      expect(entry?.source.name).toBe('overrides.yaml');
      // Override evidence belongs to the work, not a record, so it names no version.
      expect(entry && 'found_on' in entry).toBe(false);
    });

    /**
     * docs/06 §5 requires the app to show "the recorded reason, attributed to the person who
     * decided it and dated. It is a judgement, not a measurement, and must read as one."
     *
     * All three now arrive: `overrides.yaml` records `reason`, `by` and `date` on every entry,
     * the pipeline turns an include override into evidence carrying them (the reason as the
     * label, the rest as `detail`), and the export schema requires `detail.by` and `detail.date`
     * of every `rule: "override"` entry. So the app can render §5's wording from the data rather
     * than inventing an attribution, which docs/05 §11.6 forbids. This test is what the app's
     * own reading of the case rests on; it was a recorded gap until 2026-09-20.
     */
    it('carries the attribution the app must show: a reason, a person and a date', () => {
      const work = find(CASES['an override with its attribution'] as (work: Work) => boolean);
      const entry = work?.evidence.find((item) => item.rule === 'override');
      const detail = entry?.detail as Record<string, unknown>;
      expect(entry?.label).toBeTruthy();
      expect(detail.by).toEqual(expect.any(String));
      expect(detail.by).not.toBe('');
      // A date the app can format, not a free-text one: the same ISO shape as every other date.
      expect(detail.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // The reason is the label; there is no quotation to show, because nothing was read.
      expect(entry?.excerpt).toBeNull();
    });

    it('counts a work with no open-access link by its status, not by its link (docs/05 changelog)', () => {
      const work = find(CASES['a work with no open-access link'] as (work: Work) => boolean);
      expect(work?.oa.url).toBeNull();
      expect(summarize([work as Work]).open_access).toBe(work?.oa.status === 'closed' ? 0 : 1);
    });

    it('excludes a work with no field-weighted impact from the median rather than reading it as zero', () => {
      const work = find(CASES['a work with no field-weighted impact'] as (work: Work) => boolean);
      expect(summarize([work as Work]).fwci_median).toBeNull();
    });

    it('treats a retracted work as an ordinary row in every aggregate', () => {
      const work = find(CASES['a retracted work'] as (work: Work) => boolean);
      expect(work?.retracted).toBe(true);
      // The flag is for display (docs/05 §6.8); it never changes a count, because the paper was
      // still published and still used the resource.
      expect(summarize([work as Work]).publications).toBe(1);
      expect(applyFilter(doc.works, EMPTY_FILTER)).toContain(work);
    });

    it('handles both ends of the author range without capping either (A8)', () => {
      const one = find(CASES['a work with a single author'] as (work: Work) => boolean);
      const many = find(CASES['a work with more than fifty authors'] as (work: Work) => boolean);
      expect(one?.authors).toHaveLength(1);
      expect(many?.authors.length).toBe(many?.author_count);
      expect(summarize([one as Work, many as Work]).last_authors).toBe(2);
    });

    it('counts an author with no ROR-resolved affiliation as no institution, not as a missing one', () => {
      const work = find(
        CASES['an author with no ROR-resolved affiliation'] as (work: Work) => boolean,
      );
      const unresolved = work?.authors.find((person) => person.institutions.length === 0);
      expect(unresolved).toBeDefined();
      // The raw string is kept even where no ROR matched — it is sometimes the only place the
      // resource is named, which is how rule R5 works (docs/05 §4.3).
      expect(summarize([work as Work]).institutions).toBe(work?.institutions.length);
    });

    it('opens a retired work ID on the work it merged into', () => {
      const work = find(CASES['a retired work ID in aliases'] as (work: Work) => boolean);
      const index = buildWorkIndex(doc);
      expect(resolveWork(index, work?.aliases[0] ?? '')?.id).toBe(work?.id);
    });
  },
);

describe('the two pipeline defects docs/05 §3.2 records are shown as stored', () => {
  it('never decodes an entity or repairs a title in the app (docs/06 §5)', () => {
    // The app's job is to show what the store holds: decoding entities here would mask future
    // extraction bugs and risk double-decoding text that legitimately contains an escape.
    // Nothing in `contract/`, `aggregate/` or `filter/` rewrites a title or an excerpt, and this
    // test asserts that by comparing the rows the app filters with the rows as exported.
    expect(applyFilter(doc.works, EMPTY_FILTER)).toEqual(doc.works);
    for (const work of doc.works) expect(work.title).toBe(work.title.trim() || work.title);
  });
});
