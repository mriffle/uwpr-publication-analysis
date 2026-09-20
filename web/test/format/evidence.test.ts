/**
 * Reading an evidence entry (docs/05 §6, docs/06 §5).
 *
 * "Three cases each need their own wording, and a generic template produces something false in
 * all three." Which case an entry is, and what each case needs from `detail`, is decided by
 * these functions, so this is where that decision is pinned.
 */
import { describe, expect, it } from 'vitest';
import type { Evidence } from '../../src/contract/types';
import {
  evidenceKind,
  foundOnOtherVersion,
  fullTextMatch,
  hasExcerpt,
  listingRecord,
  overrideAttribution,
  versionNoun,
} from '../../src/format/evidence';
import { isSampleExport, sampleExport } from '../support/fixture';
import { work } from '../support/works';

const entry = (overrides: Partial<Evidence> = {}): Evidence => ({
  rule: 'R2',
  criterion: 2,
  label: 'UWPR award code stated in the paper',
  section: 'acknowledgements',
  excerpt: 'We thank the Proteomics Resource (UWPR95794).',
  source: { name: 'PMC', url: 'https://example.invalid', retrieved: '2026-09-19' },
  detail: {},
  first_seen: '2026-09-19',
  last_seen: '2026-09-19',
  ...overrides,
});

describe('which case an entry is', () => {
  it('reads the rule, not the section string', () => {
    expect(evidenceKind(entry({ rule: 'R1', section: 'anything at all' }))).toBe('listing');
    expect(evidenceKind(entry({ rule: 'R6' }))).toBe('full-text-index');
    expect(evidenceKind(entry({ rule: 'override' }))).toBe('override');
    for (const rule of ['R2', 'R3', 'R3d', 'R4', 'R5', 'R7'] as const) {
      expect(evidenceKind(entry({ rule }))).toBe('quotation');
    }
  });
});

describe('an excerpt is a sentence or it is nothing (docs/06 §5)', () => {
  it('rejects null and the empty string alike, so no empty quotation is rendered', () => {
    expect(hasExcerpt(entry())).toBe(true);
    expect(hasExcerpt(entry({ excerpt: null }))).toBe(false);
    expect(hasExcerpt(entry({ excerpt: '' }))).toBe(false);
    expect(hasExcerpt(entry({ excerpt: '   ' }))).toBe(false);
  });
});

describe('an override carries an attribution (docs/05 §6, changelog 2026-09-20)', () => {
  it('reads the person and the date from detail', () => {
    expect(
      overrideAttribution(
        entry({ rule: 'override', detail: { by: 'mriffle', date: '2026-09-19' } }),
      ),
    ).toEqual({ by: 'mriffle', date: '2026-09-19' });
  });

  it('returns null rather than half an attribution, so the app never invents one', () => {
    expect(overrideAttribution(entry({ rule: 'override', detail: { by: 'mriffle' } }))).toBeNull();
    expect(overrideAttribution(entry({ rule: 'override', detail: {} }))).toBeNull();
    expect(
      overrideAttribution(entry({ rule: 'override', detail: { by: '', date: '2026-09-19' } })),
    ).toBeNull();
  });
});

describe('a full-text-index match', () => {
  it('reads the phrase and the query date', () => {
    expect(
      fullTextMatch(
        entry({ rule: 'R6', detail: { phrase: 'the phrase', query_date: '2026-01-02' } }),
      ),
    ).toEqual({ phrase: 'the phrase', queryDate: '2026-01-02' });
  });

  it('falls back to the entry’s own retrieval date where detail states none', () => {
    expect(fullTextMatch(entry({ rule: 'R6', detail: {} })).queryDate).toBe('2026-09-19');
  });
});

describe('a site listing', () => {
  it('reads the page and the dates first and last seen', () => {
    expect(
      listingRecord(
        entry({
          rule: 'R1',
          detail: { page: 'current', first_seen: '2026-06-01', last_seen: '2026-09-12' },
        }),
      ),
    ).toEqual({ page: 'current', firstSeen: '2026-06-01', lastSeen: '2026-09-12' });
  });

  it('falls back to the entry’s own dates, and names no page it was not given', () => {
    expect(listingRecord(entry({ rule: 'R1', detail: {} }))).toEqual({
      page: null,
      firstSeen: '2026-09-19',
      lastSeen: '2026-09-19',
    });
  });
});

describe('evidence found on another version (docs/06 §5)', () => {
  const article = work({
    kind: 'article',
    ids: { doi: '10.1/article', pmid: null, pmcid: null, openalex: null },
  });

  it('says so when the DOIs differ', () => {
    expect(
      foundOnOtherVersion(entry({ found_on: { kind: 'preprint', doi: '10.1/preprint' } }), article),
    ).toEqual({ kind: 'preprint', doi: '10.1/preprint' });
  });

  it('says nothing when the DOIs match, whatever their case', () => {
    expect(
      foundOnOtherVersion(entry({ found_on: { kind: 'article', doi: '10.1/ARTICLE' } }), article),
    ).toBeNull();
  });

  it('falls back to the kind where a DOI is missing', () => {
    expect(
      foundOnOtherVersion(entry({ found_on: { kind: 'preprint', doi: null } }), article),
    ).toEqual({ kind: 'preprint', doi: null });
    expect(
      foundOnOtherVersion(entry({ found_on: { kind: 'article', doi: null } }), article),
    ).toBeNull();
  });

  it('says nothing for an entry that names no version, which is every override', () => {
    expect(foundOnOtherVersion(entry({ rule: 'override' }), article)).toBeNull();
  });
});

describe('versionNoun', () => {
  it('reads the hyphenated kinds as English', () => {
    expect(versionNoun('data-paper')).toBe('data paper');
    expect(versionNoun('book-chapter')).toBe('book chapter');
    expect(versionNoun('preprint')).toBe('preprint');
  });
});

describe.skipIf(!isSampleExport)('against the committed sample export', () => {
  const doc = sampleExport();
  const entries = doc.works.flatMap((item) => item.evidence.map((e) => ({ work: item, entry: e })));

  it('finds no excerpt on any listing or full-text-index entry — docs/05 §6’s two no-quote cases', () => {
    for (const { entry: item } of entries) {
      if (item.rule === 'R1' || item.rule === 'R6') expect(hasExcerpt(item)).toBe(false);
    }
  });

  it('finds an attribution on every override entry, which the export schema requires', () => {
    const overrides = entries.filter(({ entry: item }) => item.rule === 'override');
    expect(overrides.length).toBeGreaterThan(0);
    for (const { entry: item } of overrides) expect(overrideAttribution(item)).not.toBeNull();
  });

  it('has at least one entry found on a version other than the one displayed', () => {
    const crossVersion = entries.filter(
      ({ work: item, entry: e }) => foundOnOtherVersion(e, item) !== null,
    );
    expect(crossVersion.length).toBeGreaterThan(0);
  });
});
