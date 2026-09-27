/**
 * "Funding listed in this publication" (docs/09 §12.8), per case: a listed grant, a corrected
 * reference (`cited_as` beside `how: listed`, the shape the real data has), an override, an NIH
 * link, an unmatched number, R2 evidence, a converted amount, an institution-wide award, a work
 * that lists nothing, and no funding data — each with axe.
 *
 * The negatives matter as much as the positives here, as in the evidence section: the failures
 * are a "$0", the resource's own code shown as a grant, or a section that reads "no grants" in an
 * export that simply carries no funding.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FundingSection } from '../../src/components/FundingSection';
import { fundingOf, type FundingIndex } from '../../src/contract/funding';
import type { GrantListing, Work } from '../../src/contract/types';
import { expectNoAxeViolations } from '../support/axe';
import { sampleExport } from '../support/fixture';
import { listing, unresolvedGrant } from '../support/funding';
import { WORLD, WORLD_GRANTS, recordingLinks, worldIndex } from '../support/fundingWorld';
import { listings } from '../support/grants';
import { work } from '../support/works';

const RESOURCE = { identifier: 'UWPR95794', short_name: 'UWPR' };

function show(
  grants: GrantListing[],
  overrides: Partial<Work> = {},
  index: FundingIndex | null = worldIndex(),
) {
  const { links, opened } = recordingLinks();
  const view = render(
    <FundingSection
      work={work({ grants, ...overrides })}
      index={index}
      resource={RESOURCE}
      links={links}
    />,
  );
  return { ...view, opened };
}

const section = () => screen.getByRole('region', { name: 'Funding listed in this publication' });
/** A fact of a grant's card: the text of the `dd` its term names. */
const fact = (item: HTMLElement | undefined, term: string): string | undefined =>
  within(item!).getByText(term, { selector: 'dt' }).nextElementSibling?.textContent;

const items = () =>
  within(screen.getByRole('list', { name: 'Grants listed in this publication' })).getAllByRole(
    'listitem',
  );

describe('a listed grant', () => {
  const listed = () => show(listings(worldIndex(), WORLD.r01));

  it('gives the agency and number as in-app links, and the funder’s page beside them', async () => {
    const { opened } = listed();
    const [item] = items();
    expect(within(item!).getByRole('link', { name: 'NIGMS' })).toHaveAttribute(
      'href',
      '/funding/agency/NIGMS',
    );
    const number = within(item!).getByRole('link', { name: WORLD.r01.number });
    expect(number).toHaveAttribute('href', `/funding/grant/${encodeURIComponent(WORLD.r01.key)}`);
    const outbound = within(item!).getByRole('link', {
      name: `NIH RePORTER project page for ${WORLD.r01.number}`,
    });
    expect(outbound).toHaveAttribute('href', WORLD.r01.url);
    expect(outbound).toHaveTextContent('NIH RePORTER project page');

    await userEvent.click(number);
    expect(opened).toEqual([`grant:${WORLD.r01.key}`]);
  });

  it('shows the title, investigators as published, years and the dated total', () => {
    listed();
    const [item] = items();
    expect(item).toHaveTextContent(WORLD.r01.title!);
    expect(fact(item, 'Principal investigators')).toBe('Ada Investigator; Émile Coinvestigator');
    expect(fact(item, 'Years')).toBe('2019–2023');
    expect(fact(item, 'Total')).toBe(
      '$1,000,000, its lifetime award total as NIH RePORTER records it on 26 September 2026. Active: the total still grows',
    );
    // No investigator is a link (§12.11 rule 9).
    expect(within(item!).queryByRole('link', { name: /Ada/ })).toBeNull();
  });

  it('says a total is not money spent on this work, and nothing about a paper’s other forms', () => {
    listed();
    expect(section()).toHaveTextContent('not money spent on this work');
    expect(section()).not.toHaveTextContent('Also written in the paper');
  });

  it('passes axe', async () => {
    const { container } = listed();
    await expectNoAxeViolations(container);
  });
});

describe('a corrected reference (`cited_as` with `how: listed`, §11.2)', () => {
  const corrected = () =>
    show([
      listing({ grant: WORLD.r01.key, how: 'listed', cited_as: ['R01 GM00001', 'R01GM00001'] }),
    ]);

  it('says what the paper also wrote, whatever the listing’s `how`', () => {
    corrected();
    expect(items()[0]).toHaveTextContent(
      'Also written in the paper as “R01 GM00001” and “R01GM00001”.',
    );
  });

  it('says so for `how: corrected` too, with how it was matched', () => {
    show([listing({ grant: WORLD.r01.key, how: 'corrected', cited_as: ['R01 GM00001'] })]);
    expect(items()[0]).toHaveTextContent('Also written in the paper as “R01 GM00001”.');
    expect(items()[0]).toHaveTextContent(
      'Matched to this grant by correcting the number as the paper wrote it.',
    );
  });

  it('passes axe', async () => {
    const { container } = corrected();
    await expectNoAxeViolations(container);
  });
});

