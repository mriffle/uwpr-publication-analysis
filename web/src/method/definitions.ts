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
import {
  UNFILTERED,
  countedByAwardYear,
  coverage,
  fundingFigures,
  fundingScope,
  knownAmount,
  knownCounted,
  type DollarTotal,
} from '../aggregate/funding';
import { countingOf, fundingOf } from '../contract/funding';
import type { ExportDocument } from '../contract/types';
import { formatDate } from '../format/date';
import { COUNTED_LABEL } from '../format/funding';
import {
  formatCount,
  formatDecimal,
  formatOptional,
  formatShare,
  formatUsd,
  pluralize,
} from '../format/number';

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

/* ------------------------------------------------------------------------------------------------
 * Funding impact (docs/09 §12.5 item 2, §12.9).
 * --------------------------------------------------------------------------------------------- */

/**
 * The anchors Funding impact's headline figures link to, in the order `FundingFigures` shows
 * them: the six figures, then the institution-wide position the total always states (§12.11
 * rule 4). A test asserts the component carries exactly these, as for the overview's five.
 *
 * `funding-total` is the grant funding counted (docs/09 F17): its anchor kept its name when the
 * headline stopped adding lifetime totals, so every link to it still lands. The definitions that
 * no headline figure links to — the lifetime total, funding by year awarded, the unmatched
 * numbers and a grant's first year — are `fundingDefinitions`' too, but not here.
 */
export const FUNDING_DEFINITION_IDS = [
  'funding-total',
  'funding-grants',
  'funding-agencies',
  'funding-investigators',
  'funding-organizations',
  'funding-publications',
  'funding-institution-wide',
] as const;

export type FundingDefinitionId = (typeof FUNDING_DEFINITION_IDS)[number];

/**
 * "$1,234,567; 11 grants without a known amount": a total never stands without its unknowns. The
 * counted sum by default (F17), or the lifetime totals'.
 */
function dollarsWithUnknowns(total: DollarTotal, sum: 'counted' | 'lifetime' = 'counted'): string {
  const known = sum === 'counted' ? knownCounted(total) : knownAmount(total);
  const unknown = `${pluralize(total.withoutAmount, 'grant')} without a known amount`;
  if (known === null) return total.withoutAmount === 0 ? 'none' : `not known; ${unknown}`;
  return total.withoutAmount === 0 ? formatUsd(known) : `${formatUsd(known)}; ${unknown}`;
}

/** "from 2006, when UWPR began," — or, with no counting rule to read, "from when UWPR began,". */
const countedFrom = (from: number | null, resource: string): string =>
  from === null ? `from when ${resource} began,` : `from ${String(from)}, when ${resource} began,`;

/**
 * The funding figures' definitions, each with its value over the whole corpus — unfiltered, with
 * institution-wide awards included, the convention `funding.summary` is computed under — from the
 * functions the Funding impact view draws, so each value is the one the cross-check holds to the
 * pipeline's. **For the method page's `#funding` section**, which places them (docs/09 §12.9);
 * kept apart from `metricDefinitions` so that nothing appears on the page before it does.
 *
 * With no funding data (§12.10) every definition still stands and no entry has a value: there is
 * nothing to count, and a zero would read as a finding.
 *
 * The register is §12.11's: no wording of credit or cause; the total dated and said not to be
 * money spent on the work; an unknown amount beside every total and never in it; a grant
 * counted once; names as the funder publishes them.
 */
