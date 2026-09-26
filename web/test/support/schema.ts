/**
 * Validating against the pipeline's own JSON Schemas, with Ajv (docs/06 §12.1).
 *
 * The schemas reference each other by relative path (docs/02 §18), so every one is registered
 * under its file name as well as its absolute `$id`, exactly as `uwpr_pubs.validate` does. A
 * fragment names one definition: `export.schema.json#/$defs/grant` validates a single grant, which
 * is how the test builders are held to the contract without building a whole export.
 */
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { readSchema } from './fixture';

const SCHEMAS = ['common.schema.json', 'export.schema.json', 'lookup-index.schema.json'];

let ajv: Ajv2020 | null = null;

function instance(): Ajv2020 {
  if (ajv === null) {
    ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    for (const name of SCHEMAS) ajv.addSchema(readSchema(name), name);
  }
  return ajv;
}

/** The validator for a schema file, or for one definition in it (`file#/$defs/name`). */
export function validator(entry: string): ValidateFunction {
  const validate = instance().getSchema(entry);
  if (validate === undefined) throw new Error(`No schema at ${entry}`);
  return validate;
}

/** Ajv's errors for the last value `validate` saw, one line each, so a failure says what broke. */
export const report = (validate: ValidateFunction): string[] =>
  (validate.errors ?? []).map((error) => `${error.instancePath} ${error.message ?? ''}`);
