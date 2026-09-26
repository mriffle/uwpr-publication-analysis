/**
 * The scope rule (docs/09 §12.4, F15): which grants a filtered view shows. Each clause is tested
 * on its own, over the small world of `support/grants.ts`, and the unfiltered result is held to
 * the sample's `funding.summary`, which the pipeline computed independently.
 */
import { describe, expect, it } from 'vitest';
import { fundingOf } from '../../src/contract/funding';
import type { Grant, Work } from '../../src/contract/types';
import {
  DEFAULT_INSTITUTION_WIDE,
  grantSelection,
  grantsInScope,
  isMiscellaneous,
  listingsInScope,
  type GrantSelection,
} from '../../src/filter/funding';
import { applyFilter } from '../../src/filter/predicate';
import { EMPTY_FILTER, type FilterState } from '../../src/filter/state';
import { sampleExport } from '../support/fixture';
import { agency, grant, legacyDocument, listing, miscellaneous } from '../support/funding';
import {
  AGENCIES,
  FOUNDATION_GRANT,
  GRANTS,
  GRFP,
  grantsIndex,
  listings,
  NSF_PROJECT,
  P01,
  R01,
  UNMATCHED,
} from '../support/grants';
import { report, validator } from '../support/schema';
import { work } from '../support/works';

const index = grantsIndex();
const listingOf = (...grants: Grant[]) => listings(index, ...grants);
const worksListing = (...lists: Grant[][]): Work[] =>
  lists.map((grants) => work({ grants: listingOf(...grants) }));

const selection = (over: Partial<GrantSelection> = {}): GrantSelection => ({
  agencies: [],
  grants: [],
  institutionWide: 'include',
  ...over,
});
const keys = (grants: readonly Grant[]) => grants.map((item) => item.key);

/** One work listing every grant in the world. */
const everything = worksListing(GRANTS);

describe('the fixtures are grants the pipeline could write', () => {
  it.each([
    ...AGENCIES.map((item) => ['agency', item] as const),
    ...GRANTS.map((item) => ['grant', item] as const),
  ])('%s %#', (name, value) => {
    const entry = validator(`export.schema.json#/$defs/${name}`);
    const valid = entry(value);
    expect(report(entry)).toEqual([]);
    expect(valid).toBe(true);
  });
});

describe('grantSelection', () => {
  it('reads the two funding dimensions, and includes institution-wide awards by default (F4)', () => {
    const state: FilterState = { ...EMPTY_FILTER, agency: ['NSF'], grant: [R01.key], year: [2020] };
    expect(grantSelection(state)).toEqual({
      agencies: ['NSF'],
      grants: [R01.key],
      institutionWide: 'include',
    });
    expect(DEFAULT_INSTITUTION_WIDE).toBe('include');
  });

  it('carries the position it is given, and takes an absent one as the default', () => {
    expect(grantSelection(EMPTY_FILTER, 'exclude').institutionWide).toBe('exclude');
    expect(grantSelection(EMPTY_FILTER, undefined).institutionWide).toBe('include');
  });
});

describe('with nothing selected, every grant listed on the filtered works', () => {
  it('shows each grant the works list, Miscellaneous and institution-wide included, sorted by key', () => {
    expect(keys(grantsInScope(everything, index, selection()))).toEqual([...keys(GRANTS)].sort());
  });

  it('shows only the grants the given works list: the works are already filtered', () => {
    const works = worksListing([R01], [P01], [NSF_PROJECT]);
    expect(keys(grantsInScope(works.slice(0, 2), index, selection()))).toEqual([P01.key, R01.key]);
  });

  it('counts a grant once however many works list it (docs/09 §12.11 rule 7)', () => {
    const works = worksListing([R01, P01], [R01], [R01, NSF_PROJECT], [P01]);
    expect(keys(grantsInScope(works, index, selection()))).toEqual([
      P01.key,
      R01.key,
      NSF_PROJECT.key,
    ]);
  });

  it('returns the index’s grant objects, in key order whatever order the works list them', () => {
    const works = worksListing([NSF_PROJECT, R01], [P01]);
    const scoped = grantsInScope(works, index, selection());
    expect(scoped).toEqual([P01, R01, NSF_PROJECT].sort((a, b) => (a.key < b.key ? -1 : 1)));
    expect(scoped[0]).toBe(index.grants.get(scoped[0]?.key ?? ''));
  });

  it('shows nothing for works that list no grant, or no works', () => {
    expect(grantsInScope([work()], index, selection())).toEqual([]);
    expect(grantsInScope([], index, selection())).toEqual([]);
  });
});

