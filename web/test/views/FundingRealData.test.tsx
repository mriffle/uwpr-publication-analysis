/**
 * What the real export showed the funding views that the sample could not (docs/09 R1b), each
 * held on a document built to show it, and — where the reading holds for any export — on the
 * export the suite reads, the sample's or the real one's (`UWPR_EXPORT_DIR`).
 *
 * - **Many agencies.** The real export has 71 root agencies, 21 with a known amount. The ranked
 *   chart's note said "the 15 largest of 21 agencies", beside a headline of 71: it now says the
 *   21 are those with a known amount, and where the rest are.
 * - **"Other" is not a kind of award.** Every one of the real export's 208 "other" grants is from
 *   an agency outside NIH and NSF, whose grants alone are typed. The grant-types card says so.
 * - **An unmatched number a decision kept apart** is not one no record matched (`MISC:1780131`).
 * - **755 grants.** The table draws the first 50 and says so; the CSV holds every one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Router } from '../../src/App';
import { otherNote } from '../../src/views/Funding';
import { UNFILTERED, fundingScope, otherKind } from '../../src/aggregate/funding';
import { GRANT_ROW_LIMIT } from '../../src/components/GrantsTable';
import { fundingOf } from '../../src/contract/funding';
import type { Agency, ExportDocument, Grant, GrantListing } from '../../src/contract/types';
import { formatCount } from '../../src/format/number';
import { sampleExport } from '../support/fixture';
import {
  agency,
  fundingBlock,
  fundingDocument,
  grant,
  listing,
  miscellaneous,
  unresolvedGrant,
} from '../support/funding';

vi.mock('../../src/download/saveFile', () => ({ saveFile: vi.fn() }));

beforeEach(() => {
  // jsdom lays nothing out; the charts draw at a width, as in a browser.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

const at = (path: string, document_: ExportDocument) => {
  window.history.replaceState(null, '', path);
  return render(
    <Router
      doc={document_}
      fetcher={() => Promise.reject(new Error('the funding view needs no second fetch'))}
      lookupHref="/data/lookup_index.json"
      now={new Date(document_.generated_at)}
      searchDebounceMs={0}
    />,
  );
};

/*
 * A document with eighteen root agencies, each with one grant: sixteen with a known amount, the
 * largest first, and two with none; a foundation's grant typed "other"; and an unmatched number a
 * recorded decision kept apart.
 */
const AGENCY_COUNT = 18;
const KNOWN = 16;

function manyAgencies(plainUnmatched = false): ExportDocument {
  const agencies: Agency[] = [miscellaneous()];
  const grants: Grant[] = [];
  const listings: GrantListing[] = [];
  for (let at_ = 0; at_ < AGENCY_COUNT; at_ += 1) {
    const code = `AG${String(at_).padStart(2, '0')}`;
    agencies.push(
      agency({ code, name: `Agency number ${String(at_)}`, short_name: code, group: 'non_us' }),
    );
    const key = `${code}:G${String(at_)}`;
    grants.push(
      grant({
        key,
        agency: code,
        number: `G${String(at_)}`,
        category: at_ === 0 ? 'other' : 'research',
        amount_usd: at_ < KNOWN ? (AGENCY_COUNT - at_) * 1_000_000 : null,
        ...(at_ < KNOWN ? {} : { amount_source: null, fiscal_years: null }),
      }),
    );
    listings.push(listing({ grant: key, agencies: [code] }));
  }
  const kept = unresolvedGrant({ key: 'MISC:1780131', number: '178013_1' });
  grants.push(kept);
  listings.push(
    listing({
      grant: kept.key,
      agencies: ['MISC'],
      how: 'override',
      cited_as: ['178013_1'],
      override: { reason: 'Does not fit the paper.', by: 'mriffle', date: '2026-09-27' },
    }),
  );
  if (plainUnmatched) {
    // And one no record matched, as the real export's other six are.
    const plain = unresolvedGrant({ key: 'MISC:P01HL0996', number: 'P01 HL0996' });
    grants.push(plain);
    listings.push(listing({ grant: plain.key, agencies: ['MISC'] }));
  }
  const sample = sampleExport();
  return fundingDocument({
    funding: fundingBlock({ agencies, grants }),
    works: sample.works.map((work, position) => ({
      ...work,
      grants: position === 0 ? listings : [],
    })),
  });
}

