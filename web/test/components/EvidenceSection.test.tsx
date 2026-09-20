/**
 * "Why this is a UWPR publication" (docs/06 §5, docs/05 §6).
 *
 * This is the component the spec says "must not be templated carelessly", and the three cases
 * that a generic template gets false are each asserted here on their own terms — including the
 * negative assertions, because the failure mode is rendering something that should not be there
 * (an empty quotation) rather than failing to render at all.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { EvidenceSection } from '../../src/components/EvidenceSection';
import type { Evidence, Work } from '../../src/contract/types';
import { expectNoAxeViolations } from '../support/axe';
import { isSampleExport, sampleExport } from '../support/fixture';
import { work } from '../support/works';

const entry = (overrides: Partial<Evidence>): Evidence => ({
  rule: 'R2',
  criterion: 2,
  label: 'UWPR award code stated in the paper',
  section: 'acknowledgements',
  excerpt: 'We thank the Proteomics Resource (UWPR95794).',
  source: {
    name: 'PMC',
    url: 'https://pmc.example.invalid/PMC1',
    retrieved: '2026-09-19',
  },
  detail: {},
  first_seen: '2026-09-19',
  last_seen: '2026-09-19',
  ...overrides,
});

const show = (evidence: Evidence[], overrides: Partial<Work> = {}) =>
  render(<EvidenceSection work={work({ evidence: evidence as Work['evidence'], ...overrides })} />);

describe('the site listing (91 of 339 works have this as their only evidence)', () => {
  const listing = entry({
    rule: 'R1',
    criterion: 1,
    label: "Listed on UWPR's publications page",
    section: 'official list',
    excerpt: null,
    detail: { page: 'current', first_seen: '2026-06-01', last_seen: '2026-09-12' },
    source: {
      name: 'UWPR website',
      url: 'https://proteomicsresource.example.invalid/publications/',
      retrieved: '2026-09-12',
    },
  });

  it('says it was listed, with the page and the dates first and last seen', () => {
    show([listing]);
    expect(screen.getByText("Listed on UWPR's publications page")).toBeInTheDocument();
    const item = screen.getByText(/Seen on the resource’s “current” publications page/);
    expect(item).toHaveTextContent('1 June 2026');
    expect(item).toHaveTextContent('12 September 2026');
  });

  it('renders no quotation at all — not an empty one', () => {
    const { container } = show([listing]);
    expect(container.querySelector('blockquote')).toBeNull();
    expect(screen.queryByText('“”')).not.toBeInTheDocument();
  });

  it('says what a listing is and is not, rather than implying the paper says something', () => {
    show([listing]);
    expect(screen.getByText(/it quotes nothing from the paper/)).toBeInTheDocument();
  });

  it('names no page when the entry names none', () => {
    show([entry({ ...listing, detail: {} })]);
    expect(screen.getByText(/Seen on the resource’s own publications page/)).toBeInTheDocument();
  });
});

describe('a full-text index match (49 works carry one)', () => {
  const indexed = entry({
    rule: 'R6',
    criterion: 4,
    label: "Phrase found in OpenAlex's full-text index of the paper",
    section: 'full-text index',
    excerpt: null,
    detail: { phrase: "Washington's Proteomics Resource", query_date: '2026-09-19' },
    source: { name: 'OpenAlex', url: 'https://api.example.invalid', retrieved: '2026-09-19' },
  });

  it('gives the phrase and the query date', () => {
    show([indexed]);
    expect(screen.getByText(/Washington's Proteomics Resource/)).toBeInTheDocument();
    // The date is in the sentence about the search, not only in the source line beneath it.
    expect(screen.getByText(/searched on/)).toHaveTextContent('19 September 2026');
  });

  it('renders no quotation, and says why there is none', () => {
    const { container } = show([indexed]);
    expect(container.querySelector('blockquote')).toBeNull();
    expect(
      screen.getByText(/could not be read here, so there is nothing to quote/),
    ).toBeInTheDocument();
  });

  it('still reads as a sentence when the phrase itself is missing', () => {
    show([entry({ ...indexed, detail: {} })]);
    expect(
      screen.getByText(/The phrase was found in OpenAlex’s full-text index of this paper/),
    ).toBeInTheDocument();
  });
});

describe('an override is a judgement, not a measurement (docs/05 §6)', () => {
  const override = entry({
    rule: 'override',
    criterion: null,
    label: 'The acknowledgement names the facility under an older name not covered by a rule.',
    section: 'override',
    excerpt: null,
    detail: { by: 'mriffle', date: '2026-09-19' },
    source: { name: 'overrides.yaml', url: null, retrieved: '2026-09-19' },
  });

  it('shows the recorded reason, attributed to the person who decided it and dated', () => {
    show([override]);
    expect(screen.getByText('Included by a recorded decision, not by a rule')).toBeInTheDocument();
    expect(
      screen.getByText(
        'The acknowledgement names the facility under an older name not covered by a rule.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Decided by mriffle on 19 September 2026/)).toBeInTheDocument();
    expect(
      screen.getByText(/a judgement about the publication, not something measured in it/),
    ).toBeInTheDocument();
  });

  it('says the attribution is missing rather than inventing one (docs/05 §11.6)', () => {
    show([entry({ ...override, detail: {} })]);
    expect(screen.getByText(/No person or date is recorded against it/)).toBeInTheDocument();
    expect(screen.queryByText(/Decided by/)).not.toBeInTheDocument();
  });

  it('renders no quotation', () => {
    const { container } = show([override]);
    expect(container.querySelector('blockquote')).toBeNull();
  });
});

describe('an ordinary quoted entry', () => {
  it('quotes the sentence as published, with its section and source', () => {
    show([entry({})]);
    expect(screen.getByText('We thank the Proteomics Resource (UWPR95794).')).toBeInTheDocument();
    expect(
      screen.getByText(/From the acknowledgements of the paper, as published/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'PMC' })).toHaveAttribute(
      'href',
      'https://pmc.example.invalid/PMC1',
    );
  });

  it('renders an undecoded entity exactly as stored (docs/06 §5, W-000205)', () => {
    // "Decoding entities in the app would mask future extraction bugs and risks double-decoding
    // text that legitimately contains an escaped character."
    show([entry({ excerpt: 'University of Washington&apos;s Proteomics Resource (UWPR95794).' })]);
    expect(
      screen.getByText('University of Washington&apos;s Proteomics Resource (UWPR95794).'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Washington's Proteomics Resource \(UWPR95794\)\.$/)).toBeNull();
  });

  it('says so rather than showing an empty quotation when an excerpt is missing', () => {
    const { container } = show([entry({ excerpt: null })]);
    expect(container.querySelector('blockquote')).toBeNull();
    expect(screen.getByText(/No sentence was recorded for it/)).toBeInTheDocument();
  });

  it('names a source with no URL without producing a dead link', () => {
    show([entry({ source: { name: 'overrides.yaml', url: null, retrieved: '2026-09-19' } })]);
    expect(screen.queryByRole('link', { name: 'overrides.yaml' })).not.toBeInTheDocument();
    expect(screen.getByText(/Source: overrides.yaml/)).toBeInTheDocument();
  });

  it('carries the rule identifier as provenance, never as the label (docs/05 §11.7)', () => {
    show([entry({})]);
    const item = screen.getByText(/Rule R2/);
    expect(item).toBeInTheDocument();
    expect(screen.getByText('UWPR award code stated in the paper')).toBeInTheDocument();
  });
});

describe('evidence found on a different version than the one displayed (docs/06 §5)', () => {
  it('says which version carried it, and that it applies to the whole publication', () => {
    show([entry({ found_on: { kind: 'preprint', doi: '10.1101/preprint' } })], {
      kind: 'article',
      ids: { doi: '10.1/article', pmid: null, pmcid: null, openalex: null },
    });
    expect(
      screen.getByText(/Found on the preprint version of this work \(10.1101\/preprint\)/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Evidence on one version applies to the whole publication/),
    ).toBeInTheDocument();
  });

  it('says nothing when the evidence is on the version shown', () => {
    show([entry({ found_on: { kind: 'article', doi: '10.1/article' } })], {
      kind: 'article',
      ids: { doi: '10.1/article', pmid: null, pmcid: null, openalex: null },
    });
    expect(screen.queryByText(/Found on the/)).not.toBeInTheDocument();
  });
});

describe('the section as a whole', () => {
  it('is a named list of every entry', () => {
    show([entry({}), entry({ rule: 'R3', label: 'The paper names the resource' })]);
    const list = screen.getByRole('list', {
      name: 'Evidence that this publication used the resource',
    });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });

  it('passes axe', async () => {
    const { container } = show([entry({})]);
    await expectNoAxeViolations(container);
  });
});

describe.skipIf(!isSampleExport)('every evidence entry in the sample renders', () => {
  it('renders each work’s evidence without throwing and without an empty quotation', () => {
    for (const item of sampleExport().works) {
      const { container, unmount } = render(<EvidenceSection work={item} />);
      for (const quote of container.querySelectorAll('blockquote')) {
        expect(quote.textContent?.trim()).not.toBe('');
      }
      expect(container.querySelectorAll('.evidence-item')).toHaveLength(item.evidence.length);
      unmount();
    }
  });
});
