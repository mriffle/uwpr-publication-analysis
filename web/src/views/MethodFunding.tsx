/**
 * The method page's `#funding` section (docs/09 §12.9): how the funding figures are assembled.
 *
 * It is the funding half of what the rest of `/method` does for the publications — the sources
 * and their dates, the rules and what they decided, what a figure means and what it leaves out —
 * and it holds the definitions the Funding impact view's figures link to, each at its
 * `FUNDING_DEFINITION_IDS` anchor, kept apart from the publication definitions (docs/09 W6).
 *
 * **Every count is the export's.** What became of the numbers the publications give as funding
 * comes from the pipeline's `method` block, which only the pipeline can count; everything about
 * the grants themselves is counted from the grants listed by the scope the Funding impact view
 * draws (`method/funding.ts`). No figure is written into a string.
 *
 * **The register is docs/09 §12.11's**, and a test holds the section to it: nothing here says the
 * resource had a part in any grant — a grant is one a publication lists, and the section says
 * that before anything else — a total is what an award is worth and not money spent on this
 * work, an unknown amount is never $0, and the resource's own award identifier is evidence and
 * never a grant.
 *
 * **Two sources' terms are met here** (docs/09 §13.3, re-read by B10). NLM asks for "Courtesy of
 * the U.S. National Library of Medicine", clearly shown where its data is used, and for a
 * statement that the data may not be its most current, which the date it was read supplies;
 * `NlmAttribution` words it, here and on every funding page (R1a). The
 * OECD's licence asks for changes to be indicated, and its rates are stored inverted, so the
 * currency paragraph says they are.
 *
 * With no funding data the section says so in a sentence and states nothing else (§12.10).
 */
import type { ReactNode } from 'react';
import { NlmAttribution } from '../components/NlmAttribution';
import type { ExportDocument, FundingSource } from '../contract/types';
import { formatDate } from '../format/date';
import { formatCount, formatUsd, pluralize } from '../format/number';
import { fundingDefinitions, type MetricDefinition } from '../method/definitions';
import {
  fundingMethodFacts,
  sourceById,
  type AmountBasis,
  type FundingMethodFacts,
} from '../method/funding';

/** The section's anchor, which the Funding impact view and the definitions list link to. */
export const FUNDING_SECTION_ID = 'funding';

/** The anchor of the funding definitions, inside the section. */
export const FUNDING_DEFINITIONS_ID = 'funding-definitions';

/** What each source is read for, by its contract id (docs/09 §11.3). */
const SOURCE_ROLES: Readonly<Record<FundingSource['id'], string>> = {
  reporter:
    'NIH’s record of its grants: each grant’s award actions, fiscal year by fiscal year, and the grants NIH itself links to each publication.',
  nsf: 'NSF’s record of its awards and what they are worth.',
  usaspending:
    'The US government’s record of federal awards, for the amounts of other US federal agencies’ grants.',
  openalex:
    'Each publication’s funders and grant numbers as OpenAlex records them, and the amounts of awards that no agency’s own record here covers.',
  pubmed: 'The grant numbers PubMed records for each publication.',
  crossref: 'The funders and award numbers publishers deposit with each publication’s DOI.',
  pmc: 'The funding statements in each publication’s full text, where PubMed Central holds it.',
};

/** The names a source goes by when the export does not list it: a fallback, never a claim. */
const SOURCE_NAMES: Readonly<Record<FundingSource['id'], string>> = {
  reporter: 'NIH RePORTER',
  nsf: 'NSF Award API',
  usaspending: 'USAspending',
  openalex: 'OpenAlex',
  pubmed: 'PubMed',
  crossref: 'Crossref',
  pmc: 'PubMed Central',
};

const nameOf = (facts: FundingMethodFacts, id: FundingSource['id']): string =>
  sourceById(facts, id)?.name ?? SOURCE_NAMES[id];

/**
 * What a total means, source by source (docs/09 §7.1). Each family is the bases of one source,
 * and is shown only when some grant listed takes its amount from it.
 */
