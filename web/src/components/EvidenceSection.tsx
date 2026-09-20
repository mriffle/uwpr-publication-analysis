/**
 * "Why this is a UWPR publication" (docs/05 §6.6, docs/06 §5).
 *
 * Every active evidence entry: the plain-language label, the section of the paper, the quoted
 * sentence, the source with its URL, and the retrieval date. Three cases are not that shape at
 * all and each gets its own wording — `format/evidence.ts` decides which case an entry is, this
 * renders it:
 *
 * - **The site listing.** "Listed on UWPR's publications page", with the page and the first and
 *   last dates it was seen. **There is no excerpt and no empty quotation is rendered.**
 * - **A full-text index match.** The phrase and the query date, said as what it is: a hit in
 *   OpenAlex's index of a paper whose text we could not read ourselves.
 * - **An override.** The recorded reason, attributed to the person who decided it and dated. "It
 *   is a judgement, not a measurement, and must read as one."
 *
 * **Excerpts are rendered as published, not cleaned up** (docs/06 §5). Where the pipeline has
 * stored a defect — currently `W-000205`'s undecoded `&apos;` — it is visible. "Decoding entities
 * in the app would mask future extraction bugs and risks double-decoding text that legitimately
 * contains an escaped character. The fix belongs in extraction; the app's job is to show what the
 * store holds." React escapes text by default, so the entity renders literally with no effort;
 * the effort would be in *not* showing it.
 *
 * docs/05 §11.7, "plain language before jargon": the rule identifier appears as provenance at the
 * end of an entry, never as its label.
 */
import type { Evidence, Work } from '../contract/types';
import { formatDate } from '../format/date';
import {
  evidenceKind,
  foundOnOtherVersion,
  fullTextMatch,
  hasExcerpt,
  listingRecord,
  overrideAttribution,
  versionNoun,
} from '../format/evidence';

function SourceLine({ entry }: { entry: Evidence }) {
  return (
    <p className="evidence-source">
      Source:{' '}
      {entry.source.url === null ? (
        entry.source.name
      ) : (
        <a href={entry.source.url} rel="noreferrer">
          {entry.source.name}
        </a>
      )}
      , read {formatDate(entry.source.retrieved)}. Rule {entry.rule}.
    </p>
  );
}

/** The one sentence that keeps a quotation from looking like it is missing from the paper. */
function OtherVersionNote({ entry, work }: { entry: Evidence; work: Work }) {
  const other = foundOnOtherVersion(entry, work);
  if (other === null) return null;
  return (
    <p className="evidence-version">
      Found on the {versionNoun(other.kind)} version of this work
      {other.doi === null ? '' : ` (${other.doi})`}, not on the version shown above. Evidence on one
      version applies to the whole publication.
    </p>
  );
}

export function EvidenceItem({ entry, work }: { entry: Evidence; work: Work }) {
  const kind = evidenceKind(entry);

  if (kind === 'listing') {
    const listing = listingRecord(entry);
    return (
      <li className="evidence-item" data-kind="listing">
        <p className="evidence-label">{entry.label}</p>
        <p>
          {listing.page === null
            ? 'Seen on the resource’s own publications page'
            : `Seen on the resource’s “${listing.page}” publications page`}
          , first on {formatDate(listing.firstSeen)} and most recently on{' '}
          {formatDate(listing.lastSeen)}. A listing records that the resource counts this
          publication as its own; it quotes nothing from the paper.
        </p>
        <OtherVersionNote entry={entry} work={work} />
        <SourceLine entry={entry} />
      </li>
    );
  }

  if (kind === 'full-text-index') {
    const match = fullTextMatch(entry);
    return (
      <li className="evidence-item" data-kind="full-text-index">
        <p className="evidence-label">{entry.label}</p>
        <p>
          {match.phrase === null ? (
            <>The phrase was found in OpenAlex’s full-text index of this paper</>
          ) : (
            <>
              The phrase <span className="evidence-phrase">“{match.phrase}”</span> was found in
              OpenAlex’s full-text index of this paper
            </>
          )}
          , searched on {formatDate(match.queryDate)}. The index reports the match but not the
          surrounding sentence, and the paper’s own text could not be read here, so there is nothing
          to quote.
        </p>
        <OtherVersionNote entry={entry} work={work} />
        <SourceLine entry={entry} />
      </li>
    );
  }

  if (kind === 'override') {
    const attribution = overrideAttribution(entry);
    return (
      <li className="evidence-item" data-kind="override">
        <p className="evidence-label">Included by a recorded decision, not by a rule</p>
        <p className="evidence-reason">{entry.label}</p>
        <p>
          {attribution === null ? (
            <>
              The decision is recorded in the project’s overrides file. No person or date is
              recorded against it.
            </>
          ) : (
            <>
              Decided by {attribution.by} on {formatDate(attribution.date)} and recorded in the
              project’s overrides file. This is a judgement about the publication, not something
              measured in it.
            </>
          )}
        </p>
        <SourceLine entry={entry} />
      </li>
    );
  }

  return (
    <li className="evidence-item" data-kind="quotation">
      <p className="evidence-label">{entry.label}</p>
      {hasExcerpt(entry) ? (
        <blockquote className="evidence-excerpt">
          <p>{entry.excerpt}</p>
          <footer>From the {entry.section} of the paper, as published.</footer>
        </blockquote>
      ) : (
        <p>Found in the {entry.section} of the paper. No sentence was recorded for it.</p>
      )}
      <OtherVersionNote entry={entry} work={work} />
      <SourceLine entry={entry} />
    </li>
  );
}

export function EvidenceSection({ work }: { work: Work }) {
  return (
    <ul className="evidence-list" aria-label="Evidence that this publication used the resource">
      {work.evidence.map((entry, index) => (
        <EvidenceItem key={`${entry.rule}-${String(index)}`} entry={entry} work={work} />
      ))}
    </ul>
  );
}
