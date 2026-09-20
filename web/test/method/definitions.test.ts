/**
 * The metric definitions the method page renders and the headline figures link into
 * (docs/06 §4.2, docs/05 §5, §11).
 *
 * The page test asserts they appear; this asserts what they *say* — that the register rules hold
 * in the strings themselves, and that a figure the contract refuses to state stays unstated.
 */
import { describe, expect, it } from 'vitest';
import { headlineFigures } from '../../src/components/HeadlineFigures';
import { HEADLINE_DEFINITION_IDS, metricDefinitions } from '../../src/method/definitions';
import { summarize } from '../../src/aggregate/metrics';
import { formatCount } from '../../src/format/number';
import { sampleExport } from '../support/fixture';

const doc = sampleExport();
const byId = new Map(metricDefinitions(doc).map((definition) => [definition.id, definition]));

describe('the definitions the headline figures link into (docs/06 §4.2)', () => {
  it('covers every headline figure, by the id that figure carries', () => {
    const figures = headlineFigures(doc.works, doc.sources.citations.as_of);
    expect(figures.map((figure) => figure.id)).toEqual([...HEADLINE_DEFINITION_IDS]);
    for (const id of HEADLINE_DEFINITION_IDS) expect(byId.has(id)).toBe(true);
  });

  it('gives every entry a unique id, so no fragment is ambiguous', () => {
    const definitions = metricDefinitions(doc);
    expect(new Set(definitions.map((definition) => definition.id)).size).toBe(definitions.length);
  });

  it('states the same corpus values the summary cross-check asserts', () => {
    const summary = summarize(doc.works);
    expect(byId.get('publications')?.value).toBe(formatCount(summary.publications));
    expect(byId.get('citations')?.value).toBe(formatCount(summary.citations));
    expect(byId.get('research-groups')?.value).toBe(formatCount(summary.research_groups));
    expect(byId.get('journals')?.value).toBe(formatCount(summary.journals));
    expect(byId.get('institutions')?.value).toBe(formatCount(summary.institutions));
    expect(byId.get('h-index')?.value).toBe(formatCount(summary.h_index));
    expect(byId.get('years-covered')?.value).toBe(
      `${String(summary.first_year)}–${String(summary.last_year)}`,
    );
  });
});

describe('the register (docs/05 §11)', () => {
  it('says a proxy is a proxy and a floor is a floor (§11.4)', () => {
    expect(byId.get('research-groups')?.definition).toMatch(/A proxy, and not a count of groups/);
    expect(byId.get('institutions')?.definition).toMatch(/A floor/);
    expect(byId.get('countries')?.definition).toMatch(/A floor/);
  });

  it('stops the citation figure short of a causal claim (§5.1)', () => {
    expect(byId.get('citations')?.definition).toMatch(
      /they do not measure what caused the citations/,
    );
  });

  it('dates every citation-derived figure (§11.3)', () => {
    for (const id of ['citations', 'field-weighted-impact']) {
      expect(byId.get(id)?.definition).toContain(doc.sources.citations.name);
      expect(byId.get(id)?.definition).toMatch(/\d{4}/);
    }
  });

  it('says staff co-authorship is never evidence (D2)', () => {
    expect(byId.get('staff-author')?.definition).toMatch(/never evidence/);
  });

  it('uses no promotional register anywhere (§11.1)', () => {
    const prose = metricDefinitions(doc)
      .map((definition) => `${definition.term} ${definition.definition}`)
      .join(' ');
    for (const word of [
      'world-class',
      'cutting-edge',
      'leading',
      'impressive',
      'remarkable',
      'best-in-class',
      'unparalleled',
    ]) {
      expect(prose.toLowerCase()).not.toContain(word);
    }
  });
});

describe('what the contract cannot state, the page does not state', () => {
  it('gives the citation percentile no corpus value (docs/05 §2.2, §7.15)', () => {
    expect(byId.get('citation-percentile')?.value).toBeUndefined();
    expect(byId.get('citation-percentile')?.definition).toMatch(/not a percentile of anything/);
  });

  it('says so plainly when there is no by-year citation window at all', () => {
    // `period.citation_years_from` is nullable (docs/05 §5), and a contract that reports no
    // by-year series must not render "begins in null".
    const without = metricDefinitions({
      ...doc,
      period: { ...doc.period, citation_years_from: null },
    });
    const window = without.find((definition) => definition.id === 'citations-in-window');
    expect(window?.definition).toBe(
      `${doc.sources.citations.name} reports no by-year citation series for these publications, so every citation falls outside the window.`,
    );
  });

  it('reports an absent field-weighted impact as absent rather than as zero', () => {
    const empty = metricDefinitions({ ...doc, works: [] });
    expect(empty.find((definition) => definition.id === 'field-weighted-impact')?.value).toBe(
      'not available',
    );
    expect(empty.find((definition) => definition.id === 'years-covered')?.value).toBe(
      'not available',
    );
    expect(empty.find((definition) => definition.id === 'open-access')?.value).toBe('0 (0%)');
  });
});
