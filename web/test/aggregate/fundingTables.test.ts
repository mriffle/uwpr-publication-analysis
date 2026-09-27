/**
 * The grants table's and the agency table's order and search (`aggregate/fundingTables.ts`;
 * docs/09 §12.5 items 4 and 6), as arithmetic over the component world.
 *
 * The rule the spec states outright — **unknown amounts last in both directions** — is asserted
 * for both tables, since it is the one a generic comparator gets wrong the moment the direction
 * flips. Both sort by counted funding by default (docs/09 F17), a grant's lifetime total on
 * request, and a counted $0 — a grant that began after its listing work — is a known zero, not
 * an unknown.
 */
import { describe, expect, it } from 'vitest';
import { UNFILTERED, fundingScope, rankAgencies } from '../../src/aggregate/funding';
import {
  AGENCY_SORT_KEYS,
  DEFAULT_AGENCY_SORT,
  DEFAULT_GRANT_SORT,
  GRANT_SORT_KEYS,
  naturalAgencyDirection,
  naturalGrantDirection,
  searchGrants,
  sortAgencies,
  sortGrants,
  toggleAgencySort,
  toggleGrantSort,
} from '../../src/aggregate/fundingTables';
import { WORLD, WORLD_GRANTS, worldIndex, worldScope, worldWorks } from '../support/fundingWorld';

const scope = worldScope();
const index = scope.index;
const keys = (rows: readonly { grant: { key: string } }[]) => rows.map((row) => row.grant.key);

/** The world with P01's fiscal years moved after its only listing work (2021): counted as $0. */
function beganAfterScope() {
  const later = { ...WORLD.p01, fiscal_years: { '2022': 1_000_000, '2023': 1_500_000 } };
  const index_ = worldIndex(WORLD_GRANTS.map((grant) => (grant.key === later.key ? later : grant)));
  return fundingScope(worldWorks(index_), index_, UNFILTERED);
}

