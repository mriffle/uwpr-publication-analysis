/**
 * A grant in words (docs/09 §11.4, §12.11): its type, its tags, its years and its amount, as the
 * grants table, the publication's Funding section and the downloads all say them.
 *
 * One module, so that the table and its CSV cannot tag a grant differently, and so that the
 * honesty rules that govern how an amount reads are kept in one place:
 *
 * - **Unknown is never $0** (rule 3). An amount with no known US-dollar value reads as null here,
 *   and the caller says "not known". A counted $0 is a known zero, and always says why.
 * - **A converted amount shows its original and the rate year** (rule 5).
 * - **Active grants are marked** (rule 6): their totals still grow.
 * - **What the totals count is said in one register** (docs/09 F17): the headline's name and
 *   definition, the estimated part, the reason each grant counts what it does. Each is built from
 *   the export's `funding.counting`, so no year or count of years is written here.
 */
import type { AmountSource, CountedRule, FundingCounting, Grant } from '../contract/types';
import { formatCount, formatMoney, formatUsd, pluralize } from './number';

/** docs/09 §11.4's categories as a reader reads them. `center` covers programmes and resources. */
export const CATEGORY_LABELS: Readonly<Record<Grant['category'], string>> = {
  research: 'Research',
  center: 'Centre or programme',
  training: 'Training',
  instrument: 'Instrument',
  contract: 'Contract',
  other: 'Other',
};

/**
 * The tags a grant carries wherever it is listed, in a fixed order. Each changes how its total
 * reads, so each is words, never a colour alone (docs/06 §8):
 *
 * - **unmatched number** — kept in Miscellaneous: no agency, kind or amount is known (§6.11);
 * - **institution-wide** — an award to run a programme for many projects (§4, Appendix B);
 * - **active** — the total still grows (§12.11 rule 6);
 * - **amounts from FY1985** / **FY2008** — the source's amounts begin then, so an older grant's
 *   total misses its earlier years (§11.4's flags);
 * - **not converted** — in a currency no rate table covers, so with no amount in dollars.
 */
export function grantTags(grant: Grant, miscellaneous: boolean): string[] {
  const tags: string[] = [];
  if (miscellaneous) tags.push('unmatched number');
  if (grant.scope === 'institution-wide') tags.push('institution-wide');
  if (grant.flags.includes('active')) tags.push('active');
  if (grant.flags.includes('starts_before_fy1985')) tags.push('amounts from FY1985');
  if (grant.flags.includes('starts_before_fy2008')) tags.push('amounts from FY2008');
  if (grant.flags.includes('unconverted_currency')) tags.push('not converted');
  return tags;
}

/** "2019–2023", "from 2019", "until 2023", or null when the source gives neither year. */
export function grantYears(grant: Pick<Grant, 'start_year' | 'end_year'>): string | null {
  const { start_year: start, end_year: end } = grant;
  if (start === null && end === null) return null;
  if (start === null) return `until ${String(end)}`;
  if (end === null) return `from ${String(start)}`;
  return start === end ? String(start) : `${String(start)}–${String(end)}`;
}

/** "$1,234,567", or null when no amount is known in US dollars — never "$0" (rule 3). */
export const grantAmount = (grant: Pick<Grant, 'amount_usd'>): string | null =>
  grant.amount_usd === null ? null : formatUsd(grant.amount_usd);

/**
 * What an amount in another currency was (rule 5): "converted from SEK 2,000,000 at the 2021
 * rate", or, with no rate to convert it, "SEK 2,000,000, not converted to US dollars". Null for
 * an amount awarded in US dollars, or with no amount at all.
 */
export function originalAmount(
  grant: Pick<Grant, 'amount_usd' | 'amount_original' | 'currency' | 'rate_year' | 'flags'>,
): string | null {
  const { amount_original: amount, currency } = grant;
  if (amount === null || currency === null || currency.toUpperCase() === 'USD') return null;
  const original = formatMoney(amount, currency);
  if (grant.amount_usd === null) return `${original}, not converted to US dollars`;
  if (grant.rate_year === null) return `converted from ${original}`;
  const estimated = grant.flags.includes('rate_year_estimated') ? ' (the rate year estimated)' : '';
  return `converted from ${original} at the ${String(grant.rate_year)} rate${estimated}`;
}

