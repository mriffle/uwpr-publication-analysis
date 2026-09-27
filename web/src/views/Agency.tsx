/**
 * `/funding/agency/<code>` — one funding agency across the whole corpus (docs/09 §12.6).
 *
 * In order: the way back, the agency's name as the one `h1`, its facts (parent, country), the two
 * ways into a view with this agency added to the reader's filter, its figures, a breakdown by
 * the agencies within it, its grants' value over time, its grants, and its publications.
 *
 * **Whole corpus, and it says so.** Like a publication, an agency is a fact about the data, not
 * about the reader's selection, so every figure here is over every publication and states that it
 * is "not affected by the filter". The query string is kept only for the ways out: the parent
 * link a cold reader gets, and the two links that add this agency to the filter the reader had.
 * Institution-wide awards are included, and the figures say how many (§12.11 rule 4).
 *
 * **Miscellaneous is a page too**, found by its `group` and never by a code (§11.5). It is not an
 * agency: it holds the numbers no funder's record matched, which have no agency, title or amount.
 * So its page states that and counts them, lists them as the paper wrote them, and draws no
 * figure a grant would have.
 *
 * The honesty rules hold as on the Funding impact view (§12.11): no wording of credit or cause; a
 * total carries its definition and date; unknown is never $0; a grant is counted once; names are
 * as the funder publishes them, with no link to a person. At its foot, NLM's attribution when
 * PubMed is a source (§13.3, `NlmAttribution`).
 *
 * Built behind `VITE_FUNDING` (`contract/config.ts`). An unknown code, or an export with no
 * funding data (§12.10), is the designed not-found state.
 */
import { useEffect, useMemo, useRef } from 'react';
import {
  agencyDetail,
  agencyLabel,
  knownAmount,
  type AgencyDetail,
  type AgencyShare,
} from '../aggregate/funding';
import { ChartCard } from '../charts/ChartCard';
import { FundingOverTimeChart, FundingOverTimeTable } from '../charts/FundingOverTimeChart';
import { ResponsiveChart } from '../charts/ResponsiveChart';
import { BackLink, useCloseOnEscape } from '../components/BackLink';
import { EntityNotFound } from '../components/EntityNotFound';
import { EntityPublications } from '../components/EntityPublications';
import { FundingFigures } from '../components/FundingFigures';
import { AgencyLink, InAppLink, type FundingLinks } from '../components/FundingLinks';
import { GrantsTable } from '../components/GrantsTable';
import { NlmAttribution } from '../components/NlmAttribution';
import type { SiteView, ViewSwitch } from '../components/SiteHeader';
import { fundingOf, type FundingIndex } from '../contract/funding';
import type { Agency as AgencyRecord, ExportDocument, Work } from '../contract/types';
import { countryName } from '../format/country';
import { formatCount, formatUsd, pluralize } from '../format/number';
import { BACK_LABELS } from '../routing/navigation';

export interface AgencyProps {
  doc: ExportDocument;
  /** The agency's code, from the address. `key` itself is React's, so it is not a prop name. */
  agencyKey: string;
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
  /**
   * The two views with this agency added to the reader's filter (§12.6): "Filter the
   * publications by this agency" and "See funding impact for this agency".
   */
  withAgency: ViewSwitch;
  /** The method page, whose definitions the figures link to. */
  methodHref: string;
}

export function Agency({
  doc,
  agencyKey,
  onClose,
  backLabel = BACK_LABELS.funding,
  fundingHref,
  ...rest
}: AgencyProps) {
  const index = fundingOf(doc);
  const detail = useMemo(
    () => agencyDetail(agencyKey, doc.works, index, doc.period),
    [agencyKey, doc.works, doc.period, index],
  );

  if (index === null || detail === null) {
    return (
      <EntityNotFound
        doc={doc}
        entity="agency"
        entityKey={agencyKey}
        onClose={onClose}
        fundingHref={fundingHref}
        backLabel={backLabel}
      />
    );
  }
  return (
    <AgencyPage
      doc={doc}
      index={index}
      detail={detail}
      onClose={onClose}
      backLabel={backLabel}
      fundingHref={fundingHref}
      {...rest}
    />
  );
}

interface AgencyPageProps extends Omit<AgencyProps, 'agencyKey' | 'backLabel' | 'onClose'> {
  index: FundingIndex;
  detail: AgencyDetail;
  onClose: (() => void) | undefined;
  backLabel: string;
}

