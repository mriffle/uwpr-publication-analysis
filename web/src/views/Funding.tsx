/**
 * `/funding` — Funding impact (docs/09 §12.5), top to bottom: header, staleness, the filter bar
 * with the funding sentence, the headline figures with the institution-wide switch, grant funding
 * over time, agencies, grant types, all grants, coverage, footer. That is §12.5's enumeration
 * exactly, built behind `VITE_FUNDING` (`contract/config.ts`) until release. Above the footer,
 * NLM's attribution when PubMed is a source (§13.3, `NlmAttribution`).
 *
 * **One filter, one scope.** The publications are filtered exactly as the overview filters them
 * (`applyFilter`), and the grants shown are decided once, by the scope rule (`fundingScope`,
 * docs/09 §12.4, F15): every figure, chart, table and the live-region sentence is read from that
 * one scope, so no two can be computed from different grants. Nothing reads `funding.summary`,
 * which exists only as the cross-check (docs/06 §12.1).
 *
 * **Which marks are filters.** An agency's bar and an agency's segment apply the agency filter
 * (docs/06 §6); "Other" never does. The year bars are static: their year is a grant's first year
 * under the filter, and a click applying the publication-year filter would move the very first
 * years being drawn (§12.5 item 3). The grant types are static too: a type is not a dimension.
 *
 * **The honesty rules are what the page is for** (§12.11). No wording of credit or cause: these
 * are grants the publications list. The total carries its definition, date and "not money spent
 * on this work"; an unknown amount is never $0 and its count stands beside every total; the
 * institution-wide position is stated wherever the total appears; a grant is counted once.
 *
 * **An export with no funding data** — a 1.0 export after a rollback, or a 1.1 export written
 * before the pipeline had any (§12.10) — gets a plain notice, not empty charts that would read as
 * "no grants".
 */
import { useId, useMemo, useState, type ReactNode } from 'react';
import {
  GRANTS_BUCKET_YEARS,
  VALUE_BUCKET_YEARS,
  coverage,
  cumulativeDollars,
  fundingFigures,
  fundingScope,
  grantKinds,
  keptUnmatched,
  knownAmount,
  newGrantsByAgency,
  otherKind,
  rankAgencies,
  valueByAgency,
  type AgencyMeasure,
  type FundingFigures as Figures,
  type FundingScope,
  type OtherKind,
} from '../aggregate/funding';
import { ChartCard } from '../charts/ChartCard';
import { ChartEmpty } from '../charts/ChartEmpty';
import {
  AgencyStackChart,
  AgencyStackTable,
  FundingOverTimeChart,
  FundingOverTimeTable,
} from '../charts/FundingOverTimeChart';
import type { BarRow } from '../charts/HorizontalBarChart';
import { ProportionCard } from '../charts/ProportionCard';
import { RankedBarCard } from '../charts/RankedBarCard';
import { ResponsiveChart } from '../charts/ResponsiveChart';
import { otherColour, seriesColour } from '../charts/palette';
import { AgencyTable } from '../components/AgencyTable';
import { FilterBar } from '../components/FilterBar';
import { FundingFigures, institutionWideSentence } from '../components/FundingFigures';
import type { FundingLinks } from '../components/FundingLinks';
import { GrantsTable } from '../components/GrantsTable';
import { NlmAttribution } from '../components/NlmAttribution';
import { PageFooter } from '../components/PageFooter';
import { SiteHeader, type ViewSwitch } from '../components/SiteHeader';
import { StalenessNotice } from '../components/StalenessNotice';
import { fundingOf, type FundingIndex } from '../contract/funding';
import type { ExportDocument, Work } from '../contract/types';
import { buildLabels, describeFilter, filterSentence, fundingSentence } from '../filter/describe';
import { DEFAULT_INSTITUTION_WIDE, grantSelection, type InstitutionWide } from '../filter/funding';
import { applyFilter } from '../filter/predicate';
import { EMPTY_FILTER, toggleString, type FilterState } from '../filter/state';
import { formatDate } from '../format/date';
import { CATEGORY_LABELS } from '../format/funding';
import { formatCount, formatUsd, formatUsdCompact, pluralize } from '../format/number';
import { isPlainLeftClick } from '../routing/clicks';

