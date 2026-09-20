/**
 * `/lookup` — "Why is a paper not here?" (docs/06 §3, docs/05 §8).
 *
 * The behaviours under test are the three answers docs/05 §8 requires the app to distinguish,
 * and the two failures that must never be mistaken for one of them:
 *
 * > **Three outcomes**, and the app must distinguish them: included; considered and not
 * > included, with the reason; and not found at all, which means no channel ever nominated it
 * > and says nothing about the paper.
 *
 * A failed index fetch and an identifier we do not recognise are both statements about *us*, and
 * each is asserted here to say so rather than to report "not in the data" — a network failure
 * presented as a fact about someone's paper is the worst thing this page could do.
 *
 * Nothing hard-codes a figure or an identifier: the real cases are read out of the fixture,
 * which is `samples/export/` by default and the real 339-work export under `UWPR_EXPORT_DIR`.
 * The shapes the fixture happens not to hold — a rejection with no signal at all, which is the
 * commoner shape in the real index, two signals carrying the same label, and each of the five
 * recorded reasons — are served from rows built here, the way `test/support/works.ts` pins the
 * edges of the arithmetic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from '../../src/App';
import { buildWorkIndex } from '../../src/contract/resolve';
import type { Fetcher } from '../../src/contract/load';
import type { LookupIndexDocument } from '../../src/contract/types';
import { Lookup } from '../../src/views/Lookup';
import { expectNoAxeViolations } from '../support/axe';
import { sampleExport, sampleLookup } from '../support/fixture';

const doc = sampleExport();
const lookup = sampleLookup();
const index = buildWorkIndex(doc);
const LOOKUP_URL = '/data/lookup_index.json';

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`the fixture must carry ${what}`);
  return value;
}

type Row = LookupIndexDocument['not_included'][number];

/** A rejected candidate of a given shape, chosen from the fixture rather than named here. */
const rejected = (predicate: (row: Row) => boolean, what: string): Row =>
  required(lookup.not_included.find(predicate), what);

/** The identifier a reader would paste for a candidate: its DOI, or its work identifier. */
const identifierFor = (row: Row): string => row.ids.doi ?? row.id;

let sequence = 0;

/** A rejected candidate of an exact shape, for the shapes the fixture does not happen to hold. */
function row(overrides: Partial<Row> = {}): Row {
  sequence += 1;
  return {
    id: `W-99${String(sequence).padStart(4, '0')}`,
    title: `A paper that was considered ${String(sequence)}`,
    year: 2019,
    ids: { doi: null, pmid: null, pmcid: null, openalex: null },
    reason: 'no_rule_fired',
    reason_label: 'No evidence of UWPR support was found in this paper',
    signals: [],
    signal_labels: [],
    ...overrides,
  };
}

const serve = (document_: LookupIndexDocument) => {
  const calls: string[] = [];
  const fetcher: Fetcher = (input) => {
    calls.push(input);
    return Promise.resolve(new Response(JSON.stringify(document_), { status: 200 }));
  };
  return { calls, fetcher };
};

const serving = () => serve(lookup);

/** The same rows, with the alias map the pipeline would have written for them. */
const servingRows = (rows: Row[]) =>
  serve({
    ...lookup,
    aliases: Object.fromEntries(
      rows.flatMap((entry) =>
        (
          [
            ['doi', entry.ids.doi?.toLowerCase()],
            ['pmid', entry.ids.pmid],
            ['pmcid', entry.ids.pmcid],
            ['openalex', entry.ids.openalex],
          ] as const
        )
          .filter(([, value]) => value != null)
          .map(([scheme, value]) => [`${scheme}:${String(value)}`, entry.id]),
      ),
    ),
    not_included: rows,
  });

const offline: Fetcher = () => Promise.reject(new Error('offline'));

const show = (fetcher: Fetcher) =>
  render(
    <Lookup
      doc={doc}
      index={index}
      lookupHref={LOOKUP_URL}
      fetcher={fetcher}
      overviewHref="/"
      methodHref="/method"
      publicationHref={(work) => `/publication/${work.id}`}
    />,
  );

