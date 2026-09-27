/**
 * The headline figures of Funding impact (docs/09 §12.5 item 2): the total value of the grants
 * listed, the grants, agencies, principal investigators, organisations, and the publications
 * listing a grant, *K* of *N* — and the institution-wide switch, which sits here because it
 * changes the figure people cite.
 *
 * Every figure comes from `fundingFigures(scope)`, over the scope the view computed once; none
 * reads `funding.summary`, which exists only as the cross-check (docs/06 §12.1).
 *
 * The honesty rules (§12.11) are what this component is for, and each holds in its strings:
 *
 * - **The total carries its definition, its as-of date and "not money spent on this work"**
 *   (rule 2), and **never shows $0 for "not known"** (rule 3): with no grant it shows a dash, with
 *   no known amount "Not known", and the count of grants without an amount stands beside it.
 * - **The institution-wide position is stated beside the total** (rule 4) — how many such
 *   awards the total includes and their value, or what excluding them left out — whether or not
 *   the switch is shown.
 * - **A grant is counted once** (rule 7), and the grants figure says so.
 * - No wording of credit or cause (rule 1): the figures are about grants the publications list.
 *
 * Unmatched numbers (Miscellaneous) are stated beside the grants and publications they are kept
 * apart from, never counted as grants (docs/09 §4).
 */
import { useId } from 'react';
import {
  fundingFigures,
  knownAmount,
  type DollarTotal,
  type FundingFigures as Figures,
  type FundingScope,
  type InstitutionWideFigures,
} from '../aggregate/funding';
import type { InstitutionWide } from '../filter/funding';
import { formatDate } from '../format/date';
import { formatCount, formatUsd, pluralize } from '../format/number';
import type { FundingDefinitionId } from '../method/definitions';

export interface FundingFiguresProps {
  /** The scope the view computed once (`fundingScope`): the grants in view and the selection. */
  scope: FundingScope;
  /**
   * The institution-wide switch's change. The switch is controlled: its position is
   * `scope.selection.institutionWide`, and the view writes a change to the URL
   * (`institution_wide=exclude`, docs/09 §12.4). Left out, there is no switch, and the position
   * is still stated — as on an agency page, whose figures include every award.
   */
  onInstitutionWide?: ((position: InstitutionWide) => void) | undefined;
  /** A figure's definition on the method page, by its id (`FUNDING_DEFINITION_IDS`). */
  definitionHref?: ((id: FundingDefinitionId) => string) | undefined;
  /**
   * True on an agency's page, whose figures are over every publication rather than the ones a
   * filter shows (docs/09 §12.6). The agencies figure, one agency by construction, is left out,
   * and *K* of *N* says it is of every publication.
   */
  corpus?: boolean;
}

interface Figure {
  /** The fragment of this figure's definition on the method page. */
  id: FundingDefinitionId;
  label: string;
  value: string;
  definition: string;
}

/** ", 1 with no known amount" and the like: the value clause of an institution-wide sentence. */
function awardsValue(total: DollarTotal): string {
  const known = knownAmount(total);
  if (known === null) {
    return total.withoutAmount === 1 ? ', with no known amount' : ', none with a known amount';
  }
  if (total.withoutAmount === 0) return ` worth ${formatUsd(known)}`;
  return `, worth ${formatUsd(known)} for the ${formatCount(total.withAmount)} with a known amount; ${pluralize(total.withoutAmount, 'has', 'have')} none`;
}

/**
 * The institution-wide position in words (§12.11 rule 4): "Including 5 institution-wide awards
 * worth $135,503,058." or what excluding them left out. `overridden` is a grant selection holding
 * the exclusion off (§12.4), which the sentence says so the switch is not read as broken.
 */
export function institutionWideSentence(wide: InstitutionWideFigures, overridden: boolean): string {
  const awards = pluralize(wide.grants, 'institution-wide award');
  if (wide.included) {
    const position =
      wide.grants === 0
        ? 'No institution-wide award is among these grants.'
        : `Including ${awards}${awardsValue(wide)}.`;
    return overridden
      ? `${position} A grant is selected, so it is shown whatever the institution-wide switch says.`
      : position;
  }
  return wide.grants === 0
    ? 'Institution-wide awards are excluded; none is listed on these publications.'
    : `Excluding ${awards}${awardsValue(wide)}.`;
}

/** The total's value: a dash with no grant, "Not known" with no known amount, never "$0". */
function totalValue(figures: Figures): string {
  if (figures.listed === 0) return '—';
  const known = knownAmount(figures);
  return known === null ? 'Not known' : formatUsd(known);
}

function totalDefinition(figures: Figures, asOf: string | null): string {
  if (figures.listed === 0) {
    return 'No grant is listed on the publications shown, so there is no total.';
  }
  const dated = asOf === null ? '' : `, as of ${formatDate(asOf)}`;
  const worth = `The lifetime award totals of the grants listed, as their funders record them${dated}. It is what the awards are worth, not money spent on this work.`;
  if (figures.withAmount === 0) {
    const none =
      figures.listed === 1
        ? 'The one grant listed has no known amount'
        : `None of the ${formatCount(figures.listed)} grants listed has a known amount`;
    return `${worth} ${none}, so no total can be given.`;
  }
  if (figures.withoutAmount === 0) return `${worth} Every grant listed has a known amount.`;
  return `${worth} ${pluralize(figures.withoutAmount, 'grant')} with no known amount ${figures.withoutAmount === 1 ? 'is' : 'are'} not in it.`;
}