export interface FundingProps {
  doc: ExportDocument;
  filter: FilterState;
  onFilter: (next: FilterState) => void;
  /** This view's address with another filter, the rest of the query kept: for a real link. */
  filterHref: (filter: FilterState) => string;
  /** Whether institution-wide awards count (docs/09 §12.4). Absent means included, the default. */
  institutionWide?: InstitutionWide;
  onInstitutionWide: (position: InstitutionWide) => void;
  /** Agency and grant pages, and opening them in place (docs/09 §12.3). */
  links: FundingLinks;
  methodHref: string;
  onOpenMethod: () => void;
  lookupHref: string;
  onOpenLookup: () => void;
  /** The switch back to the publications, carrying the reader's query string. */
  views?: ViewSwitch;
  /** Injected in tests so the staleness threshold is exercised without freezing the clock. */
  now?: Date;
}

export function Funding({
  doc,
  filter,
  onFilter,
  filterHref,
  institutionWide = DEFAULT_INSTITUTION_WIDE,
  onInstitutionWide,
  links,
  methodHref,
  onOpenMethod,
  lookupHref,
  onOpenLookup,
  views,
  now,
}: FundingProps) {
  const funding = fundingOf(doc);

  return (
    <main className="page funding-page">
      <SiteHeader
        title={`${doc.resource.name} — funding impact`}
        lead="The grants the publications here list as their funding, each with its lifetime award total as its funder records it. That total is what the award is worth, not money spent on the work that lists it."
        current="funding"
        doc={doc}
        methodHref={methodHref}
        onOpenMethod={onOpenMethod}
        lookupHref={lookupHref}
        onOpenLookup={onOpenLookup}
        {...(views ? { views } : {})}
        focusHeading
      />

      <StalenessNotice generatedAt={doc.generated_at} {...(now ? { now } : {})} />

      {funding === null ? (
        <NoFundingData generatedAt={doc.generated_at} />
      ) : (
        <FundingImpact
          doc={doc}
          funding={funding}
          filter={filter}
          onFilter={onFilter}
          filterHref={filterHref}
          institutionWide={institutionWide}
          onInstitutionWide={onInstitutionWide}
          links={links}
          methodHref={methodHref}
        />
      )}

      {funding === null ? null : <NlmAttribution sources={funding.funding.sources} />}
      <PageFooter doc={doc} />
    </main>
  );
}

/** docs/09 §12.10: the export carries no funding data, which says nothing about the papers. */
function NoFundingData({ generatedAt }: { generatedAt: string }) {
  const heading = useId();
  return (
    <section className="empty-state" aria-labelledby={heading}>
      <h2 id={heading}>No funding data in this export</h2>
      <p>
        The data this page loaded, generated on {formatDate(generatedAt)}, does not include the
        grants its publications list, so there is nothing to show here. That is a gap in this copy
        of the data, not a finding that the publications list no funding.
      </p>
      <p>The publications themselves, and everything shown about them, are unaffected.</p>
    </section>
  );
}