/** Type an identifier and submit, the way a reader does. */
async function ask(term: string) {
  const field = screen.getByRole('textbox', { name: 'Publication identifier' });
  await userEvent.clear(field);
  await userEvent.type(field, term);
  await userEvent.click(screen.getByRole('button', { name: 'Look up' }));
}

const INCLUDED = 'This publication is included';
const NOT_INCLUDED = 'This publication was considered and is not included';
const UNKNOWN = 'This identifier is not in this project’s data';

/** The outcome the card declares, which is what tells the three apart at a glance. */
async function outcome(): Promise<string> {
  const card = await waitFor(() => {
    const found = document.querySelector('.lookup-answer');
    if (found === null) throw new Error('no answer card is on screen');
    return found;
  });
  return card.getAttribute('data-outcome') ?? '';
}

describe('the form (docs/06 §9)', () => {
  it('is one h1, a real labelled field and a real button', () => {
    show(serving().fetcher);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: 'Publication identifier' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Look up' })).toBeInTheDocument();
  });

  it('says which identifiers it takes, before the reader guesses', () => {
    show(serving().fetcher);
    expect(
      screen.getByRole('textbox', { name: 'Publication identifier' }),
    ).toHaveAccessibleDescription(/DOI, a PubMed ID, a PubMed Central ID/);
  });

  it('submits on Enter, so the form is usable from the keyboard alone', async () => {
    show(serving().fetcher);
    const target = required(doc.works[0], 'a work');
    const field = screen.getByRole('textbox', { name: 'Publication identifier' });
    field.focus();
    await userEvent.keyboard(`${target.id}{Enter}`);
    await screen.findByRole('heading', { name: INCLUDED });
  });

  it('has no axe violations before anything is asked', async () => {
    const { container } = show(serving().fetcher);
    await expectNoAxeViolations(container);
  });
});

describe('the index loads on demand (docs/06 §10)', () => {
  it('is fetched once, when the lookup is opened', async () => {
    const { calls, fetcher } = serving();
    show(fetcher);
    await waitFor(() => {
      expect(calls).toEqual([LOOKUP_URL]);
    });
  });
});

describe('outcome one: included (docs/05 §8)', () => {
  it('answers a work identifier from the export alone, and shows the evidence itself', async () => {
    const { fetcher } = serving();
    show(fetcher);
    const target = required(doc.works[0], 'a work');
    await ask(target.id);

    const card = await screen.findByRole('region', { name: INCLUDED });
    expect(within(card).getByText(target.title)).toBeInTheDocument();
    // The steer, and docs/05 §11.6: the evidence is rendered, not counted or paraphrased. It is
    // the same component the detail view uses, so each special case keeps its own wording here.
    const evidence = within(card).getByRole('list', {
      name: 'Evidence that this publication used the resource',
    });
    expect(within(evidence).getAllByRole('listitem')).toHaveLength(target.evidence.length);
    expect(
      within(card).getByRole('link', { name: 'See the full record for this publication' }),
    ).toHaveAttribute('href', `/publication/${target.id}`);
  });

  it('answers a DOI, which only the index can resolve, and in any case', async () => {
    const { calls, fetcher } = serving();
    show(fetcher);
    const target = required(
      doc.works.find((work) => work.ids.doi !== null),
      'a work with a DOI',
    );
    await ask(String(target.ids.doi).toUpperCase());
    await screen.findByRole('region', { name: INCLUDED });
    expect(calls).toEqual([LOOKUP_URL]);
  });

  it('says so when the identifier was a retired one, so the answer can be checked', async () => {
    const { fetcher } = serving();
    show(fetcher);
    const merged = required(
      doc.works.find((work) => work.aliases.length > 0),
      'a work with a retired identifier',
    );
    const retired = required(merged.aliases[0], 'a retired identifier');
    await ask(retired);
    const card = await screen.findByRole('region', { name: INCLUDED });
    expect(card).toHaveTextContent(`${retired} is a retired identifier for this work`);
    expect(card).toHaveTextContent(merged.id);
  });

  it('has no axe violations', async () => {
    const rendered = show(serving().fetcher);
    await ask(required(doc.works[0], 'a work').id);
    await screen.findByRole('region', { name: INCLUDED });
    await expectNoAxeViolations(rendered.container);
  });
});