const AMOUNT_FAMILIES: {
  source: FundingSource['id'];
  bases: readonly AmountBasis[];
  meaning: (facts: FundingMethodFacts) => ReactNode;
}[] = [
  {
    source: 'reporter',
    bases: ['reporter_fiscal_years', 'reporter_contract', 'reporter_task_order'],
    meaning: () => (
      <>
        The sum, over every fiscal year it holds, of the grant’s award actions — each one’s total
        cost, direct and indirect — whether it is a new award, a renewal, a continuation or a
        supplement: each is a row of the same grant, and all of them count. A grant made up of
        several projects also has a row for each sub-project, whose cost is already inside its
        parent row’s, so the sub-project rows are left out: adding them would count the same money
        twice. A contract is the sum of its line items, and a task order under a larger contract is
        a grant of its own, whose total is that task order’s alone.
      </>
    ),
  },
  {
    source: 'nsf',
    bases: ['nsf_obligated', 'nsf_estimated'],
    meaning: () => (
      <>
        For an award that has ended, what NSF obligated to it. For one still active, the larger of
        its estimated total and what is obligated so far.
      </>
    ),
  },
  {
    source: 'usaspending',
    bases: ['usaspending_obligation'],
    meaning: (facts) => {
      const from = sourceById(facts, 'usaspending')?.amounts_from ?? null;
      return (
        <>
          The award’s total obligation, for the grants of other US federal agencies.
          {from === null ? null : (
            <>
              {' '}
              Its records begin in fiscal year {String(from)}, so an award that started earlier may
              be missing obligations. {startedEarlier(facts.startsBeforeFy2008, from)}
            </>
          )}
        </>
      );
    },
  },
  {
    source: 'openalex',
    bases: ['openalex_amount'],
    meaning: () => (
      <>
        The amount OpenAlex records for the award, in the currency it gives, for funders that no
        agency’s own record here covers. Where an agency’s record has the grant as well, the
        agency’s figure is the one used.
      </>
    ),
  },
];

/**
 * How many grants a source's first year cuts short, and the tag each carries: "1 grant here
 * started before then, and is tagged “amounts from FY1985”." None says so, rather than "0".
 */
function startedEarlier(count: number, from: number): string {
  const tag = `“amounts from FY${String(from)}”`;
  if (count === 0) return 'None here started before then.';
  return `${pluralize(count, 'grant')} here started before then, and ${count === 1 ? 'is' : 'are'} tagged ${tag}.`;
}

/** "was" or "were", by a count. */
const was = (count: number): string => (count === 1 ? 'was' : 'were');

/** "A, B and C". */
function inWords(items: readonly ReactNode[]): ReactNode {
  return items.map((item, index) => (
    <span key={index}>
      {index === 0 ? null : index === items.length - 1 ? ' and ' : ', '}
      {item}
    </span>
  ));
}

/** "6 awards, worth $135,503,058 in all" — with an unknown value never given a figure. */
function institutionWideWorth(facts: FundingMethodFacts): string {
  const { grants, withAmount, withoutAmount, amountUsd } = facts.institutionWide;
  const awards = pluralize(grants, 'institution-wide award');
  if (grants === 0) return 'no institution-wide awards';
  if (withAmount === 0) return `${awards}, none with a known amount`;
  if (withoutAmount === 0) return `${awards}, worth ${formatUsd(amountUsd)} in all`;
  return `${awards}, worth ${formatUsd(amountUsd)} for the ${formatCount(withAmount)} with a known amount, and ${formatCount(withoutAmount)} with none known`;
}

