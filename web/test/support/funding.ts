/**
 * Hand-built funding for the tests (docs/09 §11): agencies, grants, listings, whole funding
 * blocks and whole documents.
 *
 * The sample export proves the app reads what the pipeline writes (docs/09 §11.8); these exist to
 * vary one thing at a time — a cycle among agencies, a grant with no amount, a second work in
 * another year — which the sample has too few of. **Every builder's output validates against
 * `schemas/export.schema.json`** (`test/contract/funding-builders.test.ts`), so a fixture built
 * here cannot drift from the contract; an override can still break one on purpose.
 *
 * They build shapes, not cross-checked documents. A block's `summary` and `method` are zeros
 * unless given, and nothing here keeps a listing's `agencies` equal to its grant's chain: the
 * pipeline's validator holds the export to those (docs/09 §11.7), and the app's cross-check runs
 * on the sample.
 */
import type {
  Agency,
  ExportDocument,
  Funding,
  FundingMethod,
  FundingSource,
  FundingSummary,
  Grant,
  GrantListing,
  Work,
} from '../../src/contract/types';
import { sampleExport } from './fixture';

/** The funding version and dates every builder uses unless told otherwise. */
export const FUNDING_VERSION = '2026-09-26.1';
export const FUNDING_AS_OF = '2026-09-26';

/** An agency; by default NIH, a root. */
export function agency(overrides: Partial<Agency> = {}): Agency {
  return {
    code: 'NIH',
    name: 'National Institutes of Health',
    short_name: 'NIH',
    parent: null,
    group: 'us_federal',
    country: 'US',
    ...overrides,
  };
}

/** NIH's NIGMS, the agency `grant()` names: a child of `agency()`. */
export const nigms = (overrides: Partial<Agency> = {}): Agency =>
  agency({
    code: 'NIGMS',
    name: 'National Institute of General Medical Sciences',
    short_name: 'NIGMS',
    parent: 'NIH',
    ...overrides,
  });

/** Where unresolved numbers are kept. Its code is the pipeline's to choose; the app goes by group. */
export const miscellaneous = (overrides: Partial<Agency> = {}): Agency =>
  agency({
    code: 'MISC',
    name: 'Miscellaneous',
    short_name: null,
    parent: null,
    group: 'miscellaneous',
    country: null,
    ...overrides,
  });

/** A grant; by default a resolved NIH research project, its amount from RePORTER. */
export function grant(overrides: Partial<Grant> = {}): Grant {
  const url = 'https://reporter.nih.gov/project-details/10000001';
  return {
    key: 'NIH:R01GM000001',
    agency: 'NIGMS',
    number: 'R01GM000001',
    category: 'research',
    scope: 'project',
    scope_reason: null,
    status: 'resolved',
    title: 'A RESEARCH PROJECT',
    pis: [{ name: 'A. Investigator', id: '10000001' }],
    organization: 'University of Washington',
    start_year: 2019,
    end_year: 2023,
    first_year: 2020,
    amount_usd: 1_000_000,
    amount_original: 1_000_000,
    currency: 'USD',
    rate_year: null,
    amount_source: {
      name: 'NIH RePORTER',
      url,
      as_of: FUNDING_AS_OF,
      basis: 'reporter_fiscal_years',
    },
    fiscal_years: { '2019': 500_000, '2020': 500_000 },
    url,
    url_name: 'NIH RePORTER project page',
    flags: [],
    ...overrides,
  };
}

/** A number no agency claimed, kept in Miscellaneous (docs/09 §6.11): no facts, no amount. */
export function unresolvedGrant(overrides: Partial<Grant> = {}): Grant {
  return grant({
    key: 'MISC:R01GM999999',
    agency: 'MISC',
    number: 'R01 GM999999',
    category: 'other',
    status: 'unresolved',
    title: null,
    pis: [],
    organization: null,
    start_year: null,
    end_year: null,
    amount_usd: null,
    amount_original: null,
    currency: null,
    amount_source: null,
    fiscal_years: null,
    url: null,
    url_name: null,
    flags: ['amount_not_found'],
    ...overrides,
  });
}

