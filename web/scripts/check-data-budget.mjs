/**
 * The data budget of docs/06 §10, checked in CI, as `check-bundle-budget.mjs` checks the
 * JavaScript one.
 *
 * | Data transferred on first load, gzipped | ≤ 500 KiB |
 *
 * First load reads one file, `uwpr_publications.json`; `lookup_index.json` loads on demand
 * (§10), so it is shown here and not counted. The measure is the bundle budget's — gzip level 9,
 * KiB of 1,024 bytes — so both budgets mean the same thing (docs/09 §11.9).
 *
 * It checks `export/` and `samples/export/`, the two exports committed beside the app, plus
 * `UWPR_EXPORT_DIR` when it is set; or the directories named on the command line instead. **This
 * cannot see the weekly run's export**: the bot's commit starts no workflow (docs/07 §6). The
 * pipeline therefore measures the same file the same way in stage 11 and alerts above the same
 * budget (`stages/export.py`'s `DATA_BUDGET_BYTES`, which a test keeps equal to this one).
 */
import { readFile, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_BYTES = 500 * 1024;
const EXPORT_FILE = 'uwpr_publications.json';
const LOOKUP_FILE = 'lookup_index.json';

const root = resolve(import.meta.dirname, '..', '..');
const named = process.argv.slice(2);
const defaults = [resolve(root, 'export'), resolve(root, 'samples', 'export')];
if (process.env.UWPR_EXPORT_DIR) defaults.push(resolve(process.env.UWPR_EXPORT_DIR));
const directories = [...new Set(named.length ? named.map((dir) => resolve(dir)) : defaults)];

const gzipped = async (path) => gzipSync(await readFile(path), { level: 9 }).length;
const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
/** A path inside the repository relative to its root, as the docs name it; any other in full. */
const shown = (path) => (relative(root, path).startsWith('..') ? path : relative(root, path));

let failed = false;
for (const dir of directories) {
  const path = resolve(dir, EXPORT_FILE);
  try {
    await stat(path);
  } catch {
    console.error(`No ${EXPORT_FILE} in ${shown(dir)}.`);
    failed = true;
    continue;
  }
  const size = await gzipped(path);
  const over = size > BUDGET_BYTES;
  failed ||= over;
  console.log(
    `  ${kib(size).padStart(10)} gz  ${shown(path)}  (${size.toLocaleString('en-US')} bytes)${over ? '  OVER BUDGET' : ''}`,
  );
  try {
    const lookup = await gzipped(resolve(dir, LOOKUP_FILE));
    console.log(
      `  ${kib(lookup).padStart(10)} gz  ${shown(resolve(dir, LOOKUP_FILE))}  (on demand; not counted)`,
    );
  } catch {
    // The lookup index is not part of the budget, so its absence is not this check's concern.
  }
}

const budget = kib(BUDGET_BYTES);
if (failed) {
  console.error(
    `Data budget exceeded, or an export is missing: first load may be at most ${budget} gzipped (docs/06 §10).`,
  );
  process.exit(1);
}
console.log(
  `Data: every first load within the ${budget} budget, gzipped at level 9 (docs/06 §10).`,
);
