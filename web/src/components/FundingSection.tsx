/**
 * "Funding listed in this publication" (docs/09 §12.8): the section of a publication's page, after
 * "Why this is a UWPR publication" and before "Other versions", that `PublicationDetail` places.
 *
 * Each grant the work lists, with its agency and number (each an in-app link, the number with the
 * funder's own page beside it, labelled as the export labels it), title, principal investigators,
 * years, and total or "amount not known". Its words are §12.11's:
 *
 * - **Whenever a listing carries `cited_as`, it says "also written in the paper as “…”"**, whatever
 *   the listing's `how` (rule 8). A corrected number is usually also written exactly by another
 *   source, so `how` is `listed` there, and tying the sentence to `how` would never show what the
 *   paper wrote (§11.2).
 * - **An override gives its reason, by whom and when**, and reads as a judgement, as an override
 *   in the evidence does (docs/06 §5).
 * - Unknown is "amount not known", never $0 (rule 3); a converted amount shows its original and
 *   rate year (rule 5); an active grant and an institution-wide award are tagged (rules 4, 6);
 *   names are as the funder publishes them, with no link to any person (rule 9).
 * - **The resource's own code is never a grant** (rule 10). When the work has R2 evidence, one
 *   sentence says the code shown above as evidence is not repeated here.
 *
 * Unmatched numbers are quoted under their own `h3`, apart from the grants: no record matched
 * them, so they have no agency, title or amount to show. **With no funding data the section is
 * not rendered at all** (§12.10) — it would otherwise read as "this paper lists no grant".
 */
import { useId } from 'react';
import { agencyLabel } from '../aggregate/funding';
import { listingsOf, type FundingIndex } from '../contract/funding';
import type { Grant, GrantListing, Resource, Work } from '../contract/types';
import { isMiscellaneous } from '../filter/funding';
import { formatDate } from '../format/date';
import {
  grantAmount,
  grantTags,
  grantYears,
  investigatorNames,
  originalAmount,
  unknownAmountReason,
} from '../format/funding';
import { AgencyLink, GrantLink, type FundingLinks } from './FundingLinks';

export interface FundingSectionProps {
  work: Work;
  /** `fundingOf(doc)`: null when the export has no funding data, and then nothing renders. */
  index: FundingIndex | null;
  /** The resource, for its own award code and name (§6.13). */
  resource: Pick<Resource, 'identifier' | 'short_name'>;
  links: FundingLinks;
}

/** “P01 HL99900” and “P01-HL99900”: the forms the paper wrote, each quoted. */
const quoted = (forms: readonly string[]): string => forms.map((form) => `“${form}”`).join(' and ');

/** How the listing reached the grant, where that is not simply the paper naming it. */
function howNote(listing: GrantListing): string | null {
  switch (listing.how) {
    case 'nih_link':
      return 'The funder’s own publication records link this grant to the publication; the funding statements read here do not name it.';
    case 'corrected':
      return 'Matched to this grant by correcting the number as the paper wrote it.';
    default:
      return null;
  }
}

/**
 * What one publication's listing says about how it reached the grant (§12.11 rule 8): what the
 * paper wrote, wherever `cited_as` is present and whatever `how` is; how an NIH link or a
 * correction reached it; and an override's reason, by whom and when, as a judgement. Shared by
 * this section and the grant page's publications, so the two never word a listing differently.
 */
export function ListingNotes({ listing }: { listing: GrantListing }) {
  const note = howNote(listing);
  const override = listing.override;
  return (
    <>
      {listing.cited_as === undefined ? null : (
        <p className="funding-cited">Also written in the paper as {quoted(listing.cited_as)}.</p>
      )}
      {note === null ? null : <p className="funding-how">{note}</p>}
      {override === undefined ? null : (
        <div className="funding-override">
          <p className="evidence-label">Matched by a recorded decision, not by a rule</p>
          <p className="evidence-reason">{override.reason}</p>
          <p>
            Decided by {override.by} on {formatDate(override.date)} and recorded in the project’s
            overrides file. This is a judgement about the reference, not something measured in it.
          </p>
        </div>
      )}
    </>
  );
}

