/* eslint-disable */
/**
 * Generated from schemas/export.schema.json by web/scripts/generate-types.mjs (docs/06 B3).
 * Do not edit by hand: run `npm run generate:types`.
 */

export type Evidence = {
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
  funding: Funding;
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
/**
 * The funding behind the publications (docs/09 §11.3). `version` is null exactly when this export carries no funding data; then every list is empty and every count zero.
 */
export interface Funding {
  version: string | null;
  /**
   * The date of the last full refresh: every amount was read then or later
   */
  as_of: string | null;
  sources: FundingSource[];
  exchange_rates: ExchangeRates[];
  method: FundingMethod;
  summary: FundingSummary;
  /**
   * Every agency a grant names, with every parent, sorted by code
   */
  agencies: Agency[];
  /**
   * Every grant an exported work lists, sorted by key
   */
  grants: Grant[];
}
export interface FundingSource {
  id: 'reporter' | 'nsf' | 'usaspending' | 'openalex' | 'pubmed' | 'crossref' | 'pmc';
  name: string;
  url: string;
  /**
   * The latest date a fact from this source was confirmed
   */
  as_of: string;
  /**
   * The first year the source's amounts cover, where they start somewhere
   */
  amounts_from: number | null;
  /**
   * The fiscal year in progress on as_of, for a source reported by fiscal year
   */
  partial_year: number | null;
}
export interface ExchangeRates {
  name: string;
  url: string;
  currencies: string[];
  through_year: number;
}
/**
 * Distinct (work, string) pairs over the exported works, by outcome and by method, for the method page
 */
export interface FundingMethod {
  strings: {
    grant: number;
    unresolved: number;
    not_a_grant: number;
    resource_code: number;
    facility_contract: number;
  };
  resolution: {
    exact: number;
    normalised: number;
    corrected: number;
    override: number;
  };
  works_without_funding_metadata: number;
}
/**
 * Computed from the rows, with institution-wide awards included, for the cross-check (docs/09 §11.6)
 */
export interface FundingSummary {
  grants: number;
  grants_resolved: number;
  grants_with_amount: number;
  grants_unconverted: number;
  grants_institution_wide: number;
  agencies: number;
  investigators: number;
  organizations: number;
  amount_usd: number;
  amount_usd_institution_wide: number;
  amount_usd_nih: number;
  nih_grants: number;
  works_with_grants: number;
  works_with_listings: number;
  first_year: number | null;
  last_year: number | null;
  /**
   * Resolved grants by their first year: the cumulative rule's increments
   */
  by_first_year: {
    [k: string]: FundingYear;
  };
}
/**
 * This interface was referenced by `undefined`'s JSON-Schema definition
 * via the `patternProperty` "^[0-9]{4}$".
 */
export interface FundingYear {
  grants: number;
  grants_institution_wide: number;
  amount_usd: number;
  amount_usd_institution_wide: number;
}
/**
 * An agency (docs/09 §11.5). The app finds Miscellaneous by `group`, never by a key.
 */
export interface Agency {
  code: string;
  name: string;
  short_name: string | null;
  parent: string | null;
  group: 'us_federal' | 'us_nonfederal' | 'non_us' | 'miscellaneous';
  /**
   * ISO 3166 alpha-2
   */
  country: string | null;
}
/**
 * A grant (docs/09 §11.4)
 */
export interface Grant {
  /**
   * docs/09 §8.2: a family prefix and one or two segments of uppercase letters and digits, so a key is safe in a path once URL-encoded and never ends like a file name
   */
  key: string;
  /**
   * The most specific agency: an NIH grant's administering IC
   */
  agency: string;
  /**
   * The display form
   */
  number: string;
  category: 'research' | 'center' | 'training' | 'instrument' | 'contract' | 'other';
  scope: 'project' | 'institution-wide';
  /**
   * Why it is institution-wide; null for a project
   */
  scope_reason: string | null;
  /**
   * unresolved exactly for a MISC: grant
   */
  status: 'resolved' | 'unresolved';
  /**
   * As the source gives it; RePORTER's are often capitals
   */
  title: string | null;
  /**
   * As the funder's public record gives them
   */
  pis: Investigator[];
  organization: string | null;
  start_year: number | null;
  end_year: number | null;
  /**
   * The year of the earliest exported work that lists it
   */
  first_year: number | null;
  /**
   * Whole US dollars; null when unknown or unconverted, never 0 for unknown
   */
  amount_usd: number | null;
  /**
   * In `currency`
   */
  amount_original: number | null;
  /**
   * ISO 4217
   */
  currency: string | null;
  /**
   * The exchange rate's year, when converted
   */
  rate_year: number | null;
  amount_source: AmountSource | null;
  /**
   * Sums by fiscal year, RePORTER only; a year whose rows report no amount is null. The years with amounts sum to amount_usd.
   */
  fiscal_years: {
    /**
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^[0-9]{4}$".
     */
    [k: string]: number | null;
  } | null;
  /**
   * A page a reader can open to check the grant
   */
  url: string | null;
  /**
   * The link's label, naming the page it opens; null exactly when url is
   */
  url_name: string | null;
  flags: (
    | 'active'
    | 'starts_before_fy1985'
    | 'starts_before_fy2008'
    | 'no_amount_reported'
    | 'amount_not_found'
    | 'amount_from_openalex'
    | 'amount_corrected'
    | 'amounts_disagree'
    | 'unconverted_currency'
    | 'rate_year_estimated'
  )[];
}
export interface Investigator {
  name: string;
  /**
   * RePORTER's profile_id; null where the source gives no identifier
   */
  id: string | null;
}
/**
 * Where a grant's amount comes from: the page is the grant's url, the date the store line's `checked`
 */
export interface AmountSource {
  name: 'NIH RePORTER' | 'NSF Award API' | 'USAspending' | 'OpenAlex';
  url: string | null;
  as_of: string;
  basis:
    | 'reporter_fiscal_years'
    | 'reporter_contract'
    | 'reporter_task_order'
    | 'nsf_obligated'
    | 'nsf_estimated'
    | 'usaspending_obligation'
    | 'openalex_amount';
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
  /**
   * The grants this work lists, sorted by grant; empty when it lists none or the export carries no funding data (docs/09 §11.2)
   */
  grants: GrantListing[];
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
/**
 * One grant on one work (docs/09 §11.2). `cited_as` and `override` are present only where they apply.
 */
export interface GrantListing {
  /**
   * docs/09 §8.2: a family prefix and one or two segments of uppercase letters and digits, so a key is safe in a path once URL-encoded and never ends like a file name
   */
  grant: string;
  /**
   * The strongest evidence that the paper names the grant: the first of listed, corrected, override, nih_link
   */
  how: 'listed' | 'nih_link' | 'corrected' | 'override';
  /**
   * The written forms on this work that reached the grant only by correction or override, whitespace collapsed, sorted; present exactly when there are any, whatever `how` is
   *
   * @minItems 1
   */
  cited_as?: [string, ...string[]];
  override?: GrantOverride;
  /**
   * The grant's agency chain, root first, so a filter needs nothing but the row
   *
   * @minItems 1
   */
  agencies: [string, ...string[]];
}
/**
 * Who decided a string on this work is this grant, and why: present exactly when a grant override applied
 */
export interface GrantOverride {
  reason: string;
  by: string;
  date: string;
}
