/**
 * The publication's Funding section as the detail places it (docs/09 §12.8): after "Why this is
 * a UWPR publication" and before "Other versions", with in-app links to agency and grant pages,
 * and omitted with no funding data — or in a build without the Funding impact view, where the
 * app gives the detail no funding at all.
 *
 * The section's own wording per case is `test/components/FundingSection.test.tsx`'s; this holds
 * the sample's real listings to it in place: a listed grant, a corrected reference (`cited_as`),
 * an override, an unmatched number, and none.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fundingOf, type FundingIndex } from '../../src/contract/funding';
import type { Work } from '../../src/contract/types';
import { PublicationDetail } from '../../src/views/PublicationDetail';
import { expectNoAxeViolations } from '../support/axe';
import { isSampleExport, sampleExport } from '../support/fixture';
import { recordingLinks } from '../support/fundingWorld';

const doc = sampleExport();
const index = fundingOf(doc);

const byId = (id: string): Work => {
  const work = doc.works.find((entry) => entry.id === id);
  if (work === undefined) throw new Error(`the sample has no ${id}`);
  return work;
};

function show(work: Work, funding: { index: FundingIndex | null } | null = { index }) {
  const { links, opened } = recordingLinks();
  const view = render(
    <PublicationDetail
      work={work}
      resource={doc.resource}
      citationsAsOf={doc.sources.citations.as_of}
      overviewHref="/"
      {...(funding === null ? {} : { funding: { index: funding.index, links } })}
    />,
  );
  return { ...view, opened };
}

const SECTION = 'Funding listed in this publication';
const section = () => screen.getByRole('region', { name: SECTION });

describe('where the section goes', () => {
  it('sits after the evidence and before the other versions', () => {
    const work = doc.works.find((entry) => entry.versions.length > 0)!;
    show(work);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    const evidence = headings.indexOf('Why this is a UWPR publication');
    expect(headings.slice(evidence, evidence + 3)).toEqual([
      'Why this is a UWPR publication',
      SECTION,
      'Other versions',
    ]);
  });

  it('is the last section before the footer when there are no other versions', () => {
    const work = doc.works.find((entry) => entry.versions.length === 0)!;
    show(work);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.at(-1)).toBe(SECTION);
  });
});

describe('no funding to show', () => {
  it('is omitted when the export has no funding data (§12.10)', () => {
    show(doc.works[0]!, { index: null });
    expect(screen.queryByRole('heading', { name: SECTION })).not.toBeInTheDocument();
  });

  it('is omitted when the app gives the detail no funding, as a build without the view does', () => {
    show(doc.works[0]!, null);
    expect(screen.queryByRole('heading', { name: SECTION })).not.toBeInTheDocument();
  });
});

describe.runIf(isSampleExport)('the sample’s listings, in place', () => {
  it('a listed grant: agency and number open their pages in place (W-000007)', async () => {
    const { opened } = show(byId('W-000007'));
    const item = within(section()).getByText('P30DK017047').closest('li')!;
    await userEvent.click(within(item).getByRole('link', { name: 'NIDDK' }));
    await userEvent.click(within(item).getByRole('link', { name: 'P30DK017047' }));
    expect(opened).toEqual(['agency:NIDDK', 'grant:NIH:P30DK017047']);
    // The work has R2 evidence: the resource's own code is evidence above, not a grant here.
    expect(section()).toHaveTextContent(
      `${doc.resource.short_name}’s own award code, ${doc.resource.identifier}, is shown above as evidence`,
    );
  });

  it('a corrected reference says what the paper wrote, beside an unmatched number (W-000104)', () => {
    show(byId('W-000104'));
    expect(section()).toHaveTextContent('Also written in the paper as “P01 HL99900”.');
    expect(section()).toHaveTextContent(
      'Matched to this grant by correcting the number as the paper wrote it.',
    );
    expect(
      within(section()).getByRole('heading', {
        level: 3,
        name: 'Miscellaneous (not matched to a grant record)',
      }),
    ).toBeInTheDocument();
    expect(section()).toHaveTextContent('“R01 GM999999”');
  });

  it('an override gives its reason, by whom and when (W-000105)', () => {
    show(byId('W-000105'));
    expect(section()).toHaveTextContent('Matched by a recorded decision, not by a rule');
    expect(section()).toHaveTextContent('Decided by sample on 26 September 2026');
    expect(section()).toHaveTextContent('Also written in the paper as “U19AG9990”.');
  });

  it('a work listing nothing still has the section, saying so (W-000103)', () => {
    show(byId('W-000103'));
    expect(section()).toHaveTextContent(
      'No grant is listed for this publication in the funding statements read.',
    );
  });

  it.each(['W-000007', 'W-000104', 'W-000105', 'W-000103'])(
    '%s passes axe',
    async (id) => {
      const { container } = show(byId(id));
      await expectNoAxeViolations(container);
    },
    30_000,
  );
});