describe('the grants table’s order', () => {
  it('sorts by counted funding, largest first, by default', () => {
    expect(DEFAULT_GRANT_SORT).toEqual({ key: 'counted', direction: 'desc' });
    expect(keys(sortGrants(scope.grants, DEFAULT_GRANT_SORT, index))).toEqual([
      WORLD.grfp.key,
      WORLD.p01.key,
      WORLD.r01.key,
      WORLD.foreign.key,
      // Unknown amounts, then by key.
      WORLD.unmatched.key,
      WORLD.nsf.key,
    ]);
  });

  it('keeps unknown amounts last when counted funding is sorted ascending too', () => {
    expect(keys(sortGrants(scope.grants, { key: 'counted', direction: 'asc' }, index))).toEqual([
      WORLD.foreign.key,
      WORLD.r01.key,
      WORLD.p01.key,
      WORLD.grfp.key,
      WORLD.unmatched.key,
      WORLD.nsf.key,
    ]);
  });

  it('sorts a counted $0 as a known zero, below every amount and above the unknowns', () => {
    const later = beganAfterScope();
    const p01 = later.grants.find((entry) => entry.grant.key === WORLD.p01.key);
    expect(p01?.counted).toMatchObject({ usd: 0, rule: 'began_after' });
    expect(keys(sortGrants(later.grants, DEFAULT_GRANT_SORT, later.index))).toEqual([
      WORLD.grfp.key,
      WORLD.r01.key,
      WORLD.foreign.key,
      WORLD.p01.key,
      WORLD.unmatched.key,
      WORLD.nsf.key,
    ]);
    expect(
      keys(sortGrants(later.grants, { key: 'counted', direction: 'asc' }, later.index)).slice(0, 2),
    ).toEqual([WORLD.p01.key, WORLD.foreign.key]);
  });

  it('sorts by the lifetime total on request, unknowns last both ways', () => {
    // FOREIGN's $750,000 lifetime counts $600,000: by lifetime it is still the smallest known.
    expect(keys(sortGrants(scope.grants, { key: 'lifetime', direction: 'desc' }, index))).toEqual([
      WORLD.grfp.key,
      WORLD.p01.key,
      WORLD.r01.key,
      WORLD.foreign.key,
      WORLD.unmatched.key,
      WORLD.nsf.key,
    ]);
    // With P01 counted $0, the two orders part: by lifetime it is second, by counted fourth.
    const later = beganAfterScope();
    expect(
      keys(sortGrants(later.grants, { key: 'lifetime', direction: 'desc' }, later.index))[1],
    ).toBe(WORLD.p01.key);
    const ascending = keys(sortGrants(scope.grants, { key: 'lifetime', direction: 'asc' }, index));
    expect(ascending.slice(-2)).toEqual([WORLD.unmatched.key, WORLD.nsf.key]);
  });

  it('counts less under a Year filter that shows an earlier listing work alone', () => {
    // R01 is listed in 2019 and 2021: shown only 2019, it counts FY2019 alone.
    const index_ = worldIndex();
    const [w2019] = worldWorks(index_);
    const filtered = fundingScope([w2019!], index_, UNFILTERED);
    const r01 = filtered.grants.find((entry) => entry.grant.key === WORLD.r01.key);
    expect(r01?.counted.usd).toBe(500_000);
    expect(scope.grants.find((entry) => entry.grant.key === WORLD.r01.key)?.counted.usd).toBe(
      1_000_000,
    );
  });

  it('keeps a grant with no title last whichever way titles run', () => {
    for (const direction of ['asc', 'desc'] as const) {
      const sorted = sortGrants(scope.grants, { key: 'title', direction }, index);
      const untitled = sorted.filter((entry) => entry.grant.title === null);
      expect(sorted.slice(-untitled.length)).toEqual(untitled);
    }
  });

  it('reads numbers with their digits as numbers, and agencies by their label', () => {
    const numbers = sortGrants(scope.grants, { key: 'number', direction: 'asc' }, index).map(
      (entry) => entry.grant.number,
    );
    expect(numbers).toEqual(
      [...numbers].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })),
    );
    const agencies = sortGrants(scope.grants, { key: 'agency', direction: 'asc' }, index).map(
      (entry) => entry.grant.agency,
    );
    // The foundation has no short name, so its label is its name, "SAMPLE Research Foundation".
    expect(agencies).toEqual(['MISC', 'NHLBI', 'NIGMS', 'NSF', 'NSF', 'F4399999999']);
  });

  it('sorts by first year and by publications, largest first, ties by key', () => {
    const first = sortGrants(scope.grants, { key: 'first', direction: 'desc' }, index);
    expect(first.map((entry) => entry.firstYear)).toEqual([2022, 2022, 2021, 2021, 2019, 2019]);
    const publications = sortGrants(
      scope.grants,
      { key: 'publications', direction: 'desc' },
      index,
    );
    expect(publications[0]?.grant.key).toBe(WORLD.r01.key);
  });

  it('toggles: the sorted column reverses, another starts in its natural direction', () => {
    expect(toggleGrantSort(DEFAULT_GRANT_SORT, 'counted')).toEqual({
      key: 'counted',
      direction: 'asc',
    });
    expect(toggleGrantSort(DEFAULT_GRANT_SORT, 'lifetime')).toEqual({
      key: 'lifetime',
      direction: 'desc',
    });
    expect(toggleGrantSort(DEFAULT_GRANT_SORT, 'title')).toEqual({
      key: 'title',
      direction: 'asc',
    });
    expect(toggleGrantSort({ key: 'title', direction: 'asc' }, 'title')).toEqual({
      key: 'title',
      direction: 'desc',
    });
    expect(GRANT_SORT_KEYS.map(naturalGrantDirection)).toEqual([
      'asc',
      'asc',
      'asc',
      'desc',
      'desc',
      'desc',
      'desc',
    ]);
  });

  it('is a total order: the same rows in any order sort the same way', () => {
    const reversed = [...scope.grants].reverse();
    for (const key of GRANT_SORT_KEYS) {
      for (const direction of ['asc', 'desc'] as const) {
        expect(keys(sortGrants(reversed, { key, direction }, index))).toEqual(
          keys(sortGrants(scope.grants, { key, direction }, index)),
        );
      }
    }
  });
});

