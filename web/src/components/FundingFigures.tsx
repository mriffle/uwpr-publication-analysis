/**
 * The headline figures of Funding impact (docs/09 §12.5 item 2): the grant funding counted, the
 * grants, agencies, principal investigators, organisations, and the publications listing a grant,
 * *K* of *N* — and the institution-wide switch, which sits here because it changes the figure
 * people cite.
 *
 * Every figure comes from `fundingFigures(scope)`, over the scope the view computed once; none
 * reads `funding.summary`, which exists only as the cross-check (docs/06 §12.1).
 *
 * **The headline is the counted funding** (docs/09 F17): each grant's funding from `from_year`,
 * when the resource began, through the year of the latest publication shown listing it — so a
 * filter moves it — not its lifetime total, which stays a fact about the grant.
 *
 * The honesty rules (§12.11) are what this component is for, and each holds in its strings:
 *
 * - **The total carries its definition, its window, its as-of date and "Not money spent on this
 *   work"** (rule 2), all from the export's `funding.counting`, and **never shows $0 for "not
 *   known"** (rule 3): with no grant it shows a dash, with no known amount "Not known", and the
 *   count of grants without an amount stands beside it. **The estimated part is stated** when
 *   there is one: amounts spread evenly over their years.
 * - **The institution-wide position is stated beside the total** (rule 4) — how many such
 *   awards the total includes and what is counted of them, or what excluding them left out —
 *   whether or not the switch is shown.
 * - **A grant is counted once** (rule 7), and the grants figure says so.
 * - No wording of credit or cause (rule 1): the figures are about grants the publications list.
 *
 * Unmatched numbers (Miscellaneous) are stated beside the grants and publications they are kept
 * apart from, never counted as grants (docs/09 §4).
 */
import { useId } from 'react';
import {
  fundingFigures,
  knownCounted,
  type DollarTotal,
  type FundingFigures as Figures,
  type FundingScope,
  type InstitutionWideFigures,
} from '../aggregate/funding';
import { countingOf } from '../contract/funding';
import type { FundingCounting } from '../contract/types';
import type { InstitutionWide } from '../filter/funding';
import { formatDate } from '../format/date';
import { COUNTED_LABEL, countedDefinition, estimatedLine } from '../format/funding';
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
  /**
   * The resource's short name ("UWPR"), whose start the headline's definition names as the first
   * year counted. Without it the definition says "the resource".
   */
  resource?: string;
}

/** What the definition calls the resource when the caller does not name it. */
const THE_RESOURCE = 'the resource';

interface Figure {
  /** The fragment of this figure's definition on the method page. */
  id: FundingDefinitionId;
  label: string;
  value: string;
  definition: string;
}

/**
 * " counted at $1,000,000", ", with no known amount" and the like: the value clause of an
 * institution-wide sentence, in counted dollars, as the headline beside it is.
 */
function awardsValue(total: DollarTotal): string {
  const known = knownCounted(total);
  if (known === null) {
    return total.withoutAmount === 1 ? ', with no known amount' : ', none with a known amount';
  }
  if (total.withoutAmount === 0) return ` counted at ${formatUsd(known)}`;
  return `, counted at ${formatUsd(known)} for the ${formatCount(total.withAmount)} with a known amount; ${pluralize(total.withoutAmount, 'has', 'have')} none`;
}

/**
 * The institution-wide position in words (§12.11 rule 4): "Including 5 institution-wide awards
 * counted at $126,823,172." or what excluding them left out. `overridden` is a grant selection
 * holding the exclusion off (§12.4), which the sentence says so the switch is not read as broken.
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

/**
 * The total's value: a dash with no grant, "Not known" with no known amount, never "$0" for an
 * unknown. A known $0 — every grant began after the latest publication shown listing it — is one.
 */
function totalValue(figures: Figures): string {
  if (figures.listed === 0) return '—';
  const known = knownCounted(figures);
  return known === null ? 'Not known' : formatUsd(known);
}

/**
 * The headline's definition (§12.11 rule 2): what is counted, from when to when, what it is not,
 * as of when; then what part of it is estimated, and how many grants it leaves out, unknown.
 */
function totalDefinition(
  figures: Figures,
  asOf: string | null,
  counting: FundingCounting,
  resource: string,
): string {
  if (figures.listed === 0) {
    return 'No grant is listed on the publications shown, so there is no total.';
  }
  const dated = asOf === null ? '' : ` Amounts as of ${formatDate(asOf)}.`;
  const defined = `${countedDefinition(counting, resource)}${dated}`;
  if (figures.withAmount === 0) {
    const none =
      figures.listed === 1
        ? 'The one grant listed has no known amount'
        : `None of the ${formatCount(figures.listed)} grants listed has a known amount`;
    return `${defined} ${none}, so no total can be given.`;
  }
  const estimated = estimatedLine(figures.estimatedUsd);
  const withEstimate = estimated === null ? defined : `${defined} ${estimated}`;
  if (figures.withoutAmount === 0) return `${withEstimate} Every grant listed has a known amount.`;
  return `${withEstimate} ${pluralize(figures.withoutAmount, 'grant')} with no known amount ${figures.withoutAmount === 1 ? 'is' : 'are'} not in it.`;
}

/**
 * The figures in the order shown, each with its definition id. Exported for the id test.
 * `corpus` is an agency page's: no agencies figure, and *K* of every publication (see the prop).
 */
export function fundingHeadlineFigures(
  figures: Figures,
  asOf: string | null,
  counting: FundingCounting,
  { corpus = false, resource = THE_RESOURCE }: { corpus?: boolean; resource?: string } = {},
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
      label: COUNTED_LABEL,
      value: totalValue(figures),
      definition: totalDefinition(figures, asOf, counting, resource),
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
  resource = THE_RESOURCE,
}: FundingFiguresProps) {
  const positionId = useId();
  const index = scope.index;
  if (index === null) return null;

  const figures = fundingFigures(scope);
  const [total, ...rest] = fundingHeadlineFigures(figures, index.funding.as_of, countingOf(index), {
    corpus,
    resource,
  });
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
