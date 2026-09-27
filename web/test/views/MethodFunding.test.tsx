/**
 * The method page's `#funding` section (docs/09 §12.9), as the page renders it.
 *
 * Rendered through `Router` where the route matters (the anchor, the fragment focus, the flag),
 * and through `Method` where only the document changes. **Nothing here hard-codes a figure**:
 * every count is read from the document under test, so the same assertions hold over the sample
 * and a real export (`UWPR_EXPORT_DIR`), as the rest of the method page's do.
 *
 * Three things are acceptance criteria rather than details: every anchor the Funding impact
 * view's figures link to exists, with the corpus value `funding.summary` holds; nothing in the
 * section is worded as credit or cause (§12.11 rule 1); and NLM's phrase is shown where its data
 * is used (§13.3).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Router } from '../../src/App';
import type { ExportDocument, Grant } from '../../src/contract/types';
import { formatDate } from '../../src/format/date';
import { formatCount, formatUsd, pluralize } from '../../src/format/number';
import {
  FUNDING_DEFINITION_IDS,
  fundingDefinitions,
  metricDefinitions,
} from '../../src/method/definitions';
import { fundingMethodFacts } from '../../src/method/funding';
import { Method } from '../../src/views/Method';
import { expectNoAxeViolations } from '../support/axe';
import { sampleExport } from '../support/fixture';
import {
  agency,
  fundingBlock,
  fundingDocument,
  grant,
  legacyDocument,
  listing,
  noFundingBlock,
  reporterSource,
} from '../support/funding';

const doc = sampleExport();
const SECTION = 'How the funding figures are assembled';

const show = (path = '/method', document: ExportDocument = doc) => {
  window.history.replaceState(null, '', path);
  return render(
    <Router
      doc={document}
      fetcher={() => Promise.reject(new Error('the method page needs no fetch'))}
      lookupHref="/data/lookup_index.json"
      now={new Date(document.generated_at)}
    />,
  );
};

const page = (document: ExportDocument) =>
  render(<Method doc={document} overviewHref="/" now={new Date(document.generated_at)} />);

const section = () => screen.getByRole('region', { name: SECTION });

/** The section's text, whitespace collapsed, as a reader (or a screen reader) meets it. */
const prose = () => (section().textContent ?? '').replace(/\s+/g, ' ');

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('the section (docs/09 §12.9)', () => {
  it('is an h2 at #funding, after the publication definitions and before "How current this is"', () => {
    show();
    const heading = screen.getByRole('heading', { level: 2, name: SECTION });
    expect(heading).toHaveAttribute('id', 'funding');
    expect(section()).toContainElement(heading);

    const h2s = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(h2s.indexOf(SECTION)).toBe(h2s.indexOf('What each figure means') + 1);
    expect(h2s.indexOf('How current this is')).toBe(h2s.indexOf(SECTION) + 1);
  });

  it('is linked from the publication definitions, so a reader there finds the funding ones', () => {
    show();
    expect(screen.getByRole('link', { name: 'with the funding section' })).toHaveAttribute(
      'href',
      '#funding-definitions',
    );
    expect(document.getElementById('funding-definitions')).not.toBeNull();
  });

  it('gives every element on the page a distinct id', () => {
    const { container } = show();
    const ids = [...container.querySelectorAll('[id]')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('passes axe', async () => {
    const { container } = show();
    expect(section()).toBeInTheDocument();
    await expectNoAxeViolations(container);
  }, 30_000);
});

describe('the funding definitions the Funding impact view links to (docs/09 §12.5 item 2)', () => {
  it('renders every FUNDING_DEFINITION_IDS anchor inside the section, as a focus target', () => {
    show();
    for (const id of FUNDING_DEFINITION_IDS) {
      const element = document.getElementById(id);
      expect(element, id).not.toBeNull();
      expect(section()).toContainElement(element);
      expect(element).toHaveAttribute('tabindex', '-1');
    }
  });

  it('states every funding definition in full, with its corpus value', () => {
    show();
    for (const definition of fundingDefinitions(doc)) {
      const element = document.getElementById(definition.id);
      expect(element).toHaveTextContent(definition.term);
      expect(element).toHaveTextContent(definition.definition);
      expect(definition.value).toBeDefined();
      expect(element).toHaveTextContent(definition.value ?? '');
    }
  });

  it('keeps them apart from the publication definitions', () => {
    show();
    const publicationList = document.getElementById('publications')?.closest('dl');
    for (const definition of metricDefinitions(doc)) {
      expect(section()).not.toContainElement(document.getElementById(definition.id));
    }
    for (const id of FUNDING_DEFINITION_IDS) {
      expect(publicationList).not.toContainElement(document.getElementById(id));
    }
  });

  it('shows the values funding.summary holds, the pipeline’s own count', () => {
    show();
    const summary = doc.funding.summary;
    const unknown = summary.grants_resolved - summary.grants_with_amount;
    const text = (id: string) => document.getElementById(id)?.textContent ?? '';

    expect(text('funding-total')).toContain(formatUsd(summary.amount_usd));
    if (unknown > 0) {
      expect(text('funding-total')).toContain(`${pluralize(unknown, 'grant')} without a known`);
    }
    expect(text('funding-grants')).toContain(formatCount(summary.grants_resolved));
    expect(text('funding-agencies')).toContain(formatCount(summary.agencies));
    expect(text('funding-investigators')).toContain(formatCount(summary.investigators));
    expect(text('funding-organizations')).toContain(formatCount(summary.organizations));
    expect(text('funding-publications')).toContain(
      `${formatCount(summary.works_with_grants)} of ${formatCount(doc.works.length)}`,
    );
    expect(text('funding-institution-wide')).toContain(
      `${pluralize(summary.grants_institution_wide, 'award')}, ${formatUsd(summary.amount_usd_institution_wide)}`,
    );
    expect(text('funding-unmatched')).toContain(
      `${formatCount(summary.grants - summary.grants_resolved)}, on`,
    );
    expect(text('funding-first-year')).toContain(
      `${String(summary.first_year)}–${String(summary.last_year)}`,
    );
  });

  it('focuses the definition a funding figure linked to (docs/06 §4.2, §9)', () => {
    show('/method#funding-total');
    expect(document.activeElement).toBe(document.getElementById('funding-total'));
  });
});

describe('the register (docs/09 §12.11)', () => {
  /**
   * Rule 1: never "funding generated, attracted, enabled or supported by" the resource. The list
   * is the rule's words and their near relatives; each is matched as a word, so that "known" is
   * not caught for "won".
   */
  const CREDIT_OR_CAUSE = [
    'generated',
    'generating',
    'attracted',
    'attract',
    'enabled',
    'enable',
    'brought in',
    'bring in',
    'thanks to',
    'supported by',
    'support',
    'leveraged',
    'leverage',
    'secured',
    'won',
    'earned',
    'caused',
    'resulted in',
    'led to',
    'drove',
    'credit',
    'because of',
    'due to',
    'return on',
  ];

  it('uses no wording of credit or cause, anywhere in the section', () => {
    show();
    const text = prose().toLowerCase();
    for (const words of CREDIT_OR_CAUSE) {
      expect(text, words).not.toMatch(new RegExp(`\\b${words}\\b`));
    }
  });

  it('says what the figures do not claim before it says anything else', () => {
    show();
    const opening = within(section()).getByText(
      'A grant here is one a publication lists, and nothing more is claimed for it.',
    );
    expect(opening.closest('p')).toHaveTextContent(
      `They do not say that ${doc.resource.short_name} had any part in a grant being awarded`,
    );
  });

  it('carries "not money spent on this work" in the headline definition, and in the prose', () => {
    show();
    expect(document.getElementById('funding-total')).toHaveTextContent(
      'not money spent on this work',
    );
    expect(prose()).toContain('It is what the award is worth, not money spent on this work');
  });

  it('never shows an unknown amount as $0: the one "$0" is the rule saying so', () => {
    show();
    expect(prose()).toContain('never in it as $0.');
    expect(prose().match(/\$0(?![\d,.]\d)/g)).toEqual(['$0']);
  });

  it('says the resource’s own identifier is evidence and never a grant (rule 10)', () => {
    show();
    const identifier = doc.resource.identifier;
    expect(prose()).toContain(
      `The resource’s own award identifier, ${identifier}: ${formatCount(doc.funding.method.strings.resource_code)}.`,
    );
    expect(prose()).toContain('It is evidence that the publication used the resource');
    expect(prose()).toContain('not shown as a grant anywhere');
    // Nowhere else in the section: not as a grant, a definition's value or an unmatched number.
    expect(prose().split(identifier)).toHaveLength(2);
  });
});

describe('the sources and the terms they carry (docs/09 §11.3, §13.3)', () => {
  it('names every funding source, linked, with the date it was last read', () => {
    show();
    for (const source of doc.funding.sources) {
      const link = within(section()).getByRole('link', { name: source.name });
      expect(link).toHaveAttribute('href', source.url);
      expect(link.closest('li')).toHaveTextContent(`read on ${formatDate(source.as_of)}`);
    }
  });

  it('shows NLM’s phrase where its data is used, dated, and says it may not be current', () => {
    show();
    const phrase = within(section()).getByText(
      'Courtesy of the U.S. National Library of Medicine.',
    );
    expect(phrase).toBeVisible();
    const pubmed = doc.funding.sources.find((source) => source.id === 'pubmed');
    expect(pubmed).toBeDefined();
    expect(phrase.closest('p')).toHaveTextContent(`read on ${formatDate(pubmed?.as_of ?? '')}`);
    expect(phrase.closest('p')).toHaveTextContent(
      'may not reflect the most current data available from the National Library of Medicine',
    );
    expect(phrase.closest('p')).toHaveTextContent('which does not endorse this site');
  });

  it('says the rates are inverted from how they are published, as CC BY asks', () => {
    show();
    expect(prose()).toContain(
      'the rates used here are those figures inverted, to US dollars per unit',
    );
    expect(prose()).toContain('That is a change made here to the data as published.');
    for (const rates of doc.funding.exchange_rates) {
      expect(within(section()).getByRole('link', { name: rates.name })).toHaveAttribute(
        'href',
        rates.url,
      );
      expect(prose()).toContain(
        `${rates.name} (${pluralize(rates.currencies.length, 'currency', 'currencies')}, through ${String(rates.through_year)})`,
      );
    }
  });

  it('gives RePORTER’s first fiscal year and the fiscal year in progress, from the export', () => {
    show();
    const reporter = doc.funding.sources.find((source) => source.id === 'reporter');
    expect(reporter?.amounts_from).not.toBeNull();
    expect(reporter?.partial_year).not.toBeNull();
    expect(prose()).toContain(
      `${reporter?.name ?? ''}’s amounts begin in fiscal year ${String(reporter?.amounts_from)}.`,
    );
    expect(prose()).toContain(
      `fiscal year ${String(reporter?.partial_year)} was in progress, so its amounts are partial`,
    );
  });
});

describe('the rules and what they decided (docs/09 §6, §11.3 method)', () => {
  it('states each count the method block holds', () => {
    show();
    const { strings, resolution } = doc.funding.method;
    const text = prose();
    const total = Object.values(strings).reduce((sum, count) => sum + count, 0);
    expect(text).toContain(`The publications give ${pluralize(total, 'number')} as funding`);
    expect(text).toContain(`Not a grant: ${formatCount(strings.not_a_grant)}.`);
    expect(text).toContain(`A facility contract: ${formatCount(strings.facility_contract)}.`);
    expect(text).toContain(`Matched to a grant: ${formatCount(strings.grant)}.`);
    expect(text).toContain(`Matched by no funder’s record: ${formatCount(strings.unresolved)}.`);
    expect(text).toContain(`${formatCount(resolution.exact)} matched a funder’s record exactly`);
    expect(text).toContain(`${formatCount(resolution.normalised)} matched after a fix`);
    expect(text).toMatch(
      new RegExp(`${formatCount(resolution.corrected)} (was|were) corrected to a near-miss`),
    );
    expect(text).toMatch(
      new RegExp(`${formatCount(resolution.override)} (was|were) decided by an override`),
    );
  });

  it('says investigators and organisations are counted partly by name (§11.6)', () => {
    show();
    expect(prose()).toContain('Investigators and organisations are counted partly by name.');
    expect(prose()).toContain('counts twice');
    expect(prose()).toContain('count once');
  });

  it('explains sub-projects and supplements, and each source’s total by its count', () => {
    show();
    const text = prose();
    expect(text).toContain('the sub-project rows are left out');
    expect(text).toContain('a supplement');
    const listed = doc.funding.grants.filter((entry) => entry.status === 'resolved');
    const on = (...bases: string[]) =>
      listed.filter((entry) => bases.includes(entry.amount_source?.basis ?? '')).length;
    const names = new Map(doc.funding.sources.map((source) => [source.id, source.name]));
    for (const [id, count] of [
      ['reporter', on('reporter_fiscal_years', 'reporter_contract', 'reporter_task_order')],
      ['nsf', on('nsf_obligated', 'nsf_estimated')],
      ['usaspending', on('usaspending_obligation')],
      ['openalex', on('openalex_amount')],
    ] as const) {
      if (count > 0)
        expect(text).toContain(`${names.get(id) ?? ''}, ${pluralize(count, 'grant')}.`);
    }
  });

  it('states the active grants, the institution-wide awards and Miscellaneous by their counts', () => {
    show();
    const facts = fundingMethodFacts(doc);
    const text = prose();
    expect(text).toContain(`Active grants: ${formatCount(facts?.grants.active ?? -1)}.`);
    expect(text).toContain(
      `${pluralize(doc.funding.summary.grants_institution_wide, 'institution-wide award')}, worth ${formatUsd(doc.funding.summary.amount_usd_institution_wide)}`,
    );
    expect(text).toContain('Institution-wide awards are included in every total by default');
    expect(text).toContain('never inferred from its size');
    expect(text).toContain(
      `under Miscellaneous: ${pluralize(facts?.miscellaneous.grants ?? -1, 'distinct number')}`,
    );
  });

  it('states the first-year rule as a publication year, not an award year', () => {
    show();
    expect(prose()).toContain('It is a publication year, not the year of the award');
    expect(prose()).toContain('under a filter the earliest one the filter shows');
  });

  it('names the partial publication year when the export says it is one', () => {
    show();
    expect(doc.period.current_year_partial).toBe(true);
    expect(prose()).toContain(`${String(doc.period.last_year)} is a partial publication year`);
  });
});

describe('an export with no funding data (docs/09 §12.10)', () => {
  it.each([
    ['a 1.1 export whose block has a null version', { ...doc, funding: noFundingBlock() }],
    ['a 1.0 export with no funding block', legacyDocument()],
  ])(
    'renders the page, and the section says so in a sentence: %s',
    async (_, exported) => {
      const { container } = page(exported);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('How this was assembled');
      expect(section()).toHaveTextContent(
        'This export carries no funding data, so there are no funding figures to describe.',
      );
      for (const id of FUNDING_DEFINITION_IDS) expect(container.querySelector(`#${id}`)).toBeNull();
      expect(screen.queryByRole('link', { name: 'with the funding section' })).toBeNull();
      expect(screen.queryByText(/Courtesy of the U\.S\. National Library of Medicine/)).toBeNull();
      await expectNoAxeViolations(container);
    },
    30_000,
  );
});

describe('a build without the Funding impact view (VITE_FUNDING off)', () => {
  it('has no funding section, anchor or link, and the page is otherwise whole', () => {
    vi.stubEnv('VITE_FUNDING', '');
    const { container } = show();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('How this was assembled');
    expect(screen.queryByRole('region', { name: SECTION })).toBeNull();
    expect(container.querySelector('#funding')).toBeNull();
    for (const id of FUNDING_DEFINITION_IDS) expect(container.querySelector(`#${id}`)).toBeNull();
    expect(screen.queryByRole('link', { name: 'with the funding section' })).toBeNull();
    expect(container.textContent).not.toMatch(/National Library of Medicine/);
    // The publication definitions are all still there.
    for (const definition of metricDefinitions(doc)) {
      expect(container.querySelector(`#${definition.id}`)).not.toBeNull();
    }
  });
});

describe('funding data that varies what the section can say', () => {
  /** The sample's works, the first listing the given grants and the rest none. */
  const firstLists = (...keys: [string, readonly [string, ...string[]]][]) =>
    sampleExport().works.map((entry, position) => ({
      ...entry,
      grants:
        position === 0
          ? keys.map(([key, agencies]) =>
              listing({ grant: key, agencies: [...agencies] as [string, ...string[]] }),
            )
          : [],
    }));
  const NIGMS_CHAIN = ['NIH', 'NIGMS'] as const;

  const nsfGrant = (overrides: Partial<Grant> = {}): Grant =>
    grant({
      key: 'NSF:1234567',
      agency: 'NSF',
      number: '1234567',
      pis: [],
      amount_usd: null,
      amount_source: null,
      fiscal_years: null,
      flags: ['amount_not_found'],
      url: null,
      url_name: null,
      ...overrides,
    });

  it('leaves out NLM’s phrase when no PubMed data was used, and states no rate source it lacks', () => {
    page(fundingDocument({ funding: fundingBlock({ sources: [reporterSource()] }) }));
    expect(screen.queryByText(/National Library of Medicine/)).toBeNull();
    expect(prose()).toContain(
      'converted to US dollars at the annual average rate for the year the award started. A start',
    );
    expect(prose()).toContain('No amount listed is converted.');
    expect(prose()).toContain('No grant listed is in a currency these rates do not cover.');
    expect(prose()).toContain('None here started before then.');
  });

  it('says every grant has a known amount when none lacks one, and no $0 anywhere', () => {
    page(
      fundingDocument({
        funding: fundingBlock({ grants: [grant()] }),
        works: firstLists(['NIH:R01GM000001', NIGMS_CHAIN]),
      }),
    );
    expect(prose()).toContain('Every grant listed has a known amount in US dollars.');
    expect(prose()).toContain('The grants listed include no institution-wide awards.');
  });

  it('dates nothing it does not have, and names no fiscal year a source does not report', () => {
    page(
      fundingDocument({
        funding: fundingBlock({
          as_of: null,
          sources: [reporterSource({ amounts_from: null, partial_year: null })],
        }),
      }),
    );
    expect(prose()).not.toContain('Every amount was read on or after');
    expect(prose()).not.toContain('was in progress');
    expect(prose()).not.toContain('amounts begin in fiscal year');
  });

  it('counts publications with no funding metadata, and institution-wide awards of unknown value', () => {
    const wide = nsfGrant({ scope: 'institution-wide', scope_reason: 'NSF GRFP' });
    const exported = fundingDocument({
      funding: fundingBlock({
        agencies: [
          ...fundingBlock().agencies,
          agency({ code: 'NSF', name: 'National Science Foundation', short_name: 'NSF' }),
        ],
        grants: [grant(), wide],
        method: { ...fundingBlock().method, works_without_funding_metadata: 3 },
      }),
      works: firstLists(['NIH:R01GM000001', NIGMS_CHAIN], ['NSF:1234567', ['NSF']]),
    });
    page(exported);
    expect(prose()).toContain('3 publications give none that any source here records');
    expect(prose()).toContain(
      'The grants listed include 1 institution-wide award, none with a known amount.',
    );
  });

  it('gives a partly known institution-wide value with its unknowns beside it', () => {
    const known = grant({
      key: 'NIH:R01GM000002',
      number: 'R01GM000002',
      scope: 'institution-wide',
    });
    const unknown = grant({
      key: 'NIH:R01GM000003',
      number: 'R01GM000003',
      scope: 'institution-wide',
      amount_usd: null,
      amount_source: null,
      fiscal_years: null,
      flags: ['amount_not_found'],
    });
    const exported = fundingDocument({
      funding: fundingBlock({ grants: [known, unknown] }),
      works: firstLists(['NIH:R01GM000002', NIGMS_CHAIN], ['NIH:R01GM000003', NIGMS_CHAIN]),
    });
    page(exported);
    expect(prose()).toContain(
      `2 institution-wide awards, worth ${formatUsd(known.amount_usd ?? 0)} for the 1 with a known amount, and 1 with none known`,
    );
    expect(prose()).toContain('1 grant listed has no known amount in US dollars');
  });
});
