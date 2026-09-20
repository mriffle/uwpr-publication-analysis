/**
 * The method page (docs/06 §10, docs/05 §10), as a whole page.
 *
 * It is rendered through `Router`, because the two behaviours worth asserting cross every layer:
 * `/method` resolves as a route, and every figure on it is computed from the loaded export
 * rather than written into a string.
 *
 * **Nothing here hard-codes a figure.** Each expectation is derived from the document under
 * test, so the same assertions hold over the 16-work sample and the real 339-work export — which
 * is what lets `UWPR_EXPORT_DIR=/tmp/real-export npm test` check the page against docs/05 §10's
 * measured numbers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from '../../src/App';
import { criteriaBars } from '../../src/aggregate/categories';
import { evidenceSources } from '../../src/aggregate/method';
import { worksWithStaffAuthor } from '../../src/aggregate/metrics';
import { headlineFigures } from '../../src/components/HeadlineFigures';
import { CRITERION_LABELS } from '../../src/filter/describe';
import { formatDate } from '../../src/format/date';
import { metricDefinitions } from '../../src/method/definitions';
import { Method } from '../../src/views/Method';
import { sampleExport } from '../support/fixture';
import { expectNoAxeViolations } from '../support/axe';

const doc = sampleExport();
const { method } = doc;

const show = (path = '/method') => {
  window.history.replaceState(null, '', path);
  return render(
    <Router
      doc={doc}
      fetcher={() => Promise.reject(new Error('the method page needs no fetch'))}
      lookupHref="/data/lookup_index.json"
      now={new Date(doc.generated_at)}
    />,
  );
};

beforeEach(() => {
  // jsdom lays nothing out, so `ResponsiveChart` correctly declines to draw at zero width.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('the route', () => {
  it('opens on /method, under one h1 (docs/06 §9)', () => {
    show();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('How this was assembled');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('is reachable from the overview, and going back restores the filter (docs/06 §3, §4.1)', async () => {
    show(`/?year=${String(doc.period.last_year)}`);
    await userEvent.click(screen.getByRole('link', { name: 'How this was assembled' }));

    expect(window.location.pathname).toBe('/method');
    // The method page describes the whole corpus, so its URL carries no filter of its own.
    expect(window.location.search).toBe('');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('How this was assembled');
  });

  it('offers a link out when it is reached cold, and a button when it is not', () => {
    show();
    expect(screen.getByRole('link', { name: 'See all publications' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Back to the publications' }),
    ).not.toBeInTheDocument();
  });

  it('passes axe', async () => {
    const { container } = show();
    await expectNoAxeViolations(container);
  });
});

describe('how the corpus is assembled (docs/05 §10, §7.13)', () => {
  it('carries §7.13’s chart, over the whole corpus and not under a filter', () => {
    show();
    const card = screen.getByRole('region', { name: 'How each publication is known' });
    expect(card).toHaveAccessibleDescription();
    const bars = criteriaBars(doc.works, CRITERION_LABELS);
    for (const item of bars.items) {
      expect(
        within(card).getByRole('img', {
          name: new RegExp(`^${item.label}: ${String(item.count)} publications?\\.`),
        }),
      ).toBeInTheDocument();
    }
  });

  it('says the bars overlap and sum to more than the corpus', () => {
    show();
    const card = screen.getByRole('region', { name: 'How each publication is known' });
    expect(card).toHaveTextContent(
      'The bars overlap and sum to more than the number of publications.',
    );
    const bars = criteriaBars(doc.works, CRITERION_LABELS);
    expect(card).toHaveTextContent(`the bars total ${String(bars.total)}`);
  });

  it('links each criterion to the publication list already filtered by it (docs/05 §9)', () => {
    show();
    for (const item of criteriaBars(doc.works, CRITERION_LABELS).items) {
      expect(screen.getByRole('link', { name: item.label })).toHaveAttribute(
        'href',
        `/?criterion=${String(item.criterion)}`,
      );
    }
  });

  it('states the near-misses that are deliberately not evidence (D2)', () => {
    show();
    expect(
      screen.getByText(/that fact on its own never includes a publication/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Citing a program is not using the facility/)).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(`author on ${String(worksWithStaffAuthor(doc.works))} publication`),
      ),
    ).toBeInTheDocument();
  });

  it('names every exclusion the contract carries, with its note (docs/05 §10)', () => {
    show();
    // Nothing is hard-coded: the page shows whatever the export names, which is the point of
    // resource.exclusions — the app carries none of these names itself (§1.1 principle 5).
    expect(doc.resource.exclusions.length).toBeGreaterThan(0);
    for (const exclusion of doc.resource.exclusions) {
      expect(document.body.textContent).toContain(exclusion.name);
      expect(document.body.textContent).toContain(exclusion.note);
    }
  });

  it('groups them by kind, and shows no heading for a kind the contract omits', () => {
    show();
    const kinds = new Set(doc.resource.exclusions.map((exclusion) => exclusion.kind));
    for (const [kind, heading] of [
      ['facility', 'Other facilities.'],
      ['software', 'Software.'],
      ['tool', 'Web tools.'],
      ['hardware', 'Instrument designs.'],
    ] as const) {
      if (kinds.has(kind)) {
        expect(screen.getByText(heading)).toBeInTheDocument();
      } else {
        expect(screen.queryByText(heading)).toBeNull();
      }
    }
  });
});

describe('what is independently confirmed (docs/05 §10)', () => {
  const card = () => screen.getByRole('region', { name: /publications on the resource/i });

  it('divides the listed works into the three parts §10 names, with exact counts', () => {
    show();
    const chart = within(card());
    for (const [label, value] of [
      ['Evidence found in the publication itself', method.independently_confirmed],
      ['Full text read, no mention found', method.listing_only_text_read],
      ['Full text could not be read', method.listing_only_text_unavailable],
    ] as const) {
      expect(
        chart.getByRole('img', {
          name: new RegExp(
            `^${label}: ${String(value)} of ${String(method.official_list_total)} publications?,`,
          ),
        }),
      ).toBeInTheDocument();
    }
  });

  it('states the counts in the prose as well, from the block and not from a string', () => {
    show();
    expect(
      screen.getByText(
        new RegExp(
          `For ${String(method.independently_confirmed)} of them the project also found the use recorded`,
        ),
      ),
    ).toBeInTheDocument();
  });

  it('says why the two unconfirmed parts are different failures — the sentence no chart carries', () => {
    show();
    expect(screen.getByText(/has a gap in its acknowledgements/)).toBeInTheDocument();
    expect(screen.getByText(/gap in what its publisher makes available/)).toBeInTheDocument();
    expect(screen.getByText(/Only the first is a fact about the resource/)).toBeInTheDocument();
  });

  it('defines what "read" means, so the split cannot be over-read', () => {
    show();
    expect(screen.getByText(/searched sentence by/)).toBeInTheDocument();
    expect(
      screen.getByText(/It does not mean an abstract, a title or a database record was searched/),
    ).toBeInTheDocument();
  });

  it('offers the same split as a table of numbers (docs/06 §7)', async () => {
    show();
    const chart = within(card());
    await userEvent.click(chart.getByRole('button', { name: 'View as table' }));
    const row = chart.getByRole('row', { name: /Full text could not be read/ });
    expect(within(row).getByText(String(method.listing_only_text_unavailable))).toBeInTheDocument();
  });
});

describe('what the pipeline adds (docs/05 §10)', () => {
  it('draws the corpus split by whether a work is on the resource’s own list', () => {
    show();
    const card = within(screen.getByRole('region', { name: /corpus against the resource/i }));
    expect(
      card.getByRole('img', {
        name: new RegExp(
          `: ${String(method.beyond_official_list)} of ${String(doc.works.length)} `,
        ),
      }),
    ).toBeInTheDocument();
  });

  it('links to the publications that are not on the list', () => {
    show();
    expect(
      screen.getByRole('link', {
        name: `Show the ${String(method.beyond_official_list)} not on the list`,
      }),
    ).toHaveAttribute('href', '/?list=no');
  });
});

describe('what is known to be missed (Phase 1 §10)', () => {
  it('names the three accepted gaps, and refuses to estimate a total', () => {
    show();
    expect(screen.getByText(/No mention anywhere in the paper/)).toBeInTheDocument();
    expect(screen.getByText(/Text that is not machine-readable/)).toBeInTheDocument();
    expect(screen.getByText(/An acknowledgement behind a paywall/)).toBeInTheDocument();
    expect(screen.getByText(/A figure for what is missing would be a guess/)).toBeInTheDocument();
  });

  it('ties the readable gap to the one part of it that is measurable', () => {
    show();
    expect(
      screen.getByText(
        new RegExp(
          `The ${String(method.listing_only_text_unavailable)} in the chart above are the part of this that is visible`,
        ),
      ),
    ).toBeInTheDocument();
  });
});

describe('where the numbers come from (docs/05 §10)', () => {
  it('counts the publications whose evidence each source produced', () => {
    show();
    const card = within(screen.getByRole('region', { name: 'Where the evidence was found' }));
    for (const item of evidenceSources(doc.works).items) {
      expect(
        card.getByRole('img', {
          name: new RegExp(`^${item.label}: ${String(item.count)} publications?\\.`),
        }),
      ).toBeInTheDocument();
    }
  });

  it('gives every source the date it was last read, from the export’s own map', () => {
    show();
    const table = screen.getByRole('table', {
      name: /Each source and the date it was last read/,
    });
    for (const [name, date] of Object.entries(method.sources_last_read)) {
      const row = within(table).getByRole('row', { name: new RegExp(`^${name} `) });
      expect(within(row).getByText(formatDate(date))).toBeInTheDocument();
    }
  });
});

describe('the qualifications the charts cannot carry (docs/05 §5.1, §11.4)', () => {
  it('states that nothing here is a causal claim', () => {
    show();
    expect(screen.getByText(/Nothing here is a causal claim/)).toBeInTheDocument();
  });

  it('labels the proxy as a proxy and the floors as floors', () => {
    show();
    expect(screen.getByText(/is a proxy, not a count of groups/)).toBeInTheDocument();
    expect(screen.getByText(/Institutions and countries are floors/)).toBeInTheDocument();
  });

  it('names the incomplete year, and the year the citation series can start', () => {
    show();
    expect(
      screen.getByText(`The current year, ${String(doc.period.last_year)}, is incomplete`),
    ).toBeInTheDocument();
    // The window and the citations outside it are stated as figures, not left vague.
    const from = doc.period.citation_years_from;
    expect(from).not.toBeNull();
    expect(
      screen.getByText(new RegExp(`reports citations by year only from ${String(from)}`)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(
          `${String(doc.period.citations_before_window)} citations received before that are`,
        ),
      ),
    ).toBeInTheDocument();
  });
});

describe('a contract with no by-year citation window at all (docs/05 §5)', () => {
  it('says so, rather than naming a year it does not have', () => {
    // `period.citation_years_from` is nullable. A page that rendered "only from null" would be
    // worse than one that says the series does not exist.
    render(
      <Method
        doc={{ ...doc, period: { ...doc.period, citation_years_from: null } }}
        overviewHref="/"
      />,
    );
    expect(
      screen.getByText(
        new RegExp(
          `${doc.sources.citations.name} reports no citations by year for these publications at all`,
        ),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/reports citations by year only from/)).not.toBeInTheDocument();
  });
});

describe('the definitions docs/06 §4.2’s figures link into', () => {
  it('carries an anchored definition for every headline figure', () => {
    show();
    const ids = new Set(metricDefinitions(doc).map((definition) => definition.id));
    for (const figure of headlineFigures(doc.works, doc.sources.citations.as_of)) {
      expect(ids.has(figure.id)).toBe(true);
      expect(document.getElementById(figure.id)).not.toBeNull();
    }
  });

  it('states each figure’s value over the whole corpus, computed from the rows', () => {
    show();
    for (const definition of metricDefinitions(doc)) {
      const element = document.getElementById(definition.id);
      expect(element).toHaveTextContent(definition.term);
      expect(element).toHaveTextContent(definition.definition);
      if (definition.value !== undefined) expect(element).toHaveTextContent(definition.value);
    }
  });

  it('gives the citation percentile a definition but no corpus figure (docs/05 §2.2, §7.15)', () => {
    show();
    const percentile = metricDefinitions(doc).find((d) => d.id === 'citation-percentile');
    expect(percentile?.value).toBeUndefined();
    expect(document.getElementById('citation-percentile')).toHaveTextContent(
      /a median percentile over a corpus is not a percentile of anything/,
    );
  });

  it('makes each definition a focus target, so a fragment link lands somewhere', () => {
    show();
    for (const definition of metricDefinitions(doc)) {
      expect(document.getElementById(definition.id)).toHaveAttribute('tabindex', '-1');
    }
  });

  it('focuses the definition a figure linked to (docs/06 §4.2, §9)', () => {
    show('/method#research-groups');
    expect(document.activeElement).toBe(document.getElementById('research-groups'));
  });

  it('does nothing when the fragment names nothing', () => {
    show('/method#no-such-definition');
    expect(document.activeElement).toBe(document.body);
  });
});

describe('how current this is (docs/05 §10)', () => {
  it('states the generation date, the schedule and the run that produced it', () => {
    show();
    expect(
      screen.getByText(new RegExp(`generated on ${formatDate(doc.generated_at)}`)),
    ).toBeInTheDocument();
    expect(screen.getByText(/normally refreshed weekly/)).toBeInTheDocument();
    expect(screen.getByText(doc.run_id)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`rule version ${doc.rule_version.replace(/\./g, '\\.')}`)),
    ).toBeInTheDocument();
  });

  it('says how a mistake is corrected (docs/02 §9)', () => {
    show();
    expect(
      screen.getByText(/The project records overrides for exactly that purpose/),
    ).toBeVisible();
  });

  it('says so when the data is more than two weekly runs old (docs/06 §7)', () => {
    window.history.replaceState(null, '', '/method');
    render(
      <Router
        doc={doc}
        fetcher={() => Promise.reject(new Error('no fetch'))}
        lookupHref="/data/lookup_index.json"
        now={new Date(Date.parse(doc.generated_at) + 20 * 86_400_000)}
      />,
    );
    expect(screen.getByText(/it is out of date/)).toBeInTheDocument();
  });
});
