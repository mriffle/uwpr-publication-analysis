/* eslint-disable */
/**
 * Generated from schemas/export.schema.json by web/scripts/generate-types.mjs (docs/06 B3).
 * Do not edit by hand: run `npm run generate:types`.
 */

export type Evidence = {
  [k: string]: unknown;
} & {
  [k: string]: unknown;
} & {
  rule: 'R1' | 'R2' | 'R3' | 'R3d' | 'R4' | 'R5' | 'R6' | 'R7' | 'override';
  criterion: 1 | 2 | 3 | 4 | null;
  label: string;
  section: string;
  excerpt: string | null;
  found_on?: {
    kind: 'article' | 'review' | 'letter' | 'data-paper' | 'book-chapter' | 'preprint';
    doi: string | null;
  };
  source: {
    name: string;
    url: string | null;
    retrieved: string;
  };
  detail: {};
  first_seen: string;
  last_seen: string;
} & {
  rule: 'R1' | 'R2' | 'R3' | 'R3d' | 'R4' | 'R5' | 'R6' | 'R7' | 'override';
  criterion: 1 | 2 | 3 | 4 | null;
  label: string;
  section: string;
  excerpt: string | null;
  found_on?: {
    kind: 'article' | 'review' | 'letter' | 'data-paper' | 'book-chapter' | 'preprint';
    doi: string | null;
  };
  source: {
    name: string;
    url: string | null;
    retrieved: string;
  };
  detail: {};
  first_seen: string;
  last_seen: string;
};

export interface ExportDocument {
  schema_version: string;
  generated_at: string;
  run_id: string;
  pipeline_version: string;
  rule_version: string;
  resource: Resource;
  sources: {
    citations: {
      name: 'OpenAlex';
      as_of: string;
    };
    notes: string[];
  };
  period: Period;
  summary: Summary;
  method: Method;
  works: Work[];
}
export interface Resource {
  name: string;
  short_name: string;
  url: string;
  identifier: string;
  /**
   * The institution this resource belongs to. docs/05 §7.8's chart excludes it; the app is told which one rather than taking the most frequent, which would silently start charting the home institution if it ever fell below the threshold.
   */
  home_institution: {
    ror: string;
    name: string;
  };
  /**
   * The ISO 3166-1 alpha-2 country the resource sits in. docs/05 §7.14 counts works with an author outside it, and leaves it out of the country bar.
   */
  home_country: string;
  /**
   * What is deliberately not evidence, named (docs/05 §10). The method page groups these by `kind` and shows each with its note; it carries no such names of its own, because §1.1 principle 5 keeps everything resource-specific in this file.
   *
   * @minItems 1
   */
  exclusions: [Exclusion, ...Exclusion[]];
  staff: Person[];
}
/**
 * One thing that looks like evidence and is deliberately not counted as any. `kind` groups it on the method page; `note` says why it does not count, factually and without judgement (docs/05 §10, §11).
 */
export interface Exclusion {
  kind: 'facility' | 'software' | 'tool' | 'hardware';
  name: string;
  note: string;
}
/**
 * A member of the resource's staff. `id` is the join key: it is the same identifier that works[].authors[].staff and works[].staff_authors carry, so the app can turn one into a name (docs/05 §4.2).
 */
export interface Person {
  id: 'eng' | 'sharma' | 'riffle' | 'hoopmann' | 'vonhaller';
  name: string;
  openalex: string | null;
}
export interface Period {
  first_year: number;
  last_year: number;
  complete_through: number;
  current_year_partial: boolean;
  citation_years_from: number | null;
  citations_before_window: number;
}
export interface Summary {
  publications: number;
  first_year: number;
  last_year: number;
  citations: number;
  citations_in_window: number;
  fwci_median: number | null;
  fwci_mean: number | null;
  h_index: number;
  open_access: number;
  journals: number;
  institutions: number;
  countries: number;
  research_groups: number;
  last_authors: number;
  on_official_list: number;
  beyond_official_list: number;
  preprint_only: number;
}
export interface Method {
  criteria: {
    [k: string]: number;
  };
  works_with_multiple_criteria: number;
  official_list_total: number;
  independently_confirmed: number;
  listing_only: number;
  listing_only_text_read: number;
  listing_only_text_unavailable: number;
  beyond_official_list: number;
  works_with_staff_author: number;
  sources_last_read: {
    [k: string]: string;
  };
}
export interface Work {
  id: string;
  aliases: string[];
  title: string;
  year: number;
  date: string | null;
  first_version_date: string | null;
  kind: 'article' | 'review' | 'letter' | 'data-paper' | 'book-chapter' | 'preprint';
  is_preprint: boolean;
  venue: {
    name: string;
    issn_l: string | null;
  } | null;
  ids: Ids;
  url: string | null;
  oa: {
    status: 'gold' | 'green' | 'hybrid' | 'bronze' | 'diamond' | 'closed' | 'unknown';
    url: string | null;
    license: string | null;
  };
  retracted: boolean;
  authors: Author[];
  author_count: number;
  staff_authors: ('eng' | 'sharma' | 'riffle' | 'hoopmann' | 'vonhaller')[];
  institutions: Institution[];
  countries: string[];
  corresponding_authors: NamedPerson[];
  topics: Topic[];
  citations: Citations;
  on_official_list: boolean;
  criteria: (1 | 2 | 3 | 4)[];
  /**
   * @minItems 1
   */
  evidence: [Evidence, ...Evidence[]];
  versions: Version[];
}
export interface Ids {
  doi: string | null;
  pmid: string | null;
  pmcid: string | null;
  openalex: string | null;
}
export interface Author {
  name: string;
  openalex: string | null;
  orcid: string | null;
  staff: ('eng' | 'sharma' | 'riffle' | 'hoopmann' | 'vonhaller') | null;
  corresponding: boolean;
  institutions: Institution[];
  affiliations_raw: string[];
}
export interface Institution {
  ror: string;
  name: string | null;
  country: string | null;
}
/**
 * Someone named on a publication who is not part of the resource, so has no staff identifier.
 */
export interface NamedPerson {
  name: string;
  openalex: string | null;
}
export interface Topic {
  domain: string;
  field: string;
  subfield: string;
  topic: string;
  score: number;
  primary: boolean;
}
export interface Citations {
  total: number;
  by_year: {
    [k: string]: number;
  };
  fwci: number | null;
  percentile: number | null;
  as_of: string;
}
export interface Version {
  kind: 'article' | 'review' | 'letter' | 'data-paper' | 'book-chapter' | 'preprint';
  doi: string | null;
  date: string | null;
  year: number;
  url: string | null;
}
