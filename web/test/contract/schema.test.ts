/**
 * docs/06 §12.1, the second project-specific check: "The sample export validates against its
 * JSON Schema, and the app's types are generated from that schema."
 *
 * The pipeline validates the export at its own gate (docs/05 §12), but that check runs against
 * whatever the pipeline just produced. This one runs against the *committed fixture the app
 * reads*, on the app's side of the contract, so a fixture edited by hand or a schema changed
 * without regenerating types fails the web gate rather than passing quietly.
 *
 * The other half of the check — that the types are generated, not hand-written — is
 * `npm run check:types-fresh`, which regenerates from `schemas/` and fails on any difference.
 */
import { describe, expect, it } from 'vitest';
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { readSchema, sampleExport, sampleLookup } from '../support/fixture';

function validator(entry: string): ValidateFunction {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  for (const name of ['common.schema.json', 'export.schema.json', 'lookup-index.schema.json']) {
    const schema = readSchema(name);
    // The schemas reference each other by relative path (docs/02 §18), so both the absolute $id
    // and the relative name are registered, exactly as `uwpr_pubs.validate` does.
    ajv.addSchema(schema, name);
  }
  return ajv.getSchema(entry) as ValidateFunction;
}

const report = (validate: ValidateFunction): string[] =>
  (validate.errors ?? []).map((error) => `${error.instancePath} ${error.message ?? ''}`);

describe('the committed sample validates against the schemas the pipeline wrote', () => {
  it('uwpr_publications.json', () => {
    const validate = validator('export.schema.json');
    const valid = validate(sampleExport());
    expect(report(validate)).toEqual([]);
    expect(valid).toBe(true);
  });

  it('lookup_index.json', () => {
    const validate = validator('lookup-index.schema.json');
    const valid = validate(sampleLookup());
    expect(report(validate)).toEqual([]);
    expect(valid).toBe(true);
  });

  it('rejects a document the app would otherwise render, proving the check has teeth', () => {
    const validate = validator('export.schema.json');
    const broken = sampleExport() as unknown as Record<string, unknown>;
    delete broken.summary;
    expect(validate(broken)).toBe(false);
  });
});

describe('the lookup index resolves against the export (docs/05 §12)', () => {
  it('every alias target is an exported work or a not-included row', () => {
    const doc = sampleExport();
    const lookup = sampleLookup();
    const known = new Set([
      ...doc.works.map((work) => work.id),
      ...lookup.not_included.map((row) => row.id),
    ]);
    const dangling = Object.entries(lookup.aliases)
      .filter(([, target]) => !known.has(target))
      .map(([key, target]) => `${key} -> ${target}`);
    expect(dangling).toEqual([]);
  });

  it('every work’s criteria match its evidence', () => {
    for (const work of sampleExport().works) {
      const fromEvidence = [
        ...new Set(
          work.evidence
            .map((entry) => entry.criterion)
            .filter((criterion): criterion is 1 | 2 | 3 | 4 => criterion !== null),
        ),
      ].sort();
      expect(work.criteria).toEqual(fromEvidence);
    }
  });
});
