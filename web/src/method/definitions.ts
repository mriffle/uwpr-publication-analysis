/**
 * Every figure on the site, with its exact definition and its value over the whole corpus
 * (docs/05 §5).
 *
 * This exists because of docs/06 §4.2: "**Every figure links to its definition on the method
 * page.**" The `id` of each entry is that link's fragment, and `HeadlineFigures` carries the
 * same ids, so the five figures on the overview point at the five entries here. A test asserts
 * the two sets agree rather than trusting two lists to stay in step.
 *
 * Two register rules apply to every string below (docs/05 §11):
 *
 * - **A proxy says it is a proxy, and a floor says it is a floor** (§11.4): "research groups" is
 *   distinct corresponding authors; institutions and countries are floors, because an
 *   affiliation with no ROR identifier cannot be counted.
 * - **Every figure carries its date** (§11.3), which for anything citation-derived is the date
 *   OpenAlex was read, and for the rest is the date the export was generated.
 *
 * The values are the **unfiltered** corpus, computed from the rows by the same functions the
 * overview uses. The method page says so once, above the list: the figures beside the charts
 * respond to the filter and these do not.
 */
import {
  beyondOfficialList,
  distinctCountries,
  distinctInstitutions,
  distinctJournals,
  distinctLastAuthors,
  fwciMedian,
  hIndex,
  onOfficialList,
  openAccessCount,
  preprintOnly,
  publications,
  researchGroups,
  totalCitations,
  worksWithStaffAuthor,
  yearSpan,
} from '../aggregate/metrics';
import { citationsInWindow } from '../aggregate/metrics';
import type { ExportDocument } from '../contract/types';
import { formatDate } from '../format/date';
import { formatCount, formatDecimal, formatOptional, formatShare } from '../format/number';

export interface MetricDefinition {
  /** The anchor a figure links to, and the `id` the method page renders. */
  id: string;
  term: string;
  /**
   * The value over the whole corpus, already formatted, and **absent where a corpus-wide value
   * would be a figure the contract refuses to state.** The citation percentile is the one such
   * case: docs/05 §2.2 keeps it off the overview and §7.15 keeps it out of the charts, because a
   * median percentile over a corpus is not a percentile of anything. Its definition belongs here
   * — it appears on every publication's own page — but its median does not.
   */
  value?: string;
  definition: string;
}

/** The five ids docs/06 §4.2's headline figures link to, in the order the overview shows them. */
export const HEADLINE_DEFINITION_IDS = [
  'publications',
  'years-covered',
  'citations',
  'research-groups',
  'journals',
] as const;

export type HeadlineDefinitionId = (typeof HEADLINE_DEFINITION_IDS)[number];

