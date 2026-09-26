/**
 * `/funding/grant/<key>` — one grant (docs/09), as a placeholder.
 *
 * Built behind `VITE_FUNDING` (`contract/config.ts`). Until the export carries funding data and
 * the page reads it, every key is one this export does not have, so the page is its own
 * not-found state — the one it keeps for a key that names nothing once it has data to look in.
 */
import { EntityNotFound } from '../components/EntityNotFound';
import type { ExportDocument } from '../contract/types';

export interface GrantProps {
  doc: ExportDocument;
  /** The grant's key, from the address. `key` itself is React's, so it is not a prop name. */
  grantKey: string;
  onClose?: () => void;
  backLabel?: string;
  fundingHref: string;
}

export function Grant({ doc, grantKey, onClose, backLabel, fundingHref }: GrantProps) {
  return (
    <EntityNotFound
      doc={doc}
      entity="grant"
      entityKey={grantKey}
      onClose={onClose}
      fundingHref={fundingHref}
      {...(backLabel === undefined ? {} : { backLabel })}
    />
  );
}
