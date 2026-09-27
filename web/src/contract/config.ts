/**
 * Build-time configuration (docs/06 §13).
 *
 * Phase 6 assumes only that the two export files are served at a configurable path relative to
 * the app, so the path and the app's base path are both build-time values and neither appears
 * as a literal anywhere else.
 */

/** Injected by `define` in vite.config.ts from `VITE_DATA_PATH`; `data` by default. */
const dataPath: string = typeof __DATA_PATH__ === 'string' ? __DATA_PATH__ : 'data';

const base: string = import.meta.env?.BASE_URL ?? '/';

function join(...parts: string[]): string {
  return parts
    .map((part, index) => (index === 0 ? part.replace(/\/+$/, '') : part.replace(/^\/+|\/+$/g, '')))
    .filter((part, index) => index === 0 || part.length > 0)
    .join('/');
}

/** `export/uwpr_publications.json` — the works, the summary and the method block. */
export const EXPORT_FILE = 'uwpr_publications.json';

/** `export/lookup_index.json` — loaded on demand, never on first paint (docs/06 §10). */
export const LOOKUP_FILE = 'lookup_index.json';

export const exportUrl = (): string => join(base, dataPath, EXPORT_FILE);
export const lookupUrl = (): string => join(base, dataPath, LOOKUP_FILE);

/**
 * The app's build-time base path, which the router resolves every route against (docs/06 §3).
 *
 * It is a function rather than a constant so that a test can render the app under a sub-path
 * deployment without reloading the module.
 */
export const basePath = (): string => base;