/** A two-button switch in a card's head, like the overview's (docs/06 §4.3). */
function Switch<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="chart-switch" role="group" aria-label={label}>
      {options.map(([option, text]) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => {
            onChange(option);
          }}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/**
 * What "Other" holds, when it holds grants no record here types (`otherKind`): not a kind of
 * award, but every grant of an agency other than NIH and NSF. Empty when there are none.
 */
export function otherNote({ grants, untyped }: OtherKind): string {
  if (untyped === 0) return '';
  const whose = 'whose records here do not say what kind of award a grant is.';
  if (untyped === grants) {
    return grants === 1
      ? ` “Other” is not a kind of award: its one grant is from an agency other than NIH and NSF, ${whose}`
      : ` “Other” is not a kind of award: all ${formatCount(grants)} of its grants are from agencies other than NIH and NSF, ${whose}`;
  }
  return ` “Other” is not a kind of award: ${formatCount(untyped)} of its ${formatCount(grants)} grants ${untyped === 1 ? 'is from an agency' : 'are from agencies'} other than NIH and NSF, ${whose}`;
}

/** How many ranked agencies the bar chart draws before saying how many it leaves out. */
const AGENCY_LIMIT = 15;

const GRANT_UNIT = { one: 'grant', many: 'grants' };
const PUBLICATION_UNIT = { one: 'publication', many: 'publications' };

interface FundingImpactProps {
  doc: ExportDocument;
  funding: FundingIndex;
  filter: FilterState;
  onFilter: (next: FilterState) => void;
  filterHref: (filter: FilterState) => string;
  institutionWide: InstitutionWide;
  onInstitutionWide: (position: InstitutionWide) => void;
  links: FundingLinks;
  methodHref: string;
}

/** The view itself, over an export that carries funding data. */
function FundingImpact({
  doc,
  funding,
  filter,
  onFilter,
  filterHref,
  institutionWide,
  onInstitutionWide,
  links,
  methodHref,
}: FundingImpactProps) {
  const [byAgencyOverTime, setByAgencyOverTime] = useState(false);
  const [agencyMeasure, setAgencyMeasure] = useState<AgencyMeasure>('value');
  const [singleYears, setSingleYears] = useState(false);
  const [kindMeasure, setKindMeasure] = useState<AgencyMeasure>('value');

  const labels = useMemo(() => buildLabels(doc, funding), [doc, funding]);
  const works = useMemo(
    () => applyFilter(doc.works, filter, funding),
    [doc.works, filter, funding],
  );
  // The scope, computed once: every figure, chart, table and the sentence below read it.
  const scope = useMemo(
    () => fundingScope(works, funding, grantSelection(filter, institutionWide)),
    [works, funding, filter, institutionWide],
  );
  const figures = useMemo(() => fundingFigures(scope), [scope]);

  const chips = describeFilter(filter, labels);
  const lastChip = chips.at(-1);
  const sentence = fundingSentence(
    filter,
    { grants: figures.grants, withGrants: figures.withListings, publications: works.length },
    labels,
    institutionWide,
  );
  const clearLast = lastChip
    ? {
        onClearLast: () => {
          onFilter(lastChip.without);
        },
        clearLastLabel: lastChip.label,
      }
    : {};

  let body: ReactNode;
  if (works.length === 0) {
    // No publication matches: the overview's designed empty state, naming the filter.
    body = <ChartEmpty filterSentence={filterSentence(filter, 0, labels)} {...clearLast} />;
  } else if (scope.grants.length === 0) {
    body = <NoGrantListed scope={scope} {...clearLast} />;
  } else {
    body = (
      <FundingSections
        doc={doc}
        works={works}
        scope={scope}
        figures={figures}
        filter={filter}
        onFilter={onFilter}
        filterHref={filterHref}
        links={links}
        byAgencyOverTime={byAgencyOverTime}
        setByAgencyOverTime={setByAgencyOverTime}
        agencyMeasure={agencyMeasure}
        setAgencyMeasure={setAgencyMeasure}
        singleYears={singleYears}
        setSingleYears={setSingleYears}
        kindMeasure={kindMeasure}
        setKindMeasure={setKindMeasure}
      />
    );
  }

  return (
    <>
      <FilterBar
        chips={chips}
        sentence={sentence}
        onChange={onFilter}
        onClearAll={() => {
          onFilter(EMPTY_FILTER);
        }}
      />

      {/* §12.5 item 2: the headline figures, with the institution-wide switch. */}
      <h2>Headline figures</h2>
      <FundingFigures
        scope={scope}
        onInstitutionWide={onInstitutionWide}
        definitionHref={(id) => `${methodHref}#${id}`}
      />

      {body}
    </>
  );
}

/**
 * Publications match, but none lists a grant in scope (§12.5's second empty state). Either the
 * funding statements read name none — which is not a finding that the work had no funding — or
 * every grant they list is an institution-wide award the reader has excluded, which the switch
 * above undoes.
 */
function NoGrantListed({
  scope,
  onClearLast,
  clearLastLabel,
}: {
  scope: FundingScope;
  onClearLast?: () => void;
  clearLastLabel?: string;
}) {
  const heading = useId();
  const shown = pluralize(scope.publications, 'publication');
  return (
    <section className="empty-state" aria-labelledby={heading}>
      <h2 id={heading}>No grant listed</h2>
      {scope.leftOut.length > 0 ? (
        <p>
          The {shown} shown list only institution-wide awards (
          {pluralize(scope.leftOut.length, 'award')}), and they are excluded. Include them with the
          switch above to see them.
        </p>
      ) : (
        <p>
          None of the {shown} shown lists a grant in the funding statements read. That is not a
          finding that the work had no funding: a paper may thank a funder without a number, or name
          none at all.
        </p>
      )}
      {onClearLast && clearLastLabel ? (
        <button type="button" onClick={onClearLast}>
          Remove {clearLastLabel}
        </button>
      ) : null}
    </section>
  );
}

interface FundingSectionsProps {
  doc: ExportDocument;
  /** The publications the filter selected, which the scope was read from. */
  works: readonly Work[];
  scope: FundingScope;
  figures: Figures;
  filter: FilterState;
  onFilter: (next: FilterState) => void;
  filterHref: (filter: FilterState) => string;
  links: FundingLinks;
  byAgencyOverTime: boolean;
  setByAgencyOverTime: (value: boolean) => void;
  agencyMeasure: AgencyMeasure;
  setAgencyMeasure: (value: AgencyMeasure) => void;
  singleYears: boolean;
  setSingleYears: (value: boolean) => void;
  kindMeasure: AgencyMeasure;
  setKindMeasure: (value: AgencyMeasure) => void;
}

/** §12.5 items 3 to 7, over a scope that has at least one grant in it. */
function FundingSections({
  doc,
  works,
  scope,
  figures,
  filter,
  onFilter,
  filterHref,
  links,
  byAgencyOverTime,
  setByAgencyOverTime,
  agencyMeasure,
  setAgencyMeasure,
  singleYears,
  setSingleYears,
  kindMeasure,
  setKindMeasure,
}: FundingSectionsProps) {
  const agencyTableHeading = useId();
  const period = doc.period;

  const over = useMemo(() => cumulativeDollars(scope, period), [scope, period]);
  const valueStack = useMemo(
    () => valueByAgency(scope, period, { bucketYears: VALUE_BUCKET_YEARS }),
    [scope, period],
  );
  const grantStack = useMemo(
    () => newGrantsByAgency(scope, period, { bucketYears: singleYears ? 1 : GRANTS_BUCKET_YEARS }),
    [scope, period, singleYears],
  );
  const ranking = useMemo(
    () => rankAgencies(scope, { by: agencyMeasure, limit: Infinity }),
    [scope, agencyMeasure],
  );
  const kinds = useMemo(() => grantKinds(scope), [scope]);
  const other = useMemo(() => otherKind(scope), [scope]);
  const cover = useMemo(() => coverage(scope), [scope]);
  // How many of the unmatched numbers in view a recorded decision kept apart, not a failed match.
  const decided = useMemo(() => {
    const kept = keptUnmatched(works, scope.index);
    return scope.grants.filter((entry) => entry.miscellaneous && kept.has(entry.grant.key)).length;
  }, [works, scope]);

  const toggleAgency = (code: string) => {
    onFilter(toggleString(filter, 'agency', code));
  };
  const unknownCount = figures.withoutAmount;
  const unmatched = figures.miscellaneous;
  const misc = scope.index?.miscellaneous ?? null;

  /* ---- §12.5 item 4: agencies ranked ---- */
  const byValue = agencyMeasure === 'value';
  const drawable = byValue
    ? ranking.items.filter((row) => knownAmount(row) !== null)
    : ranking.items;
  const unknownOnly = ranking.items.length - drawable.length;
  const agencyRows: BarRow[] = drawable.slice(0, AGENCY_LIMIT).map((row) => {
    const known = knownAmount(row);
    return {
      key: row.code,
      label: row.label,
      name: row.name,
      value: byValue ? row.amountUsd : row.grants,
      selected: filter.agency.includes(row.code),
      detail: byValue
        ? [
            { label: 'Grants', value: formatCount(row.grants) },
            { label: 'With no known amount', value: formatCount(row.withoutAmount) },
          ]
        : [{ label: 'Known total', value: known === null ? 'not known' : formatUsd(known) }],
    };
  });
  // Miscellaneous is not an agency and is never ranked (docs/09 §4), but it is a filter value:
  // by count it stands as its own last bar, tagged, so its unmatched numbers can be selected.
  if (!byValue && ranking.miscellaneous !== null) {
    agencyRows.push({
      key: ranking.miscellaneous.code,
      label: ranking.miscellaneous.label,
      value: ranking.miscellaneous.grants,
      selected: filter.agency.includes(ranking.miscellaneous.code),
      tag: 'unmatched numbers',
      colour: seriesColour(5),
      detail: [{ label: 'Known total', value: 'not known' }],
    });
  }
  const agencyNotShown = drawable.length - Math.min(drawable.length, AGENCY_LIMIT);

  /* ---- §12.5 item 5: grant types ---- */
  const kindRows = kinds.filter((row) => row.grants > 0);
  const kindDrawable =
    kindMeasure === 'value' ? kindRows.filter((row) => row.withAmount > 0) : kindRows;
  const kindUnknownOnly = kindRows.length - kindDrawable.length;

  /* ---- §12.5 item 7: coverage ---- */
  const overridden =
    scope.selection.institutionWide === 'exclude' && figures.institutionWide.included;
  const onlyUnmatchedFilter: FilterState | null =
    misc === null ? null : { ...filter, agency: [misc.code] };

  const csvFilename = `${doc.resource.short_name.toLowerCase()}-grants-${doc.generated_at.slice(0, 10)}.csv`;

  return (
    <>
      {/* §12.5 item 3. */}
      <h2>Grant funding over time</h2>
      <ChartCard
        title={byAgencyOverTime ? 'Grant funding by agency over time' : 'Grant funding over time'}
        description={
          byAgencyOverTime
            ? 'The known value of the grants first listed in each year, stacked by agency: the five largest, then everything else. Select an agency, in the chart or in the legend, to filter the page by it.'
            : 'The known value of the grants first listed in each year, with the running total as a line on the right-hand axis. The bars are not filters.'
        }
        note={
          <>
            Each grant’s full lifetime total enters in the year of the first publication shown that
            lists it; this is a publication year, not an award year.{' '}
            {unknownCount === 0
              ? 'Every grant listed has a known amount.'
              : `${pluralize(unknownCount, 'grant')} with no known amount ${unknownCount === 1 ? 'is' : 'are'} not in this chart.`}
            {unmatched === 0
              ? ''
              : ` Nor ${unmatched === 1 ? 'is the unmatched number' : `are the ${formatCount(unmatched)} unmatched numbers`} in Miscellaneous, which ${unmatched === 1 ? 'has' : 'have'} no amount.`}
            {byAgencyOverTime && valueStack.series.some((series) => series.role === 'other')
              ? ' “Other” is everything outside the five largest agencies and is not a filter.'
              : ''}
          </>
        }
        controls={
          <Switch
            label="What this chart shows"
            value={byAgencyOverTime ? 'agency' : 'total'}
            options={[
              ['total', 'Total'],
              ['agency', 'By agency'],
            ]}
            onChange={(next) => {
              setByAgencyOverTime(next === 'agency');
            }}
          />
        }
        chart={
          <ResponsiveChart height={byAgencyOverTime ? 340 : 320}>
            {({ width, height }) =>
              byAgencyOverTime ? (
                <AgencyStackChart
                  stack={valueStack}
                  measure="value"
                  width={width}
                  height={height}
                  selectedAgencies={filter.agency}
                  onSelectAgency={toggleAgency}
                />
              ) : (
                <FundingOverTimeChart over={over} width={width} height={height} />
              )
            }
          </ResponsiveChart>
        }
        table={
          byAgencyOverTime ? (
            <AgencyStackTable stack={valueStack} measure="value" />
          ) : (
            <FundingOverTimeTable over={over} />
          )
        }
      />

      {/* §12.5 item 4. */}
      <h2>Agencies</h2>
      <RankedBarCard
        title="Funding agencies"
        chartLabel={
          byValue
            ? 'Funding agencies by the known value of the grants listed, largest first'
            : 'Funding agencies by the number of grants listed, most first'
        }
        description={
          byValue
            ? 'Agencies by the known value of the grants listed, largest first, each institute counted under its parent. Select an agency to filter the page by it.'
            : 'Agencies by the number of grants listed, most first, each institute counted under its parent. Select an agency to filter the page by it.'
        }
        note={
          <>
            {/* Said so that it adds up to the agencies figure: the real export's 71 were "the 15
                largest of 21 agencies", the 50 with no known amount told apart only after. */}
            {agencyNotShown > 0
              ? `${
                  byValue
                    ? `The ${formatCount(AGENCY_LIMIT)} largest of the ${formatCount(drawable.length)} agencies${unknownOnly > 0 ? ' with a known amount' : ''}`
                    : `The ${formatCount(AGENCY_LIMIT)} of the ${formatCount(drawable.length)} agencies with the most grants`
                } are drawn; the other ${formatCount(agencyNotShown)} ${agencyNotShown === 1 ? 'is' : 'are'} in the table of every agency below. `
              : ''}
            {byValue && unknownOnly > 0
              ? `${pluralize(unknownOnly, 'agency', 'agencies')} whose grants have no known amount ${unknownOnly === 1 ? 'is' : 'are'} not drawn; rank by grants to see ${unknownOnly === 1 ? 'it' : 'them'}. `
              : ''}
            {ranking.miscellaneous === null
              ? 'A grant is counted once, however many publications list it.'
              : byValue
                ? 'The unmatched numbers in Miscellaneous have no amount and are not drawn; rank by grants to see them. A grant is counted once, however many publications list it.'
                : 'Miscellaneous, the last bar, holds unmatched numbers: they are not an agency’s grants. A grant is counted once, however many publications list it.'}
          </>
        }
        controls={
          <Switch
            label="How agencies are ranked"
            value={agencyMeasure}
            options={[
              ['value', 'By value'],
              ['grants', 'By grants'],
            ]}
            onChange={setAgencyMeasure}
          />
        }
        rows={agencyRows}
        {...(byValue
          ? {
              formatValue: formatUsd,
              markFormat: formatUsdCompact,
              describeValue: (value: number) => `${formatUsd(value)} known`,
            }
          : { unit: GRANT_UNIT })}
        valueAxisLabel={byValue ? 'Known value of grants listed' : 'Grants listed'}
        categoryHeader="Agency"
        tableCaption={
          byValue
            ? 'Funding agencies by the known value of the grants listed, under the current filter.'
            : 'Funding agencies by the number of grants listed, under the current filter.'
        }
        onSelect={(row) => {
          toggleAgency(row.key);
        }}
        selectVerb="filter by this agency"
      />

      <ChartCard
        title="New grants by agency over time"
        description="Grants counted once each, in the year of the first publication shown that lists them, under the top of each agency’s chain: the five agencies with the most, Miscellaneous, then everything else. Select an agency, in the chart or in the legend, to filter the page by it."
        note={
          <>
            “Other” is everything outside the five agencies with the most grants and is not a
            filter.
            {grantStack.series.some((series) => series.role === 'pinned')
              ? ' Miscellaneous holds the unmatched numbers and is never merged into it.'
              : ''}
          </>
        }
        controls={
          <Switch
            label="Period length"
            value={singleYears ? 'single' : 'buckets'}
            options={[
              ['buckets', 'Three-year periods'],
              ['single', 'Single years'],
            ]}
            onChange={(next) => {
              setSingleYears(next === 'single');
            }}
          />
        }
        chart={
          <ResponsiveChart height={340}>
            {({ width, height }) => (
              <AgencyStackChart
                stack={grantStack}
                measure="grants"
                width={width}
                height={height}
                selectedAgencies={filter.agency}
                onSelectAgency={toggleAgency}
              />
            )}
          </ResponsiveChart>
        }
        table={<AgencyStackTable stack={grantStack} measure="grants" />}
      />

      <section className="funding-agencies" aria-labelledby={agencyTableHeading}>
        <h3 id={agencyTableHeading}>Every agency</h3>
        <AgencyTable scope={scope} links={links} />
      </section>

      {/* §12.5 item 5. */}
      <h2>Grant types</h2>
      <RankedBarCard
        title="Grant types"
        chartLabel={
          kindMeasure === 'value'
            ? 'Grant types by the known value of the grants listed'
            : 'Grant types by the number of grants listed'
        }
        description={
          kindMeasure === 'value'
            ? 'The known value of the grants listed, by type of award.'
            : 'The grants listed, by type of award.'
        }
        note={
          <>
            These bars are not filters: a grant’s type is not one of the dimensions the page filters
            by.
            {kindMeasure === 'value' && kindUnknownOnly > 0
              ? ` ${pluralize(kindUnknownOnly, 'type')} whose grants have no known amount ${kindUnknownOnly === 1 ? 'is' : 'are'} not drawn.`
              : ''}
            {kindMeasure === 'value' && unknownCount > 0
              ? ` ${pluralize(unknownCount, 'grant')} with no known amount ${unknownCount === 1 ? 'is' : 'are'} not in the values.`
              : ''}
            {unmatched > 0 ? ' Unmatched numbers are not counted as any type.' : ''}
            {/* The real export's "Other" is its second type by count and third by value, and
                reads as a kind of award, which it is not (R1b). */}
            {otherNote(other)}
          </>
        }
        controls={
          <Switch
            label="What the grant types are measured by"
            value={kindMeasure}
            options={[
              ['value', 'By value'],
              ['grants', 'By grants'],
            ]}
            onChange={setKindMeasure}
          />
        }
        rows={kindDrawable.map((row) => {
          const known = knownAmount(row);
          return {
            key: row.category,
            label: CATEGORY_LABELS[row.category],
            value: kindMeasure === 'value' ? row.amountUsd : row.grants,
            detail:
              kindMeasure === 'value'
                ? [
                    { label: 'Grants', value: formatCount(row.grants) },
                    { label: 'With no known amount', value: formatCount(row.withoutAmount) },
                  ]
                : [
                    {
                      label: 'Known total',
                      value: known === null ? 'not known' : formatUsd(known),
                    },
                  ],
          };
        })}
        {...(kindMeasure === 'value'
          ? {
              formatValue: formatUsd,
              markFormat: formatUsdCompact,
              describeValue: (value: number) => `${formatUsd(value)} known`,
            }
          : { unit: GRANT_UNIT })}
        valueAxisLabel={kindMeasure === 'value' ? 'Known value of grants listed' : 'Grants listed'}
        categoryHeader="Type"
        tableCaption={
          kindMeasure === 'value'
            ? 'The known value of the grants listed, by type of award, under the current filter.'
            : 'The grants listed, by type of award, under the current filter.'
        }
      />

      {/* §12.5 item 6. */}
      <h2>All grants</h2>
      <GrantsTable scope={scope} links={links} csvFilename={csvFilename} />

      {/* §12.5 item 7. */}
      <h2>Coverage</h2>
      <ProportionCard
        title="Publications and the grants they list"
        chartLabel="The publications shown, by whether they list a grant"
        description="The publications shown, divided by whether they list a grant matched to a funder’s record, only numbers nothing matched, or nothing in view."
        note="A publication listing nothing here may still thank a funder without a number, or list a grant this view leaves out; it is not a finding that the work had no funding."
        segments={[
          {
            key: 'grant',
            label: 'List a grant',
            value: cover.publications.withGrant,
            colour: seriesColour(0),
            meaning: 'List at least one grant matched to a funder’s record.',
          },
          {
            key: 'unmatched',
            label: 'Only unmatched numbers',
            value: cover.publications.onlyUnmatched,
            colour: seriesColour(5),
            meaning: 'List only numbers no source matched to a grant record.',
          },
          {
            key: 'none',
            label: 'None',
            value: cover.publications.none,
            colour: otherColour(),
            meaning: 'List no grant in view.',
          },
        ]}
        total={cover.publications.total}
        unit={PUBLICATION_UNIT}
        categoryHeader="What they list"
        valueHeader="Publications"
        tableCaption="The publications shown, by whether they list a grant."
      />
      <ProportionCard
        title="Grants with and without a known amount"
        chartLabel="The grants listed, by whether their amount is known"
        description="The grants listed, divided by whether a source read here reports their lifetime total."
        note="A grant with no known amount is counted as a grant and never as $0: it is left out of every total, and the count stands beside each one."
        segments={[
          {
            key: 'known',
            label: 'Known amount',
            value: cover.grants.withAmount,
            colour: seriesColour(0),
            meaning: 'In every total on this page.',
          },
          {
            key: 'unknown',
            label: 'No known amount',
            value: cover.grants.withoutAmount,
            colour: otherColour(),
            meaning: 'Counted as grants, left out of every total.',
          },
        ]}
        total={cover.grants.listed}
        unit={GRANT_UNIT}
        categoryHeader="Amount"
        valueHeader="Grants"
        tableCaption="The grants listed, by whether their amount is known."
      />
      <ul className="funding-coverage">
        <li>
          {cover.miscellaneous.grants === 0 ? (
            'No unmatched number is listed on these publications: every number in view was matched to a grant record.'
          ) : (
            <>
              {cover.miscellaneous.grants === 1
                ? `One unmatched number, on ${pluralize(cover.miscellaneous.publications, 'publication')}, is kept apart in Miscellaneous: a number written in a paper that ${decided === 1 ? 'a recorded decision kept unmatched' : 'no source matched to a grant record'}. It has no amount and is not counted as a grant.`
                : `${formatCount(cover.miscellaneous.grants)} unmatched numbers, on ${pluralize(cover.miscellaneous.publications, 'publication')}, are kept apart in Miscellaneous: numbers written in the papers that ${decided === cover.miscellaneous.grants ? 'recorded decisions kept unmatched' : `no source matched to a grant record${decided === 0 ? '' : `, or, for ${formatCount(decided)} of them, that a recorded decision kept unmatched`}`}. They have no amount and are not counted as grants.`}{' '}
              {onlyUnmatchedFilter === null ||
              (filter.agency.length === 1 && filter.agency[0] === misc?.code) ? null : (
                <a
                  href={filterHref(onlyUnmatchedFilter)}
                  onClick={(event) => {
                    if (isPlainLeftClick(event)) {
                      event.preventDefault();
                      onFilter(onlyUnmatchedFilter);
                    }
                  }}
                >
                  Show only the unmatched numbers
                </a>
              )}
            </>
          )}
        </li>
        <li>{institutionWideSentence(figures.institutionWide, overridden)}</li>
        <li>
          {cover.grants.startsBeforeFy1985 === 0
            ? 'No grant listed began before FY1985, where NIH’s records of amounts begin.'
            : `${pluralize(cover.grants.startsBeforeFy1985, 'grant')} began before FY1985, where NIH’s records of amounts begin, so ${cover.grants.startsBeforeFy1985 === 1 ? 'its total leaves' : 'their totals leave'} out the years before it.`}
        </li>
        <li>
          {cover.grants.active === 0
            ? 'None of the grants listed is still active.'
            : `${pluralize(cover.grants.active, 'grant')} ${cover.grants.active === 1 ? 'is' : 'are'} still active, so ${cover.grants.active === 1 ? 'its total is' : 'their totals are'} still growing.`}
        </li>
        {cover.grants.unconverted === 0 ? null : (
          <li>
            {pluralize(cover.grants.unconverted, 'grant')}{' '}
            {cover.grants.unconverted === 1 ? 'is' : 'are'} in a currency no exchange-rate table
            here covers, so {cover.grants.unconverted === 1 ? 'it has' : 'they have'} no amount in
            US dollars.
          </li>
        )}
      </ul>
    </>
  );
}