/** One grant on one work; by default `grant()`, listed, under NIH → NIGMS. */
export function listing(overrides: Partial<GrantListing> = {}): GrantListing {
  return { grant: 'NIH:R01GM000001', how: 'listed', agencies: ['NIH', 'NIGMS'], ...overrides };
}

export const reporterSource = (overrides: Partial<FundingSource> = {}): FundingSource => ({
  id: 'reporter',
  name: 'NIH RePORTER',
  url: 'https://reporter.nih.gov/',
  as_of: FUNDING_AS_OF,
  amounts_from: 1985,
  partial_year: 2026,
  ...overrides,
});

const zeroMethod = (): FundingMethod => ({
  strings: { grant: 0, unresolved: 0, not_a_grant: 0, resource_code: 0, facility_contract: 0 },
  resolution: { exact: 0, normalised: 0, corrected: 0, override: 0 },
  works_without_funding_metadata: 0,
});

/** Every count zero and both years null: the summary of no funding data (docs/09 §11.1). */
export const zeroSummary = (overrides: Partial<FundingSummary> = {}): FundingSummary => ({
  grants: 0,
  grants_resolved: 0,
  grants_with_amount: 0,
  grants_unconverted: 0,
  grants_institution_wide: 0,
  agencies: 0,
  investigators: 0,
  organizations: 0,
  amount_usd: 0,
  amount_usd_institution_wide: 0,
  amount_usd_nih: 0,
  nih_grants: 0,
  works_with_grants: 0,
  works_with_listings: 0,
  first_year: null,
  last_year: null,
  by_first_year: {},
  ...overrides,
});

const byCode = (a: Agency, b: Agency) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
const byKey = (a: Grant, b: Grant) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/**
 * A funding block; by default NIH, NIGMS and Miscellaneous, with `grant()` and
 * `unresolvedGrant()`. Agencies and grants come out sorted, as the export writes them.
 */
export function fundingBlock(overrides: Partial<Funding> = {}): Funding {
  const block: Funding = {
    version: FUNDING_VERSION,
    as_of: FUNDING_AS_OF,
    sources: [reporterSource()],
    exchange_rates: [],
    method: zeroMethod(),
    summary: zeroSummary(),
    agencies: [agency(), nigms(), miscellaneous()],
    grants: [grant(), unresolvedGrant()],
    ...overrides,
  };
  return {
    ...block,
    agencies: [...block.agencies].sort(byCode),
    grants: [...block.grants].sort(byKey),
  };
}

/** What the pipeline writes while the store holds no funding: a null version and nothing else. */
export function noFundingBlock(): Funding {
  return {
    version: null,
    as_of: null,
    sources: [],
    exchange_rates: [],
    method: zeroMethod(),
    summary: zeroSummary(),
    agencies: [],
    grants: [],
  };
}

/**
 * A whole 1.1 document: the sample around the given block and works. By default its first work
 * lists both of `fundingBlock()`'s grants and the others list none. The sample's works are used,
 * not `works.ts`'s, because those are built for arithmetic and are not schema-valid. Its
 * top-level `summary` is the sample's, so it is a document for reading funding, not for the
 * summary cross-check.
 */
export function fundingDocument(parts: { funding?: Funding; works?: Work[] } = {}): ExportDocument {
  const sample = sampleExport();
  const listed = [listing({ grant: 'MISC:R01GM999999', agencies: ['MISC'] }), listing()];
  const works =
    parts.works ??
    sample.works.map((entry, position) => ({ ...entry, grants: position === 0 ? listed : [] }));
  return { ...sample, funding: parts.funding ?? fundingBlock(), works };
}

/**
 * The sample as a 1.0 export, as after a rollback of the data (docs/07 O2): no `funding` block
 * and no `grants` on any work. Not contract 1.1, so not validated against it; the types are
 * bent here, once, so no test has to.
 */
export function legacyDocument(): ExportDocument {
  const sample = sampleExport();
  const works = sample.works.map((entry) => {
    const legacy: Partial<Work> = { ...entry };
    delete legacy.grants;
    return legacy;
  });
  const legacy: Partial<ExportDocument> = { ...sample, schema_version: '1.0' };
  delete legacy.funding;
  return { ...legacy, works } as unknown as ExportDocument;
}