/** Why a grant has no amount, in a clause: what the page may say beside "not known". */
export function unknownAmountReason(grant: Pick<Grant, 'flags' | 'status'>): string {
  if (grant.status === 'unresolved') return 'no funder’s record matched this number';
  if (grant.flags.includes('unconverted_currency')) return 'no exchange rate covers its currency';
  if (grant.flags.includes('no_amount_reported'))
    return 'the funder’s record holds the grant but reports no amount';
  return 'no source read here reports an amount for it';
}

/** The principal investigators as the funder publishes them (rule 9), or null for none. */
export const investigatorNames = (grant: Pick<Grant, 'pis'>): string | null =>
  grant.pis.length === 0 ? null : grant.pis.map((person) => person.name).join('; ');

/**
 * What a lifetime total is, by the basis its source gives it (docs/09 §7.1), as a clause after
 * "the total is": each source adds up a different thing, and the grant page says which.
 */
export const AMOUNT_BASIS_TEXT: Readonly<Record<AmountSource['basis'], string>> = {
  reporter_fiscal_years:
    'the sum of the grant’s award actions over every fiscal year NIH RePORTER holds, its sub-projects left out so that nothing is counted twice',
  reporter_contract: 'the sum of the contract’s line items in NIH RePORTER',
  reporter_task_order: 'the task order’s own total in NIH RePORTER, apart from the larger contract',
  nsf_obligated: 'what NSF obligated to the award',
  nsf_estimated: 'NSF’s estimated total for the award, larger than what it has obligated so far',
  usaspending_obligation: 'the award’s total obligation, as USAspending records it',
  openalex_amount: 'the amount OpenAlex records for the award',
};

/**
 * One fiscal year's amount in words: "$1,000,000", or "no amount reported" for a year whose
 * source rows report none — never "$0" (§12.11 rule 3).
 */
export const fiscalYearAmount = (amount: number | null): string =>
  amount === null ? 'no amount reported' : formatUsd(amount);

/* ------------------------------------------------------------------------------------------------
 * What the totals count (docs/09 F17): one register, for Funding impact now and the grant, agency
 * and method pages after it.
 * --------------------------------------------------------------------------------------------- */

/** The headline figure's name: what every total on Funding impact adds up. */
export const COUNTED_LABEL = 'Grant funding counted';

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
] as const;

/** A small count as a sentence writes it — "five" — and the digits past ten. */
export const countInWords = (count: number): string => NUMBER_WORDS[count] ?? formatCount(count);

/** "an instrument", "a contract": the article a word takes. */
const withArticle = (word: string): string => `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`;

/** The kinds counted in full, as a reader reads them: "instrument", "instrument or contract". */
const fullAmountKinds = (counting: FundingCounting): string =>
  counting.full_amount_categories
    .map((category) => CATEGORY_LABELS[category].toLowerCase())
    .join(' or ');

/** "its last five years", "its last year": the part of an ended grant that counts. */
const lastYears = (counting: FundingCounting, whose: 'its' | 'their'): string =>
  counting.last_years === 1
    ? `${whose} last year`
    : `${whose} last ${countInWords(counting.last_years)} years`;

/**
 * Why a grant counts what it does, one clause per rule, as the grants table's CSV ("How counted")
 * and the grant page say it: "from 2006 to its latest listing publication", "began after its
 * latest listing publication: nothing counted". The year, the kinds and the count of years are
 * the export's.
 */
export function countedRuleText(counting: FundingCounting): Readonly<Record<CountedRule, string>> {
  const from = String(counting.from_year);
  return {
    window: `from ${from} to its latest listing publication`,
    began_after: 'began after its latest listing publication: nothing counted',
    full_amount: `${withArticle(fullAmountKinds(counting))} grant: counted in full`,
    ended_before: `ended before ${from}: ${lastYears(counting, 'its')} counted`,
    undated: 'no yearly breakdown: counted whole',
  };
}

/**
 * The headline's definition (docs/09 §12.11 rule 2): what is counted, from when, to when, and
 * what it is not. `resource` is the resource's short name ("UWPR"), whose start is the floor.
 */
export const countedDefinition = (counting: FundingCounting, resource: string): string =>
  `The funding of the grants listed on these publications, from ${String(counting.from_year)}, when ${resource} began, through the year of the latest publication listing each grant. Not money spent on this work.`;

