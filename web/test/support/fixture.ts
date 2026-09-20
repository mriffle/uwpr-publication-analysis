/**
 * The committed sample export as the test fixture (docs/05 §13).
 *
 * "A committed sample drives app development and tests without the real store", built by the
 * same `build_export` that writes the real one and covering all twelve edge cases of §13.
 *
 * It is read from `samples/export/` rather than copied into `web/`, so there is one fixture in
 * the repository and it is the one the pipeline writes. Its figures are small — 16 works, 13
 * real and 3 synthetic — and nothing here hard-codes them: every expectation is read from the
 * document under test, so the same tests pass against the real 339-work export.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { ExportDocument, LookupIndexDocument } from '../../src/contract/types';

/**
 * The repository root, found by walking up from the working directory. Tests run under jsdom,
 * where `import.meta.url` is an http URL and cannot be turned into a path.
 */
function repositoryRoot(): string {
  let dir = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(resolve(dir, 'samples/export/uwpr_publications.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('samples/export/ not found: the committed sample export is the test fixture.');
}

const root = repositoryRoot();

/**
 * Point the fixture at another export directory — in practice the real one.
 *
 * docs/06 §15's last exit criterion is "The summary cross-check asserted against the real
 * export", and the real export is not in the repository (only `samples/export/` is). Until it
 * is, the check is run against a freshly built one:
 *
 *     uv run uwpr-pubs export --store store --out /tmp/real-export
 *     UWPR_EXPORT_DIR=/tmp/real-export npm test
 *
 * Nothing in the suite hard-codes a figure, so the same assertions hold over 16 works or 339.
 */
const exportDir = process.env.UWPR_EXPORT_DIR ?? resolve(root, 'samples/export');

/**
 * False when the suite is pointed at some other export.
 *
 * docs/05 §13: the twelve-case coverage guard "cannot apply to a real store, which can never
 * satisfy 'retracted' or 'override with attribution': the store holds no retraction, and its
 * only override is an *exclude*, which by definition never reaches the export." The case tests
 * are therefore sample-only; every other test in the suite holds against either.
 */
export const isSampleExport = process.env.UWPR_EXPORT_DIR === undefined;

export const SAMPLE_EXPORT_PATH = resolve(exportDir, 'uwpr_publications.json');
export const SAMPLE_LOOKUP_PATH = resolve(exportDir, 'lookup_index.json');
export const SCHEMA_DIR = resolve(root, 'schemas');

const read = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

export const sampleExport = (): ExportDocument => read<ExportDocument>(SAMPLE_EXPORT_PATH);
export const sampleLookup = (): LookupIndexDocument =>
  read<LookupIndexDocument>(SAMPLE_LOOKUP_PATH);
export const readSchema = (name: string): Record<string, unknown> =>
  read<Record<string, unknown>>(resolve(SCHEMA_DIR, name));
