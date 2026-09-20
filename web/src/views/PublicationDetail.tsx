/**
 * One publication: what it is, who wrote it, and why it is counted (docs/06 §5).
 *
 * Renders docs/05 §6 in that order: identity; links; authors with affiliations and staff markers;
 * research areas at all four levels; citations; **why this is a UWPR publication**; other
 * versions; retraction if flagged. "Every element is already in the store; nothing is generated,
 * summarised or paraphrased."
 *
 * **Everything is rendered as stored** (docs/06 §5). One work's title is a filename and one
 * excerpt carries an undecoded XML entity; both appear exactly as the pipeline wrote them,
 * because "decoding entities in the app would mask future extraction bugs" and a placeholder
 * title would hide a real gap. React escapes text by default, so this costs nothing but the
 * discipline not to add a repair.
 */
import { useEffect, useRef } from 'react';
import { EvidenceSection } from '../components/EvidenceSection';
import type { Author, Topic, Work } from '../contract/types';
import { formatDate } from '../format/date';
import { formatCount, formatDecimal, formatShare, pluralize } from '../format/number';

export interface PublicationDetailProps {
  work: Work;
  /** The date the citation figures were read, from `sources.citations.as_of`. */
  citationsAsOf: string;
  /**
   * True when the reader arrived cold on this URL. docs/06 §3: reached from the overview the
   * detail "opens over" it so a filter survives; "reached cold from a link, it stands alone with
   * a route back to an unfiltered overview".
   */
  standalone?: boolean;
  /** Present when there is an overview underneath to go back to. */
  onClose?: () => void;
  /** The overview's href, for the standalone case and for a middle-click in either. */
  overviewHref: string;
  /**
   * The identifier the URL carried, when it was not this work's own — a retired work ID or an
   * external identifier. docs/06 §7: every permalink the app has ever issued keeps working, and
   * a reader who followed an old one is told which work it opened.
   */
  resolvedFrom?: string | null;
}

