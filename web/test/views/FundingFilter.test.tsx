/**
 * The funding dimensions reach the publications view (docs/09 §12.4), and the institution-wide
 * position rides in the URL as view state.
 *
 * "The publications view honours them too, so the switch keeps one filter meaning one thing": a
 * URL carrying `agency=` or `grant=` filters the publications, with the chips naming them. The
 * position is not a filter — clearing the filter keeps it — and, being in the query string, the
 * switch carries it both ways. Rendered through `Router`, because all of it crosses the URL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from '../../src/App';
import type { ExportDocument } from '../../src/contract/types';
import { sampleExport } from '../support/fixture';
import { legacyDocument } from '../support/funding';

const doc = sampleExport();

const at = (path: string, document_: ExportDocument = doc) => {
  window.history.replaceState(null, '', path);
  return render(
    <Router
      doc={document_}
      fetcher={() => Promise.reject(new Error('the overview needs no second fetch'))}
      lookupHref="/data/lookup_index.json"
      now={new Date(document_.generated_at)}
      searchDebounceMs={0}
    />,
  );
};

const listing = (code: string) =>
  doc.works.filter((work) =>
    work.grants.some((entry) => (entry.agencies as readonly string[]).includes(code)),
  ).length;
const listingGrant = (key: string) =>
  doc.works.filter((work) => work.grants.some((entry) => entry.grant === key)).length;
const publications = (count: number) =>
  `${String(count)} ${count === 1 ? 'publication' : 'publications'}`;
const here = () => `${window.location.pathname}${window.location.search}`;

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('agency and grant filter the publications view', () => {
  it('selects the works listing an agency’s grants, institutes included', () => {
    at('/?agency=NIH');
    const count = listing('NIH');
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(doc.works.length);
    expect(
      screen.getByText(
        `${publications(count)} matching Funding agency: National Institutes of Health.`,
      ),
    ).toBeInTheDocument();
  });

  it('selects the works listing a grant, named as its funder writes it', () => {
    at('/?grant=NIH%3AR01GM999001');
    expect(
      screen.getByText(
        `${publications(listingGrant('NIH:R01GM999001'))} matching Grant: NIGMS R01GM999001.`,
      ),
    ).toBeInTheDocument();
  });

  it('removes one with its chip, like any other filter', async () => {
    at('/?agency=MISC&agency=VA');
    const chips = within(screen.getByRole('list', { name: 'Active filters' }));
    await userEvent.click(chips.getByRole('button', { name: /Funding agency: Miscellaneous/ }));
    expect(here()).toBe('/?agency=VA');
  });

  it('matches nothing in an export with no funding data, and says which filter did it', () => {
    at('/?agency=NIH', legacyDocument());
    expect(screen.getAllByText('0 publications matching Funding agency: NIH.')).not.toHaveLength(0);
  });
});

describe('the institution-wide position is view state in the URL (docs/09 §12.4)', () => {
  const year = String(doc.period.last_year);
  const views = () => screen.getByRole('navigation', { name: 'Views' });

  it('is carried by the switch, both ways', async () => {
    at(`/?year=${year}&institution_wide=exclude`);
    expect(within(views()).getByRole('link', { name: 'Funding impact' })).toHaveAttribute(
      'href',
      `/funding?year=${year}&institution_wide=exclude`,
    );
    await userEvent.click(within(views()).getByRole('link', { name: 'Funding impact' }));
    expect(here()).toBe(`/funding?year=${year}&institution_wide=exclude`);
    await userEvent.click(within(views()).getByRole('link', { name: 'Publications' }));
    expect(here()).toBe(`/?year=${year}&institution_wide=exclude`);
  });

  it('survives a filter change and clearing the filter, which it is not part of', async () => {
    at(`/?year=${year}&agency=NIH&institution_wide=exclude`);
    const chips = within(screen.getByRole('list', { name: 'Active filters' }));
    await userEvent.click(chips.getByRole('button', { name: new RegExp(`Year: ${year}`) }));
    expect(here()).toBe('/?agency=NIH&institution_wide=exclude');
    await userEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(here()).toBe('/?institution_wide=exclude');
  });

  it('is not stated on the publications view, where it changes nothing', () => {
    at('/?institution_wide=exclude');
    expect(
      screen.getByText(`${publications(doc.works.length)}, no filter applied.`),
    ).toBeInTheDocument();
  });
});