describe('outcome two: considered and not included (docs/05 §8)', () => {
  it('gives the recorded reason in plain language, and what it does not mean', async () => {
    const { fetcher } = serving();
    show(fetcher);
    const candidate = rejected((entry) => entry.reason === 'no_rule_fired', 'a candidate');
    await ask(identifierFor(candidate));

    const card = await screen.findByRole('region', { name: NOT_INCLUDED });
    expect(within(card).getByText(candidate.title)).toBeInTheDocument();
    expect(card).toHaveTextContent(candidate.reason_label);
    // The sentences no styling can carry: this is about the record, not about the work.
    expect(card).toHaveTextContent(/a statement about the record, not about the work/);
    expect(card).toHaveTextContent(/did not say so reads exactly like this one/);
    // And what to do about it, which is what this reader came for.
    expect(card).toHaveTextContent(/correction worth reporting/);
  });

  it('shows each near-miss signal as its own item, with the decision behind it', async () => {
    const { fetcher } = serving();
    show(fetcher);
    const candidate = rejected((entry) => entry.signals.length > 0, 'a candidate with a signal');
    await ask(identifierFor(candidate));

    const card = await screen.findByRole('region', { name: NOT_INCLUDED });
    const signals = within(card).getByRole('list');
    expect(within(signals).getAllByRole('listitem')).toHaveLength(candidate.signals.length);
    for (const label of candidate.signal_labels) expect(signals).toHaveTextContent(label);
    // Without this, a chip reads as a connection noticed and then dismissed arbitrarily.
    expect(card).toHaveTextContent(/the rules deliberately do not count on its own/);
  });

  it('links the paper’s own identifiers, so the reader can check it is the right paper', async () => {
    const { fetcher } = serving();
    show(fetcher);
    const candidate = rejected((entry) => entry.ids.doi !== null, 'a candidate with a DOI');
    const doi = String(candidate.ids.doi);
    await ask(doi);
    const card = await screen.findByRole('region', { name: NOT_INCLUDED });
    expect(within(card).getByRole('link', { name: `DOI ${doi}` })).toHaveAttribute(
      'href',
      `https://doi.org/${doi}`,
    );
  });

  it('is not styled as a failure: no alert, no error state', async () => {
    const { fetcher } = serving();
    show(fetcher);
    await ask(identifierFor(rejected(() => true, 'a candidate')));
    await screen.findByRole('region', { name: NOT_INCLUDED });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(document.querySelector('.notice-error')).toBeNull();
  });

  it('has no axe violations', async () => {
    const rendered = show(serving().fetcher);
    await ask(identifierFor(rejected((entry) => entry.signals.length > 0, 'a candidate')));
    await screen.findByRole('region', { name: NOT_INCLUDED });
    await expectNoAxeViolations(rendered.container);
  });
});

