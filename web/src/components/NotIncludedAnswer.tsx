/**
 * "This publication was considered and is not included" — the one rendering of a rejection, used
 * by both routes that can reach one (docs/05 §8, docs/06 §5 and §7).
 *
 * **Why one component.** A reader meets this answer two ways: by asking on `/lookup`, and by
 * following `/publication/<doi>` out of a colleague's email. The second is the likelier route, and
 * it used to render the barer page — a title, the reason label and a bare list of signal labels
 * with no explanation and no way to correct it. The reader least likely to have any context got
 * the least of it. Both routes now render this card, and the register below is the target.
 *
 * **What it has to say** (docs/05 §8, §11). A rejection is a statement about the evidence this
 * project could read: never a judgement of the paper, and never a claim the resource was not used.
 * No visual state can carry that, so the words do, in this order — the recorded reason; what that
 * reason does *not* mean; each near miss with why it is deliberately not evidence; and how to
 * report it if it is wrong.
 *
 * **It is not an error.** It is one ordinary outcome of three, so it takes an accent from the
 * categorical chart palette, which carries no valence, and it never announces itself as an alert.
 *
 * **What differs between the two contexts**, and so is a prop rather than a second copy:
 * `headingLevel`, because on `/lookup` the card sits under the form's own `h1` and on a permalink
 * the card *is* the page; `arrival`, one sentence, because typing an identifier and following a
 * link are not the same act; and `children`, the ways onward, because a reader already standing at
 * the form does not need to be offered it.
 */
import { useId, type ReactNode } from 'react';
import { describeIdentifier, type ParsedIdentifier } from '../contract/identifier';
import type { NotIncluded } from '../contract/resolve';
import type { Resource } from '../contract/types';
import { staffIndex } from '../format/staff';