/**
 * The figures in the order shown, each with its definition id. Exported for the id test.
 * `corpus` is an agency page's: no agencies figure, and *K* of every publication (see the prop).
 */
export function fundingHeadlineFigures(
  figures: Figures,
  asOf: string | null,
  corpus = false,
): Figure[] {
  const unmatchedGrants =
    figures.miscellaneous === 0
      ? ''
      : ` ${formatCount(figures.miscellaneous)} more ${figures.miscellaneous === 1 ? 'is an unmatched number' : 'are unmatched numbers'}, kept apart in Miscellaneous.`;
  const onlyUnmatched = figures.withListings - figures.withGrants;
  const unmatchedPublications =
    onlyUnmatched === 0
      ? ''
      : ` ${formatCount(onlyUnmatched)} more ${onlyUnmatched === 1 ? 'lists' : 'list'} only unmatched numbers.`;

  const all: Figure[] = [
    {
      id: 'funding-total',
      label: 'Total value of grants listed',
      value: totalValue(figures),
      definition: totalDefinition(figures, asOf),
    },
    {
      id: 'funding-grants',
      label: 'Grants listed',
      value: formatCount(figures.listed),
      definition: `Each counted once, however many publications list it.${unmatchedGrants}`,
    },
    {
      id: 'funding-agencies',
      label: 'Funding agencies',
      value: formatCount(figures.agencies),
      definition: 'Counted at the top of each chain: an institute counts under its parent.',
    },
    {
      id: 'funding-investigators',
      label: 'Principal investigators',
      value: formatCount(figures.investigators),
      definition:
        'As the funders name them; told apart by name where no identifier is given, so one person written two ways counts twice.',
    },
    {
      id: 'funding-organizations',
      label: 'Organisations',
      value: formatCount(figures.organizations),
      definition: 'The organisations the grants were awarded to, told apart by name.',
    },
    {
      id: 'funding-publications',
      label: 'Publications listing a grant',
      value: `${formatCount(figures.withGrants)} of ${formatCount(figures.publications)}`,
      definition: `${corpus ? 'Of every publication here, whatever the filter.' : 'Of the publications shown.'}${unmatchedPublications}`,
    },
  ];
  return corpus ? all.filter((figure) => figure.id !== 'funding-agencies') : all;
}

export function FundingFigures({
  scope,
  onInstitutionWide,
  definitionHref,
  corpus = false,
}: FundingFiguresProps) {
  const positionId = useId();
  const index = scope.index;
  if (index === null) return null;

  const figures = fundingFigures(scope);
  const [total, ...rest] = fundingHeadlineFigures(figures, index.funding.as_of, corpus);
  const position = scope.selection.institutionWide;
  const overridden = position === 'exclude' && figures.institutionWide.included;

  const label = (figure: Figure) =>
    definitionHref ? (
      // Named outright, opening with the visible label, as the overview's figures are
      // (HeadlineFigures): engines disagree on how they join a visually hidden span.
      <a
        href={definitionHref(figure.id)}
        aria-label={`${figure.label}: how this figure is defined`}
      >
        {figure.label}
      </a>
    ) : (
      figure.label
    );

  return (
    <ul className="figure-grid funding-figures" aria-label="Funding figures">
      {total === undefined ? null : (
        <li className="funding-figure-total">
          <span className="figure-value">{total.value}</span>
          <span className="figure-label">{label(total)}</span>
          <p className="chart-card-description">{total.definition}</p>
          <p className="funding-position" id={positionId}>
            {institutionWideSentence(figures.institutionWide, overridden)}
            {definitionHref ? (
              <>
                {' '}
                <a href={definitionHref('funding-institution-wide')}>
                  What counts as institution-wide
                </a>
              </>
            ) : null}
          </p>
          {onInstitutionWide ? (
            <div
              className="chart-switch"
              role="group"
              aria-label="Institution-wide awards"
              aria-describedby={positionId}
            >
              {(['include', 'exclude'] as const).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  aria-pressed={position === choice}
                  onClick={() => {
                    // Pressing the position already held changes nothing, so it adds no entry
                    // to the history the view writes the URL into.
                    if (choice !== position) onInstitutionWide(choice);
                  }}
                >
                  {choice === 'include' ? 'Include' : 'Exclude'}
                </button>
              ))}
            </div>
          ) : null}
        </li>
      )}
      {rest.map((figure) => (
        <li key={figure.id}>
          <span className="figure-value">{figure.value}</span>
          <span className="figure-label">{label(figure)}</span>
          <p className="chart-card-description">{figure.definition}</p>
        </li>
      ))}
    </ul>
  );
}