describe('the shapes a rejection takes (docs/05 §8)', () => {
  it('handles the commoner shape, a candidate carrying no signal at all', async () => {
    // "Of the 341 where no rule fired, 136 carry a signal … and 205 carry none at all."
    const only = row({ signals: [], signal_labels: [] });
    show(servingRows([only]).fetcher);
    await ask(only.id);

    const card = await screen.findByRole('region', { name: NOT_INCLUDED });
    expect(card).toHaveTextContent(/no near miss was recorded against this paper/);
    expect(within(card).queryByRole('list')).not.toBeInTheDocument();
  });

  it('tells two signals apart when their labels are identical', async () => {
    // Real: a paper with two staff co-authors carries the same label twice, and only the staff
    // identifier distinguishes them.
    const staff = doc.resource.staff.slice(0, 2);
    expect(staff).toHaveLength(2);
    const label = 'A UWPR staff member is a co-author, which on its own is not evidence';
    const only = row({
      signals: staff.map((person) => `staff_coauthor:${person.id}`),
      signal_labels: [label, label],
    });
    show(servingRows([only]).fetcher);
    await ask(only.id);

    const card = await screen.findByRole('region', { name: NOT_INCLUDED });
    const items = within(card).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    for (const [position, person] of staff.entries()) {
      expect(items[position]).toHaveTextContent(label);
      expect(items[position]).toHaveTextContent(person.name);
    }
  });

  it.each([
    ['no_rule_fired', /a statement about the record, not about the work/],
    ['excluded_record_type', /set aside before any rule is applied/],
    ['before_window', /outside the window the searches cover/],
    ['override_exclude', /recorded by a person, with a reason/],
    ['no_longer_meets_rules', /counted under an earlier version of the rules/],
  ] as const)('explains the scope of %s, which the label alone does not', async (reason, note) => {
    const only = row({ reason, reason_label: `Recorded reason for ${reason}` });
    show(servingRows([only]).fetcher);
    await ask(only.id);
    const card = await screen.findByRole('region', { name: NOT_INCLUDED });
    expect(card).toHaveTextContent(`Recorded reason for ${reason}`);
    expect(card).toHaveTextContent(note);
  });

  it('says which identifier was used when the card does not show it', async () => {
    const only = row({ ids: { doi: null, pmid: '12345678', pmcid: null, openalex: 'W1234567' } });
    show(servingRows([only]).fetcher);

    // An OpenAlex ID appears nowhere on the card, so the reader is told it is what was asked.
    await ask('W1234567');
    const card = await screen.findByRole('region', { name: NOT_INCLUDED });
    expect(card).toHaveTextContent('Looked up by OpenAlex ID W1234567');
    expect(within(card).getByRole('link', { name: 'PubMed 12345678' })).toBeInTheDocument();

    // The work identifier is on the card, so saying it again would be noise.
    await ask(only.id);
    expect(await screen.findByRole('region', { name: NOT_INCLUDED })).not.toHaveTextContent(
      'Looked up by',
    );
  });
});

describe('outcome three: never nominated (docs/05 §8)', () => {
  it('says nothing about the paper, and says that it says nothing', async () => {
    const { fetcher } = serving();
    show(fetcher);
    await ask('10.9999/nothing-here');

    const card = await screen.findByRole('region', { name: UNKNOWN });
    expect(card).toHaveTextContent('DOI 10.9999/nothing-here');
    expect(card).toHaveTextContent(/It has not been examined and not been rejected/);
    expect(card).toHaveTextContent(/a statement about where this project has looked/);
    // The recall limit is real and documented, and this is the reader who needs to know it.
    expect(card).toHaveTextContent(/known to be missed/);
    expect(within(card).getByRole('link', { name: /how this was assembled/i })).toHaveAttribute(
      'href',
      '/method',
    );
  });

  it('is not presented as an error either', async () => {
    show(serving().fetcher);
    await ask('10.9999/nothing-here');
    await screen.findByRole('region', { name: UNKNOWN });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const rendered = show(serving().fetcher);
    await ask('10.9999/nothing-here');
    await screen.findByRole('region', { name: UNKNOWN });
    await expectNoAxeViolations(rendered.container);
  });
});

describe('the three outcomes are told apart before a sentence is read', () => {
  it('each declares its own outcome, heading and accent', async () => {
    const { fetcher } = serving();
    show(fetcher);
    const seen: string[] = [];

    await ask(required(doc.works[0], 'a work').id);
    seen.push(await outcome());

    await ask(identifierFor(rejected(() => true, 'a candidate')));
    seen.push(await outcome());

    await ask('10.9999/nothing-here');
    seen.push(await outcome());

    expect(seen).toEqual(['included', 'not-included', 'unknown']);
  });
});

