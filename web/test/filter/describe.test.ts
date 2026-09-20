import { describe, expect, it } from 'vitest';
import { buildLabels, describeFilter, filterSentence } from '../../src/filter/describe';
import { EMPTY_FILTER, setSearch, toggleString, toggleYear } from '../../src/filter/state';
import { sampleExport } from '../support/fixture';

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
