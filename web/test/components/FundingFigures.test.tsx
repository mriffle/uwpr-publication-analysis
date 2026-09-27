/**
 * The headline figures of Funding impact (docs/09 §12.5 item 2), in every state a view can hand
 * them: normal, every amount unknown, nothing in scope, no funding data, institution-wide
 * excluded (and held off by a grant selection), and unmatched numbers present.
 *
 * The headline is the grant funding counted (docs/09 F17): the world's $8,100,000 of its
 * $8,250,000 lifetime, $600,000 of it FOREIGN's estimate. The honesty rules (§12.11) are asserted
 * as strings — including the negatives, since the failure is a "$0" or a missing position rather
 * than a missing figure — and the sample export's total against the pipeline's own
 * `funding.summary`.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  FundingFigures,
  fundingHeadlineFigures,
  institutionWideSentence,
} from '../../src/components/FundingFigures';
import { UNFILTERED, fundingFigures, fundingScope } from '../../src/aggregate/funding';
import { buildFundingIndex, fundingOf } from '../../src/contract/funding';
import { formatCount, formatUsd } from '../../src/format/number';
import { FUNDING_DEFINITION_IDS } from '../../src/method/definitions';
import { expectNoAxeViolations } from '../support/axe';
import { sampleExport } from '../support/fixture';
import { counting, fundingBlock } from '../support/funding';
import { AGENCIES, RESOURCE } from '../support/grants';
import { WORLD, WORLD_GRANTS, worldIndex, worldScope, worldWorks } from '../support/fundingWorld';

const HEADLINE = 'Grant funding counted';

const figures = () => screen.getByRole('list', { name: 'Funding figures' });
const figure = (label: string) =>
  within(figures())
    .getAllByRole('listitem')
    .find((item) => item.textContent.includes(label)) as HTMLElement;

describe('the normal state', () => {
  it('shows the counted total exactly, defined, dated, estimated in part, with its unknowns', () => {
    render(<FundingFigures scope={worldScope()} resource="UWPR" />);
    const total = figure(HEADLINE);
    // R01, P01 and GRFP in full; FOREIGN $600,000 of $750,000, spread and listed to 2022;
    // NSF_PROJECT is unknown and UNMATCHED is not a grant.
    expect(within(total).getByText('$8,100,000')).toBeInTheDocument();
    expect(total.textContent).not.toContain('$8,250,000');
    expect(total).toHaveTextContent(
      'The funding of the grants listed on these publications, from 2006, when UWPR began, through the year of the latest publication listing each grant. Not money spent on this work. Amounts as of 26 September 2026. $600,000 of it is estimated: other funders’ awards spread evenly over their years. 1 grant with no known amount is not in it.',
    );
  });

  it('takes the first year counted from funding.counting, and names the resource it is given', () => {
    const block = fundingBlock({
      agencies: AGENCIES,
      grants: WORLD_GRANTS,
      counting: counting({ from_year: 2020 }),
    });
    const index = buildFundingIndex(block, RESOURCE);
    render(<FundingFigures scope={fundingScope(worldWorks(index), index, UNFILTERED)} />);
    const total = figure(HEADLINE);
    // R01's FY2019 and FOREIGN's 2019 are before the floor: $8,100,000 less $650,000.
    expect(within(total).getByText('$7,450,000')).toBeInTheDocument();
    expect(total).toHaveTextContent('from 2020, when the resource began, through the year');
  });

  it('states the estimated part exactly when a spread amount is counted', () => {
    const { unmount } = render(<FundingFigures scope={worldScope({ agencies: ['NIH'] })} />);
    // NIH's grants have fiscal years: nothing is estimated, and no line says so.
    expect(within(figure(HEADLINE)).getByText('$3,500,000')).toBeInTheDocument();
    expect(figure(HEADLINE).textContent).not.toMatch(/estimated/);
    unmount();
    render(<FundingFigures scope={worldScope({ agencies: ['F4399999999'] })} />);
    expect(figure(HEADLINE)).toHaveTextContent(
      '$600,000 of it is estimated: other funders’ awards spread evenly over their years.',
    );
  });

  it('counts each grant once, and states the unmatched numbers apart', () => {
    render(<FundingFigures scope={worldScope()} />);
    const grants = figure('Grants listed');
    expect(within(grants).getByText('5')).toBeInTheDocument();
    expect(grants).toHaveTextContent('Each counted once, however many publications list it.');
    expect(grants).toHaveTextContent('1 more is an unmatched number, kept apart in Miscellaneous.');
  });

  it('counts root agencies, investigators, organisations and K of N publications', () => {
    render(<FundingFigures scope={worldScope()} />);
    // NIH, NSF and the foundation.
    expect(within(figure('Funding agencies')).getByText('3')).toBeInTheDocument();
    // Ada and Émile on R01; the default investigator on P01 and GRFP; Åsa on FOREIGN.
    expect(within(figure('Principal investigators')).getByText('4')).toBeInTheDocument();
    expect(within(figure('Organisations')).getByText('2')).toBeInTheDocument();
    expect(within(figure('Publications listing a grant')).getByText('3 of 4')).toBeInTheDocument();
  });

  it('states the institution-wide position beside the total, counted (rule 4)', () => {
    render(<FundingFigures scope={worldScope()} />);
    expect(figure(HEADLINE)).toHaveTextContent(
      'Including 1 institution-wide award counted at $4,000,000.',
    );
  });

  it('matches the pipeline’s own summary on the sample export', () => {
    const doc = sampleExport();
    const index = fundingOf(doc);
    render(<FundingFigures scope={fundingScope(doc.works, index, UNFILTERED)} />);
    const summary = doc.funding.summary;
    expect(within(figure(HEADLINE)).getByText(formatUsd(summary.counted_usd))).toBeInTheDocument();
    expect(
      within(figure('Grants listed')).getByText(formatCount(summary.grants_resolved)),
    ).toBeInTheDocument();
    expect(
      within(figure('Publications listing a grant')).getByText(
        `${formatCount(summary.works_with_grants)} of ${formatCount(doc.works.length)}`,
      ),
    ).toBeInTheDocument();
  });

  it('passes axe', async () => {
    const { container } = render(
      <FundingFigures
        scope={worldScope()}
        onInstitutionWide={vi.fn()}
        definitionHref={(id) => `/method#${id}`}
      />,
    );
    await expectNoAxeViolations(container);
  });
});

describe('every amount unknown', () => {
  const scope = () => worldScope({ agencies: ['NSF'], institutionWide: 'exclude' });

  it('says "Not known", never $0, and why', () => {
    render(<FundingFigures scope={scope()} />);
    const total = figure(HEADLINE);
    expect(within(total).getByText('Not known')).toBeInTheDocument();
    expect(total).toHaveTextContent(
      'The one grant listed has no known amount, so no total can be given.',
    );
    expect(total.textContent).not.toMatch(/\$0\b/);
  });

  it('says how many have none when there are several', () => {
    const index = worldIndex([WORLD.nsf, { ...WORLD.p01, amount_usd: null }]);
    const works = worldWorks(worldIndex()).map((entry) => ({
      ...entry,
      grants: entry.grants.filter((listed) => index.grants.has(listed.grant)),
    }));
    render(<FundingFigures scope={fundingScope(works, index, UNFILTERED)} />);
    expect(figure(HEADLINE)).toHaveTextContent(
      'None of the 2 grants listed has a known amount, so no total can be given.',
    );
  });

  it('passes axe', async () => {
    const { container } = render(<FundingFigures scope={scope()} onInstitutionWide={vi.fn()} />);
    await expectNoAxeViolations(container);
  });
});

describe('an empty scope', () => {
  const empty = () => {
    const index = worldIndex();
    return fundingScope([], index, UNFILTERED);
  };

  it('shows a dash and says there is no total, never $0', () => {
    render(<FundingFigures scope={empty()} />);
    const total = figure(HEADLINE);
    expect(within(total).getByText('—')).toBeInTheDocument();
    expect(total).toHaveTextContent('No grant is listed on the publications shown');
    expect(figures().textContent).not.toMatch(/\$0\b/);
    expect(within(figure('Publications listing a grant')).getByText('0 of 0')).toBeInTheDocument();
  });

  it('says the same when publications match but none lists a grant', () => {
    const index = worldIndex();
    const [, , , none] = worldWorks(index);
    render(<FundingFigures scope={fundingScope([none!], index, UNFILTERED)} />);
    expect(figure(HEADLINE)).toHaveTextContent('No institution-wide award is among these grants.');
    expect(within(figure('Publications listing a grant')).getByText('0 of 1')).toBeInTheDocument();
  });

  it('passes axe', async () => {
    const { container } = render(<FundingFigures scope={empty()} onInstitutionWide={vi.fn()} />);
    await expectNoAxeViolations(container);
  });
});

describe('no funding data (docs/09 §12.10)', () => {
  it('renders nothing', () => {
    const { container } = render(
      <FundingFigures scope={fundingScope([], null, UNFILTERED)} onInstitutionWide={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('institution-wide awards excluded', () => {
  it('leaves them out of the total and says what was left out', () => {
    render(<FundingFigures scope={worldScope({ institutionWide: 'exclude' })} />);
    const total = figure(HEADLINE);
    expect(within(total).getByText('$4,100,000')).toBeInTheDocument();
    expect(total).toHaveTextContent('Excluding 1 institution-wide award counted at $4,000,000.');
  });

  it('says a selected grant holds the exclusion off, so the switch is not read as broken', () => {
    render(
      <FundingFigures
        scope={worldScope({ institutionWide: 'exclude', grants: [WORLD.grfp.key] })}
      />,
    );
    expect(figure(HEADLINE)).toHaveTextContent(
      'Including 1 institution-wide award counted at $4,000,000. A grant is selected, so it is shown whatever the institution-wide switch says.',
    );
  });

  it('says so when none is left out', () => {
    render(
      <FundingFigures scope={worldScope({ institutionWide: 'exclude', agencies: ['NIH'] })} />,
    );
    expect(figure(HEADLINE)).toHaveTextContent(
      'Institution-wide awards are excluded; none is listed on these publications.',
    );
  });

  it('passes axe', async () => {
    const { container } = render(
      <FundingFigures
        scope={worldScope({ institutionWide: 'exclude' })}
        onInstitutionWide={vi.fn()}
      />,
    );
    await expectNoAxeViolations(container);
  });
});

describe('the institution-wide switch', () => {
  it('is a labelled group of two pressed-state buttons, controlled by the scope', async () => {
    const onInstitutionWide = vi.fn();
    render(<FundingFigures scope={worldScope()} onInstitutionWide={onInstitutionWide} />);
    const group = screen.getByRole('group', { name: 'Institution-wide awards' });
    const include = within(group).getByRole('button', { name: 'Include' });
    const exclude = within(group).getByRole('button', { name: 'Exclude' });
    expect(include).toHaveAttribute('aria-pressed', 'true');
    expect(exclude).toHaveAttribute('aria-pressed', 'false');
    // The group is described by the position sentence.
    expect(group).toHaveAccessibleDescription(/Including 1 institution-wide award/);

    await userEvent.click(include);
    expect(onInstitutionWide).not.toHaveBeenCalled();
    await userEvent.click(exclude);
    expect(onInstitutionWide).toHaveBeenCalledWith('exclude');
  });

  it('is absent without a handler, while the position is still stated', () => {
    render(<FundingFigures scope={worldScope()} />);
    expect(screen.queryByRole('group', { name: 'Institution-wide awards' })).toBeNull();
    expect(figure(HEADLINE)).toHaveTextContent('Including 1 institution-wide');
  });
});

describe('the definition links (docs/09 §12.5 item 2, §12.9)', () => {
  it('links every figure and the position to the ids the method page will carry', () => {
    render(<FundingFigures scope={worldScope()} definitionHref={(id) => `/method#${id}`} />);
    const hrefs = within(figures())
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(new Set(hrefs)).toEqual(new Set(FUNDING_DEFINITION_IDS.map((id) => `/method#${id}`)));
    expect(
      screen.getByRole('link', {
        name: 'Grant funding counted: how this figure is defined',
      }),
    ).toHaveAttribute('href', '/method#funding-total');
  });

  it('carries the headline ids in the order of FUNDING_DEFINITION_IDS', () => {
    const shown = fundingHeadlineFigures(fundingFigures(worldScope()), null, counting()).map(
      (f) => f.id,
    );
    expect([...shown, 'funding-institution-wide']).toEqual([...FUNDING_DEFINITION_IDS]);
  });
});

describe('the institution-wide sentence, for every mix of known and unknown amounts', () => {
  const wide = (withAmount: number, withoutAmount: number, included = true) => ({
    included,
    grants: withAmount + withoutAmount,
    withAmount,
    withoutAmount,
    amountUsd: withAmount * 1_000_000,
    countedUsd: withAmount * 500_000,
  });

  it('gives the counted value, and never gives an unknown amount one', () => {
    expect(institutionWideSentence(wide(0, 1), false)).toBe(
      'Including 1 institution-wide award, with no known amount.',
    );
    expect(institutionWideSentence(wide(0, 2), false)).toBe(
      'Including 2 institution-wide awards, none with a known amount.',
    );
    expect(institutionWideSentence(wide(2, 0), false)).toBe(
      'Including 2 institution-wide awards counted at $1,000,000.',
    );
    expect(institutionWideSentence(wide(2, 1), false)).toBe(
      'Including 3 institution-wide awards, counted at $1,000,000 for the 2 with a known amount; 1 has none.',
    );
    expect(institutionWideSentence(wide(1, 2, false), false)).toBe(
      'Excluding 3 institution-wide awards, counted at $500,000 for the 1 with a known amount; 2 have none.',
    );
  });

  it('dates no total when the export records no refresh', () => {
    const [total] = fundingHeadlineFigures(fundingFigures(worldScope()), null, counting());
    expect(total?.definition).not.toMatch(/as of/);
    expect(total?.definition).toMatch(/Not money spent on this work\./);
  });

  it('says the resource began in the first year counted, or "the resource" unnamed', () => {
    const figures = fundingFigures(worldScope());
    const [named] = fundingHeadlineFigures(figures, null, counting(), { resource: 'UWPR' });
    expect(named?.definition).toMatch(
      /^The funding of the grants listed on these publications, from 2006, when UWPR began,/,
    );
    const [unnamed] = fundingHeadlineFigures(figures, null, counting());
    expect(unnamed?.definition).toMatch(/from 2006, when the resource began,/);
  });
});
