import { describe, expect, it } from 'vitest';
import { fundingOf } from '../../src/contract/funding';
import {
  buildLabels,
  describeFilter,
  EMPTY_LABELS,
  filterSentence,
  fundingSentence,
} from '../../src/filter/describe';
import {
  EMPTY_FILTER,
  setSearch,
  toggleString,
  toggleYear,
  type FilterState,
} from '../../src/filter/state';
import { isSampleExport, sampleExport } from '../support/fixture';
import { legacyDocument } from '../support/funding';

describe('the active filter, in words (docs/06 §6)', () => {
  it('says so when nothing is selected, rather than showing a bare total', () => {
    expect(filterSentence(EMPTY_FILTER, 16)).toBe('16 publications, no filter applied.');
  });

  it('names every selection and the resulting count', () => {
    let state = toggleYear(EMPTY_FILTER, 2019);
    state = toggleString(state, 'country', 'US');
    expect(filterSentence(state, 3)).toBe('3 publications matching Year: 2019; Country: US.');
  });

  it('agrees with English on one result', () => {
    expect(filterSentence(EMPTY_FILTER, 1)).toBe('1 publication, no filter applied.');
  });

  it('quotes a search term', () => {
    const chips = describeFilter(setSearch(EMPTY_FILTER, 'casanovo'));
    expect(chips).toHaveLength(1);
    expect(chips[0]?.label).toBe('Search: “casanovo”');
  });

  it('gives each chip the state with that one selection removed', () => {
    let state = toggleYear(EMPTY_FILTER, 2019);
    state = toggleYear(state, 2020);
    const chips = describeFilter(state);
    expect(chips).toHaveLength(2);
    expect(chips[0]?.without.year).toEqual([2020]);
  });

  it('states a criterion in plain language, not as a rule identifier (docs/05 §11.7)', () => {
    const chips = describeFilter({ ...EMPTY_FILTER, criterion: [1] });
    expect(chips[0]?.label).toBe("How it is known: Listed on UWPR's publications page");
  });
});

describe('display names come from the export, never from the app', () => {
  const doc = sampleExport();
  const labels = buildLabels(doc);

  it('resolves a ROR ID to the institution name the export carries', () => {
    const first = doc.works.flatMap((work) => work.institutions)[0];
    expect(first).toBeDefined();
    const chips = describeFilter({ ...EMPTY_FILTER, institution: [first?.ror ?? ''] }, labels);
    expect(chips[0]?.label).toBe(`Institution: ${first?.name ?? ''}`);
  });

  it('resolves an author key to the author’s name', () => {
    const person = doc.works.flatMap((work) => work.authors)[0];
    const key = person?.openalex ?? person?.name ?? '';
    const chips = describeFilter({ ...EMPTY_FILTER, author: [key] }, labels);
    expect(chips[0]?.label).toBe(`Author: ${person?.name ?? ''}`);
  });

  it('resolves a venue key to the venue name', () => {
    const venue = doc.works.map((work) => work.venue).find((v) => v !== null);
    const key = venue?.issn_l ?? venue?.name ?? '';
    const chips = describeFilter({ ...EMPTY_FILTER, journal: [key] }, labels);
    expect(chips[0]?.label).toBe(`Journal: ${venue?.name ?? ''}`);
  });

  it('falls back to the raw value when the export has no name for it', () => {
    const chips = describeFilter({ ...EMPTY_FILTER, institution: ['0zzzzzzzz'] }, labels);
    expect(chips[0]?.label).toBe('Institution: 0zzzzzzzz');
  });
});

