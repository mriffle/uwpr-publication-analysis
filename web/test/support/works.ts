/**
 * Minimal, hand-built works for the arithmetic tests.
 *
 * The sample export proves the metrics agree with the pipeline on real data; these exist to pin
 * the *edges* — an empty corpus, a work with no venue, an author with no OpenAlex ID, a null
 * field-weighted impact — which the sample has too few of to vary one at a time.
 */
import type { Author, Work } from '../../src/contract/types';

export function author(overrides: Partial<Author> = {}): Author {
  return {
    name: 'A. Researcher',
    openalex: 'A1',
    orcid: null,
    staff: null,
    corresponding: false,
    institutions: [],
    affiliations_raw: [],
    ...overrides,
  };
}

let sequence = 0;

export function work(overrides: Partial<Work> = {}): Work {
  sequence += 1;
  const id = `W-${String(sequence).padStart(6, '0')}`;
  return {
    id,
    aliases: [],
    title: `Work ${id}`,
    year: 2020,
    date: '2020-01-01',
    first_version_date: '2020-01-01',
    kind: 'article',
    is_preprint: false,
    venue: { name: 'Journal of Tests', issn_l: '0000-0001' },
    ids: { doi: `10.0000/${id}`, pmid: null, pmcid: null, openalex: null },
    url: null,
    oa: { status: 'gold', url: null, license: null },
    retracted: false,
    authors: [author()],
    author_count: 1,
    staff_authors: [],
    institutions: [],
    countries: [],
    corresponding_authors: [],
    topics: [],
    citations: { total: 0, by_year: {}, fwci: null, percentile: null, as_of: '2026-09-20' },
    on_official_list: false,
    criteria: [],
    evidence: [
      {
        rule: 'R2',
        criterion: 2,
        label: 'UWPR award code in the publisher’s funding metadata',
        section: 'metadata',
        excerpt: 'UWPR95794',
        source: { name: 'OpenAlex', url: null, retrieved: '2026-09-20' },
        detail: {},
        first_seen: '2026-09-20',
        last_seen: '2026-09-20',
      },
    ],
    versions: [],
    ...overrides,
  };
}
