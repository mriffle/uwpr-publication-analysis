/**
 * The designed state for `/funding/agency/<key>` and `/funding/grant/<key>` when the key names
 * nothing in the loaded export (docs/09; docs/06 §7: "a work referenced by URL does not exist").
 *
 * It is laid out as the page it stands in for: the way back, one `h1` that takes focus, and a
 * plain statement of what was asked for and not found. It says which of two things happened,
 * because they mean different things to the reader holding the link — the export has funding
 * data and not this key, or the export has no funding data at all, which says nothing about the
 * key and will change when data that has it is published (docs/07 O2).
 */
import { useEffect, useRef } from 'react';
import { fundingOf } from '../contract/funding';
import type { ExportDocument } from '../contract/types';
import { formatDate } from '../format/date';
import { BACK_LABELS } from '../routing/navigation';
import { BackLink, useCloseOnEscape } from './BackLink';

export type FundingEntity = 'agency' | 'grant';

const NOUNS: Readonly<Record<FundingEntity, string>> = {
  agency: 'funding agency',
  grant: 'grant',
};

const HEADINGS: Readonly<Record<FundingEntity, string>> = {
  agency: 'Funding agency not found',
  grant: 'Grant not found',
};

export interface EntityNotFoundProps {
  doc: ExportDocument;
  entity: FundingEntity;
  /** The key the address carried, decoded, exactly as the reader supplied it. */
  entityKey: string;
  /** Present when the app opened this page over another, which closing returns to. */
  onClose?: (() => void) | undefined;
  backLabel?: string;
  /** `/funding` with the reader's query string, for a reader who arrived cold. */
  fundingHref: string;
}

export function EntityNotFound({
  doc,
  entity,
  entityKey,
  onClose,
  backLabel = BACK_LABELS.funding,
  fundingHref,
}: EntityNotFoundProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  // docs/06 §9: focus goes to the heading of a page that replaces another, so a keyboard or
  // screen-reader user hears where they are rather than being left on a control that has gone.
  useEffect(() => {
    headingRef.current?.focus();
  }, [entity, entityKey]);

  useCloseOnEscape(onClose);

  const noun = NOUNS[entity];
  const noData = fundingOf(doc) === null;

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
        {HEADINGS[entity]}
      </h1>
      <div className="empty-state">
        <p>
          No {noun} in this export has the key <code>{entityKey}</code>.
        </p>
        {noData ? (
          <p>
            This export has no funding data at all: the data this page loaded, generated on{' '}
            {formatDate(doc.generated_at)}, does not include the grants its publications list. That
            is a gap in this copy of the data, and says nothing about the {noun} this link names.
          </p>
        ) : (
          <p>
            Nothing listed on the publications here has that key. It may have been changed when the
            link was copied: a key is written exactly as the {noun}’s own page shows it.
          </p>
        )}
      </div>
    </main>
  );
}
