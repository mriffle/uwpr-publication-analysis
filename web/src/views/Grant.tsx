/**
 * `/funding/grant/<key>` — one grant (docs/09 §12.7): its facts, its amount and where it came
 * from, its amount by fiscal year, and the publications that list it.
 *
 * - **The `h1` is the title, or the number when there is none**, and an identity line gives the
 *   agency (an in-app link) and the number.
 * - **The facts** state the lifetime total with its source, what that source adds up and the date
 *   it was read; the original currency and the rate's year; where the source's amounts begin
 *   (FY1985 for NIH RePORTER); "active — the total still grows"; the principal investigators as
 *   the funder publishes them, with no link to any person; the organisation; the years; the type;
 *   and the scope, with the reason an award is institution-wide.
 * - **The amount by fiscal year**, static, "Fiscal year (October to September)", the fiscal year in
 *   progress marked, and a year whose source reports no amount shown as "no amount reported".
 * - **The publications listing it**, each with what the paper wrote wherever its listing carries
 *   `cited_as` ("also written in the paper as …"), and an override's reason, by whom and when.
 * - **The funder's own page**, labelled as the export labels it (`url_name`), whether or not the
 *   grant has an amount.
 *
 * Its words are §12.11's: unknown is never $0, a converted amount shows its original, a grant is
 * counted once and the page says so, and nothing says the resource caused or earned it. An
 * unmatched number (Miscellaneous) has a page too, which says it matched no record and shows only
 * what the papers wrote. At its foot, NLM's attribution when PubMed is a source (§13.3,
 * `NlmAttribution`).
 *
 * An unknown key, or an export with no funding data (§12.10), is the designed not-found state.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { agencyLabel, grantDetail, type GrantDetail } from '../aggregate/funding';
import { ChartCard } from '../charts/ChartCard';
import { FiscalYearChart, FiscalYearTable } from '../charts/FiscalYearChart';
import { ResponsiveChart } from '../charts/ResponsiveChart';
import { BackLink, useCloseOnEscape } from '../components/BackLink';
import { EntityNotFound } from '../components/EntityNotFound';
import { EntityPublications } from '../components/EntityPublications';
import { AgencyLink, type FundingLinks } from '../components/FundingLinks';
import { ListingNotes, otherForms } from '../components/FundingSection';
import { NlmAttribution } from '../components/NlmAttribution';
import { fundingOf, type FundingIndex } from '../contract/funding';
import type { ExportDocument, Work } from '../contract/types';
import { formatDate } from '../format/date';
import {
  AMOUNT_BASIS_TEXT,
  CATEGORY_LABELS,
  grantAmount,
  grantTags,
  grantYears,
  investigatorNames,
  originalAmount,
  unknownAmountReason,
} from '../format/funding';
import { formatCount, pluralize } from '../format/number';
import { BACK_LABELS } from '../routing/navigation';

export interface GrantProps {
  doc: ExportDocument;
  /** The grant's key, from the address. `key` itself is React's, so it is not a prop name. */
  grantKey: string;
  /** Present when the app opened this page over another, which closing returns to. */
  onClose?: () => void;
  /** The page closing returns to, in words (`routing/navigation.ts`). */
  backLabel?: string;
  /** `/funding` with the reader's query string, for a reader who arrived cold. */
  fundingHref: string;
  /** Agency and grant pages, opened in place as the Funding impact view opens them (§12.3). */
  links: FundingLinks;
  /** A publication's page, keeping the reader's query, and opening it in place. */
  publicationHref: (work: Work) => string;
  onOpenPublication?: (work: Work) => void;
}

export function Grant({
  doc,
  grantKey,
  onClose,
  backLabel = BACK_LABELS.funding,
  fundingHref,
  links,
  publicationHref,
  onOpenPublication,
}: GrantProps) {
  const index = fundingOf(doc);
  const detail = useMemo(
    () => grantDetail(grantKey, doc.works, index),
    [grantKey, doc.works, index],
  );

  if (index === null || detail === null) {
    return (
      <EntityNotFound
        doc={doc}
        entity="grant"
        entityKey={grantKey}
        onClose={onClose}
        fundingHref={fundingHref}
        backLabel={backLabel}
      />
    );
  }
  return (
    <GrantPage
      index={index}
      detail={detail}
      onClose={onClose}
      backLabel={backLabel}
      fundingHref={fundingHref}
      links={links}
      publicationHref={publicationHref}
      onOpenPublication={onOpenPublication}
    />
  );
}

