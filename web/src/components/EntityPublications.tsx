/**
 * The publications an agency's or a grant's page lists (docs/09 §12.6, §12.7): a compact list of
 * links, newest first, under the page's own `h2`.
 *
 * Each title is a real link to the publication's page, keeping the reader's query string, and the
 * app opens it in place on a plain left click, recording the page left (§12.3) so that the
 * publication's back control names it. The grant page adds, under each, what that publication's
 * listing says about how it reached the grant (`ListingNotes`).
 */
import { useId, type ReactNode } from 'react';
import type { Work } from '../contract/types';
import { pluralize } from '../format/number';
import { InAppLink } from './FundingLinks';

export interface EntityPublication {
  work: Work;
  /** Anything the page says about this publication beside its title. */
  notes?: ReactNode;
}

export interface EntityPublicationsProps {
  heading: string;
  /** Newest first, as `agencyDetail` and `grantDetail` give them. */
  entries: readonly EntityPublication[];
  /** A sentence after the count, where the page has one: "It is counted once …". */
  summary?: string | undefined;
  publicationHref: (work: Work) => string;
  onOpenPublication?: ((work: Work) => void) | undefined;
}

export function EntityPublications({
  heading,
  entries,
  summary,
  publicationHref,
  onOpenPublication,
}: EntityPublicationsProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>{heading}</h2>
      <p className="chart-card-description">
        {entries.length === 0
          ? 'None of the publications here lists it.'
          : `${pluralize(entries.length, 'publication')}, newest first.`}
        {summary === undefined ? '' : ` ${summary}`}
      </p>
      {entries.length === 0 ? null : (
        <ul className="entity-publications" aria-label={heading}>
          {entries.map(({ work, notes }) => (
            <li key={work.id}>
              <InAppLink
                href={publicationHref(work)}
                onOpen={
                  onOpenPublication === undefined
                    ? undefined
                    : () => {
                        onOpenPublication(work);
                      }
                }
              >
                {work.title}
              </InAppLink>{' '}
              <span className="entity-publication-meta">
                {work.year}
                {work.venue === null ? '' : ` · ${work.venue.name}`}
              </span>
              {notes}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
