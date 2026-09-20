/**
 * The bundle budget of docs/06 §10, checked in CI (§12.3: "The job fails on a budget overrun, so
 * the bundle cannot grow unnoticed").
 *
 * | JavaScript, gzipped | ≤ 250 KB |
 *
 * The compressed transfer is what the budget is about — GitHub Pages serves compressed — so the
 * check gzips the built JavaScript rather than measuring it raw. The most likely way to miss it
 * is importing the `d3` umbrella package for two scale functions, which docs/06 §10 calls out;
 * this script is what turns that into a red build.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_BYTES = 250 * 1024;

const distDir = resolve(import.meta.dirname, '..', 'dist');

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

try {
  await stat(distDir);
} catch {
  console.error(`No build at ${distDir}. Run \`npm run build\` first.`);
  process.exit(1);
}

let total = 0;
const files = [];
for await (const path of walk(distDir)) {
  if (!path.endsWith('.js')) continue;
  const gzipped = gzipSync(await readFile(path), { level: 9 }).length;
  total += gzipped;
  files.push({ path: path.slice(distDir.length + 1), gzipped });
}

files.sort((a, b) => b.gzipped - a.gzipped);
for (const file of files) {
  console.log(`  ${(file.gzipped / 1024).toFixed(1).padStart(7)} KB gz  ${file.path}`);
}

const kb = (total / 1024).toFixed(1);
const budgetKb = (BUDGET_BYTES / 1024).toFixed(0);
if (total > BUDGET_BYTES) {
  console.error(`JavaScript budget exceeded: ${kb} KB gzipped against a budget of ${budgetKb} KB.`);
  process.exit(1);
}
console.log(`JavaScript: ${kb} KB gzipped, within the ${budgetKb} KB budget (docs/06 §10).`);