interface GrantPageProps {
  index: FundingIndex;
  detail: GrantDetail;
  onClose: (() => void) | undefined;
  backLabel: string;
  fundingHref: string;
  links: FundingLinks;
  publicationHref: (work: Work) => string;
  onOpenPublication: ((work: Work) => void) | undefined;
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function GrantPage({
  index,
  detail,
  onClose,
  backLabel,
  fundingHref,
  links,
  publicationHref,
  onOpenPublication,
}: GrantPageProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const { grant } = detail;

  // docs/06 §9: focus goes to the heading of a page that replaces another, and again when the
  // reader moves from one grant to another.
  useEffect(() => {
    headingRef.current?.focus();
  }, [grant.key]);

  useCloseOnEscape(onClose);

  const parent = detail.chain.length > 1 ? (detail.chain.at(-2) ?? null) : null;
  const tags = grantTags(grant, detail.miscellaneous);

  return (
    <main className="detail entity-page">
      <div className="detail-head">
        <BackLink
          onBack={onClose}
          backLabel={backLabel}
          parentHref={fundingHref}
          parentLabel="See funding impact"
        />
      </div>

      <h1 tabIndex={-1} ref={headingRef}>
        {grant.title ?? grant.number}
      </h1>
      <p className="detail-identity">
        <AgencyLink links={links} code={grant.agency}>
          {agencyLabel(index, grant.agency)}
        </AgencyLink>
        {parent === null ? null : (
          <>
            , part of{' '}
            <AgencyLink links={links} code={parent.code}>
              {agencyLabel(index, parent.code)}
            </AgencyLink>
          </>
        )}
        {' · '}
        {grant.number}
        {tags.map((tag) => (
          <span key={tag}>
            {' '}
            <span className="badge">{tag}</span>
          </span>
        ))}
      </p>

      {detail.miscellaneous ? <p>{unmatchedSentence(detail)}</p> : <GrantFacts detail={detail} />}

      {grant.url === null || grant.url_name === null ? null : (
        <p className="entity-source">
          <a href={grant.url} rel="noreferrer">
            {grant.url_name}
          </a>
        </p>
      )}

      {detail.miscellaneous ? null : <FiscalYears detail={detail} />}

      <EntityPublications
        heading={
          detail.miscellaneous
            ? 'Publications giving this number'
            : 'Publications listing this grant'
        }
        entries={detail.listings.map(({ work, listing }) => ({
          work,
          // An unmatched number is shown as written, so only the paper's other forms are news.
          notes: detail.miscellaneous ? (
            <ListingNotes listing={otherForms(listing, grant)} unmatched />
          ) : (
            <ListingNotes listing={listing} />
          ),
        }))}
        summary={
          detail.miscellaneous
            ? undefined
            : 'The grant is counted once in every total, however many publications list it.'
        }
        publicationHref={publicationHref}
        onOpenPublication={onOpenPublication}
      />

      <NlmAttribution sources={index.funding.sources} />
    </main>
  );
}

/**
 * Why an unmatched number is unmatched, as its listings say. Most matched no funder's record. One
 * an override decided was matched, by OpenAlex, to a grant that does not fit the paper, and a
 * recorded decision kept it apart (`MISC:1780131`, docs/09 B9): "no funder's record matched" is
 * not what happened to it (R1b). The override's reason, by whom and when, is with its listing.
 */
export function unmatchedSentence(detail: Pick<GrantDetail, 'listings'>): string {
  const decided = detail.listings.filter(({ listing }) => listing.override !== undefined).length;
  const kept =
    'so it has no agency, title or amount, and it is counted in no figure as a grant. It is kept as';
  const one = detail.listings.length === 1;
  if (decided === 0) {
    return `No funder’s record matched this number, ${kept} the ${one ? 'publication' : 'publications'} below wrote it, in Miscellaneous.`;
  }
  if (decided === detail.listings.length) {
    return `A recorded decision, not a rule, kept this number unmatched, and gives its reason with the ${one ? 'publication' : 'publications'} below; ${kept} the ${one ? 'publication' : 'publications'} wrote it, in Miscellaneous.`;
  }
  return `No funder’s record matched this number, and where a publication below says so, a recorded decision kept it unmatched; ${kept} the publications wrote it, in Miscellaneous.`;
}

/** The facts list (§12.7): amount, its source and caveats, people, organisation, years, scope. */
function GrantFacts({ detail }: { detail: GrantDetail }) {
  const { grant, source } = detail;
  const amount = grantAmount(grant);
  const original = originalAmount(grant);
  const people = investigatorNames(grant);
  const years = grantYears(grant);
  const amountSource = grant.amount_source;

  // Where the source's amounts begin, for a grant older than that (§12.11 rule 6's sibling): the
  // year is the source's own (`sources[].amounts_from`), never the app's.
  const before =
    grant.flags.includes('starts_before_fy1985') || grant.flags.includes('starts_before_fy2008')
      ? (source?.amounts_from ?? (grant.flags.includes('starts_before_fy1985') ? 1985 : 2008))
      : null;

  return (
    <>
      <h2>About this grant</h2>
      <dl className="funding-facts entity-facts">
        <Fact term="Lifetime total">
          {amount === null ? (
            <>Not known: {unknownAmountReason(grant)}.</>
          ) : (
            <>
              {amount}
              {amountSource === null ? null : (
                <>
                  , {AMOUNT_BASIS_TEXT[amountSource.basis]}, read on{' '}
                  {formatDate(amountSource.as_of)}
                </>
              )}
              . It is what the award is worth, not money spent on the work that lists it.
            </>
          )}{' '}
          It is counted once, however many publications list it.
        </Fact>
        {original === null ? null : <Fact term="Original amount">{original}</Fact>}
        {before === null ? null : (
          <Fact term="Where the amounts begin">
            The grant began before fiscal year {before}, where{' '}
            {source?.name ?? amountSource?.name ?? 'its source'}’s amounts begin, so its total
            leaves out the years before it.
          </Fact>
        )}
        {grant.flags.includes('active') ? (
          <Fact term="Status">Active — the total still grows</Fact>
        ) : null}
        <Fact term="Principal investigators">
          {people === null ? 'None recorded' : `${people}, as the funder publishes them`}
        </Fact>
        <Fact term="Organisation">{grant.organization ?? 'Not recorded'}</Fact>
        <Fact term="Years">{years ?? 'Not recorded'}</Fact>
        {detail.firstYear === null ? null : (
          <Fact term="First listed">{String(detail.firstYear)}</Fact>
        )}
        <Fact term="Type">{CATEGORY_LABELS[grant.category]}</Fact>
        <Fact term="Scope">
          {grant.scope === 'institution-wide' ? (
            <>
              Institution-wide: an award to run a programme for many projects, not one research
              project{grant.scope_reason === null ? '' : ` (${grant.scope_reason})`}. The funding
              figures leave it out when institution-wide awards are excluded.
            </>
          ) : (
            'A project'
          )}
        </Fact>
      </dl>
    </>
  );
}

/** Why there is no year-by-year amount: only NIH RePORTER reports one (§11.4). */
function noYearsReason(detail: GrantDetail): string {
  const name = detail.grant.amount_source?.name;
  return name === undefined
    ? 'No source read here reports an amount for this grant, by fiscal year or in total.'
    : `${name} reports a lifetime total for this grant, not an amount for each fiscal year.`;
}

/** §12.7's per-fiscal-year chart and table, or why there is none. */
function FiscalYears({ detail }: { detail: GrantDetail }) {
  const years = detail.fiscalYears;
  const sourceName = detail.source?.name ?? detail.grant.amount_source?.name ?? 'NIH RePORTER';

  let body: ReactNode;
  if (years === null || years.length === 0) {
    body = <p className="chart-card-description">{noYearsReason(detail)}</p>;
  } else if (years.every((year) => year.amountUsd === null)) {
    // Nothing to draw: a chart of bars at nothing would read as $0 a year.
    body = (
      <>
        <p className="chart-card-description">
          {sourceName} holds {pluralize(years.length, 'fiscal year')} of this grant and reports no
          amount for any of them, so there is nothing to draw. The grant’s amount is not known; it
          is not $0.
        </p>
        <FiscalYearTable years={years} sourceName={sourceName} />
      </>
    );
  } else {
    const missing = years.filter((year) => year.amountUsd === null).length;
    const partial = years.find((year) => year.partial);
    body = (
      <ChartCard
        title="Amount by fiscal year"
        description={`What ${sourceName} records as awarded to the grant in each fiscal year it holds, October to September, each named by the year it ends in. The bars are not filters.`}
        note={
          <>
            {partial === undefined
              ? ''
              : `Fiscal year ${String(partial.year)} is still in progress, so its amount may grow. `}
            {missing === 0
              ? 'Every fiscal year shown reports an amount.'
              : `${pluralize(missing, 'fiscal year')} ${missing === 1 ? 'reports' : 'report'} no amount and ${missing === 1 ? 'is' : 'are'} drawn with no bar, which is not $0.`}{' '}
            {`The ${formatCount(years.length - missing)} with an amount add up to the lifetime total.`}
          </>
        }
        chart={
          <ResponsiveChart height={280}>
            {({ width, height }) => (
              <FiscalYearChart
                years={years}
                width={width}
                height={height}
                sourceName={sourceName}
              />
            )}
          </ResponsiveChart>
        }
        table={<FiscalYearTable years={years} sourceName={sourceName} />}
      />
    );
  }

  return (
    <>
      <h2>Amount by fiscal year</h2>
      {body}
    </>
  );
}