describe('an override', () => {
  const overridden = () =>
    show([
      listing({
        grant: WORLD.p01.key,
        agencies: ['NIH', 'NHLBI'],
        how: 'override',
        cited_as: ['P01HL00002'],
        override: {
          reason: 'The serial is a digit short; the title and investigator identify the grant.',
          by: 'mriffle',
          date: '2026-10-03',
        },
      }),
    ]);

  it('gives its reason, by whom and when, as a judgement', () => {
    overridden();
    const [item] = items();
    expect(item).toHaveTextContent('Matched by a recorded decision, not by a rule');
    expect(item).toHaveTextContent(
      'The serial is a digit short; the title and investigator identify the grant.',
    );
    expect(item).toHaveTextContent('Decided by mriffle on 3 October 2026');
    expect(item).toHaveTextContent('Also written in the paper as “P01HL00002”.');
  });

  it('passes axe', async () => {
    const { container } = overridden();
    await expectNoAxeViolations(container);
  });
});

describe('an NIH link', () => {
  it('says the funder’s records link it, not the funding statements', () => {
    show([listing({ grant: WORLD.r01.key, how: 'nih_link' })]);
    expect(items()[0]).toHaveTextContent(
      'The funder’s own publication records link this grant to the publication; the funding statements read here do not name it.',
    );
  });
});

describe('unmatched numbers (Miscellaneous)', () => {
  const withUnmatched = () => show(listings(worldIndex(), WORLD.r01, WORLD.unmatched));

  it('quotes them under their own h3, apart from the grants', () => {
    withUnmatched();
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'Miscellaneous (not matched to a grant record)',
      }),
    ).toBeInTheDocument();
    expect(section()).toHaveTextContent(`“${WORLD.unmatched.number}”`);
    expect(items()).toHaveLength(1);
    expect(section()).toHaveTextContent('are not counted as grants');
  });

  it('shows only the h3 when a work lists nothing else', () => {
    show(listings(worldIndex(), WORLD.unmatched));
    expect(screen.queryByRole('list', { name: 'Grants listed in this publication' })).toBeNull();
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();
  });

  it('passes axe', async () => {
    const { container } = withUnmatched();
    await expectNoAxeViolations(container);
  });
});

/**
 * An override can decide that a string matches nothing (docs/09 B9): the real export's W-000102
 * lists `MISC:1780131`, "178013_1", which OpenAlex matched to an unrelated grant. The section
 * quoted the number and dropped the listing, so the decision's reason, author and date — which
 * §12.8 asks of every override — were shown nowhere on the publication. R1a found it by running
 * the sample-only listings test below against the real export.
 */
describe('an override that keeps a number unmatched', () => {
  const kept = () =>
    show([
      listing({
        grant: WORLD.unmatched.key,
        agencies: ['MISC'],
        how: 'override',
        cited_as: [WORLD.unmatched.number, 'R01 GM-99999'],
        override: {
          reason: 'OpenAlex matches this string to an unrelated grant, which does not fit.',
          by: 'mriffle',
          date: '2026-09-27',
        },
      }),
    ]);

  it('gives its reason, by whom and when, and does not call the decision a match', () => {
    kept();
    const [item] = within(section()).getAllByRole('listitem');
    expect(item).toHaveTextContent(`“${WORLD.unmatched.number}”`);
    expect(item).toHaveTextContent('Kept unmatched by a recorded decision, not by a rule');
    expect(item).not.toHaveTextContent('Matched by a recorded decision');
    expect(item).toHaveTextContent(
      'OpenAlex matches this string to an unrelated grant, which does not fit.',
    );
    expect(item).toHaveTextContent('Decided by mriffle on 27 September 2026');
  });

  // R1b: the heading's sentence said "no funder's record matched", which the decision beneath it
  // contradicted: OpenAlex matched the number, and a decision set the match aside.
  it('says a recorded decision kept it unmatched, not that no record matched it', () => {
    kept();
    expect(section()).toHaveTextContent(
      'Numbers the paper gives as funding that a recorded decision kept unmatched, for the reason given with each. They have no agency, title or amount, and are not counted as grants.',
    );
    expect(section()).not.toHaveTextContent('no funder’s record matched');
  });

  it('says both when one number matched nothing and another was kept apart', () => {
    const other = unresolvedGrant({ key: 'MISC:OTHER1', number: 'OTHER 1' });
    show(
      [
        listing({ grant: WORLD.unmatched.key, agencies: ['MISC'] }),
        listing({
          grant: other.key,
          agencies: ['MISC'],
          how: 'override',
          override: { reason: 'Does not fit.', by: 'mriffle', date: '2026-09-27' },
        }),
      ],
      {},
      worldIndex([...WORLD_GRANTS, other]),
    );
    expect(section()).toHaveTextContent(
      'Numbers the paper gives as funding that no funder’s record matched, or that a recorded decision kept unmatched, for the reason given with it.',
    );
  });

  it('says only the forms the paper wrote besides the number quoted', () => {
    kept();
    const [item] = within(section()).getAllByRole('listitem');
    expect(item).toHaveTextContent('Also written in the paper as “R01 GM-99999”.');
    expect(item).not.toHaveTextContent(`as “${WORLD.unmatched.number}”`);
  });

  it('passes axe', async () => {
    const { container } = kept();
    await expectNoAxeViolations(container);
  });
});