describe('an agency selection narrows the grants, by chain', () => {
  // The case F15 exists for: a paper listing NSF and NIH grants, under agency=NSF.
  const both = worksListing([R01, NSF_PROJECT]);

  it('keeps only the selected agency’s grants, not every grant on the matching works', () => {
    expect(keys(grantsInScope(both, index, selection({ agencies: ['NSF'] })))).toEqual([
      NSF_PROJECT.key,
    ]);
  });

  it('keeps every institute’s grants under a root agency: NIH keeps NIGMS and NHLBI', () => {
    expect(keys(grantsInScope(everything, index, selection({ agencies: ['NIH'] })))).toEqual([
      P01.key,
      R01.key,
    ]);
  });

  it('keeps only that institute’s under an institute', () => {
    expect(keys(grantsInScope(everything, index, selection({ agencies: ['NIGMS'] })))).toEqual([
      R01.key,
    ]);
  });

  it('keeps any selected agency’s grants: OR within the dimension', () => {
    expect(
      keys(grantsInScope(everything, index, selection({ agencies: ['NHLBI', 'F4399999999'] }))),
    ).toEqual([FOUNDATION_GRANT.key, P01.key]);
  });

  it('keeps nothing for an agency no grant belongs to', () => {
    expect(grantsInScope(everything, index, selection({ agencies: ['NOPE'] }))).toEqual([]);
  });
});

describe('a grant selection narrows the grants to those selected', () => {
  it('keeps only the selected grants, not the others on the same works', () => {
    expect(keys(grantsInScope(everything, index, selection({ grants: [P01.key] })))).toEqual([
      P01.key,
    ]);
    expect(
      keys(grantsInScope(everything, index, selection({ grants: [NSF_PROJECT.key, R01.key] }))),
    ).toEqual([R01.key, NSF_PROJECT.key]);
  });

  it('combines with an agency selection by AND, as dimensions do', () => {
    // The publications listing an NSF grant *and* R01 are selected; the grants that are both
    // NSF's and R01 are none.
    expect(
      grantsInScope(everything, index, selection({ agencies: ['NSF'], grants: [R01.key] })),
    ).toEqual([]);
    expect(
      keys(grantsInScope(everything, index, selection({ agencies: ['NIH'], grants: [R01.key] }))),
    ).toEqual([R01.key]);
  });

  it('keeps nothing for a key the index does not hold', () => {
    expect(grantsInScope(everything, index, selection({ grants: ['NIH:R01GM777777'] }))).toEqual(
      [],
    );
  });
});

describe('the institution-wide toggle (F4)', () => {
  it('keeps institution-wide awards when included, the default', () => {
    expect(keys(grantsInScope(everything, index, selection()))).toContain(GRFP.key);
  });

  it('drops them when excluded, and nothing else', () => {
    expect(
      keys(grantsInScope(everything, index, selection({ institutionWide: 'exclude' }))),
    ).toEqual(
      keys(GRANTS)
        .filter((key) => key !== GRFP.key)
        .sort(),
    );
  });

  it('drops them under an agency selection too', () => {
    expect(
      keys(
        grantsInScope(
          everything,
          index,
          selection({ agencies: ['NSF'], institutionWide: 'exclude' }),
        ),
      ),
    ).toEqual([NSF_PROJECT.key]);
  });

  it('is overridden by an explicit grant selection: a selected award is shown while excluded', () => {
    expect(
      keys(
        grantsInScope(
          everything,
          index,
          selection({ grants: [GRFP.key], institutionWide: 'exclude' }),
        ),
      ),
    ).toEqual([GRFP.key]);
  });
});

