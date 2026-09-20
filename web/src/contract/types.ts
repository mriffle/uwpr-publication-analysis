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
} from './generated/export';

export type { LookupIndexDocument } from './generated/lookup-index';