describe('the ranked agencies with many agencies, most with no known amount', () => {
  it('says the agencies drawn are those with a known amount, and where the rest are', () => {
    at('/funding', manyAgencies());
    const card = screen.getByRole('region', { name: 'Funding agencies' });
    expect(card).toHaveTextContent(
      `The 15 largest of the ${String(KNOWN)} agencies with a known amount are drawn; the other 1 is in the table of every agency below. 2 agencies whose grants have no known amount are not drawn; rank by grants to see them.`,
    );
    fireEvent.click(within(card).getByRole('button', { name: 'By grants' }));
    expect(card).toHaveTextContent(
      `The 15 of the ${String(AGENCY_COUNT)} agencies with the most grants are drawn; the other 3 are in the table of every agency below.`,
    );
  });

  it('names each bar in full, the axis keeping the short name', () => {
    at('/funding', manyAgencies());
    const card = screen.getByRole('region', { name: 'Funding agencies' });
    expect(
      within(card).getByRole('button', { name: /^AG00 \(Agency number 0\): \$18,000,000 known/ }),
    ).toBeInTheDocument();
  });

  it('gives every agency its full name in the table of every agency', () => {
    at('/funding', manyAgencies());
    const table = screen.getByRole('table', { name: /^The agencies of the grants listed/ });
    expect(
      within(table).getByRole('rowheader', { name: 'AG17 Agency number 17' }),
    ).toBeInTheDocument();
  });
});

describe('grant types: "Other" is not a kind of award', () => {
  it('says the grants typed "other" are from agencies whose grants are not typed', () => {
    at('/funding', manyAgencies());
    expect(screen.getByRole('region', { name: 'Grant types' })).toHaveTextContent(
      '“Other” is not a kind of award: its one grant is from an agency other than NIH and NSF, whose records here do not say what kind of award a grant is.',
    );
  });

  it('says so on the export the suite reads whenever it has such a grant', () => {
    const doc = sampleExport();
    at('/funding', doc);
    const other = otherKind(fundingScope(doc.works, fundingOf(doc), UNFILTERED));
    const card = screen.getByRole('region', { name: 'Grant types' });
    if (other.untyped === 0) {
      expect(card).not.toHaveTextContent('“Other” is not a kind of award');
    } else {
      expect(card).toHaveTextContent(otherNote(other).trim());
    }
  });

  it('words each case: none, one, all, some', () => {
    expect(otherNote({ grants: 3, untyped: 0 })).toBe('');
    expect(otherNote({ grants: 208, untyped: 208 })).toBe(
      ' “Other” is not a kind of award: all 208 of its grants are from agencies other than NIH and NSF, whose records here do not say what kind of award a grant is.',
    );
    expect(otherNote({ grants: 5, untyped: 1 })).toMatch(
      /: 1 of its 5 grants is from an agency other than NIH and NSF, /,
    );
    expect(otherNote({ grants: 5, untyped: 4 })).toMatch(
      /: 4 of its 5 grants are from agencies other than NIH and NSF, /,
    );
  });
});

describe('an unmatched number a recorded decision kept apart', () => {
  it('is said to be kept by the decision in the coverage, not unmatched by every source', () => {
    at('/funding', manyAgencies());
    expect(
      screen.getByText(
        /^One unmatched number, on 1 publication, is kept apart in Miscellaneous: a number written in a paper that a recorded decision kept unmatched\./,
      ),
    ).toBeInTheDocument();
  });

  it('is told apart from one no record matched, as on the real export', () => {
    at('/funding', manyAgencies(true));
    expect(
      screen.getByText(
        /^2 unmatched numbers, on 1 publication, are kept apart in Miscellaneous: numbers written in the papers that no source matched to a grant record, or, for 1 of them, that a recorded decision kept unmatched\./,
      ),
    ).toBeInTheDocument();
  });

  it('is told apart on Miscellaneous’s page too', () => {
    at('/funding/agency/MISC', manyAgencies(true));
    expect(
      screen.getByText(
        /^These are numbers the publications give as funding that no funder’s record matched, or, for 1 of them, that a recorded decision kept unmatched\./,
      ),
    ).toBeInTheDocument();
  });

  it('is said to be kept by the decision on Miscellaneous’s page, whose rows are numbers', () => {
    at('/funding/agency/MISC', manyAgencies());
    expect(
      screen.getByText(
        /^These are numbers the publications give as funding that recorded decisions kept unmatched\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Download this unmatched number as CSV' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/record matched are kept/)).toBeNull();
  });
});

describe('the grants table on the export the suite reads', () => {
  it('draws the first rows when there are more, and says how many of how many', () => {
    const doc = sampleExport();
    at('/funding', doc);
    const all = doc.funding.summary.grants;
    const table = screen.getByRole('table', { name: /^Every grant listed/ });
    const drawn = within(table).getAllByRole('rowheader').length;
    expect(drawn).toBe(Math.min(all, GRANT_ROW_LIMIT));
    expect(
      screen.getByRole('button', { name: `Download these ${formatCount(all)} grants as CSV` }),
    ).toBeInTheDocument();
    if (all > GRANT_ROW_LIMIT) {
      expect(table).toHaveAccessibleName(
        new RegExp(
          `the first ${String(GRANT_ROW_LIMIT)} of ${formatCount(all)}, in the order chosen`,
        ),
      );
      fireEvent.click(screen.getByRole('button', { name: `Show all ${formatCount(all)} grants` }));
      expect(within(table).getAllByRole('rowheader')).toHaveLength(all);
    }
  });
});
