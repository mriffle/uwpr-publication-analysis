/**
 * NLM's attribution, wherever the site shows funding data (docs/09 §13.3).
 *
 * PubMed's grant lists are one of the sources of the numbers the publications give as funding,
 * and NLM's terms, re-read by B10, ask three things of a site that uses its data: the phrase
 * "Courtesy of the U.S. National Library of Medicine", shown clearly; no suggestion that NLM
 * endorses the site; and, since the data here is not kept current with NLM's, a statement that it
 * may not reflect NLM's most current data. The date PubMed was read is that statement's substance.
 *
 * W9 wrote it for the method page's funding section. R1a made it this one component, so every
 * place says the same thing: the method page, the foot of the Funding impact view, of an agency
 * page and of a grant page, and — as one short line — the end of a publication's Funding section.
 * It is given only when the export's funding `sources` include PubMed, dated by that source's
 * `as_of`, and says nothing when they do not, which includes an export with no funding data.
 */
import type { FundingSource } from '../contract/types';
import { formatDate } from '../format/date';

/** NLM's own phrase, exactly as its terms give it. */
export const NLM_COURTESY = 'Courtesy of the U.S. National Library of Medicine.';

export interface NlmAttributionProps {
  /** The funding block's `sources`: the attribution is given only when PubMed is one. */
  sources: readonly FundingSource[];
  /** One short line, for the end of a publication's Funding section. */
  compact?: boolean;
}

export function NlmAttribution({ sources, compact = false }: NlmAttributionProps) {
  const pubmed = sources.find((source) => source.id === 'pubmed');
  if (pubmed === undefined) return null;
  const read = formatDate(pubmed.as_of);

  if (compact) {
    return (
      <p className="nlm-attribution nlm-attribution-line">
        <strong>{NLM_COURTESY}</strong> {pubmed.name}’s grant numbers, read on {read}, may not
        reflect the Library’s most current data; the Library does not endorse this site.
      </p>
    );
  }

  return (
    <p className="nlm-attribution">
      <strong>{NLM_COURTESY}</strong> The grant numbers from {pubmed.name} were read on {read}, and
      may not reflect the most current data available from the National Library of Medicine, which
      does not endorse this site.
    </p>
  );
}
