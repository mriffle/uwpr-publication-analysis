/**
 * `/funding/agency/<key>` — one funding agency (docs/09), as a placeholder.
 *
 * Built behind `VITE_FUNDING` (`contract/config.ts`). Until the export carries funding data and
 * the page reads it, every key is one this export does not have, so the page is its own
 * not-found state — the one it keeps for a key that names nothing once it has data to look in.
 */
import { EntityNotFound } from '../components/EntityNotFound';
import type { ExportDocument } from '../contract/types';

export interface AgencyProps {
  doc: ExportDocument;
  /** The agency's key, from the address. `key` itself is React's, so it is not a prop name. */
  agencyKey: string;
  onClose?: () => void;
  backLabel?: string;
  fundingHref: string;
}

export function Agency({ doc, agencyKey, onClose, backLabel, fundingHref }: AgencyProps) {
  return (
    <EntityNotFound
      doc={doc}
      entity="agency"
      entityKey={agencyKey}
      onClose={onClose}
      fundingHref={fundingHref}
      {...(backLabel === undefined ? {} : { backLabel })}
    />
  );
}