const doiUrl = (doi: string): string => `https://doi.org/${doi}`;
const pubmedUrl = (pmid: string): string => `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
const pmcUrl = (pmcid: string): string => `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`;

function AuthorRow({ author }: { author: Author }) {
  return (
    <li className="author-row">
      <span className="author-name">
        {author.name}
        {author.staff === null ? null : <span className="badge badge-staff"> UWPR staff</span>}
        {author.corresponding ? <span className="badge"> corresponding</span> : null}
      </span>
      {author.orcid === null ? null : (
        <a className="author-orcid" href={`https://orcid.org/${author.orcid}`} rel="noreferrer">
          ORCID {author.orcid}
        </a>
      )}
      {author.institutions.length > 0 ? (
        <span className="author-institutions">
          {author.institutions.map((institution) => institution.name ?? institution.ror).join('; ')}
        </span>
      ) : (
        <span className="author-institutions author-institutions-none">
          No institution resolved
        </span>
      )}
      {author.affiliations_raw.length > 0 ? (
        <details className="author-raw">
          <summary>Affiliation as published</summary>
          <ul>
            {author.affiliations_raw.map((raw) => (
              <li key={raw}>{raw}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

/** Primary first (docs/05 §6.4, D12), then by the score OpenAlex assigned. */
const orderedTopics = (topics: readonly Topic[]): Topic[] =>
  [...topics].sort((a, b) => Number(b.primary) - Number(a.primary) || b.score - a.score);

export function PublicationDetail({
  work,
  citationsAsOf,
  standalone = false,
  onClose,
  overviewHref,
  resolvedFrom = null,
}: PublicationDetailProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  // Moving focus to the heading is what makes "opens over the overview" work for a keyboard or
  // screen-reader user: without it the reader is left where they clicked, on a page that has
  // changed underneath them (docs/06 §9).
  useEffect(() => {
    headingRef.current?.focus();
  }, [work.id]);

  useEffect(() => {
    if (!onClose) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const byYear = Object.entries(work.citations.by_year)
    .map(([year, count]) => ({ year: Number(year), count }))
    .sort((a, b) => a.year - b.year);
  const topics = orderedTopics(work.topics);

  return (
    <article className="detail" aria-labelledby="detail-heading">
      <div className="detail-head">
        {onClose ? (
          <button type="button" className="detail-close" onClick={onClose}>
            Back to the publications
          </button>
        ) : (
          <a className="detail-close" href={overviewHref}>
            {standalone ? 'See all publications' : 'Back to the publications'}
          </a>
        )}
      </div>

      {work.retracted ? (
        <p className="notice notice-error detail-retracted" role="alert">
          <strong>This publication has been retracted.</strong> The retraction is recorded by the
          publisher and is reported here as found; the publication is still counted, because it
          still records use of the resource.
        </p>
      ) : null}

      {resolvedFrom === null ? null : (
        <p className="notice" role="status">
          You followed a link for <code>{resolvedFrom}</code>. That identifier now belongs to{' '}
          {work.id}, shown here.
        </p>
      )}

      {/* 1. Identity (docs/05 §6.1). */}
      <h1 id="detail-heading" tabIndex={-1} ref={headingRef}>
        {work.title}
      </h1>
      <p className="detail-identity">
        {work.venue === null ? 'No venue recorded' : work.venue.name}
        {' · '}
        {work.date === null ? work.year : formatDate(work.date)}
        {' · '}
        {work.is_preprint ? 'preprint' : work.kind}
        {work.is_preprint ? (
          <span className="badge badge-preprint"> not yet published in a journal</span>
        ) : null}
      </p>
      <p className="detail-authors-short">
        {pluralize(work.author_count, 'author')}
        {work.staff_authors.length > 0
          ? `, ${String(work.staff_authors.length)} of them UWPR staff`
          : ''}
      </p>

      {/* 2. Links (docs/05 §6.2). */}
      <h2>Links</h2>
      <ul className="detail-links">
        {work.ids.doi === null ? null : (
          <li>
            <a href={doiUrl(work.ids.doi)} rel="noreferrer">
              DOI {work.ids.doi}
            </a>
          </li>
        )}
        {work.ids.pmid === null ? null : (
          <li>
            <a href={pubmedUrl(work.ids.pmid)} rel="noreferrer">
              PubMed {work.ids.pmid}
            </a>
          </li>
        )}
        {work.ids.pmcid === null ? null : (
          <li>
            <a href={pmcUrl(work.ids.pmcid)} rel="noreferrer">
              PubMed Central {work.ids.pmcid}
            </a>
          </li>
        )}
        {work.oa.url === null ? (
          <li className="detail-links-none">No open-access copy is recorded ({work.oa.status}).</li>
        ) : (
          <li>
            <a href={work.oa.url} rel="noreferrer">
              Open-access copy ({work.oa.status}
              {work.oa.license === null ? '' : `, ${work.oa.license}`})
            </a>
          </li>
        )}
      </ul>

      {/* 3. Authors and affiliations (docs/05 §6.3). */}
      <h2>Authors and affiliations</h2>
      <ol className="author-list">
        {work.authors.map((author, index) => (
          <AuthorRow key={`${author.openalex ?? author.name}-${String(index)}`} author={author} />
        ))}
      </ol>

      {/* 4. Research areas at all four levels (docs/05 §6.4). */}
      <h2>Research areas</h2>
      {topics.length === 0 ? (
        <p>OpenAlex reports no topics for this publication.</p>
      ) : (
        <table className="topic-table">
          <caption>
            The topics OpenAlex assigns, at all four of its levels, primary first. This is
            OpenAlex’s vocabulary, not one of our own.
          </caption>
          <thead>
            <tr>
              <th scope="col">Topic</th>
              <th scope="col">Subfield</th>
              <th scope="col">Field</th>
              <th scope="col">Domain</th>
              <th scope="col" className="numeric">
                Score
              </th>
            </tr>
          </thead>
          <tbody>
            {topics.map((topic) => (
              <tr key={`${topic.topic}-${String(topic.score)}`}>
                <th scope="row">
                  {topic.topic}
                  {topic.primary ? <span className="badge"> primary</span> : null}
                </th>
                <td>{topic.subfield}</td>
                <td>{topic.field}</td>
                <td>{topic.domain}</td>
                <td className="numeric">{formatDecimal(topic.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* 5. Citations (docs/05 §6.5). */}
      <h2>Citations</h2>
      <p>
        {pluralize(work.citations.total, 'citation')}, reported by OpenAlex as of{' '}
        {formatDate(work.citations.as_of)}.{' '}
        {work.citations.fwci === null ? (
          <>
            OpenAlex reports no field-weighted citation impact for this publication, which is usual
            for a recent one.
          </>
        ) : (
          <>
            Its field-weighted citation impact is {formatDecimal(work.citations.fwci)}: it is cited
            that many times as often as the average paper in its field, year and type, where 1.0 is
            average.
          </>
        )}{' '}
        {work.citations.percentile === null ? null : (
          <>
            OpenAlex places it in the {formatShare(work.citations.percentile)} percentile of its
            field and year.
          </>
        )}
      </p>
      {byYear.length === 0 ? (
        <p>No citations by year are recorded.</p>
      ) : (
        <table className="chart-table">
          <caption>Citations received by year, as OpenAlex reports them.</caption>
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col" className="numeric">
                Citations
              </th>
            </tr>
          </thead>
          <tbody>
            {byYear.map((row) => (
              <tr key={row.year}>
                <th scope="row">{row.year}</th>
                <td className="numeric">{formatCount(row.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* 6. Why this is a UWPR publication (docs/05 §6.6) — the reason the project exists. */}
      <h2>Why this is a UWPR publication</h2>
      <p className="chart-card-description">
        {work.on_official_list
          ? 'This publication is on the resource’s own publications list.'
          : 'This publication is not on the resource’s own publications list; it was found from the evidence below.'}{' '}
        Each entry below is a separate reason, recorded with where it came from and when it was
        read.
      </p>
      <EvidenceSection work={work} />

      {/* 7. Other versions (docs/05 §6.7). */}
      {work.versions.length > 0 ? (
        <>
          <h2>Other versions</h2>
          <ul className="detail-links">
            {work.versions.map((version) => (
              <li key={`${version.kind}-${version.doi ?? String(version.year)}`}>
                {version.url === null || version.doi === null ? (
                  <>
                    {version.kind},{' '}
                    {version.date === null ? version.year : formatDate(version.date)}
                  </>
                ) : (
                  <a href={version.url} rel="noreferrer">
                    {version.kind},{' '}
                    {version.date === null ? version.year : formatDate(version.date)} ({version.doi}
                    )
                  </a>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="detail-footer">
        Work {work.id}
        {work.aliases.length > 0 ? `, formerly ${work.aliases.join(', ')}` : ''}. Citation figures
        from OpenAlex as of {formatDate(citationsAsOf)}.
      </p>
    </article>
  );
}
