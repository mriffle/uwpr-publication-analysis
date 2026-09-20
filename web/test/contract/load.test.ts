/**
 * Loading and the `schema_version` check (docs/06 §7, docs/05 §12).
 */
import { describe, expect, it } from 'vitest';
import {
  describeFailure,
  loadExport,
  loadLookupIndex,
  SUPPORTED_SCHEMA_MAJOR,
  type Fetcher,
} from '../../src/contract/load';
import { sampleExport, sampleLookup } from '../support/fixture';

const serving =
  (body: unknown, status = 200): Fetcher =>
  () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

describe('loadExport', () => {
  it('loads the committed sample export', async () => {
    const result = await loadExport('/data/uwpr_publications.json', serving(sampleExport()));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.works.length).toBe(sampleExport().works.length);
  });

  it('reports an unreachable file by name, so the message names what failed', async () => {
    const result = await loadExport('/data/uwpr_publications.json', () =>
      Promise.reject(new Error('network down')),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe('unreachable');
      expect(describeFailure(result.failure)).toContain('/data/uwpr_publications.json');
    }
  });

  it('treats an HTTP error as unreachable and states the status', async () => {
    const result = await loadExport('/data/uwpr_publications.json', serving({}, 404));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(describeFailure(result.failure)).toContain('404');
  });

  it('reports a file that is not JSON separately from one that is missing', async () => {
    const result = await loadExport('/data/uwpr_publications.json', () =>
      Promise.resolve(new Response('<html>not json</html>', { status: 200 })),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('unparseable');
  });

  it('refuses a major version it does not know, naming both versions', async () => {
    const doc = { ...sampleExport(), schema_version: '2.0' };
    const result = await loadExport('/data/uwpr_publications.json', serving(doc));
    expect(result.ok).toBe(false);
    if (!result.ok && result.failure.kind === 'schema-version') {
      expect(result.failure.found).toBe('2.0');
      expect(result.failure.expected).toBe(`${String(SUPPORTED_SCHEMA_MAJOR)}.x`);
      const message = describeFailure(result.failure);
      expect(message).toContain('2.0');
      expect(message).toContain('1.x');
    }
  });

  it('accepts a newer minor version, because additive changes bump the minor (docs/05 §12)', async () => {
    const doc = { ...sampleExport(), schema_version: '1.7' };
    const result = await loadExport('/data/uwpr_publications.json', serving(doc));
    expect(result.ok).toBe(true);
  });

  it('refuses a version that is not a version at all', async () => {
    for (const version of ['', 'one', '1', null, undefined]) {
      const doc = { ...sampleExport(), schema_version: version };
      const result = await loadExport('/x.json', serving(doc));
      expect(result.ok).toBe(false);
    }
  });
});

describe('loadLookupIndex', () => {
  it('loads the committed sample lookup index and checks its version too', async () => {
    const result = await loadLookupIndex('/data/lookup_index.json', serving(sampleLookup()));
    expect(result.ok).toBe(true);

    const bad = await loadLookupIndex(
      '/data/lookup_index.json',
      serving({ ...sampleLookup(), schema_version: '3.1' }),
    );
    expect(bad.ok).toBe(false);
  });
});
