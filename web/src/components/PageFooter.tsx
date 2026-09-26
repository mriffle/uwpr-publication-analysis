/**
 * The footer the site's views share (docs/06 §4.9): where the data came from, which run and
 * which rules produced it, and how to correct a mistake.
 */
import type { ExportDocument } from '../contract/types';
import { formatDate } from '../format/date';

export interface PageFooterProps {
  doc: Pick<
    ExportDocument,
    'sources' | 'generated_at' | 'run_id' | 'pipeline_version' | 'rule_version'
  >;
}

export function PageFooter({ doc }: PageFooterProps) {
  return (
    <footer className="page-footer">
      <p>
        {doc.sources.notes.join(' ')} Generated {formatDate(doc.generated_at)} by run{' '}
        <code>{doc.run_id}</code>, pipeline {doc.pipeline_version}, rules {doc.rule_version}.
      </p>
      <p>
        A mistake in this page can be corrected: the project records overrides for exactly that
        purpose. Report one against the repository this page is built from.
      </p>
    </footer>
  );
}
