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
  Period,
  Summary,
  Method,
  Resource,
  Ids,
} from './generated/export';

export type { LookupIndexDocument } from './generated/lookup-index';

/** `oa.status` values the contract allows (docs/05 §9: six values plus `unknown`). */
export const OA_STATUSES = [
  'diamond',
  'gold',
  'green',
  'hybrid',
  'bronze',
  'closed',
  'unknown',
] as const;
export type OaStatus = (typeof OA_STATUSES)[number];

/** The four inclusion criteria of docs/01 §6, as they appear on a work. */
export const CRITERIA = [1, 2, 3, 4] as const;
export type Criterion = (typeof CRITERIA)[number];