describe('Miscellaneous (docs/09 §12.4)', () => {
  it('is kept when nothing is selected', () => {
    expect(keys(grantsInScope(everything, index, selection()))).toContain(UNMATCHED.key);
  });

  it('is dropped when the agency selection does not include it', () => {
    expect(keys(grantsInScope(everything, index, selection({ agencies: ['NIH'] })))).not.toContain(
      UNMATCHED.key,
    );
  });

  it('is kept when the agency selection includes it, alone or with others', () => {
    expect(keys(grantsInScope(everything, index, selection({ agencies: ['MISC'] })))).toEqual([
      UNMATCHED.key,
    ]);
    expect(
      keys(grantsInScope(everything, index, selection({ agencies: ['NIH', 'MISC'] }))),
    ).toEqual([UNMATCHED.key, P01.key, R01.key].sort());
  });

  it('is dropped when another grant is selected, even with Miscellaneous selected', () => {
    expect(keys(grantsInScope(everything, index, selection({ grants: [R01.key] })))).toEqual([
      R01.key,
    ]);
    expect(
      grantsInScope(everything, index, selection({ agencies: ['MISC'], grants: [R01.key] })),
    ).toEqual([]);
  });

  it('is kept when it is the grant selected, as a selected institution-wide award is', () => {
    expect(keys(grantsInScope(everything, index, selection({ grants: [UNMATCHED.key] })))).toEqual([
      UNMATCHED.key,
    ]);
  });

  it('is found by group, never by key, whatever chain its listing carries', () => {
    // The pipeline's to name: here Miscellaneous is `UNMATCHED`, and a listing claims an NIH
    // chain for it, which the validator would refuse. The group still decides.
    const unmatched = miscellaneous({ code: 'UNMATCHED' });
    const number = grant({ ...UNMATCHED, key: 'UNMATCHED:R01GM999999', agency: 'UNMATCHED' });
    const odd = grantsIndex({ agencies: [agency(), unmatched], grants: [number] });
    expect(odd.miscellaneous?.code).toBe('UNMATCHED');
    expect(isMiscellaneous(number, odd)).toBe(true);
    const works = [
      work({ grants: [listing({ grant: number.key, agencies: ['NIH', 'UNMATCHED'] })] }),
    ];
    expect(grantsInScope(works, odd, selection({ agencies: ['NIH'] }))).toEqual([]);
    expect(keys(grantsInScope(works, odd, selection({ agencies: ['UNMATCHED'] })))).toEqual([
      number.key,
    ]);
    expect(keys(grantsInScope(works, odd, selection()))).toEqual([number.key]);
  });

  it('is not a code: an agency called MISC outside the group is an ordinary agency', () => {
    const ordinary = agency({ code: 'MISC', name: 'Ministry of Science', short_name: 'MISC' });
    const number = grant({ ...R01, key: 'MISC:12345', agency: 'MISC', number: '12345' });
    const plain = grantsIndex({ agencies: [agency(), ordinary], grants: [number] });
    expect(plain.miscellaneous).toBeNull();
    expect(isMiscellaneous(number, plain)).toBe(false);
  });
});

describe('listingsInScope: the listings behind the grants, per work', () => {
  it('keeps a work’s in-scope listings in the work’s order', () => {
    const [subject] = worksListing([NSF_PROJECT, R01, GRFP, P01]);
    expect(
      listingsInScope(subject ?? work(), index, selection({ agencies: ['NIH'] })).map(
        (item) => item.grant,
      ),
    ).toEqual([R01.key, P01.key]);
  });

  it('says which works list a grant in scope: the K of "listed on K of N publications"', () => {
    const works = worksListing([R01], [NSF_PROJECT], [], [GRFP]);
    const withListing = (scope: GrantSelection) =>
      works.filter((item) => listingsInScope(item, index, scope).length > 0).length;
    expect(withListing(selection())).toBe(3);
    expect(withListing(selection({ agencies: ['NSF'] }))).toBe(2);
    expect(withListing(selection({ agencies: ['NSF'], institutionWide: 'exclude' }))).toBe(1);
  });

  it('ignores a listing naming a grant the index does not hold', () => {
    const stray = work({ grants: [listing({ grant: 'NIH:R01GM777777' })] });
    expect(listingsInScope(stray, index, selection())).toEqual([]);
    expect(grantsInScope([stray], index, selection())).toEqual([]);
  });
});

describe('an export with no funding data has no grants in scope (docs/09 §12.10)', () => {
  it('shows nothing, and does not throw, without an index', () => {
    expect(grantsInScope(everything, null, selection())).toEqual([]);
    expect(listingsInScope(everything[0] ?? work(), null, selection())).toEqual([]);
  });

  it('shows nothing for a 1.0 export, whose works carry no grants', () => {
    const legacy = legacyDocument();
    const funding = fundingOf(legacy);
    expect(funding).toBeNull();
    expect(grantsInScope(legacy.works, funding, selection())).toEqual([]);
  });
});

describe('unfiltered, the scope rule agrees with the pipeline’s own summary (docs/09 §11.6)', () => {
  const doc = sampleExport();
  const funding = fundingOf(doc);
  const summary = doc.funding.summary;
  const all = applyFilter(doc.works, EMPTY_FILTER, funding);

  it('shows every grant in the block, each once', () => {
    const scoped = grantsInScope(all, funding, grantSelection(EMPTY_FILTER));
    expect(scoped).toHaveLength(summary.grants);
    expect(keys(scoped)).toEqual(doc.funding.grants.map((item) => item.key));
  });

  it('leaves out exactly the institution-wide awards when they are excluded', () => {
    const scoped = grantsInScope(all, funding, grantSelection(EMPTY_FILTER, 'exclude'));
    expect(scoped).toHaveLength(summary.grants - summary.grants_institution_wide);
    expect(scoped.every((item) => item.scope === 'project')).toBe(true);
  });

  it('finds the works listing a grant: works_with_listings', () => {
    const scope = grantSelection(EMPTY_FILTER);
    const listed = all.filter((item) => listingsInScope(item, funding, scope).length > 0);
    expect(listed).toHaveLength(summary.works_with_listings);
  });
});