/** docs/09 §11.5's groups, as a reader reads them. */
const GROUP_LABELS: Readonly<Record<AgencyRecord['group'], string>> = {
  us_federal: 'US federal',
  us_nonfederal: 'US, not federal',
  non_us: 'Outside the US',
  miscellaneous: 'Not an agency',
};

/** "uwpr-grants-nih-2026-09-26.csv": the view's name for the file, with the agency in it. */
const csvName = (doc: ExportDocument, code: string): string =>
  `${doc.resource.short_name.toLowerCase()}-grants-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${doc.generated_at.slice(0, 10)}.csv`;

function AgencyPage({
  doc,
  index,
  detail,
  onClose,
  backLabel,
  fundingHref,
  links,
  publicationHref,
  onOpenPublication,
  withAgency,
  methodHref,
}: AgencyPageProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const { agency } = detail;

  // docs/06 §9: the page replaces another, so focus goes to its heading — again whenever the
  // reader moves from one agency to another, the page staying mounted.
  useEffect(() => {
    headingRef.current?.focus();
  }, [agency.code]);

  useCloseOnEscape(onClose);

  const label = agencyLabel(index, agency.code);
  const parent = agency.parent === null ? null : (index.agencies.get(agency.parent) ?? null);
  const open = (view: SiteView) => () => {
    withAgency.onSwitch(view);
  };

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
        {agency.name}
      </h1>

      {detail.miscellaneous ? (
        <p className="detail-identity">
          Not a funding agency: where the numbers no funder’s record matched are kept
        </p>
      ) : (
        <>
          <p className="detail-identity">
            Funding agency
            {agency.short_name === null || agency.short_name === agency.name
              ? ''
              : ` · ${agency.short_name}`}
          </p>
          <dl className="funding-facts entity-facts">
            <div>
              <dt>Part of</dt>
              <dd>
                {parent === null ? (
                  'No larger agency: it is the top of its chain'
                ) : (
                  <AgencyLink links={links} code={parent.code}>
                    {parent.name}
                  </AgencyLink>
                )}
              </dd>
            </div>
            <div>
              <dt>Country</dt>
              <dd>{agency.country === null ? 'Not recorded' : countryName(agency.country)}</dd>
            </div>
            <div>
              <dt>Kind</dt>
              <dd>{GROUP_LABELS[agency.group]}</dd>
            </div>
          </dl>
        </>
      )}

      <p className="entity-ways">
        <InAppLink href={withAgency.hrefs.publications} onOpen={open('publications')}>
          {detail.miscellaneous
            ? 'Filter the publications to those giving an unmatched number'
            : 'Filter the publications by this agency'}
        </InAppLink>
        <InAppLink href={withAgency.hrefs.funding} onOpen={open('funding')}>
          {detail.miscellaneous
            ? 'See funding impact for the unmatched numbers'
            : 'See funding impact for this agency'}
        </InAppLink>
      </p>

      {detail.miscellaneous ? (
        <Unmatched doc={doc} detail={detail} links={links} />
      ) : (
        <AgencyBody doc={doc} detail={detail} label={label} links={links} methodHref={methodHref} />
      )}

      <EntityPublications
        heading={
          detail.miscellaneous
            ? 'Publications giving an unmatched number'
            : 'Publications listing its grants'
        }
        entries={detail.publications.map((work) => ({ work }))}
        publicationHref={publicationHref}
        onOpenPublication={onOpenPublication}
      />

      <NlmAttribution sources={index.funding.sources} />
    </main>
  );
}

