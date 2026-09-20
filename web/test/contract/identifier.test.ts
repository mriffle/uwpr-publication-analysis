/**
 * Reading an identifier the way a person supplies one (docs/05 §8).
 *
 * The lookup form receives whatever the reader had to hand, so the cases here are the forms a
 * real paste takes rather than the tidy ones a permalink carries. Two of them are the point of
 * the module:
 *
 * - a DOI is **case-insensitive**, so `10.1021/ACS…` and `10.1021/acs…` are one identifier;
 * - input that is not an identifier at all returns `null`, which is what keeps "we do not
 *   recognise this" separate from "no channel ever nominated this paper". Only the second is a
 *   statement about the paper, and reporting one as the other would assert something the data
 *   does not support.
 */
import { describe, expect, it } from 'vitest';
import { describeIdentifier, parseIdentifier } from '../../src/contract/identifier';

const parsed = (input: string) => {
  const result = parseIdentifier(input);
  if (result === null) throw new Error(`expected ${input} to parse`);
  return result;
};

describe('a DOI, however it arrives', () => {
  it.each([
    '10.1021/acs.jproteome.5c00706',
    '  10.1021/acs.jproteome.5c00706  ',
    'https://doi.org/10.1021/acs.jproteome.5c00706',
    'http://dx.doi.org/10.1021/acs.jproteome.5c00706',
    'https://www.doi.org/10.1021/acs.jproteome.5c00706',
    'doi.org/10.1021/acs.jproteome.5c00706',
    'doi:10.1021/acs.jproteome.5c00706',
    'DOI: 10.1021/acs.jproteome.5c00706',
    'doi 10.1021/acs.jproteome.5c00706',
    '<https://doi.org/10.1021/acs.jproteome.5c00706>',
    '10.1021/acs.jproteome.\n5c00706',
  ])('reads %s', (input) => {
    expect(parsed(input)).toMatchObject({
      kind: 'doi',
      value: '10.1021/acs.jproteome.5c00706',
      key: 'doi:10.1021/acs.jproteome.5c00706',
    });
  });

  it('is case-insensitive, because a DOI is', () => {
    expect(parsed('10.1021/ACS.JPROTEOME.5C00706').value).toBe('10.1021/acs.jproteome.5c00706');
  });
});

describe('a PubMed ID, however it arrives', () => {
  it.each([
    '31921548',
    ' 31921548 ',
    'PMID: 31921548',
    'pmid:31921548',
    'PMID 31921548',
    'PubMed 31921548',
    'PubMed ID: 31921548',
    'https://pubmed.ncbi.nlm.nih.gov/31921548/',
    'https://pubmed.ncbi.nlm.nih.gov/31921548',
    'https://www.ncbi.nlm.nih.gov/pubmed/31921548',
  ])('reads %s', (input) => {
    expect(parsed(input)).toMatchObject({ kind: 'pmid', value: '31921548', key: 'pmid:31921548' });
  });
});

describe('a PubMed Central ID, however it arrives', () => {
  it.each([
    'PMC6947714',
    'pmc6947714',
    'PMCID: PMC6947714',
    'https://pmc.ncbi.nlm.nih.gov/articles/PMC6947714/',
    'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6947714/',
  ])('reads %s', (input) => {
    expect(parsed(input)).toMatchObject({ kind: 'pmcid', value: 'PMC6947714' });
  });
});

describe('an OpenAlex ID, however it arrives', () => {
  it.each([
    'W2982915979',
    'w2982915979',
    'openalex:W2982915979',
    'OpenAlex: W2982915979',
    'https://openalex.org/W2982915979',
    'https://api.openalex.org/works/W2982915979',
  ])('reads %s', (input) => {
    expect(parsed(input)).toMatchObject({ kind: 'openalex', value: 'W2982915979' });
  });
});

describe('a work identifier from this site', () => {
  it.each(['W-000327', 'w-000327', 'work:W-000327', 'Work ID: W-000327'])('reads %s', (input) => {
    expect(parsed(input)).toMatchObject({ kind: 'work', value: 'W-000327', id: 'W-000327' });
  });

  it('is told apart from an OpenAlex ID by the hyphen alone', () => {
    expect(parsed('W-000327').kind).toBe('work');
    expect(parsed('W000327').kind).toBe('openalex');
  });
});

describe('input that is not an identifier', () => {
  it.each([
    '',
    '   ',
    'Targeting and Specific Activation of Antigen-Presenting Cells',
    'Smith et al 2019',
    'proteomics',
    'workflow analysis',
    'doi: not a real doi',
    '10.1021',
    'https://example.org/some/page',
  ])('returns null for %s, rather than reporting an unknown paper', (input) => {
    expect(parseIdentifier(input)).toBeNull();
  });
});

describe('naming the identifier back to the reader', () => {
  it('says which kind it is, in plain words', () => {
    expect(describeIdentifier(parsed('10.1021/x.1'))).toBe('DOI 10.1021/x.1');
    expect(describeIdentifier(parsed('31921548'))).toBe('PubMed ID 31921548');
    expect(describeIdentifier(parsed('PMC6947714'))).toBe('PubMed Central ID PMC6947714');
    expect(describeIdentifier(parsed('W2982915979'))).toBe('OpenAlex ID W2982915979');
    expect(describeIdentifier(parsed('W-000327'))).toBe('work W-000327');
  });
});

describe('what the resolver is asked', () => {
  it('is the bare value, which rebuilds the same key the index is written with', () => {
    expect(parsed('https://doi.org/10.1021/X.1').id).toBe('10.1021/x.1');
    expect(parsed('PMID: 31921548').id).toBe('31921548');
    expect(parsed('work:w-000327').id).toBe('W-000327');
  });
});
