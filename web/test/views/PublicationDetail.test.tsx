/**
 * The publication detail (docs/06 §5, docs/05 §6): identity; links; authors with affiliations and
 * staff markers; research areas at all four levels; citations; why this is a UWPR publication;
 * other versions; retraction.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PublicationDetail } from '../../src/views/PublicationDetail';
import type { Work } from '../../src/contract/types';
import { expectNoAxeViolations } from '../support/axe';
import { isSampleExport, sampleExport } from '../support/fixture';
import { author, work } from '../support/works';

const show = (overrides: Partial<Work> = {}, props: Record<string, unknown> = {}) =>
  render(
    <PublicationDetail
      work={work(overrides)}
      citationsAsOf="2026-09-20"
      overviewHref="/"
      {...props}
    />,
  );

describe('identity (docs/05 §6.1)', () => {
  it('is the page’s only h1, and carries the title as stored', () => {
    show({ title: '1_manuscript_2020-04-14.pdf' });
    // docs/06 §5: "The same applies to the one work whose stored title is a filename. It renders
    // as stored." A placeholder would hide a real gap in the pipeline.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      '1_manuscript_2020-04-14.pdf',
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('labels a preprint-only work as a preprint, here as everywhere else (Phase 1 §1)', () => {
    show({ is_preprint: true, kind: 'preprint' });
    expect(screen.getByText(/not yet published in a journal/)).toBeInTheDocument();
  });

  it('states the venue, the date and the kind', () => {
    show({
      venue: { name: 'Journal of Proteome Research', issn_l: '1535-3893' },
      date: '2025-11-14',
    });
    const identity = screen.getByText(/Journal of Proteome Research/);
    expect(identity).toHaveTextContent('14 November 2025');
    expect(identity).toHaveTextContent('article');
  });

  it('says so when no venue is recorded rather than showing a gap', () => {
    show({ venue: null });
    expect(screen.getByText(/No venue recorded/)).toBeInTheDocument();
  });
});

describe('links (docs/05 §6.2)', () => {
  it('links the DOI, PubMed and PubMed Central where present', () => {
    show({ ids: { doi: '10.1/x', pmid: '123', pmcid: 'PMC9', openalex: 'W1' } });
    expect(screen.getByRole('link', { name: /DOI 10.1\/x/ })).toHaveAttribute(
      'href',
      'https://doi.org/10.1/x',
    );
    expect(screen.getByRole('link', { name: /PubMed 123/ })).toHaveAttribute(
      'href',
      'https://pubmed.ncbi.nlm.nih.gov/123/',
    );
    expect(screen.getByRole('link', { name: /PubMed Central PMC9/ })).toHaveAttribute(
      'href',
      'https://pmc.ncbi.nlm.nih.gov/articles/PMC9/',
    );
  });

  it('links the open-access copy, with its status and licence', () => {
    show({ oa: { status: 'hybrid', url: 'https://oa.example.invalid', license: 'cc-by' } });
    expect(
      screen.getByRole('link', { name: /Open-access copy \(hybrid, cc-by\)/ }),
    ).toBeInTheDocument();
  });

  it('says there is none where there is none — 32 of 339 works (docs/05 §3.3)', () => {
    show({ oa: { status: 'closed', url: null, license: null } });
    expect(screen.getByText(/No open-access copy is recorded \(closed\)/)).toBeInTheDocument();
  });
});

describe('authors and affiliations (docs/05 §6.3)', () => {
  it('lists every author in published order, with a staff marker', () => {
    const { container } = show({
      authors: [
        author({ name: 'First Author' }),
        author({ name: 'Staff Member', staff: 'riffle' }),
      ],
      author_count: 2,
      staff_authors: ['riffle'],
    });
    const names = [...container.querySelectorAll('.author-name')].map((node) => node.textContent);
    expect(names).toEqual(['First Author', 'Staff Member UWPR staff']);
    expect(screen.getByText('UWPR staff')).toBeInTheDocument();
    expect(screen.getByText(/2 authors, 1 of them UWPR staff/)).toBeInTheDocument();
  });

  it('marks a corresponding author', () => {
    show({ authors: [author({ corresponding: true })], author_count: 1 });
    expect(screen.getByText('corresponding')).toBeInTheDocument();
  });

  it('links an ORCID where one is known (77% of slots)', () => {
    show({ authors: [author({ orcid: '0000-0002-1825-0097' })], author_count: 1 });
    expect(screen.getByRole('link', { name: /ORCID 0000-0002-1825-0097/ })).toHaveAttribute(
      'href',
      'https://orcid.org/0000-0002-1825-0097',
    );
  });

  it('says an affiliation could not be resolved rather than showing nothing', () => {
    show({
      authors: [author({ institutions: [], affiliations_raw: ['Somewhere, Nowhere'] })],
      author_count: 1,
    });
    expect(screen.getByText('No institution resolved')).toBeInTheDocument();
  });

  it('offers the raw affiliation string on demand', async () => {
    show({
      authors: [author({ affiliations_raw: ['Department of Genome Sciences, Seattle, USA'] })],
      author_count: 1,
    });
    await userEvent.click(screen.getByText('Affiliation as published'));
    expect(screen.getByText('Department of Genome Sciences, Seattle, USA')).toBeInTheDocument();
  });

  it('states the full author count, even for the 82-author case (docs/05 §13)', () => {
    show({
      authors: Array.from({ length: 82 }, (_, i) => author({ name: `A${String(i)}` })),
      author_count: 82,
    });
    expect(screen.getByText(/82 authors/)).toBeInTheDocument();
  });
});

describe('research areas at all four levels (docs/05 §6.4)', () => {
  it('shows topic, subfield, field and domain, primary first', () => {
    show({
      topics: [
        { domain: 'D2', field: 'F2', subfield: 'S2', topic: 'Second', score: 0.4, primary: false },
        { domain: 'D1', field: 'F1', subfield: 'S1', topic: 'First', score: 0.9, primary: true },
      ],
    });
    const rows = within(
      screen.getByRole('table', { name: /topics OpenAlex assigns/ }),
    ).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('First');
    expect(rows[1]).toHaveTextContent('primary');
    expect(rows[1]).toHaveTextContent('S1');
    expect(rows[1]).toHaveTextContent('F1');
    expect(rows[1]).toHaveTextContent('D1');
  });

  it('says so when OpenAlex reports none', () => {
    show({ topics: [] });
    expect(
      screen.getByText('OpenAlex reports no topics for this publication.'),
    ).toBeInTheDocument();
  });
});

describe('citations (docs/05 §6.5)', () => {
  it('gives the total, the field-weighted impact and the percentile with their source and date', () => {
    show({
      citations: {
        total: 42,
        by_year: { '2024': 20, '2025': 22 },
        fwci: 1.8,
        percentile: 0.91,
        as_of: '2026-09-20',
      },
    });
    expect(
      screen.getByText(/42 citations, reported by OpenAlex as of 20 September 2026/),
    ).toBeInTheDocument();
    expect(screen.getByText(/field-weighted citation impact is 1.80/)).toBeInTheDocument();
    expect(screen.getByText(/above 91% of comparable papers/)).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /Citations received by year/ });
    expect(within(table).getByRole('rowheader', { name: '2024' })).toBeInTheDocument();
  });

  it('says there is no field-weighted impact rather than showing a zero (16 of 339)', () => {
    show({
      citations: { total: 0, by_year: {}, fwci: null, percentile: null, as_of: '2026-09-20' },
    });
    expect(screen.getByText(/reports no field-weighted citation impact/)).toBeInTheDocument();
    expect(screen.getByText('No citations by year are recorded.')).toBeInTheDocument();
  });
});

describe('other versions and retraction (docs/05 §6.7, §6.8)', () => {
  it('links the version that is not canonical', () => {
    show({
      versions: [
        {
          kind: 'preprint',
          doi: '10.1101/2025.07.25.666826',
          date: '2025-07-29',
          year: 2025,
          url: 'https://doi.org/10.1101/2025.07.25.666826',
        },
      ],
    });
    expect(screen.getByRole('heading', { name: 'Other versions' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /preprint, 29 July 2025/ })).toBeInTheDocument();
  });

  it('omits the section entirely when there is only one version', () => {
    show({ versions: [] });
    expect(screen.queryByRole('heading', { name: 'Other versions' })).not.toBeInTheDocument();
  });

  it('flags a retraction prominently, and still counts the publication', () => {
    show({ retracted: true });
    expect(screen.getByRole('alert')).toHaveTextContent('This publication has been retracted.');
    expect(screen.getByRole('alert')).toHaveTextContent(/still counted/);
  });

  it('shows no flag when nothing is retracted', () => {
    show({ retracted: false });
    expect(screen.queryByText(/has been retracted/)).not.toBeInTheDocument();
  });
});

describe('getting back (docs/06 §3)', () => {
  it('offers a button back to the overview when there is one behind it', async () => {
    const onClose = vi.fn();
    show({}, { onClose });
    await userEvent.click(screen.getByRole('button', { name: 'Back to the publications' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape when it opened over the overview', async () => {
    const onClose = vi.fn();
    show({}, { onClose });
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('offers a link to an unfiltered overview when reached cold', () => {
    show({}, { standalone: true, overviewHref: '/' });
    expect(screen.getByRole('link', { name: 'See all publications' })).toHaveAttribute('href', '/');
  });

  it('says which old identifier opened it, so a retired permalink is not silent', () => {
    show({ id: 'W-000457' }, { resolvedFrom: 'W-000735' });
    expect(screen.getByRole('status')).toHaveTextContent('W-000735');
    expect(screen.getByRole('status')).toHaveTextContent('W-000457');
  });

  it('moves focus to the heading, so a keyboard reader is not left behind', () => {
    show();
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });
});

describe('accessibility', () => {
  it('passes axe', async () => {
    const { container } = show({
      retracted: true,
      authors: [author({ orcid: '0000-1', staff: 'eng', corresponding: true })],
      author_count: 1,
      versions: [
        {
          kind: 'preprint',
          doi: '10.1/p',
          date: '2020-01-01',
          year: 2020,
          url: 'https://x.invalid',
        },
      ],
    });
    await expectNoAxeViolations(container);
  });
});

describe.skipIf(!isSampleExport)('every work in the sample renders (docs/06 §12.1)', () => {
  it('renders all twelve cases of docs/05 §13 without throwing', () => {
    for (const item of sampleExport().works) {
      const { unmount } = render(
        <PublicationDetail work={item} citationsAsOf="2026-09-20" overviewHref="/" />,
      );
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(item.title);
      unmount();
    }
  });
});