/** The figures, the breakdown, value over time and the grants of an agency that is one. */
function AgencyBody({
  doc,
  detail,
  label,
  links,
  methodHref,
}: {
  doc: ExportDocument;
  detail: AgencyDetail;
  label: string;
  links: FundingLinks;
  methodHref: string;
}) {
  const { figures, overTime } = detail;
  const breakdown = detail.children.length > 0 || detail.unassigned !== null;

  return (
    <>
      <h2>Figures across every publication</h2>
      <p className="chart-card-description">
        Over every publication here, so these figures are not affected by the filter. They include
        institution-wide awards, and count each grant once, however many publications list it.
      </p>
      <FundingFigures scope={detail.scope} corpus definitionHref={(id) => `${methodHref}#${id}`} />

      {breakdown ? (
        <>
          <h2>By the agencies within it</h2>
          <Breakdown detail={detail} label={label} links={links} />
        </>
      ) : null}

      <h2>Grant funding over time</h2>
      {figures.withAmount === 0 ? (
        <p className="chart-card-description">
          None of its grants listed has a known amount, so there is no value to draw over time. That
          is what the sources record, not a finding that the grants are worth nothing.
        </p>
      ) : (
        <ChartCard
          title="Grant funding over time"
          description={`The known value of ${label}’s grants first listed in each year, over every publication, with the running total as a line on the right-hand axis. The bars are not filters.`}
          note={
            <>
              Each grant’s full lifetime total enters in the year of the first publication that
              lists it; this is a publication year, not an award year.{' '}
              {figures.withoutAmount === 0
                ? 'Every grant listed has a known amount.'
                : `${pluralize(figures.withoutAmount, 'grant')} with no known amount ${figures.withoutAmount === 1 ? 'is' : 'are'} not in this chart.`}
            </>
          }
          chart={
            <ResponsiveChart height={300}>
              {({ width, height }) => (
                <FundingOverTimeChart over={overTime} width={width} height={height} />
              )}
            </ResponsiveChart>
          }
          table={<FundingOverTimeTable over={overTime} />}
        />
      )}

      <h2>Grants</h2>
      <GrantsTable
        scope={detail.scope}
        links={links}
        csvFilename={csvName(doc, detail.agency.code)}
        caption={`Every grant of ${label} listed on a publication here, whatever the filter`}
      />
    </>
  );
}

/** A known total as a cell: the sum, or "not known" — never $0 (§12.11 rule 3). */
const totalCell = (share: AgencyShare): string => {
  const known = knownAmount(share);
  return known === null ? 'not known' : formatUsd(known);
};

/** The grants by the agency within it that awarded them, with the remainder that none did. */
function Breakdown({
  detail,
  label,
  links,
}: {
  detail: AgencyDetail;
  label: string;
  links: FundingLinks;
}) {
  const rows: { share: AgencyShare; own: boolean }[] = [
    ...detail.children.map((share) => ({ share, own: false })),
    ...(detail.unassigned === null ? [] : [{ share: detail.unassigned, own: true }]),
  ];
  return (
    <div className="table-scroll">
      <table className="chart-table funding-table">
        <caption>
          {label}’s grants by the agency within it that awards them, largest known total first, over
          every publication. A grant is counted once, under its own agency. A known total leaves out
          the grants with no amount, which are counted beside it, never as $0.
        </caption>
        <thead>
          <tr>
            <th scope="col">Agency</th>
            <th scope="col" className="numeric">
              Grants
            </th>
            <th scope="col" className="numeric">
              Known total
            </th>
            <th scope="col" className="numeric">
              Without an amount
            </th>
            <th scope="col" className="numeric">
              Publications
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ share, own }) => (
            <tr key={own ? '' : share.code} className={own ? 'funding-table-apart' : undefined}>
              <th scope="row">
                {own ? (
                  'Assigned to no institute'
                ) : (
                  <AgencyLink links={links} code={share.code}>
                    {share.label}
                  </AgencyLink>
                )}
              </th>
              <td className="numeric">{formatCount(share.grants)}</td>
              <td className="numeric">{totalCell(share)}</td>
              <td className="numeric">{formatCount(share.withoutAmount)}</td>
              <td className="numeric">{formatCount(share.publications)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Miscellaneous: the unmatched numbers, counted and listed, with no figure a grant would have. */
function Unmatched({
  doc,
  detail,
  links,
}: {
  doc: ExportDocument;
  detail: AgencyDetail;
  links: FundingLinks;
}) {
  const figures = detail.figures;
  return (
    <>
      <p>
        These are numbers the publications give as funding that no funder’s record matched. They
        have no agency, title or amount, are not counted as grants in any figure, and are shown as
        the paper wrote them. Over every publication here, whatever the filter:
      </p>
      <ul className="figure-grid" aria-label="Unmatched numbers">
        <li>
          <span className="figure-value">{formatCount(figures.miscellaneous)}</span>
          <span className="figure-label">Unmatched numbers</span>
        </li>
        <li>
          <span className="figure-value">
            {formatCount(detail.publications.length)} of {formatCount(detail.scope.publications)}
          </span>
          <span className="figure-label">Publications giving one</span>
        </li>
      </ul>

      <h2>Unmatched numbers</h2>
      <GrantsTable
        scope={detail.scope}
        links={links}
        csvFilename={csvName(doc, detail.agency.code)}
        caption="Every unmatched number given on a publication here, whatever the filter"
      />
    </>
  );
}
