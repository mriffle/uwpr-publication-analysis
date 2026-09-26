/**
 * The Funding impact routes (docs/09; docs/06 §3): `/funding`, `/funding/agency/<key>` and
 * `/funding/grant/<key>`, at the root and under a base path.
 *
 * A key is the pipeline's own grammar, and some of them are written as a paper printed them, so
 * the cases that matter are the characters a key can carry that a path segment cannot: a colon,
 * a space and a slash. Each must survive a round trip exactly.
 */
import { describe, expect, it } from 'vitest';
import {
  agencyPath,
  fundingPath,
  grantPath,
  parseRoute,
  routePath,
  type Route,
} from '../../src/routing/route';

const KEYS = [
  'NIH:R01GM086688',
  'NIH-contract:HHSN272201700036I:75N93020F00001',
  'MISC:ABC123',
  'MISC:P01 HL0996',
  'MISC:5 R01/GM 12345-03',
  'USA:NASA:NNX14AB01G',
];

describe('parsing', () => {
  it('reads the funding view at /funding, at the root and under a base', () => {
    expect(parseRoute('/funding')).toEqual({ kind: 'funding' });
    expect(parseRoute('/funding/')).toEqual({ kind: 'funding' });
    expect(parseRoute('/uwpr/funding', '/uwpr/')).toEqual({ kind: 'funding' });
  });

  it('reads an agency and a grant by key, the prefix before the exact match', () => {
    expect(parseRoute('/funding/agency/NIH')).toEqual({ kind: 'agency', key: 'NIH' });
    expect(parseRoute('/funding/grant/NIH%3AR01GM086688')).toEqual({
      kind: 'grant',
      key: 'NIH:R01GM086688',
    });
    expect(parseRoute('/uwpr/funding/grant/NIH%3AR01GM086688', '/uwpr/')).toEqual({
      kind: 'grant',
      key: 'NIH:R01GM086688',
    });
  });

  it('accepts a colon written unescaped, which is how a reader types one', () => {
    expect(parseRoute('/funding/grant/NIH:R01GM086688')).toEqual({
      kind: 'grant',
      key: 'NIH:R01GM086688',
    });
  });

  it('keeps a key whole, slash and all, as it does a DOI', () => {
    expect(parseRoute('/funding/grant/MISC:5 R01/GM 12345-03')).toEqual({
      kind: 'grant',
      key: 'MISC:5 R01/GM 12345-03',
    });
  });

  it('survives a malformed escape rather than throwing on a hand-edited URL', () => {
    expect(parseRoute('/funding/agency/%E0%A4%A')).toEqual({ kind: 'agency', key: '%E0%A4%A' });
  });

  it('reads a prefix with no key as no route, not as an empty agency or grant', () => {
    expect(parseRoute('/funding/agency/')).toEqual({ kind: 'unknown', path: 'funding/agency' });
    expect(parseRoute('/funding/grant')).toEqual({ kind: 'unknown', path: 'funding/grant' });
  });

  it('reads anything else under /funding as no route', () => {
    expect(parseRoute('/funding/nowhere')).toEqual({ kind: 'unknown', path: 'funding/nowhere' });
    expect(parseRoute('/fundingx')).toEqual({ kind: 'unknown', path: 'fundingx' });
  });

  it('has no funding routes at all in a build without the view', () => {
    for (const path of ['/funding', '/funding/agency/NIH', '/funding/grant/NIH%3AR01']) {
      expect(parseRoute(path, '/', { funding: false }).kind).toBe('unknown');
    }
    // Every other route is unaffected by the flag.
    expect(parseRoute('/method', '/', { funding: false })).toEqual({ kind: 'method' });
    expect(parseRoute('/publication/W-1', '/', { funding: false })).toEqual({
      kind: 'publication',
      id: 'W-1',
    });
  });
});

describe('building', () => {
  it('builds the funding view at the root and under a base', () => {
    expect(fundingPath()).toBe('/funding');
    expect(fundingPath('/uwpr/')).toBe('/uwpr/funding');
  });

  it('escapes the characters a path segment cannot carry', () => {
    expect(grantPath('NIH:R01GM086688')).toBe('/funding/grant/NIH%3AR01GM086688');
    expect(agencyPath('MISC:P01 HL0996/2')).toBe('/funding/agency/MISC%3AP01%20HL0996%2F2');
  });

  it.each(KEYS)('round-trips the key %s, at the root and under a base', (key) => {
    for (const base of ['/', '/uwpr/', '/a/b/']) {
      expect(parseRoute(agencyPath(key, base), base)).toEqual({ kind: 'agency', key });
      expect(parseRoute(grantPath(key, base), base)).toEqual({ kind: 'grant', key });
    }
  });

  it('builds a path for every funding route it can parse', () => {
    const routes: Route[] = [
      { kind: 'funding' },
      { kind: 'agency', key: 'NIH' },
      { kind: 'grant', key: 'NSF:1443474' },
    ];
    for (const route of routes) {
      expect(parseRoute(routePath(route))).toEqual(route);
      expect(parseRoute(routePath(route, '/uwpr/'), '/uwpr/')).toEqual(route);
    }
  });
});