export function fundingDefinitions(doc: ExportDocument): MetricDefinition[] {
  const index = fundingOf(doc);
  const scope = fundingScope(doc.works, index, UNFILTERED);
  const figures = fundingFigures(scope);
  const unmatched = coverage(scope).miscellaneous;
  const years = scope.grants
    .filter((entry) => !entry.miscellaneous)
    .map((entry) => entry.firstYear);
  const awarded = [...countedByAwardYear(scope).keys()];
  const asOf = index?.funding.as_of ?? null;
  const dated = asOf === null ? '' : `, as of ${formatDate(asOf)}`;
  const valued = (value: string): { value?: string } => (index === null ? {} : { value });
  const from = countingOf(index)?.from_year ?? null;
  const resource = doc.resource.short_name;
  const run = (all: readonly number[]): string =>
    all.length === 0 ? 'none' : `${String(Math.min(...all))}–${String(Math.max(...all))}`;

  return [
    {
      id: 'funding-total',
      term: COUNTED_LABEL,
      ...valued(dollarsWithUnknowns(figures)),
      definition: `The sum, in US dollars, of the part of each distinct grant the publications list that the totals count: its funding ${countedFrom(from, resource)} through the year of the latest publication listing it, with the exceptions set out under “How grant funding is counted”. Each grant’s amounts are as its funder records them${dated}. It is not money spent on this work: a grant’s funding is the award’s, not the part of it spent on the research these publications report. A grant counts once however many publications list it. A grant with no known amount is counted beside the total, never in it as zero. Institution-wide awards are included unless the reader excludes them, and the page always says which.`,
    },
    {
      id: 'funding-lifetime',
      term: 'Lifetime total of the grants listed',
      ...valued(dollarsWithUnknowns(figures, 'lifetime')),
      definition: `The sum, in US dollars, of the lifetime award totals of the same grants, each as its funder records it${dated}: every year of each award, before ${resource} began and after the last publication listing it. It is given for comparison, here and on each grant’s own page, and no total on the site adds it up. It is what the awards are worth, not money spent on this work.`,
    },
    {
      id: 'funding-grants',
      term: 'Grants listed',
      ...valued(formatCount(figures.listed)),
      definition:
        'Distinct grants that the publications’ funding statements name and that a funder’s record matched, each counted once however many publications list it. A number no record matched is an unmatched number, kept apart and not counted here.',
    },
    {
      id: 'funding-agencies',
      term: 'Funding agencies',
      ...valued(formatCount(figures.agencies)),
      definition:
        'Distinct agencies that awarded the grants listed, each counted at the top of its chain, so an institute counts under its parent agency. Unmatched numbers have no agency and are not one.',
    },
    {
      id: 'funding-investigators',
      term: 'Principal investigators',
      ...valued(formatCount(figures.investigators)),
      definition:
        'Distinct principal investigators of the grants listed, named as the funders publish them, and told apart by the funder’s own identifier where it gives one and by name otherwise. One person written two ways, or once with an identifier and once without, counts twice.',
    },
    {
      id: 'funding-organizations',
      term: 'Organisations',
      ...valued(formatCount(figures.organizations)),
      definition:
        'Distinct organisations the grants listed were awarded to, as the funders name them, told apart by name. The same organisation written two ways counts twice.',
    },
    {
      id: 'funding-publications',
      term: 'Publications listing a grant',
      ...valued(`${formatCount(figures.withGrants)} of ${formatCount(figures.publications)}`),
      definition:
        'Publications with at least one grant listed, out of the publications shown. One whose only numbers are unmatched is not among them. A publication listing none is not a finding that it had no funding: not every funding statement reaches the sources read.',
    },
    {
      id: 'funding-institution-wide',
      term: 'Institution-wide awards',
      ...valued(
        `${pluralize(figures.institutionWide.grants, 'award')}, ${dollarsWithUnknowns(figures.institutionWide)}`,
      ),
      definition:
        'Awards made to an institution or a consortium to run a programme for many unrelated projects — a fellowship programme, a national institute, a consortium-wide total — whose value bears no relation to one research project. They are tagged from an explicit list and never inferred from size. The value is their grant funding counted, as every grant’s is. They are included in the total by default; a reader may exclude them, and the page states which.',
    },
    {
      id: 'funding-unmatched',
      term: 'Unmatched numbers',
      ...valued(
        `${formatCount(unmatched.grants)}, on ${pluralize(unmatched.publications, 'publication')}`,
      ),
      definition:
        'Numbers the publications give as funding that no funder’s record matched, or that a recorded decision kept unmatched because the record matched does not fit the paper. They are kept apart, under Miscellaneous, with no agency, kind or amount, and are not counted as grants.',
    },
    {
      id: 'funding-award-year',
      term: 'Grant funding by year awarded',
      ...valued(run(awarded)),
      definition: `The counted funding of the grants listed, placed in the year it was awarded: NIH’s by fiscal year, other funders’ amounts spread evenly over the award’s years. Amounts with no years, and grants whose funding ended before ${from === null ? `${resource} began` : String(from)}, go to the year of the first publication listing them, and an instrument’s years after the latest publication listing it go to that year. So every year falls between ${from === null ? `the year ${resource} began` : String(from)} and the latest publication year, and the years add up to the counted total. The value is the span of years with counted funding.`,
    },
    {
      id: 'funding-first-year',
      term: 'A grant’s first year',
      ...valued(run(years)),
      definition:
        'The publication year of the earliest publication shown that lists the grant: a publication year, not the year of the award. It places a grant among the new grants by agency, and is the “First listed” on its page; no dollars are placed by it.',
    },
  ];
}
