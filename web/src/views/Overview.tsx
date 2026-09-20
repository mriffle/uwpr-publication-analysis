/**
 * The overview (docs/06 §4), as far as this slice builds it: the header, the headline figures,
 * and publications per year — the one chart taken end to end through the shared kit, which is
 * docs/06 §15's remaining exit criterion for the chart layer.
 *
 * The remaining sections (§4.4 to §4.9) are later slices and are deliberately absent rather than
 * stubbed, so that nothing on the page implies a figure the app cannot yet substantiate.
 */
import { useMemo } from 'react';
import {
  PublicationsPerYearChart,
  PublicationsPerYearTable,
} from '../charts/PublicationsPerYearChart';
import { ChartCard } from '../charts/ChartCard';
import { ChartEmpty } from '../charts/ChartEmpty';
import { ResponsiveChart } from '../charts/ResponsiveChart';
import { HeadlineFigures } from '../components/HeadlineFigures';
import { StalenessNotice } from '../components/StalenessNotice';
import { useFilterUrl } from '../components/useFilterUrl';
import type { ExportDocument } from '../contract/types';
import { buildLabels, describeFilter, filterSentence } from '../filter/describe';
import { applyFilter } from '../filter/predicate';
import { EMPTY_FILTER, toggleYear } from '../filter/state';
import { formatDate } from '../format/date';

export interface OverviewProps {
  doc: ExportDocument;
  /** Injected in tests so the staleness threshold is exercised without freezing the clock. */
  now?: Date;
}

export function Overview({ doc, now }: OverviewProps) {
  const { filter, setFilter } = useFilterUrl();
  const labels = useMemo(() => buildLabels(doc), [doc]);
  const works = useMemo(() => applyFilter(doc.works, filter), [doc.works, filter]);
  const chips = describeFilter(filter, labels);
  const sentence = filterSentence(filter, works.length, labels);
  const lastChip = chips.at(-1);

  return (
    <main className="page">
      <header className="page-header">
        <h1>{doc.resource.name} — publications</h1>
        <p>
          Publications with recorded evidence that they used the resource. Each one can show why it
          is counted.
        </p>
        <p>
          Data generated {formatDate(doc.generated_at)}. Citations from {doc.sources.citations.name}{' '}
          as of {doc.sources.citations.as_of}.{' '}
          <a href={doc.resource.url}>{doc.resource.short_name}</a>
        </p>
      </header>

      <StalenessNotice generatedAt={doc.generated_at} {...(now ? { now } : {})} />

      {/*
        docs/06 §9: "Filter changes announce the new result count in a live region; a silent
        update strands a screen reader user mid-page." The same sentence is shown, because
        docs/06 §6 requires the active filter to be stated in words beside the figures.
      */}
      <p className="notice" role="status" aria-live="polite">
        {sentence}
        {chips.length > 0 ? (
          <>
            {' '}
            <button
              type="button"
              onClick={() => {
                setFilter(EMPTY_FILTER);
              }}
            >
              Clear all filters
            </button>
          </>
        ) : null}
      </p>

      <h2>Headline figures</h2>
      <HeadlineFigures works={works} citationsAsOf={doc.sources.citations.as_of} />

      <h2>Output over time</h2>
      <ChartCard
        title="Publications per year"
        description="One bar per year, with the running total as a line on the right-hand axis. Select a year to filter the page by it."
        note={`Nothing is recorded before ${String(doc.period.first_year)}: the project's search window opens in 2006, and the earliest publication found is ${String(doc.period.first_year)}.`}
        {...(works.length === 0
          ? {
              empty: (
                <ChartEmpty
                  filterSentence={sentence}
                  {...(lastChip
                    ? {
                        onClearLast: () => {
                          setFilter(lastChip.without);
                        },
                        clearLastLabel: lastChip.label,
                      }
                    : {})}
                />
              ),
            }
          : {})}
        chart={
          <ResponsiveChart height={320}>
            {({ width, height }) => (
              <PublicationsPerYearChart
                works={works}
                period={doc.period}
                width={width}
                height={height}
                selectedYears={filter.year}
                onSelectYear={(year) => {
                  setFilter(toggleYear(filter, year));
                }}
              />
            )}
          </ResponsiveChart>
        }
        table={<PublicationsPerYearTable works={works} period={doc.period} />}
      />
    </main>
  );
}
