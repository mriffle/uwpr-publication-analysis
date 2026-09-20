/**
 * The one rendering of a rejection, which both `/lookup` and `/publication/<identifier>` use
 * (docs/05 §8, §11; docs/06 §5, §7).
 *
 * The point of the component is that the two routes cannot drift, so the tests that matter most
 * here are the ones that hold the *answer* fixed while the context varies: the same outcome, the
 * same heading text, the same reason, the same near misses and the same correction path, whether
 * the reader typed the identifier into a form or followed a colleague's link. What is allowed to
 * differ is the heading level, one sentence about how they arrived, and the ways onward.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { NotIncludedAnswer } from '../../src/components/NotIncludedAnswer';
import { parseIdentifier } from '../../src/contract/identifier';
import type { NotIncluded } from '../../src/contract/resolve';
import type { Resource } from '../../src/contract/types';
import { sampleExport, sampleLookup } from '../support/fixture';
import { expectNoAxeViolations } from '../support/axe';

const doc = sampleExport();
const resource: Resource = doc.resource;

const HEADING = 'This publication was considered and is not included';

const row = (over: Partial<NotIncluded> = {}): NotIncluded => ({
  id: 'W-000789',
  title: 'A paper that was considered',
  year: 2019,
  ids: { doi: '10.1234/considered', pmid: '12345678', pmcid: null, openalex: null },
  reason: 'no_rule_fired',
  reason_label: 'No evidence of UWPR support was found in this paper',
  signals: [],
  signal_labels: [],
  ...over,
});

const show = (props: Partial<Parameters<typeof NotIncludedAnswer>[0]> = {}) =>
  render(<NotIncludedAnswer row={row()} resource={resource} methodHref="/method" {...props} />);

describe('the answer is the same answer, however the reader arrived', () => {
  it('declares the same outcome and the same heading at either level', () => {
    const asked = render(
      <NotIncludedAnswer row={row()} resource={resource} methodHref="/method" headingLevel={2} />,
    );
    const askedCard = asked.container.querySelector('.lookup-answer');
    expect(askedCard?.getAttribute('data-outcome')).toBe('not-included');
    expect(screen.getByRole('heading', { level: 2, name: HEADING })).toBeInTheDocument();
    asked.unmount();

    render(
      <NotIncludedAnswer row={row()} resource={resource} methodHref="/method" headingLevel={1} />,
    );
    expect(document.querySelector('.lookup-answer')?.getAttribute('data-outcome')).toBe(
      'not-included',
    );
    expect(screen.getByRole('heading', { level: 1, name: HEADING })).toBeInTheDocument();
  });

  it('names the card the same way to a screen reader either way, which is what stops the two drifting', () => {
    const asked = show({ headingLevel: 2 });
    expect(screen.getByRole('region', { name: HEADING })).toBeInTheDocument();
    asked.unmount();

    show({ headingLevel: 1 });
    expect(screen.getByRole('region', { name: HEADING })).toBeInTheDocument();
  });

  it('carries the reason, what it does not mean, and the correction path in both contexts', () => {
    for (const headingLevel of [1, 2] as const) {
      const view = show({ headingLevel });
      const card = screen.getByRole('region', { name: HEADING });
      expect(card).toHaveTextContent('No evidence of UWPR support was found in this paper');
      // The statement no styling can make (docs/05 §8, §11).
      expect(card).toHaveTextContent('a statement about the record, not about the work');
      expect(card).toHaveTextContent('correction worth reporting');
      view.unmount();
    }
  });
});

describe('the heading level follows the page, and the sub-heading follows the heading', () => {
  it('puts the near misses one level under the card heading, so the order never skips', () => {
    const signals = {
      signals: ['staff_coauthor:riffle'],
      signal_labels: ['A UWPR staff member is a co-author, which on its own is not evidence'],
    };

    const asked = show({ headingLevel: 2, row: row(signals) });
    expect(
      screen.getByRole('heading', { level: 3, name: 'What was found, and why it is not evidence' }),
    ).toBeInTheDocument();
    asked.unmount();

    show({ headingLevel: 1, row: row(signals) });
    expect(
      screen.getByRole('heading', { level: 2, name: 'What was found, and why it is not evidence' }),
    ).toBeInTheDocument();
  });

  it('defaults to the level the lookup needs, so a caller that forgets does not create a second h1', () => {
    show();
    expect(screen.getByRole('heading', { level: 2, name: HEADING })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });
});

describe('the identifier the reader supplied (docs/05 §8)', () => {
  const openalex = parseIdentifier('W2000000001');

  it('is named when the card does not already show it, because an answer must be checkable', () => {
    show({ query: openalex, arrival: 'asked' });
    expect(screen.getByRole('region', { name: HEADING })).toHaveTextContent(
      'Looked up by OpenAlex ID W2000000001',
    );
  });

  it('is named as followed, not asked, when the reader came in on a permalink', () => {
    show({ query: openalex, arrival: 'followed', headingLevel: 1 });
    expect(screen.getByRole('region', { name: HEADING })).toHaveTextContent(
      'You followed a link for OpenAlex ID W2000000001',
    );
  });

  it('is left unsaid when the card already shows it', () => {
    show({ query: parseIdentifier('10.1234/considered') });
    expect(screen.getByRole('region', { name: HEADING })).not.toHaveTextContent('Looked up by');
  });

  it('is left unsaid when the URL carried something unreadable, rather than echoing nonsense', () => {
    show({ query: null, headingLevel: 1 });
    const card = screen.getByRole('region', { name: HEADING });
    expect(card).not.toHaveTextContent('Looked up by');
    expect(card).not.toHaveTextContent('You followed a link');
  });
});

describe('every reason the schema allows says what it does not mean (docs/05 §8)', () => {
  // "None is in the real export today and one is in the sample, so any per-reason wording must
  // handle all five."
  const REASONS: readonly NotIncluded['reason'][] = [
    'no_rule_fired',
    'excluded_record_type',
    'before_window',
    'override_exclude',
    'no_longer_meets_rules',
  ];

  it.each(REASONS)('%s is explained, not merely labelled', (reason) => {
    const view = show({ row: row({ reason, reason_label: 'The recorded reason' }) });
    const card = screen.getByRole('region', { name: HEADING });
    expect(card).toHaveTextContent('The recorded reason.');
    // Something beyond the label itself, which is the whole difference from the old bare render.
    const text = card.textContent ?? '';
    expect(text.length).toBeGreaterThan('The recorded reason.'.length + 200);
    view.unmount();
  });

  it('reads an override as the human judgement it is, not as a measurement', () => {
    show({ row: row({ reason: 'override_exclude' }) });
    expect(screen.getByRole('region', { name: HEADING })).toHaveTextContent('recorded by a person');
  });
});

describe('the near misses (docs/05 §8)', () => {
  it('shows each signal with why it is deliberately not evidence, and a route to what does count', () => {
    show({
      row: row({
        signals: ['staff_coauthor:riffle'],
        signal_labels: ['A UWPR staff member is a co-author, which on its own is not evidence'],
      }),
    });
    const card = screen.getByRole('region', { name: HEADING });
    expect(card).toHaveTextContent('the rules deliberately do not count on its own');
    expect(within(card).getByRole('link', { name: 'How this was assembled' })).toHaveAttribute(
      'href',
      '/method',
    );
  });

  it('tells two identical labels apart by the staff member each names', () => {
    const [first, second] = resource.staff;
    expect(first, 'the sample resource must carry two staff members').toBeDefined();
    expect(second, 'the sample resource must carry two staff members').toBeDefined();
    const label = 'A UWPR staff member is a co-author, which on its own is not evidence';
    show({
      row: row({
        signals: [`staff_coauthor:${String(first?.id)}`, `staff_coauthor:${String(second?.id)}`],
        signal_labels: [label, label],
      }),
    });
    const items = within(screen.getByRole('region', { name: HEADING })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(String(first?.name));
    expect(items[1]).toHaveTextContent(String(second?.name));
  });

  it('says so when nothing came close, rather than leaving a silence to read into', () => {
    show({ row: row({ reason: 'no_rule_fired', signals: [], signal_labels: [] }) });
    expect(screen.getByRole('region', { name: HEADING })).toHaveTextContent(
      'no near miss was recorded against this paper',
    );
  });
});

describe('a rejection is not a failure (docs/05 §11)', () => {
  it('never announces itself as an alert, at either level', () => {
    for (const headingLevel of [1, 2] as const) {
      const view = show({ headingLevel });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('takes an accent from the categorical palette, which carries no valence', () => {
    const { container } = show();
    expect(container.querySelector('[data-outcome="not-included"]')).toBeInTheDocument();
  });
});

describe('the ways onward differ, because the two contexts owe the reader different things', () => {
  it('renders none where the form is already on the page', () => {
    show({ headingLevel: 2 });
    expect(
      within(screen.getByRole('region', { name: HEADING })).queryByRole('link', {
        name: 'See all publications',
      }),
    ).not.toBeInTheDocument();
  });

  it('renders whatever a permalink route hands it', () => {
    show({
      headingLevel: 1,
      children: <a href="/">See all publications</a>,
    });
    expect(
      within(screen.getByRole('region', { name: HEADING })).getByRole('link', {
        name: 'See all publications',
      }),
    ).toBeInTheDocument();
  });
});

describe('accessibility (docs/06 §9)', () => {
  it('passes axe at both heading levels', async () => {
    const real = sampleLookup().not_included[0];
    expect(real, 'the sample lookup index must carry a rejected candidate').toBeDefined();

    const asked = show({ row: real as NotIncluded, headingLevel: 2 });
    await expectNoAxeViolations(asked.container);
    asked.unmount();

    const followed = show({
      row: real as NotIncluded,
      headingLevel: 1,
      arrival: 'followed',
      children: <a href="/">See all publications</a>,
    });
    await expectNoAxeViolations(followed.container);
  });
});