describe('R2 evidence: the resource’s own award (§6.13, §12.11 rule 10)', () => {
  it('says the code shown as evidence is not a grant, and never lists it as one', () => {
    // `work()` carries R2 evidence by default.
    show(listings(worldIndex(), WORLD.r01));
    expect(section()).toHaveTextContent(
      'UWPR’s own award code, UWPR95794, is shown above as evidence that this publication used the resource. It is not a grant that funded this work, and is not listed here.',
    );
    for (const item of items()) expect(item).not.toHaveTextContent('UWPR95794');
  });

  it('says nothing of it without R2 evidence', () => {
    const [evidence] = work().evidence;
    show(listings(worldIndex(), WORLD.r01), { evidence: [{ ...evidence, rule: 'R3' }] });
    expect(section()).not.toHaveTextContent('UWPR95794');
  });

  it('passes axe', async () => {
    const { container } = show(listings(worldIndex(), WORLD.r01));
    await expectNoAxeViolations(container);
  });
});

describe('amounts', () => {
  it('shows a converted amount’s original and rate year (rule 5)', () => {
    show(listings(worldIndex(), WORLD.foreign));
    expect(items()[0]).toHaveTextContent(
      /\$750,000, its lifetime award total as OpenAlex records it on 26 September 2026; converted from SEK\s7,000,000 at the 2021 rate/,
    );
  });

  it('says "amount not known", with why, never $0 (rule 3)', () => {
    show(listings(worldIndex(), WORLD.nsf));
    const [item] = items();
    expect(fact(item, 'Total')).toBe(
      'Amount not known: no source read here reports an amount for it',
    );
    expect(item!.textContent).not.toMatch(/\$0\b/);
    expect(item).toHaveTextContent('No title recorded');
    expect(
      within(item!).getByRole('link', { name: `NSF award page for ${WORLD.nsf.number}` }),
    ).toBeInTheDocument();
  });

  it('gives no outbound link where the export has none', () => {
    show(listings(worldIndex(), WORLD.foreign));
    expect(within(items()[0]!).getAllByRole('link')).toHaveLength(2);
  });
});

describe('an institution-wide award', () => {
  it('is tagged and says why', () => {
    show(listings(worldIndex(), WORLD.grfp));
    const [item] = items();
    expect(within(item!).getByText('institution-wide')).toHaveClass('badge');
    expect(fact(item, 'Institution-wide')).toBe(
      'An award to run a programme for many projects, not one research project: NSF GRFP institutional award',
    );
  });
});

describe('a work that lists no grant', () => {
  it('says so, as what the sources record rather than a finding', () => {
    show([]);
    expect(section()).toHaveTextContent(
      'No grant is listed for this publication in the funding statements read.',
    );
    expect(section()).toHaveTextContent('not a finding that the work had no funding');
  });

  it('passes axe', async () => {
    const { container } = show([]);
    await expectNoAxeViolations(container);
  });
});

describe('no funding data (docs/09 §12.10)', () => {
  it('renders nothing at all', () => {
    const { container } = show(listings(worldIndex(), WORLD.r01), {}, null);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a 1.0 work with no `grants`', () => {
    const { links } = recordingLinks();
    const legacy: Partial<Work> = work();
    delete legacy.grants;
    const { container } = render(
      <FundingSection work={legacy as Work} index={null} resource={RESOURCE} links={links} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

// Every listing of whichever export is loaded: the sample's, or the real one's 1,664 (R1a), whose
// 33 listings with a written form take about 3 s with axe, and its 338 sections about 1 s.
describe('the export’s real listings (docs/09 §11.8)', () => {
  const doc = sampleExport();
  const index = fundingOf(doc);
  const find = (id: string) => doc.works.find((entry) => entry.id === id) as Work;

  function showSample(id: string) {
    const { links } = recordingLinks();
    return render(
      <FundingSection work={find(id)} index={index} resource={doc.resource} links={links} />,
    );
  }

  it('shows every corrected form the export carries, and every override’s attribution', async () => {
    for (const entry of doc.works) {
      for (const item of entry.grants.filter((listed) => listed.cited_as !== undefined)) {
        const { container, unmount } = showSample(entry.id);
        for (const form of item.cited_as ?? []) expect(container).toHaveTextContent(`“${form}”`);
        if (item.override !== undefined) {
          expect(container).toHaveTextContent(item.override.reason);
          expect(container).toHaveTextContent(`Decided by ${item.override.by}`);
        }
        await expectNoAxeViolations(container);
        unmount();
      }
    }
  }, 30_000);

  it('never shows the resource’s own code as a grant', () => {
    for (const entry of doc.works) {
      const { container, unmount } = showSample(entry.id);
      for (const item of container.querySelectorAll('.funding-item')) {
        expect(item).not.toHaveTextContent(doc.resource.identifier);
      }
      unmount();
    }
  }, 30_000);
});
