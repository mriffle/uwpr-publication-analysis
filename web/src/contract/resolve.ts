/**
 * Resolving a work identifier from a URL (docs/06 §7).
 *
 * **Two maps, with different reach, and the order matters** (docs/06 §7, corrected 2026-09-20):
 *
 * > The export's own `aliases` resolve **retired work IDs** only — 37 works carry one — and are
 * > already loaded. An external identifier in a permalink (a DOI, PMID or OpenAlex ID) resolves
 * > only through `lookup_index.json`, which §10 loads on demand. So: try the export first; if
 * > the URL carries an identifier it cannot resolve, **fetch the lookup index before deciding**,
 * > and only then show a not-found state. A DOI permalink must work from cold, at the cost of
 * > one extra fetch in the case that needs it.
 *
 * Work IDs are permanent (docs/02), but a merge retires the higher ID into the lower one
 * (docs/01 §8), so every permalink the app has ever issued has to keep opening.
 */
import type { ExportDocument, LookupIndexDocument, Work } from './types';

export type WorkIndex = ReadonlyMap<string, Work>;

/** Every work keyed by its own ID and by each retired ID that merged into it. */
export function buildWorkIndex(doc: Pick<ExportDocument, 'works'>): WorkIndex {
  const index = new Map<string, Work>();
  for (const work of doc.works) index.set(work.id, work);
  // Aliases are applied second so a live ID always wins over a retired one, whatever the order
  // of the array.
  for (const work of doc.works) {
    for (const alias of work.aliases) if (!index.has(alias)) index.set(alias, work);
  }
  return index;
}

export function resolveWork(index: WorkIndex, id: string): Work | null {
  return index.get(id) ?? null;
}

/** True when `id` opened a work only by way of a retired identifier. */
export function isRetiredId(index: WorkIndex, id: string): boolean {
  const work = index.get(id);
  return work !== undefined && work.id !== id;
}

/**
 * The type-prefixed key the lookup index is keyed by (docs/05 §8: `"doi:10.1021/…"`,
 * `"pmid:…"`, `"work:W-000735"`).
 *
 * A permalink can carry any of them, and a reader pasting one will paste it in whatever form
 * they had: a bare DOI, a `https://doi.org/` URL, `PMC1234567`, a PubMed ID, an OpenAlex ID.
 * All of them are recognised here, because the alternative is a not-found page for an
 * identifier the file can answer.
 */
export function aliasKey(raw: string): string | null {
  const value = raw.trim();
  if (value === '') return null;

  const prefixed = /^(doi|pmid|pmcid|openalex|work):(.+)$/i.exec(value);
  if (prefixed) {
    const scheme = (prefixed[1] ?? '').toLowerCase();
    const rest = prefixed[2] ?? '';
    return scheme === 'doi' ? `doi:${rest.toLowerCase()}` : `${scheme}:${rest}`;
  }

  // `https://doi.org/10.…`, `http://dx.doi.org/10.…`
  const doiUrl = /^https?:\/\/(?:dx\.)?doi\.org\/(10\..+)$/i.exec(value);
  if (doiUrl) return `doi:${(doiUrl[1] ?? '').toLowerCase()}`;

  const openAlexUrl = /^https?:\/\/(?:api\.)?openalex\.org\/(?:works\/)?(W\d+)$/i.exec(value);
  if (openAlexUrl) return `openalex:${(openAlexUrl[1] ?? '').toUpperCase()}`;

  if (/^10\.\d{4,9}\//.test(value)) return `doi:${value.toLowerCase()}`;
  if (/^W-\d+$/i.test(value)) return `work:${value.toUpperCase()}`;
  if (/^PMC\d+$/i.test(value)) return `pmcid:${value.toUpperCase()}`;
  if (/^W\d+$/i.test(value)) return `openalex:${value.toUpperCase()}`;
  if (/^\d+$/.test(value)) return `pmid:${value}`;
  return null;
}

export type NotIncluded = LookupIndexDocument['not_included'][number];

/**
 * The three outcomes docs/05 §8 requires the app to distinguish: included; considered and not
 * included, with the reason; and not found at all, "which means no channel ever nominated it and
 * says nothing about the paper".
 */
export type Resolution =
  | { status: 'found'; work: Work; retiredId: string | null }
  | { status: 'not-included'; row: NotIncluded }
  | { status: 'unknown' };

/**
 * The first half of docs/06 §7's order: what the already-loaded export can answer by itself.
 *
 * Returns `null` — "ask the lookup index" — rather than `unknown`, so the caller cannot skip the
 * fetch the spec requires before showing a not-found state.
 */
export function resolveFromExport(index: WorkIndex, id: string): Resolution | null {
  const direct = index.get(id);
  if (direct) return { status: 'found', work: direct, retiredId: direct.id === id ? null : id };
  return null;
}

/** The second half: the on-demand lookup index, which is the only map that knows an external ID. */
export function resolveFromLookup(
  index: WorkIndex,
  lookup: LookupIndexDocument,
  id: string,
): Resolution {
  const key = aliasKey(id);
  const target = key === null ? undefined : lookup.aliases[key];
  if (target !== undefined) {
    const work = index.get(target);
    if (work) return { status: 'found', work, retiredId: work.id === id ? null : id };
    const row = lookup.not_included.find((entry) => entry.id === target);
    if (row) return { status: 'not-included', row };
  }
  // An identifier may name a rejected candidate directly, without passing through `aliases`.
  const row = lookup.not_included.find((entry) => entry.id === id);
  return row ? { status: 'not-included', row } : { status: 'unknown' };
}