function GrantItem({
  listing,
  grant,
  index,
  links,
}: {
  listing: GrantListing;
  grant: Grant;
  index: FundingIndex;
  links: FundingLinks;
}) {
  const amount = grantAmount(grant);
  const original = originalAmount(grant);
  const years = grantYears(grant);
  const people = investigatorNames(grant);
  const tags = grantTags(grant, false);

  return (
    <li className="funding-item">
      <p className="funding-item-head">
        <AgencyLink links={links} code={grant.agency}>
          {agencyLabel(index, grant.agency)}
        </AgencyLink>{' '}
        <GrantLink links={links} grantKey={grant.key}>
          {grant.number}
        </GrantLink>
        {tags.map((tag) => (
          <span key={tag}>
            {' '}
            <span className="badge">{tag}</span>
          </span>
        ))}
      </p>
      <p className="funding-item-title">{grant.title ?? 'No title recorded'}</p>
      <dl className="funding-facts">
        {people === null ? null : (
          <div>
            <dt>Principal investigators</dt>
            <dd>{people}</dd>
          </div>
        )}
        {years === null ? null : (
          <div>
            <dt>Years</dt>
            <dd>{years}</dd>
          </div>
        )}
        <div>
          <dt>Total</dt>
          <dd>
            {amount === null
              ? `Amount not known: ${unknownAmountReason(grant)}`
              : `${amount}, its lifetime award total${grant.amount_source === null ? '' : ` as ${grant.amount_source.name} records it on ${formatDate(grant.amount_source.as_of)}`}`}
            {original === null ? null : `; ${original}`}
            {grant.flags.includes('active') ? '. Active: the total still grows' : ''}
          </dd>
        </div>
        {grant.scope === 'institution-wide' ? (
          <div>
            <dt>Institution-wide</dt>
            <dd>
              An award to run a programme for many projects, not one research project
              {grant.scope_reason === null ? '' : `: ${grant.scope_reason}`}
            </dd>
          </div>
        ) : null}
      </dl>
      <ListingNotes listing={listing} />
      {grant.url === null || grant.url_name === null ? null : (
        <p className="funding-source">
          <a href={grant.url} rel="noreferrer" aria-label={`${grant.url_name} for ${grant.number}`}>
            {grant.url_name}
          </a>
        </p>
      )}
    </li>
  );
}

export function FundingSection({ work, index, resource, links }: FundingSectionProps) {
  const headingId = useId();
  if (index === null) return null;

  const grants: { listing: GrantListing; grant: Grant }[] = [];
  const unmatched: Grant[] = [];
  for (const listing of listingsOf(work, index)) {
    // `listingsOf` keeps only listings whose grant the index holds.
    const grant = index.grants.get(listing.grant) as Grant;
    if (isMiscellaneous(grant, index)) unmatched.push(grant);
    else grants.push({ listing, grant });
  }
  const hasResourceCode = work.evidence.some((entry) => entry.rule === 'R2');

  return (
    <section className="funding-section" aria-labelledby={headingId}>
      <h2 id={headingId}>Funding listed in this publication</h2>
      {grants.length === 0 && unmatched.length === 0 ? (
        <p className="chart-card-description">
          No grant is listed for this publication in the funding statements read. That is what the
          sources record, not a finding that the work had no funding.
        </p>
      ) : (
        <p className="chart-card-description">
          The grants this publication’s funding statements name, as the sources record them. A total
          is the grant’s lifetime award as its funder records it: what the award is worth, not money
          spent on this work.
        </p>
      )}

      {grants.length === 0 ? null : (
        <ul className="funding-list" aria-label="Grants listed in this publication">
          {grants.map(({ listing, grant }) => (
            <GrantItem
              key={grant.key}
              listing={listing}
              grant={grant}
              index={index}
              links={links}
            />
          ))}
        </ul>
      )}

      {unmatched.length === 0 ? null : (
        <>
          <h3>Miscellaneous (not matched to a grant record)</h3>
          <p className="chart-card-description">
            Numbers the paper gives as funding that no funder’s record matched. They have no agency,
            title or amount, and are not counted as grants.
          </p>
          <ul className="funding-unmatched">
            {unmatched.map((grant) => (
              <li key={grant.key}>“{grant.number}”</li>
            ))}
          </ul>
        </>
      )}

      {hasResourceCode ? (
        <p className="funding-resource-code">
          {resource.short_name}’s own award code, {resource.identifier}, is shown above as evidence
          that this publication used the resource. It is not a grant that funded this work, and is
          not listed here.
        </p>
      ) : null}
    </section>
  );
}
