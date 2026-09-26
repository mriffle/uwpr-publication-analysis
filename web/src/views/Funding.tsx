/**
 * `/funding` — Funding impact (docs/09), as a placeholder.
 *
 * Built in slices behind `VITE_FUNDING` (`contract/config.ts`), so that no half-built view reaches
 * the public page. This slice is the frame every later one fills: the header the view shares
 * with the publications, with the switch between them; the staleness notice; the footer; and the
 * state every version of this view has to handle — **an export with no funding data in it**.
 * Every export is one until the pipeline writes funding, and data and app are published
 * separately (docs/07 O2), so the app will meet one after any rollback of the data too. It says
 * so plainly instead of drawing empty charts that would read as "no grants".
 *
 * The register is docs/05 §11's, and here it has one more thing to hold: a grant's value is what
 * the award is worth, which is not money spent on the work that lists it, and the page says so
 * before it shows a single figure.
 */
import { useId } from 'react';
import { PageFooter } from '../components/PageFooter';
import { SiteHeader, type ViewSwitch } from '../components/SiteHeader';
import { StalenessNotice } from '../components/StalenessNotice';
import { fundingOf } from '../contract/funding';
import type { ExportDocument } from '../contract/types';
import { formatDate } from '../format/date';

export interface FundingProps {
  doc: ExportDocument;
  methodHref: string;
  onOpenMethod: () => void;
  lookupHref: string;
  onOpenLookup: () => void;
  /** The switch back to the publications, carrying the reader's query string. */
  views?: ViewSwitch;
  /** Injected in tests so the staleness threshold is exercised without freezing the clock. */
  now?: Date;
}

export function Funding({
  doc,
  methodHref,
  onOpenMethod,
  lookupHref,
  onOpenLookup,
  views,
  now,
}: FundingProps) {
  const stateHeading = useId();
  const funding = fundingOf(doc);

  return (
    <main className="page funding-page">
      <SiteHeader
        title={`${doc.resource.name} — funding impact`}
        lead="The grants the publications here list as their funding, each with its lifetime award total as its funder records it. That total is what the award is worth, not money spent on the work that lists it."
        current="funding"
        doc={doc}
        methodHref={methodHref}
        onOpenMethod={onOpenMethod}
        lookupHref={lookupHref}
        onOpenLookup={onOpenLookup}
        {...(views ? { views } : {})}
        focusHeading
      />

      <StalenessNotice generatedAt={doc.generated_at} {...(now ? { now } : {})} />

      {funding === null ? (
        <section className="empty-state" aria-labelledby={stateHeading}>
          <h2 id={stateHeading}>No funding data in this export</h2>
          <p>
            The data this page loaded, generated on {formatDate(doc.generated_at)}, does not include
            the grants its publications list, so there is nothing to show here. That is a gap in
            this copy of the data, not a finding that the publications list no funding.
          </p>
          <p>The publications themselves, and everything shown about them, are unaffected.</p>
        </section>
      ) : (
        <section className="empty-state" aria-labelledby={stateHeading}>
          <h2 id={stateHeading}>Funding is not shown yet</h2>
          <p>
            This export includes funding data, generated on {formatDate(doc.generated_at)}. This
            version of the page does not display it yet.
          </p>
        </section>
      )}

      <PageFooter doc={doc} />
    </main>
  );
}
