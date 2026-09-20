/**
 * The five headline figures of docs/06 §4.2, each responding to the active filter, and the one
 * sentence carrying the quality claim.
 *
 * Every figure is recomputed from the rows (docs/05 §1.1) — none reads the `summary` block,
 * which exists only as the cross-check of §1.2.
 *
 * Register, from docs/05 §11: each figure carries its definition; "research groups" says it is a
 * proxy and "journals" is stated as distinct venues including preprint servers; and the
 * field-weighted sentence stops at what the evidence supports (§5.1 — the app must not imply the
 * resource caused the citations).
 */
import {
  distinctJournals,
  fwciMedian,
  publications,
  researchGroups,
  totalCitations,
  yearSpan,
} from '../aggregate/metrics';
import type { Work } from '../contract/types';
import { formatDate } from '../format/date';
import { formatCount, formatDecimal } from '../format/number';
import type { HeadlineDefinitionId } from '../method/definitions';

export interface HeadlineFiguresProps {
  works: readonly Work[];
  /** The date the citation figures were read, from `sources.citations.as_of`. */
  citationsAsOf: string;
  /**
   * docs/06 §4.2: "Every figure links to its definition on the method page." Given a figure's
   * `id`, this returns that link. It is optional so the component can be rendered on its own in
   * a test; the overview always passes it.
   *
   * The inline definition below each figure stays as well. docs/05 §11.3 accepts either — "every
   * figure carries its definition and its date, **or** links to §5" — and the two are not the
   * same answer: the sentence says what the figure is without a navigation, and the link says
   * how it is computed, what it excludes, and what it is over the whole corpus.
   */
  definitionHref?: (id: string) => string;
}

interface Figure {
  /** The fragment of this figure's entry on the method page (`method/definitions.ts`). */
  id: HeadlineDefinitionId;
  label: string;
  value: string;
  definition: string;
}

export function headlineFigures(works: readonly Work[], citationsAsOf: string): Figure[] {
  const span = yearSpan(works);
  return [
    {
      id: 'publications',
      label: 'Publications',
      value: formatCount(publications(works)),
      definition: 'Distinct works. A preprint and its journal article count once.',
    },
    {
      id: 'years-covered',
      label: 'Years covered',
      value: span === null ? '—' : `${String(span.first)}–${String(span.last)}`,
      definition: 'First and last publication year of each work’s canonical record.',
    },
    {
      id: 'citations',
      label: 'Citations',
      value: formatCount(totalCitations(works)),
      definition: `Citations reported by OpenAlex as of ${formatDate(citationsAsOf)}.`,
    },
    {
      id: 'research-groups',
      label: 'Research groups',
      value: formatCount(researchGroups(works)),
      definition:
        'A proxy: distinct corresponding authors. Not every work marks one, and a group may publish under several.',
    },
    {
      id: 'journals',
      label: 'Journals',
      value: formatCount(distinctJournals(works)),
      definition:
        'Distinct venues, keyed by ISSN-L where present. Preprint servers are venues and are counted as such.',
    },
  ];
}

export function HeadlineFigures({ works, citationsAsOf, definitionHref }: HeadlineFiguresProps) {
  const figures = headlineFigures(works, citationsAsOf);
  const median = fwciMedian(works);

  return (
    <>
      <ul className="figure-grid" aria-label="Headline figures">
        {figures.map((figure) => (
          <li key={figure.label}>
            <span className="figure-value">{figure.value}</span>
            <span className="figure-label">
              {definitionHref ? (
                /*
                  The accessible name is given outright rather than assembled from a
                  visually-hidden span, because engines do not agree on how they join adjacent
                  text nodes: the same markup reads "Publications: how…" under jsdom and
                  "Publications : how…" in Chromium, and a name that differs between the
                  component test and the browser is a name no test really pins down. It opens
                  with the visible label, so the name a reader hears still starts with the one
                  they can see.
                */
                <a
                  href={definitionHref(figure.id)}
                  aria-label={`${figure.label}: how this figure is defined`}
                >
                  {figure.label}
                </a>
              ) : (
                figure.label
              )}
            </span>
            <p className="chart-card-description">{figure.definition}</p>
          </li>
        ))}
      </ul>
      <p className="chart-card-description">
        {median === null ? (
          <>
            No field-weighted citation impact is available for the publications shown. OpenAlex
            reports one for most works but not the most recent.
          </>
        ) : (
          <>
            The median publication shown is cited about {formatDecimal(median)} times as often as
            the average paper in its field and year (field-weighted citation impact, OpenAlex, as of{' '}
            {formatDate(citationsAsOf)}). This records how these publications were cited; it does
            not measure what caused the citations.
          </>
        )}
      </p>
    </>
  );
}
