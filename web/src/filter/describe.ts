/**
 * The active filter, in words (docs/06 §6).
 *
 * "The active filter is stated in words. A filtered figure that looks like a total is the
 * easiest way for an accurate page to mislead." Pure, so the sentence a screen reader hears in
 * the live region and the chips a sighted reader sees are the same text, built once and tested
 * as data.
 */
import type { ExportDocument } from '../contract/types';
import { authorKey } from './predicate';
import type { FilterState } from './state';

export type ChipDimension =
  | 'year'
  | 'domain'
  | 'field'
  | 'subfield'
  | 'topic'
  | 'journal'
  | 'institution'
  | 'country'
  | 'author'
  | 'oa'
  | 'kind'
  | 'criterion'
  | 'onOfficialList'
  | 'search';

export interface FilterChip {
  dimension: ChipDimension;
  /** The chip's text, e.g. "Year: 2019". */
  label: string;
  /** The filter with this one selection removed. */
  without: FilterState;
}

/** Display names the raw filter values do not carry: a ROR ID, an OpenAlex author ID, a venue key. */
export interface FilterLabels {
  institution: ReadonlyMap<string, string>;
  author: ReadonlyMap<string, string>;
  journal: ReadonlyMap<string, string>;
}

export const EMPTY_LABELS: FilterLabels = {
  institution: new Map(),
  author: new Map(),
  journal: new Map(),
};

/** Build the display-name lookups from the export itself; the app holds no vocabulary of its own. */
export function buildLabels(doc: Pick<ExportDocument, 'works'>): FilterLabels {
  const institution = new Map<string, string>();
  const author = new Map<string, string>();
  const journal = new Map<string, string>();
  for (const work of doc.works) {
    for (const item of work.institutions) {
      if (!institution.has(item.ror)) institution.set(item.ror, item.name ?? item.ror);
    }
    for (const person of work.authors) {
      const key = authorKey(person);
      if (!author.has(key)) author.set(key, person.name);
    }
    if (work.venue !== null) {
      const key = work.venue.issn_l ?? work.venue.name;
      if (!journal.has(key)) journal.set(key, work.venue.name);
    }
  }
  return { institution, author, journal };
}

const DIMENSION_NAMES: Record<ChipDimension, string> = {
  year: 'Year',
  domain: 'Research domain',
  field: 'Research field',
  subfield: 'Research subfield',
  topic: 'Research topic',
  journal: 'Journal',
  institution: 'Institution',
  country: 'Country',
  author: 'Author',
  oa: 'Open access',
  kind: 'Kind',
  criterion: 'How it is known',
  onOfficialList: "On UWPR's list",
  search: 'Search',
};

/**
 * docs/05 §11.7: "Plain language before jargon." The criteria are the four ways a publication
 * qualifies (docs/01 §6); the rule identifiers behind them belong on the detail view.
 */
export const CRITERION_LABELS: Record<number, string> = {
  1: "Listed on UWPR's publications page",
  2: 'UWPR award code given as funding',
  3: 'UWPR staff thanked in their UWPR role',
  4: 'UWPR facilities used',
};

export function describeFilter(
  state: FilterState,
  labels: FilterLabels = EMPTY_LABELS,
): FilterChip[] {
  const chips: FilterChip[] = [];
  const add = (dimension: ChipDimension, value: string, without: FilterState): void => {
    chips.push({ dimension, label: `${DIMENSION_NAMES[dimension]}: ${value}`, without });
  };

  for (const year of state.year) {
    add('year', String(year), { ...state, year: state.year.filter((item) => item !== year) });
  }
  const plain = ['domain', 'field', 'subfield', 'topic', 'country', 'oa', 'kind'] as const;
  for (const dimension of plain) {
    for (const value of state[dimension]) {
      add(dimension, value, {
        ...state,
        [dimension]: state[dimension].filter((item) => item !== value),
      });
    }
  }
  const named = ['journal', 'institution', 'author'] as const;
  for (const dimension of named) {
    for (const value of state[dimension]) {
      add(dimension, labels[dimension].get(value) ?? value, {
        ...state,
        [dimension]: state[dimension].filter((item) => item !== value),
      });
    }
  }
  for (const criterion of state.criterion) {
    add('criterion', CRITERION_LABELS[criterion] ?? String(criterion), {
      ...state,
      criterion: state.criterion.filter((item) => item !== criterion),
    });
  }
  if (state.onOfficialList !== null) {
    add('onOfficialList', state.onOfficialList ? 'yes' : 'no', {
      ...state,
      onOfficialList: null,
    });
  }
  if (state.search.trim() !== '') {
    add('search', `“${state.search.trim()}”`, { ...state, search: '' });
  }
  return chips;
}

/**
 * The sentence stated beside the figures and announced when the filter changes (docs/06 §9:
 * "Filter changes announce the new result count in a live region").
 */
export function filterSentence(
  state: FilterState,
  count: number,
  labels: FilterLabels = EMPTY_LABELS,
): string {
  const noun = count === 1 ? 'publication' : 'publications';
  const chips = describeFilter(state, labels);
  if (chips.length === 0) return `${String(count)} ${noun}, no filter applied.`;
  return `${String(count)} ${noun} matching ${chips.map((chip) => chip.label).join('; ')}.`;
}
