/**
 * The data contract, as the app sees it.
 *
 * Every type here is re-exported from `generated/`, which `scripts/generate-types.mjs` compiles
 * from `schemas/export.schema.json` and `schemas/lookup-index.schema.json` (docs/06 B3). Nothing
 * in this file describes a field; it only gives the generated shapes the names the app uses and
 * keeps every other module off the generated paths, so a schema change lands in one place.
 */
export type {
  ExportDocument,
  Work,
  Author,
  Institution,
  Topic,
  Citations,
  Evidence,
  Version,
  Person,
  NamedPerson,
  Period,
  Summary,
  Method,
  Resource,
  Exclusion,
  Ids,
  // Contract 1.1's funding (docs/09 §11). Read them through `contract/funding.ts`, never off the
  // document directly: an export older than the app has no `funding` block and no `grants` on
  // its works, whatever these types say (docs/09 §12.10).
  Funding,
  FundingSource,
  ExchangeRates,
  FundingMethod,
  FundingSummary,
  FundingYear,
  // Contract 1.2's counting (docs/09 F17, §7.4): the rule's constants, each grant's rule and the
  // counted dollars by award year. An export older than 1.2 has no `funding.counting`, and
  // `fundingOf` reads it as having no funding data; `countingOf` reads the rule off an index.
  FundingCounting,
  CountedRule,
  CountedYear,
  GrantCategory,
  Agency,
  Grant,
  Investigator,
  AmountSource,
  GrantListing,
  GrantOverride,
} from './generated/export';

export type { LookupIndexDocument } from './generated/lookup-index';
