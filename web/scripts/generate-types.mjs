/**
 * Generate the app's contract types from the pipeline's JSON Schemas (docs/06 B3).
 *
 * "TypeScript types are generated from the JSON Schemas, not hand-written. Makes the data
 * contract the compile-time interface: a pipeline schema change that the app does not handle
 * fails the build rather than the page."
 *
 * `node scripts/generate-types.mjs`          writes src/contract/generated/
 * `node scripts/generate-types.mjs --check`  fails if the committed output is stale
 *
 * The generated files are committed so that `tsc` and the editor work without a generate step,
 * and the --check mode (run in CI, and by `npm test`) is what turns schema drift into a failure.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { compile } from 'json-schema-to-typescript';

const here = import.meta.dirname;
const schemaDir = resolve(here, '..', '..', 'schemas');
const outDir = resolve(here, '..', 'src', 'contract', 'generated');

const TARGETS = [
  { schema: 'export.schema.json', name: 'ExportDocument', out: 'export.ts' },
  { schema: 'lookup-index.schema.json', name: 'LookupIndexDocument', out: 'lookup-index.ts' },
];

const banner = (source) =>
  [
    '/* eslint-disable */',
    '/**',
    ` * Generated from schemas/${source} by web/scripts/generate-types.mjs (docs/06 B3).`,
    ' * Do not edit by hand: run `npm run generate:types`.',
    ' */',
  ].join('\n');

async function render({ schema, name, out }) {
  const raw = JSON.parse(await readFile(join(schemaDir, schema), 'utf8'));
  // The schema `title` is a sentence naming the file and its spec section, and `$id` is a URL;
  // both would become the root type's name. Neither is an identifier, so `name` supplies it
  // instead. Relative `$ref`s keep resolving because they resolve against `cwd`, not `$id`.
  delete raw.title;
  delete raw.$id;
  const ts = await compile(raw, name, {
    cwd: `${schemaDir}/`,
    bannerComment: banner(schema),
    additionalProperties: false,
    declareExternallyReferenced: true,
    enableConstEnums: false,
    unreachableDefinitions: false,
    style: { printWidth: 100, singleQuote: true, semi: true, trailingComma: 'all' },
  });
  return { path: join(outDir, out), ts };
}

const results = await Promise.all(TARGETS.map(render));

if (process.argv.includes('--check')) {
  let stale = false;
  for (const { path, ts } of results) {
    const current = await readFile(path, 'utf8').catch(() => null);
    if (current !== ts) {
      stale = true;
      console.error(
        `Contract drift: ${path} does not match schemas/. Run \`npm run generate:types\`.`,
      );
    }
  }
  process.exit(stale ? 1 : 0);
}

await mkdir(outDir, { recursive: true });
for (const { path, ts } of results) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, ts, 'utf8');
  console.log(`wrote ${path}`);
}
