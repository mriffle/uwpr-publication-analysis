/**
 * `/lookup` — "Why is a paper not here?" (docs/06 §3, docs/05 §8).
 *
 * A reader supplies one identifier and gets one of **three answers, which the page has to tell
 * apart** (docs/05 §8): included; considered and not included, with the reason; and not found at
 * all, "which means no channel ever nominated it and says nothing about the paper".
 *
 * **It is not a browsable list** (docs/05 A4). The 455 rejected candidates are answered on
 * request and never rendered as a list, a table or a search over titles: "a visitor skimming
 * that list concludes the method is sloppy, and publishing it also puts UWPR in the position of
 * having publicly declined other people's papers."
 *
 * **What the page does not say.** The file behind this form is public and complete (docs/05 §8),
 * so nothing here may imply the data is withheld, private or released case by case. Showing it
 * only on lookup is a decision about what the page *asserts*.
 *
 * **The register** (docs/05 §11) carries more weight here than on any other view, because this
 * is the page someone reads after asking why their paper is missing. Two things follow.
 *
 * - *The design must not contradict the words.* The three outcomes are told apart by a label, a
 *   heading and the shape of what follows — never by a tick against a cross, and never by red
 *   against green. The accents are three colours from the categorical chart palette, which
 *   carries no valence.
 * - *The words have to do the rest.* A rejection is a statement about the evidence this project
 *   could read, not a judgement of the paper and not a claim the resource was not used. No
 *   visual state can say that, so each outcome says it: what the answer means, what it does not
 *   mean, and what to do if it is wrong.
 *
 * **A failed fetch is never an answer.** If `lookup_index.json` cannot be loaded, the page says
 * that, names the file and offers to try again. Reporting "not in the data" when the data could
 * not be read would state a fact about someone's paper that nobody established.
 *
 * The index is fetched **on demand** through the existing `useLookupIndex` (docs/06 §10): the
 * overview never loads it, and arriving on this route is the demand. There is one fetch path in
 * the app and this view reuses it.
 */
import { useId, useState, type FormEvent, type MouseEvent } from 'react';
import { EvidenceSection } from '../components/EvidenceSection';
import { AnswerCard, NotIncludedAnswer } from '../components/NotIncludedAnswer';
import { describeIdentifier, parseIdentifier, type ParsedIdentifier } from '../contract/identifier';
import { describeFailure, type Fetcher } from '../contract/load';
import {
  resolveFromExport,
  resolveFromLookup,
  type NotIncluded,
  type WorkIndex,
} from '../contract/resolve';
import type { ExportDocument, Work } from '../contract/types';
import { useLookupIndex } from '../contract/useLookup';
import { formatDate } from '../format/date';

export interface LookupProps {
  doc: ExportDocument;
  /** The works keyed by their own and their retired identifiers, built once by the router. */
  index: WorkIndex;
  /** Where `lookup_index.json` is served from, which is build-time configuration. */
  lookupHref: string;
  fetcher: Fetcher;
  overviewHref: string;
  /** "How this was assembled", which carries the fuller account of what the answers mean. */
  methodHref: string;
  publicationHref: (work: Work) => string;
  onOpenPublication?: (work: Work) => void;
}

export function Lookup(props: LookupProps) {
  const { doc, methodHref } = props;
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState<ParsedIdentifier | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Remounting the answer is what retries the fetch: `useLookupIndex` starts again from idle,
  // and the submitted query, which lives here, survives it.
  const [attempt, setAttempt] = useState(0);

  const fieldId = useId();
  const hintId = useId();
  const problemId = useId();

  // An example the reader can recognise, taken from the data rather than written into the app
  // (docs/05 §1.1 principle 5).
  const example = doc.works.find((work) => work.ids.doi !== null)?.ids.doi ?? null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseIdentifier(draft);
    if (parsed === null) {
      setQuery(null);
      setProblem(
        draft.trim() === ''
          ? 'Enter an identifier to look up.'
          : 'That is not a DOI, a PubMed or PubMed Central ID, an OpenAlex ID or a work ' +
              'identifier. This form matches identifiers only; it cannot search by title or author.',
      );
      return;
    }
    setProblem(null);
    setQuery(parsed);
  };

  return (
    <main className="page lookup">
      <header className="page-header">
        <h1>Look up a publication</h1>
        <p>
          Paste an identifier to see whether a paper is among the publications here, and why or why
          not. The answer comes from the record of everything this project has considered — the
          papers it includes and the papers it looked at and did not.{' '}
          <a href={methodHref}>How this was assembled</a> sets out how that record is built.
        </p>
      </header>

      <form className="lookup-form" onSubmit={submit} noValidate>
        <div className="lookup-field">
          <label htmlFor={fieldId}>Publication identifier</label>
          <input
            id={fieldId}
            type="text"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            aria-describedby={problem === null ? hintId : `${problemId} ${hintId}`}
            aria-invalid={problem !== null}
            autoComplete="off"
            spellCheck={false}
          />
          {problem === null ? null : (
            <p className="lookup-problem" id={problemId} role="alert">
              {problem}
            </p>
          )}
          <p className="lookup-hint" id={hintId}>
            A DOI, a PubMed ID, a PubMed Central ID, an OpenAlex ID, or a work identifier from this
            site. A full web address works too
            {example === null ? '' : `, as does ${example}`}.
          </p>
        </div>
        <button className="lookup-submit" type="submit">
          Look up
        </button>
      </form>

      <LookupAnswer
        key={attempt}
        {...props}
        query={query}
        onRetry={() => {
          setAttempt((value) => value + 1);
        }}
      />
    </main>
  );
}

