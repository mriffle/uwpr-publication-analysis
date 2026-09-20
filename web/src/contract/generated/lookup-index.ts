/* eslint-disable */
/**
 * Generated from schemas/lookup-index.schema.json by web/scripts/generate-types.mjs (docs/06 B3).
 * Do not edit by hand: run `npm run generate:types`.
 */

export interface LookupIndexDocument {
  schema_version: string;
  generated_at: string;
  aliases: {
    [k: string]: string;
  };
  not_included: {
    id: string;
    title: string;
    year: number | null;
    ids: Ids;
    reason:
      | 'no_rule_fired'
      | 'excluded_record_type'
      | 'before_window'
      | 'override_exclude'
      | 'no_longer_meets_rules';
    reason_label: string;
    signals: string[];
    signal_labels: string[];
  }[];
}
export interface Ids {
  doi: string | null;
  pmid: string | null;
  pmcid: string | null;
  openalex: string | null;
}