describe('the grants table’s search', () => {
  const search = (query: string) => keys(searchGrants(scope.grants, query, index));

  it('matches every row for an empty query', () => {
    expect(search('   ')).toEqual(keys(scope.grants));
  });

  it('finds a number however it is spaced or punctuated', () => {
    expect(search('P01 HL-000002')).toEqual([WORLD.p01.key]);
    expect(search('p01hl000002')).toEqual([WORLD.p01.key]);
  });

  it('finds by title, investigator and organisation, folding case and accents’ forms', () => {
    expect(search('program project')).toEqual([WORLD.p01.key]);
    expect(search('ÉMILE')).toEqual([WORLD.r01.key]);
    expect(search('karolinska')).toEqual([WORLD.foreign.key]);
  });

  it('finds an institute’s grants by the agency at the top of its chain', () => {
    expect(search('NIH')).toEqual([WORLD.p01.key, WORLD.r01.key]);
    expect(search('national science foundation')).toEqual([WORLD.grfp.key, WORLD.nsf.key]);
  });

  it('needs every word to match', () => {
    expect(search('NIH program')).toEqual([WORLD.p01.key]);
    expect(search('NIH nowhere')).toEqual([]);
  });

  it('works without an index, on the grant’s own fields', () => {
    expect(keys(searchGrants(scope.grants, 'NIGMS', null))).toEqual([WORLD.r01.key]);
  });
});

describe('the agency table’s order', () => {
  const rows = rankAgencies(scope, { level: 'agency', limit: Infinity }).items;
  const codes = (sorted: readonly { code: string }[]) => sorted.map((row) => row.code);

  it('starts from the ranking’s own order, counted funding largest first', () => {
    expect(codes(sortAgencies(rows, DEFAULT_AGENCY_SORT, index))).toEqual(codes(rows));
    expect(codes(rows)).toEqual(['NSF', 'NHLBI', 'NIGMS', 'F4399999999']);
  });

  it('keeps an agency with no known total last in both directions', () => {
    const unknownOnly = worldScope({ agencies: ['NSF'], institutionWide: 'exclude' });
    const withUnknown = [
      ...rows.filter((row) => row.code !== 'NSF'),
      ...rankAgencies(unknownOnly, { level: 'agency' }).items,
    ];
    for (const direction of ['asc', 'desc'] as const) {
      expect(codes(sortAgencies(withUnknown, { key: 'counted', direction }, index)).at(-1)).toBe(
        'NSF',
      );
    }
  });

  it('sorts by parent and country with a missing one last, and by counts', () => {
    const byParent = codes(sortAgencies(rows, { key: 'parent', direction: 'desc' }, index));
    expect(byParent.slice(-2).sort()).toEqual(['F4399999999', 'NSF']);
    const byCountry = codes(sortAgencies(rows, { key: 'country', direction: 'asc' }, index));
    // Ukraine before the United States, by name.
    expect(byCountry[0]).toBe('F4399999999');
    const byGrants = sortAgencies(rows, { key: 'grants', direction: 'desc' }, index);
    expect(byGrants[0]?.code).toBe('NSF');
    for (const key of AGENCY_SORT_KEYS) {
      expect(sortAgencies(rows, { key, direction: 'asc' }, index)).toHaveLength(rows.length);
    }
  });

  it('toggles like the grants table', () => {
    expect(DEFAULT_AGENCY_SORT).toEqual({ key: 'counted', direction: 'desc' });
    expect(toggleAgencySort(DEFAULT_AGENCY_SORT, 'counted')).toEqual({
      key: 'counted',
      direction: 'asc',
    });
    expect(toggleAgencySort(DEFAULT_AGENCY_SORT, 'agency')).toEqual({
      key: 'agency',
      direction: 'asc',
    });
    expect(toggleAgencySort({ key: 'agency', direction: 'asc' }, 'agency').direction).toBe('desc');
    expect(AGENCY_SORT_KEYS.map(naturalAgencyDirection)).toEqual([
      'asc',
      'asc',
      'asc',
      'desc',
      'desc',
      'desc',
      'desc',
    ]);
  });
});