interface AnswerProps extends LookupProps {
  query: ParsedIdentifier | null;
  onRetry: () => void;
}

/**
 * Everything downstream of the index fetch, in a component of its own so that remounting it
 * retries the fetch without disturbing the form above.
 */
function LookupAnswer({ query, lookupHref, fetcher, onRetry, ...rest }: AnswerProps) {
  const lookup = useLookupIndex(true, lookupHref, fetcher);

  // A work identifier the export already holds is answered without waiting for the index; every
  // other identifier needs it, because only the index knows an external one (docs/06 §7).
  const fromExport = query === null ? null : resolveFromExport(rest.index, query.id);
  const resolution =
    query === null
      ? null
      : (fromExport ??
        (lookup.status === 'ready' ? resolveFromLookup(rest.index, lookup.data, query.id) : null));

  const failed = fromExport === null && lookup.status === 'failed';
  const busy = query !== null && resolution === null && !failed;
  const preparing = query === null && (lookup.status === 'loading' || lookup.status === 'idle');

  // One live region for the whole view, present from the first render so a later change to it is
  // announced. It carries the announcement once there is a result, and the visible progress
  // message while there is not.
  let announcement = '';
  if (preparing) announcement = 'Loading the record of everything this project has considered…';
  else if (busy && query !== null) announcement = `Looking up ${describeIdentifier(query)}…`;
  else if (query !== null && resolution !== null) announcement = summarize(query, resolution);

  return (
    <div className="lookup-answers">
      <p role="status" className={preparing || busy ? 'chart-skeleton' : 'visually-hidden'}>
        {announcement}
      </p>

      {lookup.status === 'failed' && failed ? (
        <div className="notice" role="alert">
          <p>{describeFailure(lookup.failure)}</p>
          <p>
            {query === null
              ? 'Until it loads, this page cannot answer for any identifier.'
              : `Nothing is being claimed about ${describeIdentifier(query)}: this is a failure to load this page’s data, not a finding about the paper.`}
          </p>
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : null}

      {query === null && !failed ? <LookupEmptyState /> : null}

      {query !== null && resolution !== null ? (
        <Answer query={query} resolution={resolution} {...rest} />
      ) : null}
    </div>
  );
}

type Resolution = NonNullable<ReturnType<typeof resolveFromExport>>;

/** The one sentence the live region carries; the card below it carries the substance. */
function summarize(query: ParsedIdentifier, resolution: Resolution): string {
  const named = describeIdentifier(query);
  switch (resolution.status) {
    case 'found':
      return `${named} is included: ${resolution.work.title}`;
    case 'not-included':
      return `${named} was considered and is not included. ${resolution.row.reason_label}.`;
    case 'unknown':
      return `${named} is not in this project’s data at all.`;
  }
}

/** The three outcomes, in the order of docs/05 §8, with the label each answer carries. */
const OUTCOMES: readonly (readonly [string, string, string])[] = [
  [
    'included',
    'Included',
    'The publication is among those shown here, with the evidence that put it there.',
  ],
  [
    'not-included',
    'Considered, not included',
    'The paper was examined and no rule was met, with the reason and anything that came close.',
  ],
  [
    'unknown',
    'Not in the data',
    'No search this project runs has ever put the paper forward, so there is nothing recorded about it either way.',
  ],
];

/**
 * What the reader sees before asking anything: the three answers they can get, each under the
 * label it will arrive with, so the shape of the reply is not a surprise — and so that "not
 * included" is visibly one ordinary outcome of three rather than a verdict.
 */
function LookupEmptyState() {
  return (
    <div className="lookup-empty">
      <p>One of three answers comes back:</p>
      <ul>
        {OUTCOMES.map(([outcome, label, description]) => (
          <li key={outcome}>
            <span className="lookup-outcome" data-outcome={outcome}>
              {label}
            </span>
            <span className="lookup-empty-description">{description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface CardProps extends Omit<LookupProps, 'lookupHref' | 'fetcher'> {
  query: ParsedIdentifier;
  resolution: Resolution;
}

function Answer({ resolution, ...rest }: CardProps) {
  switch (resolution.status) {
    case 'found':
      return <IncludedCard work={resolution.work} {...rest} />;
    case 'not-included':
      return <NotIncludedCard row={resolution.row} {...rest} />;
    case 'unknown':
      return <UnknownCard {...rest} />;
  }
}

/**
 * The identifier the reader typed, where it is not one the card already shows.
 *
 * A retired work identifier and a superseded preprint DOI both resolve to a work whose own
 * identifiers look nothing like what was pasted, and a reader left to wonder about that has been
 * given an answer they cannot check.
 */
function matchNote(query: ParsedIdentifier, work: Work): string | null {
  if (query.kind === 'work') {
    return work.id === query.value
      ? null
      : `${query.value} is a retired identifier for this work, which is now ${work.id}.`;
  }
  if (query.kind !== 'doi') return null;
  if (work.ids.doi !== null && work.ids.doi.toLowerCase() === query.value) return null;
  const version = work.versions.find(
    (entry) => entry.doi !== null && entry.doi.toLowerCase() === query.value,
  );
  if (!version) return null;
  return `That DOI is the ${version.kind} version of this publication. The versions are one work here, and evidence on either applies to both.`;
}

function IncludedCard({
  query,
  work,
  doc,
  publicationHref,
  onOpenPublication,
}: Omit<CardProps, 'resolution'> & { work: Work }) {
  const note = matchNote(query, work);
  const href = publicationHref(work);
  const open = (event: MouseEvent) => {
    if (onOpenPublication && !event.metaKey && !event.ctrlKey && event.button === 0) {
      event.preventDefault();
      onOpenPublication(work);
    }
  };

  return (
    <AnswerCard outcome="included" label="Included" heading="This publication is included">
      <p className="lookup-answer-title">
        <a href={href} onClick={open}>
          {work.title}
        </a>
      </p>
      <p className="lookup-answer-meta">
        {work.venue === null ? 'No venue recorded' : work.venue.name}
        {' · '}
        {work.date === null ? work.year : formatDate(work.date)}
        {' · '}
        {work.is_preprint ? 'preprint' : work.kind}
      </p>
      {note === null ? null : <p className="lookup-note">{note}</p>}

      {/* The evidence is the explanation. It is shown, not summarised (docs/05 §11.6). */}
      <h3>Why it is counted</h3>
      <p className="lookup-answer-lede">
        {work.on_official_list
          ? `This publication is on ${doc.resource.short_name}’s own publications list.`
          : `This publication is not on ${doc.resource.short_name}’s own publications list; it was found from the evidence below.`}{' '}
        Each entry is a separate reason, recorded with where it came from and when it was read.
      </p>
      <EvidenceSection work={work} />

      <p className="lookup-more">
        <a href={href} onClick={open}>
          See the full record for this publication
        </a>
      </p>
    </AnswerCard>
  );
}

/**
 * The rejection, which `/publication/<identifier>` renders too (`components/NotIncludedAnswer`).
 *
 * Here the reader has just asked a question, so the card sits under this page's own `h1`, the
 * identifier is named as one they looked up, and the ways onward are left out: the form is
 * directly above, and offering to look up another publication from inside the answer would be
 * furniture.
 */
function NotIncludedCard({
  query,
  row,
  doc,
  methodHref,
}: Omit<CardProps, 'resolution'> & { row: NotIncluded }) {
  return (
    <NotIncludedAnswer
      row={row}
      resource={doc.resource}
      methodHref={methodHref}
      query={query}
      headingLevel={2}
      arrival="asked"
    />
  );
}

function UnknownCard({ query, overviewHref, methodHref }: Omit<CardProps, 'resolution'>) {
  return (
    <AnswerCard
      outcome="unknown"
      label="Not in the data"
      heading="This identifier is not in this project’s data"
    >
      <p className="lookup-answer-title">{describeIdentifier(query)}</p>
      <p>
        No search this project runs has put this paper forward as a candidate, so there is nothing
        recorded about it — neither that it belongs here nor that it does not. It has not been
        examined and not been rejected.
      </p>
      <p>
        That is a statement about where this project has looked. The searches cover a defined set of
        sources, and publications that used the resource but record no trace of it anywhere readable
        are known to be missed — <a href={methodHref}>how this was assembled</a> gives the coverage
        in numbers, and says how to report a paper that belongs here.
      </p>
      <p className="lookup-more">
        <a href={overviewHref}>See all publications</a>
      </p>
    </AnswerCard>
  );
}
