/**
 * The overview (docs/06 §4), top to bottom: header, headline figures, output over time, research
 * areas, who the work involves, where it appears, the citation profile, the publication explorer,
 * footer. That is §4's enumeration exactly; how the publications are *known* is the method page's
 * subject (docs/05 §7.13, §10) and its chart lives there.
 *
 * **Every chart recomputes under every filter, and nothing reads the `summary` block**
 * (docs/05 §1.1, §7). The filtered rows are computed once here and handed to each chart's own
 * pure aggregation, so a figure and the chart beside it can never be computed from different
 * sets of works.
 *
 * **Clicking a mark applies the corresponding filter** (docs/06 §6). Ten of the twelve charts
 * have a dimension to apply: the two that do not are the citation distribution — docs/05 §9 has
 * no citation-count dimension — and the most-cited list, whose rows are links to a publication
 * rather than to a selection.
 */
import { useMemo, useState } from 'react';
import {
  rankCountries,
  rankInstitutions,
  rankJournals,
  rankResearchers,
  rankSubfields,
  worksAtInstitution,
  worksInCountry,
  worksOutside,
} from '../aggregate/categories';
import { researchAreasOverTime } from '../aggregate/areas';
import { citationsBeforeWindow } from '../aggregate/series';
import type { Sort, SortKey } from '../aggregate/explorer';
import { ChartCard } from '../charts/ChartCard';
import { ChartEmpty } from '../charts/ChartEmpty';
import { ResponsiveChart } from '../charts/ResponsiveChart';
import { RankedBarCard } from '../charts/RankedBarCard';
import type { BarRow } from '../charts/HorizontalBarChart';
import {
  PublicationsPerYearChart,
  PublicationsPerYearTable,
} from '../charts/PublicationsPerYearChart';
import { CitationsPerYearChart, CitationsPerYearTable } from '../charts/CitationsPerYearChart';
import {
  ResearchAreasOverTimeChart,
  ResearchAreasOverTimeTable,
} from '../charts/ResearchAreasOverTimeChart';
import {
  CitationDistributionChart,
  CitationDistributionTable,
} from '../charts/CitationDistributionChart';
import {
  OpenAccessOverTimeChart,
  OpenAccessOverTimeTable,
} from '../charts/OpenAccessOverTimeChart';
import { MostCitedList, MostCitedTable } from '../charts/MostCitedChart';
import { seriesColour } from '../charts/palette';
import { FilterBar } from '../components/FilterBar';
import { HeadlineFigures } from '../components/HeadlineFigures';
import { PublicationExplorer } from '../components/PublicationExplorer';
import { StalenessNotice } from '../components/StalenessNotice';
import type { ExportDocument, Work } from '../contract/types';
import { buildLabels, describeFilter, filterSentence } from '../filter/describe';
import { applyFilter } from '../filter/predicate';
import {
  EMPTY_FILTER,
  setSearch,
  toggleString,
  toggleYear,
  type FilterState,
} from '../filter/state';
import { countryName } from '../format/country';
import { formatDate } from '../format/date';
import { formatCount, pluralize } from '../format/number';

export interface OverviewProps {
  doc: ExportDocument;
  filter: FilterState;
  onFilter: (next: FilterState) => void;
  sort: Sort;
  onSort: (key: SortKey) => void;
  /** The route for a publication (docs/06 §3), and the in-app navigation to it. */
  publicationHref: (work: Work) => string;
  onOpenPublication: (work: Work) => void;
  /** The method page (docs/06 §4.1), which §4.2's figures also link into by fragment. */
  methodHref: string;
  onOpenMethod: () => void;
  lookupHref: string;
  onOpenLookup: () => void;
  /** Injected in tests so the staleness threshold is exercised without freezing the clock. */
  now?: Date;
  /** 0 in tests, so a keystroke in the search box does not need a timer to land. */
  searchDebounceMs?: number;
}

