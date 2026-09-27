/**
 * NLM's attribution (docs/09 §13.3), the component and each place it is shown (R1a).
 *
 * NLM's terms ask for "Courtesy of the U.S. National Library of Medicine", clearly shown wherever
 * its data is used, no suggestion that it endorses the site, and a statement that the data may
 * not reflect its most current. PubMed's grant lists are a funding source, so the phrase belongs
 * on every page that shows funding data — and on none when PubMed is not among the sources, since
 * then none of its data is used.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Router } from '../../src/App';
import { NLM_COURTESY, NlmAttribution } from '../../src/components/NlmAttribution';
import type { ExportDocument, FundingSource } from '../../src/contract/types';
import { formatDate } from '../../src/format/date';
import { expectNoAxeViolations } from '../support/axe';
import { sampleExport } from '../support/fixture';
import { fundingBlock, fundingDocument, listing, reporterSource } from '../support/funding';

const pubmed = (overrides: Partial<FundingSource> = {}): FundingSource => ({
  id: 'pubmed',
  name: 'PubMed',
  url: 'https://pubmed.ncbi.nlm.nih.gov/',
  as_of: '2026-09-27',
  amounts_from: null,
  partial_year: null,
  ...overrides,
});

describe('the attribution', () => {
  it('gives NLM’s phrase, the date PubMed was read, that it may not be current, and no endorsement', () => {
    render(<NlmAttribution sources={[reporterSource(), pubmed()]} />);
    const phrase = screen.getByText(NLM_COURTESY);
    expect(phrase.tagName).toBe('STRONG');
    const paragraph = phrase.closest('p');
    expect(paragraph).toHaveTextContent('The grant numbers from PubMed were read on 27 September');
    expect(paragraph).toHaveTextContent(
      'may not reflect the most current data available from the National Library of Medicine',
    );
    expect(paragraph).toHaveTextContent('which does not endorse this site');
  });

  it('as one short line, says the same three things', () => {
    render(<NlmAttribution sources={[pubmed({ as_of: '2026-10-03' })]} compact />);
    const paragraph = screen.getByText(NLM_COURTESY).closest('p');
    expect(paragraph).toHaveTextContent('PubMed’s grant numbers, read on 3 October 2026');
    expect(paragraph).toHaveTextContent('may not reflect the Library’s most current data');
    expect(paragraph).toHaveTextContent('the Library does not endorse this site');
  });

  it('names the source as the export names it', () => {
    render(<NlmAttribution sources={[pubmed({ name: 'PubMed (NLM)' })]} />);
    expect(screen.getByText(NLM_COURTESY).closest('p')).toHaveTextContent(
      'The grant numbers from PubMed (NLM) were read on',
    );
  });

  it.each([
    ['no PubMed among the sources', [reporterSource()]],
    ['no sources at all', []],
  ])('is absent with %s', (_, sources) => {
    const { container } = render(<NlmAttribution sources={sources} />);
    expect(container).toBeEmptyDOMElement();
    const compact = render(<NlmAttribution sources={sources} compact />);
    expect(compact.container).toBeEmptyDOMElement();
  });

  it('passes axe, in both forms', async () => {
    const { container } = render(
      <>
        <NlmAttribution sources={[pubmed()]} />
        <NlmAttribution sources={[pubmed()]} compact />
      </>,
    );
    await expectNoAxeViolations(container);
  });
});

/* ------------------------------------------------------------------------------------------------
 * Where it is shown: the foot of the Funding impact view, an agency page and a grant page, and
 * the end of a publication's Funding section — with PubMed a source, and not without.
 * --------------------------------------------------------------------------------------------- */

const at = (path: string, doc: ExportDocument) => {
  window.history.replaceState(null, '', path);
  return render(
    <Router
      doc={doc}
      fetcher={() => Promise.reject(new Error('the funding pages need no second fetch'))}
      lookupHref="/data/lookup_index.json"
      now={new Date(doc.generated_at)}
      searchDebounceMs={0}
    />,
  );
};

/** The built document: `fundingBlock()`'s NIH grant and unmatched number on the first work. */
const built = (sources: FundingSource[]): ExportDocument =>
  fundingDocument({ funding: fundingBlock({ sources }) });

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('each page that shows funding data', () => {
  const firstWork = sampleExport().works[0]!;
  const pages: [string, string, (page: HTMLElement) => HTMLElement][] = [
    ['the Funding impact view', '/funding', (page) => page],
    ['an agency page', '/funding/agency/NIH', (page) => page],
    ['a grant page', `/funding/grant/${encodeURIComponent(listing().grant)}`, (page) => page],
    [
      'a publication’s Funding section',
      `/publication/${firstWork.id}`,
      () => screen.getByRole('region', { name: 'Funding listed in this publication' }),
    ],
  ];

  it.each(pages)('%s carries it, dated, at its end', (_, path, within_) => {
    at(path, built([reporterSource(), pubmed({ as_of: '2026-09-20' })]));
    const place = within_(document.body);
    const phrase = within(place).getByText(NLM_COURTESY);
    const paragraph = phrase.closest('p')!;
    expect(paragraph).toHaveTextContent(`read on ${formatDate('2026-09-20')}`);
    expect(paragraph).toHaveTextContent('endorse this site');
    // At the end: nothing of the page's own follows it but the footer (and the hidden SVG the
    // chart kit measures its labels in, which is no content).
    const after = [...place.querySelectorAll('*')].filter(
      (element) =>
        paragraph.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING &&
        !paragraph.contains(element) &&
        element.closest('footer') === null &&
        element.closest('[aria-hidden="true"]') === null,
    );
    expect(after).toEqual([]);
  });

  it.each(pages)('%s does not carry it when PubMed is not a source', (_, path) => {
    at(path, built([reporterSource()]));
    expect(screen.queryByText(NLM_COURTESY)).toBeNull();
    expect(document.body).not.toHaveTextContent(/National Library of Medicine/);
  });

  it('is on no page of an export with no funding data', () => {
    const doc = fundingDocument({
      funding: { ...fundingBlock({ sources: [pubmed()] }), version: null },
    });
    for (const path of ['/funding', '/funding/agency/NIH', `/publication/${firstWork.id}`]) {
      const { unmount } = at(path, doc);
      expect(screen.queryByText(NLM_COURTESY)).toBeNull();
      unmount();
    }
  });

  it('passes axe on the Funding impact view with it', async () => {
    const { container } = at('/funding', built([reporterSource(), pubmed()]));
    await expectNoAxeViolations(container);
  }, 30_000);
});