export function metricDefinitions(doc: ExportDocument): MetricDefinition[] {
  const works = doc.works;
  const span = yearSpan(works);
  const citationsAsOf = formatDate(doc.sources.citations.as_of);
  const citationSource = doc.sources.citations.name;
  const total = publications(works);
  const oa = openAccessCount(works);

  return [
    {
      id: 'publications',
      term: 'Publications',
      value: formatCount(total),
      definition:
        'Distinct works. A preprint and the journal article it became count once, as one work.',
    },
    {
      id: 'years-covered',
      term: 'Years covered',
      value: span === null ? 'not available' : `${String(span.first)}–${String(span.last)}`,
      definition: `First and last publication year of each work’s canonical record — the article where there is one, the preprint otherwise. Nothing is recorded before ${String(doc.period.first_year)}, and ${String(doc.period.last_year)} is still in progress.`,
    },
    {
      id: 'citations',
      term: 'Citations',
      value: formatCount(totalCitations(works)),
      definition: `Citations of the canonical record, summed over the works, as ${citationSource} reported them on ${citationsAsOf}. They differ from Google Scholar or Web of Science. They record how these publications were cited; they do not measure what caused the citations.`,
    },
    {
      id: 'citations-in-window',
      term: 'Citations in the by-year window',
      value: formatCount(citationsInWindow(works)),
      definition:
        doc.period.citation_years_from === null
          ? `${citationSource} reports no by-year citation series for these publications, so every citation falls outside the window.`
          : `The same citations restricted to the years ${citationSource} reports a by-year series for, which begins in ${String(doc.period.citation_years_from)}. ${formatCount(doc.period.citations_before_window)} citations were received before it and are outside every per-year chart.`,
    },
    {
      id: 'research-groups',
      term: 'Research groups',
      value: formatCount(researchGroups(works)),
      definition:
        'A proxy, and not a count of groups: distinct corresponding authors, identified by OpenAlex author identifier and by name where there is none. Not every publication marks a corresponding author, and one group may publish under several.',
    },
    {
      id: 'last-authors',
      term: 'Distinct last authors',
      value: formatCount(distinctLastAuthors(works)),
      definition:
        'The second view of the same proxy: distinct authors in the last position, keyed the same way. It is carried beside “research groups” because the two disagree, and neither is the truth.',
    },
    {
      id: 'journals',
      term: 'Journals',
      value: formatCount(distinctJournals(works)),
      definition:
        'Distinct venues, keyed by ISSN-L where the venue has one and by name otherwise. Preprint servers are venues and are counted as such, because leaving them out would misstate the corpus.',
    },
    {
      id: 'institutions',
      term: 'Institutions',
      value: formatCount(distinctInstitutions(works)),
      definition:
        'Distinct ROR identifiers across every author of every publication. A floor: an affiliation string that carries no ROR identifier cannot be counted, and many do not.',
    },
    {
      id: 'countries',
      term: 'Countries',
      value: formatCount(distinctCountries(works)),
      definition:
        'Distinct countries of the affiliations that resolved to a ROR identifier. A floor, for the same reason as institutions.',
    },
    {
      id: 'field-weighted-impact',
      term: 'Field-weighted citation impact',
      value: formatOptional(fwciMedian(works), formatDecimal),
      definition: `${citationSource}’s measure of a publication’s citations against the average for its field, year and type, where 1.0 is that average. Reported as the median over the publications that have one; ${citationSource} does not report it for every publication, and rarely for the most recent. Read ${citationsAsOf}.`,
    },
    {
      id: 'citation-percentile',
      term: 'Citation percentile',
      definition: `${citationSource}’s percentile for a publication within its field and year, shown in words on that publication’s own page — “${citationSource} puts it above 90% of comparable papers in its field and year”. No figure is given here on purpose: a median percentile over a corpus is not a percentile of anything, so it is not a headline figure and is not charted.`,
    },
    {
      id: 'h-index',
      term: 'Corpus h-index',
      value: formatCount(hIndex(works)),
      definition:
        'The largest number h for which h of these publications have each been cited at least h times. It is secondary and is not a headline figure: it largely measures how large and how old a corpus is.',
    },
    {
      id: 'open-access',
      term: 'Open access',
      value: `${formatCount(oa)} (${formatShare(total > 0 ? oa / total : 0)})`,
      definition:
        'Publications whose canonical record has an open-access status other than “closed”. It is a statement about the record, not a promise that a given link resolves today.',
    },
    {
      id: 'preprint-only',
      term: 'Preprint-only',
      value: formatCount(preprintOnly(works)),
      definition:
        'Publications with no journal version yet. They are labelled as preprints everywhere they appear, and a preprint that later becomes an article merges into one work rather than becoming a second one.',
    },
    {
      id: 'on-official-list',
      term: 'On the resource’s own list',
      value: formatCount(onOfficialList(works)),
      definition: `Publications whose evidence includes the listing on ${doc.resource.short_name}’s own publications page.`,
    },
    {
      id: 'beyond-official-list',
      term: 'Found beyond that list',
      value: formatCount(beyondOfficialList(works)),
      definition: `Publications included on evidence found in the papers or their metadata, which are not on ${doc.resource.short_name}’s own publications page.`,
    },
    {
      id: 'staff-author',
      term: 'Publications with a staff author',
      value: formatCount(worksWithStaffAuthor(works)),
      definition: `Publications with at least one author who is a member of ${doc.resource.short_name}’s staff. It is reported here and is never evidence: co-authorship on its own does not include a publication.`,
    },
  ];
}
