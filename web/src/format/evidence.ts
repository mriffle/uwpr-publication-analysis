/**
 * Reading an evidence entry, as pure functions (docs/05 §6, docs/06 §5).
 *
 * "The evidence section is the one that must not be templated carelessly. **Three cases each need
 * their own wording, and a generic template produces something false in all three.**"
 *
 * | Case | Requirement |
 * |---|---|
 * | The site listing | Says it was listed, with the page and the dates first and last seen. **There is no excerpt**, and the app must not render an empty quotation. 91 of 339 works have this as their only evidence. |
 * | A full-text index match | Says the phrase was found in OpenAlex's full-text index, with the phrase and the query date. **There is no excerpt**, because the text could not be read directly. 49 works carry one. |
 * | An override | Shows the recorded reason, attributed to the person who decided it and dated. It is a judgement, not a measurement, and must read as one. |
 *
 * Which case an entry is, and what each case needs from `detail`, is decided here so that it is
 * decided once and can be tested as data. The component's job is only to render it.
 *
 * `detail` is typed `{}` by the generated contract — `common.schema.json` deliberately leaves it
 * free (docs/05 changelog) — so every read of it goes through `field()`, which never throws and
 * never invents a value.
 */
import type { Evidence, Work } from '../contract/types';

export type EvidenceKind = 'listing' | 'full-text-index' | 'override' | 'quotation';

/**
 * The rule identifier is the authority on which case an entry is, not the section string:
 * `section` is prose from the paper and R1's happens to read "official list" today.
 */
export function evidenceKind(entry: Evidence): EvidenceKind {
  switch (entry.rule) {
    case 'R1':
      return 'listing';
    case 'R6':
      return 'full-text-index';
    case 'override':
      return 'override';
    default:
      return 'quotation';
  }
}

function field(entry: Evidence, name: string): string | null {
  const value = (entry.detail as Record<string, unknown>)[name];
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * True only for an excerpt that is a real sentence.
 *
 * docs/06 §5: the listing and the full-text-index match "have no excerpt, and the app must not
 * render an empty quotation". `null` is what the contract stores, and an empty string would be
 * the same mistake in a different shape, so both are excluded here rather than at three call
 * sites.
 */
export const hasExcerpt = (entry: Evidence): boolean =>
  typeof entry.excerpt === 'string' && entry.excerpt.trim() !== '';

export interface OverrideAttribution {
  by: string;
  date: string;
}

/**
 * The attribution docs/05 §6 requires an override to carry: "the reason recorded by the person
 * who made the decision, attributed to them and dated".
 *
 * The export schema requires `detail.by` and `detail.date` on override evidence, so a `null`
 * here means the file is not what the schema says it is. The caller renders the reason without
 * an attribution rather than inventing one, which docs/05 §11.6 forbids.
 */
export function overrideAttribution(entry: Evidence): OverrideAttribution | null {
  const by = field(entry, 'by');
  const date = field(entry, 'date');
  return by !== null && date !== null ? { by, date } : null;
}

export interface FullTextMatch {
  phrase: string | null;
  queryDate: string;
}

/** The phrase and the query date of a full-text-index match (docs/06 §5). */
export const fullTextMatch = (entry: Evidence): FullTextMatch => ({
  phrase: field(entry, 'phrase'),
  // The entry's own `retrieved` is the query date; `detail.query_date` states it explicitly.
  queryDate: field(entry, 'query_date') ?? entry.source.retrieved,
});

export interface ListingRecord {
  /** Which of UWPR's publication pages carried it, where the entry names one. */
  page: string | null;
  firstSeen: string;
  lastSeen: string;
}

/** The page and the dates a site listing was first and last seen (docs/06 §5). */
export const listingRecord = (entry: Evidence): ListingRecord => ({
  page: field(entry, 'page'),
  firstSeen: field(entry, 'first_seen') ?? entry.first_seen,
  lastSeen: field(entry, 'last_seen') ?? entry.last_seen,
});

/**
 * Which other version carried the evidence, or `null` when it is the one on display.
 *
 * docs/06 §5: "Evidence found on a different version than the one displayed says so — evidence
 * on a preprint applies to the whole work (Phase 1 §8), and a reader looking at the article
 * should not have to guess why the quotation is not in it." 77 of the real store's evidence
 * entries are in this position.
 *
 * The DOI decides it where both are known, because a work and its preprint can share a kind;
 * the kind decides it otherwise. Override evidence belongs to the work rather than to a record
 * and names no version at all, so it is never in this position.
 */
export function foundOnOtherVersion(
  entry: Evidence,
  work: Work,
): { kind: string; doi: string | null } | null {
  const found = entry.found_on;
  if (found === undefined) return null;
  const theirs = found.doi?.toLowerCase() ?? null;
  const ours = work.ids.doi?.toLowerCase() ?? null;
  if (theirs !== null && ours !== null)
    return theirs === ours ? null : { kind: found.kind, doi: found.doi };
  return found.kind === work.kind ? null : { kind: found.kind, doi: found.doi };
}

/** "the preprint version", "the article version" — the noun phrase §5's sentence needs. */
export const versionNoun = (kind: string): string =>
  kind === 'data-paper' ? 'data paper' : kind === 'book-chapter' ? 'book chapter' : kind;
