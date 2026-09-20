/**
 * The explorer's ordering (docs/06 §4.8: "Sortable by year, citations and title").
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SORT,
  isSortKey,
  naturalDirection,
  sortWorks,
  toggleSort,
} from '../../src/aggregate/explorer';
import { work } from '../support/works';

const row = (title: string, year: number, citations: number) =>
  work({
    title,
    year,
    citations: { total: citations, by_year: {}, fwci: null, percentile: null, as_of: '2026-09-20' },
  });

describe('the sort key', () => {
  it('opens newest first, which is the question a reader arrives with', () => {
    expect(DEFAULT_SORT).toEqual({ key: 'year', direction: 'desc' });
  });

  it('starts a new column at its natural direction: titles A–Z, numbers highest first', () => {
    expect(naturalDirection('title')).toBe('asc');
    expect(naturalDirection('year')).toBe('desc');
    expect(naturalDirection('citations')).toBe('desc');
    expect(toggleSort(DEFAULT_SORT, 'title')).toEqual({ key: 'title', direction: 'asc' });
  });

  it('reverses the column that is already sorted', () => {
    expect(toggleSort({ key: 'year', direction: 'desc' }, 'year')).toEqual({
      key: 'year',
      direction: 'asc',
    });
  });

  it('recognises only the three keys the spec names', () => {
    expect(isSortKey('year')).toBe(true);
    expect(isSortKey('venue')).toBe(false);
  });
});

describe('sorting', () => {
  const works = [row('Beta', 2020, 5), row('Alpha', 2024, 1), row('Gamma', 2020, 9)];

  it('sorts by year, newest first', () => {
    expect(sortWorks(works, { key: 'year', direction: 'desc' }).map((item) => item.title)).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ]);
  });

  it('sorts by citations', () => {
    expect(
      sortWorks(works, { key: 'citations', direction: 'desc' }).map((item) => item.title),
    ).toEqual(['Gamma', 'Beta', 'Alpha']);
  });

  it('sorts by title', () => {
    expect(sortWorks(works, { key: 'title', direction: 'asc' }).map((item) => item.title)).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ]);
  });

  it('is a total order, so equal values never reshuffle between renders', () => {
    const tied = [row('B', 2020, 1), row('A', 2020, 1)];
    const once = sortWorks(tied, { key: 'year', direction: 'desc' }).map((item) => item.title);
    const twice = sortWorks([...tied].reverse(), { key: 'year', direction: 'desc' }).map(
      (item) => item.title,
    );
    expect(once).toEqual(twice);
  });

  it('leaves the input array alone', () => {
    const copy = [...works];
    sortWorks(works, { key: 'title', direction: 'asc' });
    expect(works).toEqual(copy);
  });
});