export function Overview({
  doc,
  filter,
  onFilter,
  sort,
  onSort,
  publicationHref,
  onOpenPublication,
  methodHref,
  onOpenMethod,
  lookupHref,
  onOpenLookup,
  now,
  searchDebounceMs,
}: OverviewProps) {
  const [citationsMode, setCitationsMode] = useState(false);
  const [singleYears, setSingleYears] = useState(false);
  const [includeStaff, setIncludeStaff] = useState(false);

  const labels = useMemo(() => buildLabels(doc), [doc]);
  const works = useMemo(() => applyFilter(doc.works, filter), [doc.works, filter]);
  const chips = describeFilter(filter, labels);
  const sentence = filterSentence(filter, works.length, labels);
  const lastChip = chips.at(-1);
  const empty = works.length === 0;

  // The institution §7.8 excludes and the country §7.14 counts "outside" are stated by the
  // contract, not found in the data: they are facts about the facility, which the app must not
  // carry itself (docs/05 §1.1 principle 5) and must not infer from frequency.
  const home = doc.resource.home_institution;
  const homeCountry = doc.resource.home_country;
  // The figures that justify each exclusion, from the **unfiltered** corpus, so they are stable
  // facts about the page rather than numbers that move as the reader filters.
  const homeWorks = useMemo(() => worksAtInstitution(doc.works, home.ror), [doc.works, home.ror]);
  const homeCountryWorks = useMemo(
    () => worksInCountry(doc.works, homeCountry),
    [doc.works, homeCountry],
  );

  const areas = useMemo(
    () => researchAreasOverTime(works, doc.period, { bucketYears: singleYears ? 1 : 3 }),
    [works, doc.period, singleYears],
  );
  const subfields = useMemo(() => rankSubfields(works), [works]);
  const researchers = useMemo(
    () => rankResearchers(works, { includeStaff }),
    [works, includeStaff],
  );
  const institutions = useMemo(
    () => rankInstitutions(works, { exclude: home.ror }),
    [works, home.ror],
  );
  const journals = useMemo(() => rankJournals(works), [works]);
  const countries = useMemo(
    () => rankCountries(works, { exclude: homeCountry }),
    [works, homeCountry],
  );
  const beforeWindow = citationsBeforeWindow(works);

  const emptyState = empty ? (
    <ChartEmpty
      filterSentence={sentence}
      {...(lastChip
        ? {
            onClearLast: () => {
              onFilter(lastChip.without);
            },
            clearLastLabel: lastChip.label,
          }
        : {})}
    />
  ) : undefined;

  const publicationUnit = { one: 'publication', many: 'publications' };

  const toggle = (dimension: Parameters<typeof toggleString>[1]) => (row: BarRow) => {
    onFilter(toggleString(filter, dimension, row.key));
  };

  return (
    <main className="page">
      {/* §4.1 Header. */}
      <header className="page-header">
        <h1>{doc.resource.name} — publications</h1>
        <p>
          Publications with recorded evidence that they used the resource. Each one can show why it
          is counted.
        </p>
        <p>
          Data generated {formatDate(doc.generated_at)}. Citations from {doc.sources.citations.name}{' '}
          as of {formatDate(doc.sources.citations.as_of)}.{' '}
          <a href={doc.resource.url}>{doc.resource.short_name}</a>
        </p>
        {/* §4.1: the header links to the method page and to the lookup. */}
        <p>
          <a
            href={methodHref}
            onClick={(event) => {
              if (!event.metaKey && !event.ctrlKey && event.button === 0) {
                event.preventDefault();
                onOpenMethod();
              }
            }}
          >
            How this was assembled
          </a>
          {' · '}
          <a
            href={lookupHref}
            onClick={(event) => {
              if (!event.metaKey && !event.ctrlKey && event.button === 0) {
                event.preventDefault();
                onOpenLookup();
              }
            }}
          >
            Why is a paper not here?
          </a>
        </p>
      </header>

      <StalenessNotice generatedAt={doc.generated_at} {...(now ? { now } : {})} />

      <FilterBar
        chips={chips}
        sentence={sentence}
        onChange={onFilter}
        onClearAll={() => {
          onFilter(EMPTY_FILTER);
        }}
      />

      {/* §4.2 Headline figures. */}
      <h2>Headline figures</h2>
      <HeadlineFigures
        works={works}
        citationsAsOf={doc.sources.citations.as_of}
        // docs/06 §4.2: "Every figure links to its definition on the method page." The inline
        // definition stays as well — docs/05 §11.3 accepts either, and the two answer different
        // questions: the sentence says what the figure is, the link says how it is computed, what
        // it excludes and what it is over the whole corpus.
        definitionHref={(id) => `${methodHref}#${id}`}
      />

      {/* §4.3 Output over time, with the citations toggle on the same frame. */}
      <h2>Output over time</h2>
      <ChartCard
        title={citationsMode ? 'Citations received per year' : 'Publications per year'}
        description={
          citationsMode
            ? 'One bar per year of citations received by the publications shown, with the running total as a line on the right-hand axis. Select a year to filter the page by it.'
            : 'One bar per year, with the running total as a line on the right-hand axis. Select a year to filter the page by it.'
        }
        note={
          citationsMode ? (
            <>
              {doc.period.citation_years_from === null
                ? 'OpenAlex reports no citations by year for these publications.'
                : `OpenAlex reports citations by year only from ${String(doc.period.citation_years_from)}, four years after these publications begin.`}{' '}
              {beforeWindow > 0
                ? `${pluralize(beforeWindow, 'citation')} of the ${pluralize(
                    works.reduce((sum, work) => sum + work.citations.total, 0),
                    'citation',
                  )} shown above were received before that and are not in this chart.`
                : 'No citations fall outside that window.'}
            </>
          ) : (
            `Nothing is recorded before ${String(doc.period.first_year)}: the project's search window opens in 2006, and the earliest publication found is ${String(doc.period.first_year)}.`
          )
        }
        controls={
          <div className="chart-switch" role="group" aria-label="What this chart counts">
            <button
              type="button"
              aria-pressed={!citationsMode}
              onClick={() => {
                setCitationsMode(false);
              }}
            >
              Publications
            </button>
            <button
              type="button"
              aria-pressed={citationsMode}
              onClick={() => {
                setCitationsMode(true);
              }}
            >
              Citations
            </button>
          </div>
        }
        {...(emptyState ? { empty: emptyState } : {})}
        chart={
          <ResponsiveChart height={320}>
            {({ width, height }) =>
              citationsMode ? (
                <CitationsPerYearChart
                  works={works}
                  period={doc.period}
                  width={width}
                  height={height}
                  selectedYears={filter.year}
                  onSelectYear={(year) => {
                    onFilter(toggleYear(filter, year));
                  }}
                />
              ) : (
                <PublicationsPerYearChart
                  works={works}
                  period={doc.period}
                  width={width}
                  height={height}
                  selectedYears={filter.year}
                  onSelectYear={(year) => {
                    onFilter(toggleYear(filter, year));
                  }}
                />
              )
            }
          </ResponsiveChart>
        }
        table={
          citationsMode ? (
            <CitationsPerYearTable works={works} period={doc.period} />
          ) : (
            <PublicationsPerYearTable works={works} period={doc.period} />
          )
        }
      />

      {/* §4.4 Research areas. */}
      <h2>Research areas</h2>
      <ChartCard
        title="Research areas over time"
        description="The five largest research fields plus everything else, as topic assignments. Select a field, in the chart or in the legend, to filter the page by it."
        note={
          <>
            The axis counts <strong>topic assignments</strong>, not publications: OpenAlex gives a
            publication up to three topics and all of them are counted, so the total (
            {formatCount(areas.assignments)}) exceeds the {pluralize(areas.works, 'publication')}{' '}
            shown. “Other” is everything outside the five largest fields and is not a filter.
          </>
        }
        controls={
          <div className="chart-switch" role="group" aria-label="Period length">
            <button
              type="button"
              aria-pressed={!singleYears}
              onClick={() => {
                setSingleYears(false);
              }}
            >
              Three-year periods
            </button>
            <button
              type="button"
              aria-pressed={singleYears}
              onClick={() => {
                setSingleYears(true);
              }}
            >
              Single years
            </button>
          </div>
        }
        {...(emptyState ? { empty: emptyState } : {})}
        chart={
          <ResponsiveChart height={340}>
            {({ width, height }) => (
              <ResearchAreasOverTimeChart
                areas={areas}
                width={width}
                height={height}
                selectedFields={filter.field}
                onSelectField={(field) => {
                  onFilter(toggleString(filter, 'field', field));
                }}
              />
            )}
          </ResponsiveChart>
        }
        table={<ResearchAreasOverTimeTable areas={areas} />}
      />

      <RankedBarCard
        title="Research areas overall"
        chartLabel="Publications by research subfield, most frequent first"
        description="Publications by OpenAlex subfield, which is the level dense enough to be informative. Select a subfield to filter the page by it."
        note={
          subfields.notShown > 0
            ? `The ${formatCount(subfields.items.length)} most frequent of ${pluralize(subfields.distinct, 'subfield')}; ${formatCount(subfields.notShown)} are not shown. A publication is counted once in each subfield it touches.`
            : 'A publication is counted once in each subfield it touches.'
        }
        rows={subfields.items.map((item) => ({
          key: item.key,
          label: item.label,
          value: item.count,
          selected: filter.subfield.includes(item.key),
        }))}
        unit={publicationUnit}
        valueAxisLabel="Publications"
        categoryHeader="Subfield"
        tableCaption="Publications by research subfield, under the current filter."
        onSelect={toggle('subfield')}
        selectVerb="filter by this subfield"
        {...(emptyState ? { empty: emptyState } : {})}
      />

      {/* §4.5 Who the work involves. */}
      <h2>Who the work involves</h2>
      <RankedBarCard
        title="Researchers appearing most often"
        chartLabel="Researchers by number of publications, most frequent first"
        description="Authors on the most publications shown. Select a researcher to filter the page by them."
        note={
          <>
            {includeStaff
              ? 'Resource staff are included and marked. A staff member on many papers and an external investigator on many papers are different facts, and the chart does not merge them.'
              : 'Resource staff are excluded by default: a staff member on many papers describes staff contribution, not sustained use of the facility.'}{' '}
            {researchers.notShown > 0
              ? `The ${formatCount(researchers.items.length)} most frequent of ${pluralize(researchers.distinct, 'researcher')}; ${formatCount(researchers.notShown)} are not shown.`
              : null}
          </>
        }
        controls={
          <div className="chart-switch" role="group" aria-label="Whether to include resource staff">
            <button
              type="button"
              aria-pressed={!includeStaff}
              onClick={() => {
                setIncludeStaff(false);
              }}
            >
              Exclude staff
            </button>
            <button
              type="button"
              aria-pressed={includeStaff}
              onClick={() => {
                setIncludeStaff(true);
              }}
            >
              Include staff
            </button>
          </div>
        }
        rows={researchers.items.map((item) => ({
          key: item.key,
          label: item.label,
          value: item.count,
          selected: filter.author.includes(item.key),
          ...(item.staff === null
            ? {}
            : { tag: `${doc.resource.short_name} staff`, colour: seriesColour(1) }),
        }))}
        unit={publicationUnit}
        valueAxisLabel="Publications"
        categoryHeader="Researcher"
        tableCaption="Researchers by number of publications, under the current filter."
        onSelect={toggle('author')}
        selectVerb="filter by this researcher"
        {...(emptyState ? { empty: emptyState } : {})}
      />

      <RankedBarCard
        title="Institutions"
        chartLabel="Institutions by number of publications, most frequent first"
        description="Institutions on the publications shown, counted once per publication. Select an institution to filter the page by it."
        note={
          <>
            {`${home.name} is excluded: it is the resource’s own institution, appears on ${formatCount(homeWorks)} of ${pluralize(doc.works.length, 'publication')} and would flatten the chart to one bar and a fringe. `}
            {institutions.notShown > 0
              ? `The ${formatCount(institutions.items.length)} most frequent of ${pluralize(institutions.distinct, 'other institution')}; ${formatCount(institutions.notShown)} are not shown. `
              : ''}
            Institutions are a floor: an affiliation with no ROR identifier cannot be counted.
          </>
        }
        rows={institutions.items.map((item) => ({
          key: item.key,
          label: item.label,
          value: item.count,
          selected: filter.institution.includes(item.key),
        }))}
        unit={publicationUnit}
        valueAxisLabel="Publications"
        categoryHeader="Institution"
        tableCaption="Institutions by number of publications, under the current filter."
        onSelect={toggle('institution')}
        selectVerb="filter by this institution"
        {...(emptyState ? { empty: emptyState } : {})}
      />

      <RankedBarCard
        title="Countries"
        chartLabel="Countries by number of publications, most frequent first"
        description={`Countries other than ${countryName(homeCountry)} on the publications shown, counted once per publication. Select a country to filter the page by it.`}
        note={
          <>
            {pluralize(worksOutside(works, homeCountry), 'publication')} of the{' '}
            {pluralize(works.length, 'publication')} shown have an author outside{' '}
            {countryName(homeCountry)}, the resource’s own country, which appears on{' '}
            {formatCount(homeCountryWorks)} of {pluralize(doc.works.length, 'publication')} and is
            left out of the chart below. There is no map: one saturated country and a scattering
            conveys less than this sentence does.
          </>
        }
        rows={countries.items.map((item) => ({
          key: item.key,
          label: countryName(item.key),
          value: item.count,
          selected: filter.country.includes(item.key),
        }))}
        unit={publicationUnit}
        valueAxisLabel="Publications"
        categoryHeader="Country"
        tableCaption="Countries by number of publications, under the current filter."
        onSelect={toggle('country')}
        selectVerb="filter by this country"
        {...(emptyState ? { empty: emptyState } : {})}
      />

      {/* §4.6 Where the work appears. */}
      <h2>Where the work appears</h2>
      <RankedBarCard
        title="Journals"
        chartLabel="Venues by number of publications, most frequent first"
        description="The venues carrying the most publications shown. Select a venue to filter the page by it."
        note={
          <>
            {pluralize(journals.distinct, 'distinct venue')} in all
            {journals.notShown > 0 ? `; ${formatCount(journals.notShown)} are not shown` : ''}.
            Preprint servers are venues and are counted and labelled as such, because leaving them
            out would misstate the corpus.
          </>
        }
        rows={journals.items.map((item) => ({
          key: item.key,
          label: item.label,
          value: item.count,
          selected: filter.journal.includes(item.key),
          ...(item.preprintServer ? { tag: 'preprint server', colour: seriesColour(2) } : {}),
        }))}
        unit={publicationUnit}
        valueAxisLabel="Publications"
        categoryHeader="Venue"
        tableCaption="Venues by number of publications, under the current filter."
        onSelect={toggle('journal')}
        selectVerb="filter by this venue"
        {...(emptyState ? { empty: emptyState } : {})}
      />

      <ChartCard
        title="Open access over time"
        description="Publications per year split into open access and closed, with the open-access share as a line on the right-hand axis. Select a year to filter the page by it."
        note="The counts are shown with the share because the early years have six to fifteen publications each, where one paper moves the percentage several points."
        {...(emptyState ? { empty: emptyState } : {})}
        chart={
          <ResponsiveChart height={320}>
            {({ width, height }) => (
              <OpenAccessOverTimeChart
                works={works}
                period={doc.period}
                width={width}
                height={height}
                selectedYears={filter.year}
                onSelectYear={(year) => {
                  onFilter(toggleYear(filter, year));
                }}
              />
            )}
          </ResponsiveChart>
        }
        table={<OpenAccessOverTimeTable works={works} period={doc.period} />}
      />

      {/* §4.7 Citation profile. */}
      <h2>Citation profile</h2>
      <ChartCard
        title="Citation distribution"
        description="How many publications have how many citations, in logarithmic bands. Publications with no citations yet have a bucket of their own, because a logarithmic scale has no zero."
        note="These bars are not selectable: a citation count is not one of the dimensions the page filters by."
        {...(emptyState ? { empty: emptyState } : {})}
        chart={
          <ResponsiveChart height={280}>
            {({ width, height }) => (
              <CitationDistributionChart works={works} width={width} height={height} />
            )}
          </ResponsiveChart>
        }
        table={<CitationDistributionTable works={works} />}
      />

      <ChartCard
        title="Most cited publications"
        description="The most cited publications under the current filter. Select one to see its authors, its topics and the evidence for why it is counted."
        note="Citation counts come from OpenAlex and differ from Google Scholar or Web of Science. They record how these publications were cited; they do not measure what caused the citations."
        {...(emptyState ? { empty: emptyState } : {})}
        chart={<MostCitedList works={works} href={publicationHref} onOpen={onOpenPublication} />}
        table={<MostCitedTable works={works} />}
      />

      {/* docs/05 §7.13's chart is on the method page, not here: §7.13 says it "belongs on the
          method page, where it is the clearest single statement of how the corpus was assembled",
          and docs/06 §4's enumeration of this view does not include it. It is the one chart about
          method rather than about the science, and its four bars are still filter dimensions —
          the method page links back here with each one applied. */}

      {/* §4.8 Publication explorer. */}
      <h2>All publications</h2>
      <PublicationExplorer
        works={works}
        sort={sort}
        onSort={onSort}
        search={filter.search}
        onSearch={(term) => {
          onFilter(setSearch(filter, term));
        }}
        href={publicationHref}
        onOpen={onOpenPublication}
        {...(searchDebounceMs === undefined ? {} : { debounceMs: searchDebounceMs })}
      />

      {/* §4.9 Footer. */}
      <footer className="page-footer">
        <p>
          {doc.sources.notes.join(' ')} Generated {formatDate(doc.generated_at)} by run{' '}
          <code>{doc.run_id}</code>, pipeline {doc.pipeline_version}, rules {doc.rule_version}.
        </p>
        <p>
          A mistake in this page can be corrected: the project records overrides for exactly that
          purpose. Report one against the repository this page is built from.
        </p>
      </footer>
    </main>
  );
}