describe('agencies and grants, named from the funding block (docs/09 §12.4)', () => {
  const doc = sampleExport();
  const labels = buildLabels(doc, fundingOf(doc));
  const label = (state: Partial<FilterState>) =>
    describeFilter({ ...EMPTY_FILTER, ...state }, labels).map((chip) => chip.label);

  it('names an agency by its name', () => {
    expect(label({ agency: ['NIH'] })).toEqual(['Funding agency: National Institutes of Health']);
    expect(label({ agency: ['MISC'] })).toEqual(['Funding agency: Miscellaneous']);
  });

  // The grants named below are listed in both the sample and the real export; the sample's
  // synthetic grants, which the real one never has, are named in the sample-only cases.
  it('names a grant by its agency’s short name and its number, as the funder writes it', () => {
    expect(label({ grant: ['NIH:P30DK017047'] })).toEqual(['Grant: NIDDK P30DK017047']);
  });

  it.runIf(isSampleExport)('names the sample’s synthetic grant and task order the same way', () => {
    expect(label({ grant: ['NIH:R01GM999001'] })).toEqual(['Grant: NIGMS R01GM999001']);
    expect(label({ grant: ['NIH-contract:HHSN272209900002I:75N99099F00001'] })).toEqual([
      'Grant: NIAID 75N99099F00001',
    ]);
  });

  it('uses the agency’s name where it has no short name', () => {
    expect(label({ grant: ['CANCERFONDEN:222380PJ'] })).toEqual(['Grant: Cancerfonden 22 2380 Pj']);
  });

  it.runIf(isSampleExport)('names the sample’s synthetic funder and unmatched number so', () => {
    expect(label({ grant: ['F4399999999:UA99001'] })).toEqual([
      'Grant: SAMPLE Research Foundation UA-99001',
    ]);
    expect(label({ grant: ['MISC:R01GM999999'] })).toEqual(['Grant: Miscellaneous R01 GM999999']);
  });

  it('shows a stale code or key raw', () => {
    expect(label({ agency: ['NOPE'], grant: ['NIH:R01GM777777'] })).toEqual([
      'Funding agency: NOPE',
      'Grant: NIH:R01GM777777',
    ]);
  });

  it('shows them raw when the export has no funding data', () => {
    const legacy = legacyDocument();
    const bare = buildLabels(legacy, fundingOf(legacy));
    expect(bare.agency.size).toBe(0);
    expect(bare.grant.size).toBe(0);
    expect(buildLabels(doc).grant.size).toBe(0);
    expect(
      describeFilter({ ...EMPTY_FILTER, agency: ['NIH'] }, bare).map((chip) => chip.label),
    ).toEqual(['Funding agency: NIH']);
  });

  it('names a grant’s agency by code when the block lacks the agency', () => {
    const funding = fundingOf(doc);
    expect(funding).not.toBeNull();
    if (funding === null) return;
    const orphan = { ...funding, agencies: new Map() };
    expect(buildLabels(doc, orphan).grant.get('NIH:P30DK017047')).toBe('NIDDK P30DK017047');
  });

  it('places them after the publication dimensions, and removes one value per chip', () => {
    const state: FilterState = {
      ...EMPTY_FILTER,
      year: [2021],
      agency: ['NIH', 'VA'],
      grant: ['NIH:R01GM999001'],
      criterion: [2],
    };
    const chips = describeFilter(state, labels);
    expect(chips.map((chip) => chip.dimension)).toEqual([
      'year',
      'agency',
      'agency',
      'grant',
      'criterion',
    ]);
    expect(chips[1]?.without.agency).toEqual(['VA']);
    expect(chips[3]?.without.grant).toEqual([]);
    expect(chips[3]?.without.agency).toEqual(['NIH', 'VA']);
  });

  it('states them in the publications sentence like any other selection', () => {
    expect(filterSentence({ ...EMPTY_FILTER, agency: ['NIGMS'] }, 2, labels)).toBe(
      '2 publications matching Funding agency: National Institute of General Medical Sciences.',
    );
  });
});

describe('the funding sentence (docs/09 §12.4)', () => {
  const doc = sampleExport();
  const labels = buildLabels(doc, fundingOf(doc));
  const year2020 = { ...EMPTY_FILTER, year: [2020] };
  const counts = { grants: 41, withGrants: 88, publications: 338 };

  it('reads as the spec writes it', () => {
    expect(fundingSentence(year2020, counts)).toBe(
      '41 grants listed on 88 of 338 publications matching Year: 2020.',
    );
  });

  it('says so when nothing is selected, as the publications sentence does', () => {
    expect(fundingSentence(EMPTY_FILTER, { grants: 9, withGrants: 4, publications: 18 })).toBe(
      '9 grants listed on 4 of 18 publications, no filter applied.',
    );
  });

  it('agrees with English on one grant and one publication', () => {
    expect(
      fundingSentence(
        { ...EMPTY_FILTER, grant: ['NIH:P30DK017047'] },
        { grants: 1, withGrants: 1, publications: 1 },
        labels,
      ),
    ).toBe('1 grant listed on 1 of 1 publication matching Grant: NIDDK P30DK017047.');
  });

  it('states an empty result as counts, not as a missing sentence', () => {
    expect(fundingSentence(year2020, { grants: 0, withGrants: 0, publications: 0 })).toBe(
      '0 grants listed on 0 of 0 publications matching Year: 2020.',
    );
  });

  it('names every selection with the chips’ labels', () => {
    const state = { ...year2020, agency: ['NIH'], country: ['US'] };
    expect(fundingSentence(state, counts, labels)).toBe(
      '41 grants listed on 88 of 338 publications matching Year: 2020; Country: US; Funding agency: National Institutes of Health.',
    );
  });

  it('states the institution-wide position when they are excluded (docs/09 §12.11 rule 4)', () => {
    expect(fundingSentence(year2020, counts, EMPTY_LABELS, 'exclude')).toBe(
      '41 grants listed on 88 of 338 publications matching Year: 2020. Institution-wide awards are excluded.',
    );
    expect(
      fundingSentence(
        EMPTY_FILTER,
        { grants: 8, withGrants: 4, publications: 18 },
        labels,
        'exclude',
      ),
    ).toBe(
      '8 grants listed on 4 of 18 publications, no filter applied. Institution-wide awards are excluded.',
    );
  });

  it('says nothing of them when included, the default', () => {
    expect(fundingSentence(year2020, counts, EMPTY_LABELS, 'include')).toBe(
      fundingSentence(year2020, counts),
    );
  });

  it('claims no exclusion while a grant is selected, which overrides the toggle', () => {
    const state = { ...EMPTY_FILTER, grant: ['NSF:1908587'] };
    expect(
      fundingSentence(state, { grants: 1, withGrants: 1, publications: 1 }, labels, 'exclude'),
    ).toBe('1 grant listed on 1 of 1 publication matching Grant: NSF 1908587.');
  });

  it('leaves the publications sentence as it was', () => {
    expect(filterSentence(year2020, 338)).toBe('338 publications matching Year: 2020.');
  });
});