describe('a failed index fetch is not an answer', () => {
  it('names the file and says nothing is being claimed about the paper', async () => {
    show(offline);
    await ask('10.9999/nothing-here');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(LOOKUP_URL);
    expect(alert).toHaveTextContent(/not a finding about the paper/);
    // The distinction that matters: this must never read as "never nominated".
    expect(screen.queryByRole('region', { name: UNKNOWN })).not.toBeInTheDocument();
    expect(document.querySelector('.lookup-answer')).toBeNull();
  });

  it('says so before anything is asked, rather than leaving a form that cannot answer', async () => {
    show(offline);
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot answer for any identifier/);
  });

  it('offers a retry, and answers once the fetch succeeds', async () => {
    let attempts = 0;
    const flaky: Fetcher = () => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(new Response(JSON.stringify(lookup), { status: 200 }));
    };
    show(flaky);
    await ask(identifierFor(rejected(() => true, 'a candidate')));
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // The submitted question survives the retry: the reader does not retype it.
    await screen.findByRole('region', { name: NOT_INCLUDED });
    expect(attempts).toBe(2);
  });

  it('still answers a work identifier the export already holds', async () => {
    show(offline);
    await ask(required(doc.works[0], 'a work').id);
    expect(await screen.findByRole('region', { name: INCLUDED })).toBeInTheDocument();
  });
});

describe('input we do not recognise is also not an answer about the paper', () => {
  it('says the form matches identifiers, and shows no outcome', async () => {
    show(serving().fetcher);
    await ask('Targeting and Specific Activation of Antigen-Presenting Cells');

    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot search by title or author/);
    expect(document.querySelector('.lookup-answer')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Publication identifier' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('asks for an identifier when the field is empty', async () => {
    show(serving().fetcher);
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter an identifier to look up.');
  });
});

describe('the answer is announced (docs/06 §9)', () => {
  it('states the outcome in a live region, not only on screen', async () => {
    const { fetcher } = serving();
    show(fetcher);
    const candidate = rejected(() => true, 'a candidate');
    await ask(identifierFor(candidate));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        `was considered and is not included. ${candidate.reason_label}.`,
      );
    });
  });

  it('says what it is doing while the index is still loading', async () => {
    let release: (() => void) | undefined;
    const slow: Fetcher = () =>
      new Promise<Response>((resolve) => {
        release = () => {
          resolve(new Response(JSON.stringify(lookup), { status: 200 }));
        };
      });
    show(slow);
    expect(screen.getByRole('status')).toHaveTextContent(/Loading the record of everything/);

    await ask('10.9999/nothing-here');
    expect(screen.getByRole('status')).toHaveTextContent('Looking up DOI 10.9999/nothing-here');

    release?.();
    await screen.findByRole('region', { name: UNKNOWN });
  });
});

describe('it is not a browsable list (docs/05 A4)', () => {
  it('renders no candidate until one is asked for', () => {
    show(serving().fetcher);
    for (const candidate of lookup.not_included.slice(0, 25)) {
      expect(screen.queryByText(candidate.title)).not.toBeInTheDocument();
    }
  });

  it('says nothing implying the data is withheld, because the file is public and complete', () => {
    const { container } = show(serving().fetcher);
    const text = (container.textContent ?? '').toLowerCase();
    for (const word of ['private', 'confidential', 'restricted', 'not public', 'on request only']) {
      expect(text).not.toContain(word);
    }
  });
});

describe('the route (docs/06 §3)', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  const at = (path: string, fetcher: Fetcher) => {
    window.history.replaceState(null, '', path);
    return render(
      <Router
        doc={doc}
        fetcher={fetcher}
        lookupHref={LOOKUP_URL}
        now={new Date(doc.generated_at)}
        searchDebounceMs={0}
      />,
    );
  };

  it('is registered at /lookup', () => {
    at('/lookup', serving().fetcher);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Look up a publication');
  });

  it('is linked from the overview header (docs/06 §4.1)', () => {
    at('/', serving().fetcher);
    expect(screen.getByRole('link', { name: 'Why is a paper not here?' })).toHaveAttribute(
      'href',
      '/lookup',
    );
  });

  it('is what fetches the index: the overview never does (docs/06 §10)', () => {
    const { calls, fetcher } = serving();
    at('/', fetcher);
    expect(calls).toEqual([]);
  });
});
