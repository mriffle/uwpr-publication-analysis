/**
 * Build-time configuration (docs/06 §13): "the two export files reachable at a configurable path
 * relative to the app", so the same source serves a root deployment or a sub-path.
 */
import { describe, expect, it } from 'vitest';
import { EXPORT_FILE, LOOKUP_FILE, exportUrl, lookupUrl } from '../../src/contract/config';

describe('where the app fetches its data', () => {
  it('names the two files of docs/05 §4.1', () => {
    expect(EXPORT_FILE).toBe('uwpr_publications.json');
    expect(LOOKUP_FILE).toBe('lookup_index.json');
  });

  it('builds a path under the app’s base, with no doubled or missing separator', () => {
    // Vitest resolves `import.meta.env.BASE_URL` to '/' and __DATA_PATH__ to the configured
    // 'data', which is the default deployment shape.
    expect(exportUrl()).toBe('/data/uwpr_publications.json');
    expect(lookupUrl()).toBe('/data/lookup_index.json');
  });
});
