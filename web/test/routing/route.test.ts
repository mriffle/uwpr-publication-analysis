/**
 * Routes (docs/06 §3), including the build-time base path that lets the same source serve a
 * root deployment, a sub-path or a different host (§13).
 */
import { describe, expect, it } from 'vitest';
import {
  overviewPath,
  parseRoute,
  publicationPath,
  routePath,
  stripBase,
} from '../../src/routing/route';

describe('parsing', () => {
  it('reads the overview at the root', () => {
    expect(parseRoute('/')).toEqual({ kind: 'overview' });
    expect(parseRoute('')).toEqual({ kind: 'overview' });
  });

  it('reads a publication by work ID', () => {
    expect(parseRoute('/publication/W-000457')).toEqual({ kind: 'publication', id: 'W-000457' });
  });

  it('reads a publication under a sub-path deployment', () => {
    expect(parseRoute('/uwpr/publication/W-000457', '/uwpr/')).toEqual({
      kind: 'publication',
      id: 'W-000457',
    });
    expect(parseRoute('/uwpr/', '/uwpr/')).toEqual({ kind: 'overview' });
    expect(parseRoute('/uwpr', '/uwpr/')).toEqual({ kind: 'overview' });
  });

  it('keeps a DOI whole, slash and all — the slash is not a path separator', () => {
    expect(parseRoute('/publication/10.1021/acs.jproteome.5c00706')).toEqual({
      kind: 'publication',
      id: '10.1021/acs.jproteome.5c00706',
    });
  });

  it('decodes an encoded identifier, which is how the app writes one', () => {
    expect(parseRoute('/publication/10.1021%2Facs.jproteome.5c00706')).toEqual({
      kind: 'publication',
      id: '10.1021/acs.jproteome.5c00706',
    });
  });

  it('survives a malformed escape rather than throwing on a hand-edited URL', () => {
    expect(parseRoute('/publication/%E0%A4%A')).toEqual({
      kind: 'publication',
      id: '%E0%A4%A',
    });
  });

  it('reads anything else as unknown, so the app can show a designed state', () => {
    expect(parseRoute('/method')).toEqual({ kind: 'unknown', path: 'method' });
    // The trailing slash is stripped with every other one, so this is "publication" with no
    // identifier, which is no route rather than an empty publication.
    expect(parseRoute('/publication/')).toEqual({ kind: 'unknown', path: 'publication' });
  });
});

describe('building', () => {
  it('round-trips a work ID', () => {
    expect(publicationPath('W-000457')).toBe('/publication/W-000457');
    expect(parseRoute(publicationPath('W-000457'))).toEqual({
      kind: 'publication',
      id: 'W-000457',
    });
  });

  it('round-trips under a base path', () => {
    const path = publicationPath('W-000457', '/uwpr/');
    expect(path).toBe('/uwpr/publication/W-000457');
    expect(parseRoute(path, '/uwpr/')).toEqual({ kind: 'publication', id: 'W-000457' });
  });

  it('round-trips a DOI', () => {
    const doi = '10.1021/acs.jproteome.5c00706';
    expect(parseRoute(publicationPath(doi))).toEqual({ kind: 'publication', id: doi });
  });

  it('builds the overview path at the root and under a base', () => {
    expect(overviewPath()).toBe('/');
    expect(overviewPath('/uwpr/')).toBe('/uwpr/');
  });

  it('builds a path for every route it can parse', () => {
    expect(routePath({ kind: 'overview' })).toBe('/');
    expect(routePath({ kind: 'publication', id: 'W-1' })).toBe('/publication/W-1');
    expect(routePath({ kind: 'unknown', path: 'method' })).toBe('/method');
  });
});

describe('stripBase', () => {
  it('removes the base and the surrounding slashes', () => {
    expect(stripBase('/uwpr/publication/W-1', '/uwpr/')).toBe('publication/W-1');
    expect(stripBase('/publication/W-1', '/')).toBe('publication/W-1');
  });

  it('leaves a path that is not under the base alone', () => {
    expect(stripBase('/elsewhere/x', '/uwpr/')).toBe('elsewhere/x');
  });
});
