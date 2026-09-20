/**
 * Reading an identifier the way a person actually supplies one (docs/05 §8, docs/06 §7).
 *
 * `resolve.ts`'s `aliasKey` already turns a clean identifier into the type-prefixed key
 * `lookup_index.json` is keyed by, because a permalink carries one. A reader typing into the
 * lookup form does not: they paste `https://doi.org/10.1021/…` from a browser bar, `PMID:
 * 12345678` from an email, `PMC6947714` from a citation, a bare number from PubMed, or a work
 * identifier from this site — often with a stray space or a line break from the paste.
 *
 * So this normalises first, uses `aliasKey` to decide which of the five types it is, and then
 * checks the value is actually shaped like that type. Two things follow from the check, and both
 * matter on this page:
 *
 * - **Unrecognised input is its own answer.** "We do not recognise what you typed" and "no
 *   channel ever nominated this paper" are different statements, and only the second is about
 *   the paper. Without the check, `doi: my paper` would be reported as a paper nobody has heard
 *   of, which is a fact the data does not support.
 * - **Case is normalised here**, because `aliasKey` lower-cases a DOI only in its bare form and
 *   leaves an explicitly prefixed `pmcid:pmc6947714` alone, which matches nothing.
 */
import { aliasKey } from './resolve';

export type IdentifierKind = 'doi' | 'pmid' | 'pmcid' | 'openalex' | 'work';

export interface ParsedIdentifier {
  /** What the reader typed, trimmed, so the page can echo it back as they wrote it. */
  input: string;
  kind: IdentifierKind;
  /** The identifier alone, normalised: a DOI lower-cased, a PMC or OpenAlex ID upper-cased. */
  value: string;
  /** The type-prefixed key `lookup_index.json`'s `aliases` are keyed by. */
  key: string;
  /**
   * What `resolveFromExport` and `resolveFromLookup` are asked about.
   *
   * It is the bare normalised value in every case: `aliasKey` rebuilds the same key from it, and
   * a work identifier has to reach `not_included` by its own `id`, which is the form a rejected
   * candidate is listed under there.
   */
  id: string;
}

/**
 * A label the reader wrote in front of the identifier, and the prefix it means.
 *
 * Each requires a separator or a space after the word, so `workflow` is not read as a work
 * identifier called `flow`.
 */
const LABELS: readonly (readonly [RegExp, string])[] = [
  [/^doi(?:\s*[:.#]\s*|\s+)/i, 'doi:'],
  [/^(?:pubmed(?:\s+id)?|pmid)(?:\s*[:.#]\s*|\s+)/i, 'pmid:'],
  [/^pmc\s*id(?:\s*[:.#]\s*|\s+)/i, 'pmcid:'],
  [/^openalex(?:\s+id)?(?:\s*[:.#]\s*|\s+)/i, 'openalex:'],
  [/^work(?:\s+id)?(?:\s*[:.#]\s*|\s+)/i, 'work:'],
];

/**
 * The URLs an identifier arrives inside. `aliasKey` already reads doi.org and openalex.org;
 * PubMed's and PMC's are here because a reader who found the paper there copies that bar.
 */
const URLS: readonly (readonly [RegExp, string])[] = [
  [/^(?:https?:\/\/)?(?:www\.)?(?:dx\.)?doi\.org\/(10\..+)$/i, 'doi:'],
  [/^https?:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)\/?$/i, 'pmid:'],
  [/^https?:\/\/(?:www\.)?ncbi\.nlm\.nih\.gov\/pubmed\/(\d+)\/?$/i, 'pmid:'],
  [/^https?:\/\/(?:pmc|www)\.ncbi\.nlm\.nih\.gov\/(?:pmc\/)?articles\/(PMC\d+)\/?$/i, 'pmcid:'],
  [/^https?:\/\/(?:api\.)?openalex\.org\/(?:works\/)?(W\d+)$/i, 'openalex:'],
];

/** What each type has to look like once the wrapping is off. */
const SHAPES: Record<IdentifierKind, RegExp> = {
  doi: /^10\.\d{4,9}\/\S+$/,
  pmid: /^\d+$/,
  pmcid: /^PMC\d+$/,
  openalex: /^W\d+$/,
  work: /^W-\d+$/,
};

/**
 * Strip what a paste adds and what a person writes around an identifier.
 *
 * Whitespace goes entirely: none of the five identifier types contains any, and a DOI wrapped
 * across two lines in an email is a normal thing to receive. Angle brackets go for the same
 * reason — `<https://doi.org/10.…>` is how a mail client writes a link.
 *
 * **A URL is recognised before a label**, because `doi.org/10.…` — a browser bar with the scheme
 * dropped — starts with the same three letters as the label `doi.`, and reading it as one leaves
 * an identifier called `org/10.…`.
 */
function clean(raw: string): string {
  const base = raw
    .trim()
    .replace(/^[<([]+/, '')
    .replace(/[>)\]]+$/, '');
  const squeeze = (value: string) => value.replace(/\s+/g, '');

  for (const [pattern, prefix] of URLS) {
    const match = pattern.exec(squeeze(base));
    if (match) return `${prefix}${match[1] ?? ''}`;
  }
  for (const [pattern, prefix] of LABELS) {
    if (pattern.test(base)) return squeeze(base.replace(pattern, prefix));
  }
  return squeeze(base);
}

const KEY = /^(doi|pmid|pmcid|openalex|work):(.+)$/;

/** A DOI is case-insensitive; the other four are recorded upper-case in the store. */
const normalizeValue = (kind: IdentifierKind, value: string): string =>
  kind === 'doi' ? value.toLowerCase() : value.toUpperCase();

export function parseIdentifier(raw: string): ParsedIdentifier | null {
  const input = raw.trim();
  if (input === '') return null;
  const key = aliasKey(clean(input));
  if (key === null) return null;
  const match = KEY.exec(key);
  if (!match) return null;
  const kind = match[1] as IdentifierKind;
  const value = normalizeValue(kind, match[2] ?? '');
  if (!SHAPES[kind].test(value)) return null;
  return { input, kind, value, key: `${kind}:${value}`, id: value };
}

const NOUNS: Record<IdentifierKind, string> = {
  doi: 'DOI',
  pmid: 'PubMed ID',
  pmcid: 'PubMed Central ID',
  openalex: 'OpenAlex ID',
  work: 'work',
};

/** How the identifier is named back to the reader: "DOI 10.1021/…", "work W-000457". */
export function describeIdentifier(identifier: ParsedIdentifier): string {
  return `${NOUNS[identifier.kind]} ${identifier.value}`;
}