/**
 * The part of a counted total that is an estimate: "$418,540,466 of it is estimated: other
 * funders’ awards spread evenly over their years." Null when none is, so no line is shown.
 */
export const estimatedLine = (estimatedUsd: number): string | null =>
  estimatedUsd === 0
    ? null
    : `${formatUsd(estimatedUsd)} of it is estimated: other funders’ awards spread evenly over their years.`;

/**
 * The page's lead: what Funding impact shows and what its totals count. Without funding data
 * there is no rule to state, and the lead says only what the page is for.
 */
export function fundingLead(counting: FundingCounting | null, resource: string): string {
  const grants = 'The grants the publications here list as their funding';
  if (counting === null) {
    return `${grants}, and how much of each grant’s funding the totals count: not money spent on the work that lists it.`;
  }
  return `${grants}. The totals count each grant’s funding from ${String(counting.from_year)}, when ${resource} began, through the year of the latest publication listing it: not money spent on the work that lists it.`;
}

/** The order the rules are told in: the common case first, the zero last. */
const RULES_IN_WORDS: readonly CountedRule[] = [
  'window',
  'full_amount',
  'ended_before',
  'undated',
  'began_after',
];

/**
 * How the grants with a known amount are counted, rule by rule, in one sentence, and how many
 * of their amounts are estimates: the coverage's line on Funding impact, over the grants in view.
 * `rules` is `countedRules`'s count per rule, whose sum is the grants with a known amount.
 */
export function countedRulesSentence(
  rules: Partial<Record<CountedRule, number>>,
  estimated: number,
  counting: FundingCounting,
): string {
  const known = Object.values(rules).reduce((sum, count) => sum + count, 0);
  if (known === 0) return 'No grant listed has a known amount, so none is counted.';
  const from = String(counting.from_year);
  const kinds = fullAmountKinds(counting);
  /** What a rule does to the grants it counts, after their count: "are counted from 2006…". */
  const phrase = (rule: CountedRule, one: boolean): string => {
    switch (rule) {
      case 'window':
        return `${one ? 'is' : 'are'} counted from ${from} through the year of the latest publication listing ${one ? 'it' : 'each'}`;
      case 'full_amount':
        return `${one ? `is ${withArticle(kinds)} grant` : `are ${kinds} grants`}, counted in full`;
      case 'ended_before':
        return `ended before ${from} and ${one ? 'counts' : 'count'} ${lastYears(counting, one ? 'its' : 'their')}`;
      case 'undated':
        return `${one ? 'has' : 'have'} no yearly breakdown and ${one ? 'counts' : 'count'} whole`;
      case 'began_after':
        return `began after the latest publication listing ${one ? 'it and counts' : 'them and count'} nothing`;
    }
  };
  const spread = 'other funders’ awards spread evenly over their years.';
  const counted = RULES_IN_WORDS.filter((rule) => (rules[rule] ?? 0) > 0);
  if (known === 1) {
    const [rule] = counted as [CountedRule];
    const estimate = estimated === 0 ? '' : ` Its amount is an estimate: ${spread}`;
    return `The one grant with a known amount ${phrase(rule, true)}.${estimate}`;
  }
  const parts = counted.map((rule) => {
    const count = rules[rule] ?? 0;
    return `${formatCount(count)} ${phrase(rule, count === 1)}`;
  });
  const estimates =
    estimated === 0
      ? ''
      : ` ${formatCount(estimated)} of these amounts ${estimated === 1 ? 'is an estimate' : 'are estimates'}: ${spread}`;
  return `Of the ${pluralize(known, 'grant')} with a known amount, ${parts.join('; ')}.${estimates}`;
}

/* ------------------------------------------------------------------------------------------------
 * One grant's counted amount (docs/09 F17), as its own page and a publication's Funding section
 * say it: over every publication listing it, so the export's `counted_usd`, whatever the filter.
 * --------------------------------------------------------------------------------------------- */

/** The label a grant's counted amount goes by, on its page and in a publication's section. */
export const COUNTED_FACT_LABEL = 'Counted in the totals';

/** A year as a grant's breakdown names it: "FY2011" for NIH's fiscal years, "2011" otherwise. */
const yearName = (year: number, fiscal: boolean): string =>
  fiscal ? `FY${String(year)}` : String(year);