function Definitions({ definitions }: { definitions: readonly MetricDefinition[] }) {
  return (
    <dl className="definition-list">
      {definitions.map((definition) => (
        <div className="definition" key={definition.id} id={definition.id} tabIndex={-1}>
          <dt>
            {definition.term}
            {definition.value === undefined ? null : (
              <>
                {' '}
                <span className="definition-value">{definition.value}</span>
              </>
            )}
          </dt>
          <dd>{definition.definition}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface FundingMethodSectionProps {
  doc: ExportDocument;
}

export function FundingMethodSection({ doc }: FundingMethodSectionProps) {
  const facts = fundingMethodFacts(doc);
  const heading = <h2 id={FUNDING_SECTION_ID}>How the funding figures are assembled</h2>;

  if (facts === null) {
    return (
      <section className="method-funding" aria-labelledby={FUNDING_SECTION_ID}>
        {heading}
        <p>This export carries no funding data, so there are no funding figures to describe.</p>
      </section>
    );
  }

  const resource = doc.resource.short_name;
  const { method, grants } = facts;
  const reporter = sourceById(facts, 'reporter');
  const families = AMOUNT_FAMILIES.map((family) => ({
    ...family,
    count: family.bases.reduce((sum, basis) => sum + (facts.byBasis.get(basis) ?? 0), 0),
  })).filter((family) => family.count > 0);

  return (
    <section className="method-funding" aria-labelledby={FUNDING_SECTION_ID}>
      {heading}
      <p>
        The funding figures are about the grants these publications list as their funding: which
        grants, from which agencies, and what each is worth. This section says how a number written
        in a publication becomes one of those grants, where each amount comes from and what it adds
        up, and what is left out.
        {facts.asOf === null ? null : (
          <>
            {' '}
            Every amount was read on or after {formatDate(facts.asOf)}, the last time the funding
            data was read in full.
          </>
        )}
      </p>
      <p>
        <strong>
          A grant here is one a publication lists, and nothing more is claimed for it.
        </strong>{' '}
        The figures say which grants the publications that used {resource} name in their funding
        statements, and what those grants are worth. They do not say that {resource} had any part in
        a grant being awarded, and nothing in this project tests that.
      </p>

      <h3 id="funding-sources">Where the funding data comes from</h3>
      <p>
        The numbers the publications give as funding come from their metadata and their full text;
        the grants and their amounts come from the funders’ own records. Each source is dated by the
        latest day a fact from it was confirmed for this data.
      </p>
      <ul className="method-list">
        {facts.sources.map((source) => (
          <li key={source.id}>
            <strong>
              <a href={source.url}>{source.name}</a>
            </strong>
            , read on {formatDate(source.as_of)}. {SOURCE_ROLES[source.id]}
            {source.amounts_from === null ? null : (
              <> Its amounts begin in fiscal year {String(source.amounts_from)}.</>
            )}
            {source.partial_year === null ? null : (
              <>
                {' '}
                Fiscal year {String(source.partial_year)} was still in progress on that date, so its
                amounts are partial.
              </>
            )}
          </li>
        ))}
      </ul>
      <NlmAttribution sources={facts.sources} />

      <h3 id="funding-resolution">From a number in a publication to a grant</h3>
      <p>
        The publications give {pluralize(facts.strings, 'number')} as funding, each counted once for
        each publication that gives it, however many sources repeat it.
        {method.works_without_funding_metadata === 0 ? null : (
          <>
            {' '}
            {pluralize(method.works_without_funding_metadata, 'publication')} give none that any
            source here records, which is not a finding that they had no funding.
          </>
        )}{' '}
        Each number is decided by the first of these that applies, in this order:
      </p>
      <ul className="method-list">
        <li>
          <strong>
            The resource’s own award identifier, {doc.resource.identifier}:{' '}
            {formatCount(method.strings.resource_code)}.
          </strong>{' '}
          It is evidence that the publication used the resource, one of the four criteria above, and
          never a grant: it is not counted as funding, not kept as an unmatched number, and not
          shown as a grant anywhere.
        </li>
        <li>
          <strong>Not a grant: {formatCount(method.strings.not_a_grant)}.</strong> Strings that are
          positively not a grant number — an antibody or reagent name, a research resource
          identifier, a programme or mechanism named without a number, a funder’s registry
          identifier, a fragment. They are left out and counted nowhere else.
        </li>
        <li>
          <strong>A facility contract: {formatCount(method.strings.facility_contract)}.</strong> The
          operating contract of a national laboratory, cited for the use of a facility there. It
          pays for the laboratory rather than for a project, so it is left out.
        </li>
        <li>
          <strong>Matched to a grant: {formatCount(method.strings.grant)}.</strong> A grant counts
          once however many publications list it, and once however many ways they write it.
        </li>
        <li>
          <strong>Matched by no funder’s record: {formatCount(method.strings.unresolved)}.</strong>{' '}
          Kept as written, under Miscellaneous (below).
        </li>
      </ul>
      <p>
        How a number reached its grant, counted the same way: {formatCount(method.resolution.exact)}{' '}
        matched a funder’s record exactly as written, once case, spacing, separators and labels are
        set aside; {formatCount(method.resolution.normalised)} matched after a fix to how the number
        was written — an O or I for a 0 or 1, split digits, a missing zero, a serial number written
        alone; {formatCount(method.resolution.corrected)} {was(method.resolution.corrected)}{' '}
        corrected to a near-miss that the funder’s own records link to the same publication; and{' '}
        {formatCount(method.resolution.override)} {was(method.resolution.override)} decided by an
        override, a decision recorded by hand for that publication and that number, with its reason.
        A number from any other agency stands as that agency writes it. {nameOf(facts, 'reporter')}{' '}
        also links grants to publications itself, and a grant reached only that way is listed too.
        Wherever a number was corrected, what the publication wrote is kept beside the grant it
        became.
      </p>
      <p>
        <strong>Investigators and organisations are counted partly by name.</strong> They are named
        as the funders publish them, and nothing here links a person to any profile.{' '}
        {nameOf(facts, 'reporter')} gives each investigator an identifier and the other sources give
        only a name, so an investigator is told apart by identifier where there is one and by name
        otherwise, and an organisation by name alone. One person written two ways, or once with an
        identifier and once without, counts twice; two people of the same name without an identifier
        count once. Neither count is exact: each can be too high or too low.
      </p>

      <h3 id="funding-amounts">What a grant’s total means</h3>
      <p>
        A grant’s total is its lifetime award total as its funder records it, on the date its record
        was last confirmed. It is what the award is worth, not money spent on this work: a total is
        the whole award’s, not the part of it spent on the research these publications report. A
        grant still active has a total that still grows. What a total adds up depends on where it
        comes from:
      </p>
      <ul className="method-list">
        {families.map((family) => (
          <li key={family.source}>
            <strong>
              {nameOf(facts, family.source)}, {pluralize(family.count, 'grant')}.
            </strong>{' '}
            {family.meaning(facts)}
          </li>
        ))}
      </ul>
      <p>
        {grants.withoutAmount === 0 ? (
          'Every grant listed has a known amount in US dollars.'
        ) : (
          <>
            {pluralize(grants.withoutAmount, 'grant')} listed{' '}
            {grants.withoutAmount === 1 ? 'has' : 'have'} no known amount in US dollars: no source
            read here reports one, or it is in a currency no rate here covers.
          </>
        )}{' '}
        A grant with no known amount is counted beside every total, and never in it as $0.
      </p>

      <h3 id="funding-currency">Amounts in other currencies</h3>
      <p>
        An amount awarded in another currency is converted to US dollars at the annual average rate
        for the year the award started
        {facts.exchangeRates.length === 0 ? null : (
          <>
            , from{' '}
            {inWords(
              facts.exchangeRates.map((rates) => (
                <>
                  <a href={rates.url}>{rates.name}</a> (
                  {pluralize(rates.currencies.length, 'currency', 'currencies')}, through{' '}
                  {String(rates.through_year)})
                </>
              )),
            )}
          </>
        )}
        . A start year the rates do not reach takes the nearest year they have, and an award whose
        source gives no start year takes the grant’s first year, marked as an estimated rate year.{' '}
        <strong>
          The rates are published as units of each currency per US dollar, for all but a few
          currencies; the rates used here are those figures inverted, to US dollars per unit, and
          rounded to ten significant digits.
        </strong>{' '}
        That is a change made here to the data as published.
      </p>
      <p>
        {facts.converted === 0
          ? 'No amount listed is converted.'
          : `${pluralize(facts.converted, 'amount')} listed ${facts.converted === 1 ? 'is' : 'are'} converted${
              facts.rateYearEstimated === 0
                ? ''
                : `, ${formatCount(facts.rateYearEstimated)} with the rate year estimated`
            }.`}{' '}
        A converted amount shows its original and the rate’s year wherever it appears.{' '}
        {grants.unconverted === 0
          ? 'No grant listed is in a currency these rates do not cover.'
          : `${pluralize(grants.unconverted, 'grant')} listed ${grants.unconverted === 1 ? 'is' : 'are'} in a currency these rates do not cover: shown in that currency, and left out of every total in US dollars.`}
      </p>

      <h3 id="funding-years">Fiscal years, partial years and the first year</h3>
      <ul className="method-list">
        <li>
          <strong>Fiscal years</strong> are NIH’s and the US government’s: 1 October to 30
          September, named by the year they end.
          {reporter === undefined || reporter.partial_year === null ? null : (
            <>
              {' '}
              On {formatDate(reporter.as_of)}, fiscal year {String(reporter.partial_year)} was in
              progress, so its amounts are partial, and are marked as partial wherever a grant’s
              years are shown.
            </>
          )}
        </li>
        {reporter === undefined || reporter.amounts_from === null ? null : (
          <li>
            <strong>
              {reporter.name}’s amounts begin in fiscal year {String(reporter.amounts_from)}.
            </strong>{' '}
            It holds nothing earlier, so a grant already running then is short of its earlier years.{' '}
            {startedEarlier(grants.startsBeforeFy1985, reporter.amounts_from)}
          </li>
        )}
        <li>
          <strong>Active grants: {formatCount(grants.active)}.</strong> Each ends after the date its
          record was read, or has an award in the fiscal year in progress. Its total still grows,
          and it is tagged “active”.
        </li>
        <li>
          <strong>The first year.</strong> Over time, each grant enters once, with its whole
          lifetime total, in its first year: the publication year of the earliest publication here
          that lists it, or under a filter the earliest one the filter shows. It is a publication
          year, not the year of the award, so the value over time shows when grants first appear on
          these publications, not when they were awarded or spent.
        </li>
        {doc.period.current_year_partial ? (
          <li>
            <strong>{String(doc.period.last_year)} is a partial publication year</strong> here too,
            so the grants first listed in it are those listed so far.
          </li>
        ) : null}
      </ul>

      <h3 id="funding-institution-wide-awards">Institution-wide awards</h3>
      <p>
        The grants listed include {institutionWideWorth(facts)}. Such an award is made to an
        institution or a consortium to run a programme for many unrelated projects — a fellowship
        programme, a national institute, a consortium-wide total — and what it is worth bears no
        relation to one research project. Each is tagged from an explicit list, with its reason, and
        never inferred from its size; an NIH centre grant is not one, and is counted with the
        project grants as a centre or programme.{' '}
        <strong>Institution-wide awards are included in every total by default</strong>, as they are
        in the definitions below. A reader may exclude them, and every total says which position it
        is in; a grant the reader selects is shown whatever that position is.
      </p>

      <h3 id="funding-miscellaneous">Miscellaneous: numbers nothing matched</h3>
      <p>
        A number that no funder’s record matches is kept as the publication wrote it, under
        Miscellaneous: {pluralize(facts.miscellaneous.grants, 'distinct number')}, on{' '}
        {pluralize(facts.miscellaneous.publications, 'publication')}. It has no agency, kind or
        amount, because none is known, so it is not counted as a grant listed, an agency or a
        dollar. It is counted beside those figures instead, and listed with the grants so that a
        reader looking for a number a publication wrote still finds it. Miscellaneous is where these
        numbers are kept, not an agency.
      </p>

      <h3 id={FUNDING_DEFINITIONS_ID}>What each funding figure means</h3>
      <p>
        The exact definition of each funding figure, with its value over the whole corpus:
        unfiltered, and with institution-wide awards included, as the pipeline computes its own
        summary of them. The same figures beside the funding charts respond to the filter; these do
        not.
      </p>
      <Definitions definitions={fundingDefinitions(doc)} />
    </section>
  );
}