const doiUrl = (doi: string): string => `https://doi.org/${doi}`;
const pubmedUrl = (pmid: string): string => `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
const pmcUrl = (pmcid: string): string => `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`;

/** The three outcomes' shared frame: the label, the heading, and whatever the outcome puts under it. */
export interface AnswerCardProps {
  outcome: 'included' | 'not-included' | 'unknown';
  label: string;
  heading: string;
  /**
   * 2 under `/lookup`'s own `h1`, 1 where the card is the whole page. docs/06 §9 asks for one
   * `h1` and ordered headings under it, which a fixed level cannot give both routes.
   */
  headingLevel?: 1 | 2;
  children: ReactNode;
}

export function AnswerCard({
  outcome,
  label,
  heading,
  headingLevel = 2,
  children,
}: AnswerCardProps) {
  const headingId = useId();
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <section className="lookup-answer" data-outcome={outcome} aria-labelledby={headingId}>
      <p className="lookup-outcome">{label}</p>
      {/* The class, not the tag, carries the type: the level changes with the page, the answer does not. */}
      <Heading className="lookup-answer-heading" id={headingId}>
        {heading}
      </Heading>
      {children}
    </section>
  );
}

/** The external identifiers a rejected candidate carries, as links, so the reader can check it. */
function RowLinks({ row }: { row: NotIncluded }) {
  const links: ReactNode[] = [];
  if (row.ids.doi !== null)
    links.push(
      <a key="doi" href={doiUrl(row.ids.doi)} rel="noreferrer">
        DOI {row.ids.doi}
      </a>,
    );
  if (row.ids.pmid !== null)
    links.push(
      <a key="pmid" href={pubmedUrl(row.ids.pmid)} rel="noreferrer">
        PubMed {row.ids.pmid}
      </a>,
    );
  if (row.ids.pmcid !== null)
    links.push(
      <a key="pmcid" href={pmcUrl(row.ids.pmcid)} rel="noreferrer">
        PubMed Central {row.ids.pmcid}
      </a>,
    );
  if (links.length === 0) return null;
  return <p className="lookup-answer-links">{links}</p>;
}

/**
 * What the recorded reason means, and — the part no styling can carry — what it does not.
 *
 * The contract's `reason_label` states the finding; this states its scope. "No evidence of
 * support was found in this paper" is a statement about a record, and a paper that used the
 * resource and never said so reads exactly the same way. Saying that is the difference between
 * an explanation and a verdict (docs/05 §8, §11).
 *
 * All five reasons the schema allows are handled, including the `no_longer_meets_rules` case that
 * has no instance in the real export today (docs/05 §8).
 */
export function reasonNote(reason: NotIncluded['reason'], resource: string): string {
  switch (reason) {
    case 'no_rule_fired':
      return (
        `For a paper to count, something has to be recorded in it, or in a source that can be ` +
        `read about it: the award code, ${resource} named in the text, an author affiliated to ` +
        `it, or a staff member thanked for the analysis. None of those was found. That is a ` +
        `statement about the record, not about the work — a paper that used the resource and ` +
        `did not say so reads exactly like this one.`
      );
    case 'excluded_record_type':
      return (
        `The corpus counts research publications and the preprints behind them. A record of ` +
        `another type is set aside before any rule is applied to it, so nothing was looked for ` +
        `here and nothing about the work itself has been found either way.`
      );
    case 'before_window':
      return (
        `Earlier work sits outside the window the searches cover, so no evidence was sought for ` +
        `it in either direction. The window is a limit of this project, not a statement about ` +
        `the paper.`
      );
    case 'override_exclude':
      return (
        `That decision was recorded by a person, with a reason, rather than reached by a rule. ` +
        `It is a judgement about the publication and should be read as one.`
      );
    case 'no_longer_meets_rules':
      return (
        `It was counted under an earlier version of the rules and does not meet the current ` +
        `ones. The rules change deliberately and every change is dated; the paper has not ` +
        `changed.`
      );
  }
}

/**
 * Whether the card already puts the identifier the reader supplied in front of them.
 *
 * The card shows the work identifier and links the DOI, PubMed and PMC IDs; an OpenAlex ID, or
 * an identifier that reached this candidate through the alias map, appears nowhere. A reader who
 * cannot see what they asked about has been handed an answer they cannot check.
 */
function shows(row: NotIncluded, query: ParsedIdentifier): boolean {
  return [row.id, row.ids.doi, row.ids.pmid, row.ids.pmcid]
    .filter((value): value is string => value !== null)
    .some((value) => value.toLowerCase() === query.value.toLowerCase());
}

export interface NotIncludedAnswerProps {
  row: NotIncluded;
  /**
   * The facility the page describes: its short name, which the wording uses throughout, and
   * `staff`, which is what turns a signal's identifier suffix into a person. Both come from the
   * export; the app holds no text of its own about the resource (docs/05 §1.1 principle 5).
   */
  resource: Resource;
  /** "How this was assembled", which carries the fuller account of what the answers mean. */
  methodHref: string;
  /**
   * The identifier the reader supplied, named back to them when the card does not already show
   * it. `null` where it is unreadable, which is only reachable from a permalink.
   */
  query?: ParsedIdentifier | null;
  headingLevel?: 1 | 2;
  /** How the reader got here, which changes exactly one sentence. */
  arrival?: 'asked' | 'followed';
  /** The ways onward, which the two routes owe the reader differently. */
  children?: ReactNode;
}

export function NotIncludedAnswer({
  row,
  resource,
  methodHref,
  query = null,
  headingLevel = 2,
  arrival = 'asked',
  children,
}: NotIncludedAnswerProps) {
  const staff = staffIndex(resource.staff);
  // A signal names the staff member it is about; the label, which the contract owns and this
  // view quotes rather than rewrites, does not. Two co-authors therefore produce two identical
  // labels, and the name is what tells them apart (docs/05 §11.7: plain language, then the name).
  const signals = row.signals.map((signal, position) => ({
    signal,
    label: row.signal_labels[position] ?? signal,
    who: staff.get(signal.split(':')[1] ?? '') ?? null,
  }));

  // The signals sit one level under the card's heading, whichever level that is.
  const SignalsHeading = headingLevel === 1 ? 'h2' : 'h3';

  const named = query === null ? null : describeIdentifier(query);
  const note =
    query === null || named === null || shows(row, query)
      ? null
      : arrival === 'followed'
        ? `You followed a link for ${named}. It belongs to the record below.`
        : `Looked up by ${named}.`;

  return (
    <AnswerCard
      outcome="not-included"
      label="Considered, not included"
      heading="This publication was considered and is not included"
      headingLevel={headingLevel}
    >
      <p className="lookup-answer-title">{row.title}</p>
      <p className="lookup-answer-meta">
        {row.year === null ? 'No year recorded' : row.year}
        {' · '}
        {row.id}
      </p>
      <RowLinks row={row} />
      {note === null ? null : <p className="lookup-note">{note}</p>}

      <p className="lookup-reason">{row.reason_label}.</p>
      <p>{reasonNote(row.reason, resource.short_name)}</p>

      {signals.length > 0 ? (
        <>
          <SignalsHeading className="lookup-answer-subheading">
            What was found, and why it is not evidence
          </SignalsHeading>
          <p className="lookup-answer-lede">
            These came up while the paper was read. Each is a connection the rules deliberately do
            not count on its own, because each can be true of a paper the resource had no part in —
            which is why they are listed here rather than acted on.{' '}
            <a href={methodHref}>How this was assembled</a> sets out what does count.
          </p>
          <ul className="lookup-signals">
            {signals.map((entry, position) => (
              <li key={`${entry.signal}-${String(position)}`}>
                {entry.label}
                {entry.who === null ? null : (
                  <span className="lookup-signal-detail">{entry.who}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : row.reason === 'no_rule_fired' ? (
        <p>Nothing came close either: no near miss was recorded against this paper.</p>
      ) : null}

      <p className="lookup-note">
        If the paper did use {resource.short_name} and says so somewhere that can be read, that is a
        correction worth reporting: the project records overrides for exactly that purpose, against
        the repository this page is built from.
      </p>

      {children}
    </AnswerCard>
  );
}