/** A run of years: "FY2006–FY2011" for NIH's fiscal years, "2016–2019" for calendar ones. */
export const yearRun = (first: number, last: number, fiscal: boolean): string =>
  first === last ? yearName(first, fiscal) : `${yearName(first, fiscal)}–${yearName(last, fiscal)}`;

/** What the grant page knows of a grant with a known amount, to say why it counts what it does. */
export interface CountedFactParts {
  /** The counted amount: known, a safe integer. */
  usd: number;
  rule: CountedRule;
  category: Grant['category'];
  /** The first and last years of its yearly breakdown, fiscal or spread; null with none. */
  breakdown: { first: number; last: number } | null;
  /** The first and last of the years its counted amount adds up (`countedYears`); null for none. */
  counted: { first: number; last: number } | null;
  /** The year of the latest publication listing it, over every publication. */
  lastListed: number;
  /** Its years are NIH's fiscal years, not the calendar years of an even spread. */
  fiscal: boolean;
}

/**
 * A grant's counted amount and why, in a clause, as its page states it (docs/09 F17): "$87,011,296
 * for FY2006–FY2011, its fiscal years from 2006, when UWPR began, through 2012, the year of the
 * latest publication listing it". An ended grant is phrased by its last year of funding, since
 * the "End year" beside it can be later; a grant that began too late says when it began, so its
 * $0 says why. The years, the kinds counted in full and the count of years are the export's.
 */
export function countedFact(
  parts: CountedFactParts,
  counting: FundingCounting,
  resource: string,
): string {
  const from = String(counting.from_year);
  const amount = formatUsd(parts.usd);
  const latest = `${String(parts.lastListed)}, the year of the latest publication listing it`;
  const run = (first: number, last: number) => yearRun(first, last, parts.fiscal);
  const { breakdown } = parts;
  switch (parts.rule) {
    case 'window':
      return parts.counted === null
        ? `${amount}: none of its years falls from ${from}, when ${resource} began, through ${latest}`
        : `${amount} for ${run(parts.counted.first, parts.counted.last)}, its ${parts.fiscal ? 'fiscal ' : ''}years from ${from}, when ${resource} began, through ${latest}`;
    case 'ended_before': {
      if (breakdown === null) return `${amount}, ${countedRuleText(counting).ended_before}`;
      const n = counting.last_years;
      const counted =
        n === 1
          ? `its last year, ${yearName(breakdown.last, parts.fiscal)}, is`
          : `its last ${countInWords(n)} years, ${run(breakdown.last - n + 1, breakdown.last)}, are`;
      return `${amount}: its funding ended in ${yearName(breakdown.last, parts.fiscal)}, before ${from}, so ${counted} counted`;
    }
    case 'began_after':
      return breakdown === null
        ? `${amount}, ${countedRuleText(counting).began_after}`
        : `${amount}: its funding began in ${yearName(breakdown.first, parts.fiscal)}, after ${latest}, so none of it is counted`;
    case 'full_amount':
      return parts.category === 'instrument'
        ? `${amount}, counted in full: an instrument is bought once and used for years`
        : `${amount}, counted in full, as every ${CATEGORY_LABELS[parts.category].toLowerCase()} grant is`;
    case 'undated':
      return `${amount}, counted whole: there is no yearly breakdown or end year to divide it by`;
  }
}

/**
 * The sentence a spread grant's counted amount carries (`isSpread`): its amount is the pipeline's
 * even spread over the award's years, "2016–2026", so what is counted of it is an estimate.
 */
export const spreadSentence = (first: number, last: number): string =>
  `Its amount is spread evenly over the award’s years, ${yearRun(first, last, false)}: an estimate.`;

/**
 * A grant's counted amount in a short line, for a publication's Funding section: "$1,000,000,
 * from 2006 to its latest listing publication", with "; an estimate…" for a spread amount. From
 * the export's `counted_usd` and `counted_rule`, over every publication listing it. Null for an
 * unknown amount, whose total already says "not known".
 */
export function countedLine(
  grant: Pick<Grant, 'counted_usd' | 'counted_rule'>,
  spread: boolean,
  counting: FundingCounting,
): string | null {
  if (grant.counted_usd === null || grant.counted_rule === null) return null;
  const estimate = spread ? '; an estimate, its amount spread evenly over its years' : '';
  return `${formatUsd(grant.counted_usd)}, ${countedRuleText(counting)[grant.counted_rule]}${estimate}`;
}
