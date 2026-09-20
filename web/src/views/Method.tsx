/**
 * `/method` — "How this was assembled" (docs/06 §3, §10; docs/05 §10).
 *
 * The page for docs/06 §1's third reader, "someone checking the claim", who "is the reason the
 * project exists in the form it does". Everything on it is computed from the loaded export: the
 * criteria and the source counts from the rows, the two splits from the `method` block the
 * pipeline computes independently, the dates from `sources_last_read`.
 *
 * **What is drawn rather than written.** Three of §10's bullets are proportions, and a
 * proportion buried in a sentence is a proportion nobody reads. The confirmation split in
 * particular *is* the section's argument: a listed paper read with no trace found and a listed
 * paper that could not be read at all are different failures, and the difference is visible in a
 * segmented bar and invisible in prose. What a chart cannot say — *why* that difference matters,
 * and what is missed entirely — stays as sentences, because it is reasoning and not a number.
 *
 * **The criteria chart of docs/05 §7.13 lives here and not on the overview.** §7.13 says it
 * "belongs on the method page, where it is the clearest single statement of how the corpus was
 * assembled", and docs/06 §4's enumeration of the overview, section by section, does not include
 * it. It is the one chart about *method* rather than about the science, so it belongs with the
 * method. Each bar is still a filter dimension (docs/05 §9), so the links beneath it open the
 * publication list already filtered — the affordance survives the move, as a link rather than as
 * a chart mark, because a mark that navigates away from this page is not the same control as a
 * mark that filters the page it is on.
 *
 * Register, from docs/05 §11, which governs every string here more than anywhere else on the
 * site: no promotion, no causal claims, every figure with its definition, every proxy labelled,
 * and each limitation stated as the plain thing it is rather than defended.
 */
import { useEffect } from 'react';
import { criteriaBars } from '../aggregate/categories';
import {
  BEYOND_OFFICIAL_LIST,
  INDEPENDENTLY_CONFIRMED,
  NOT_READABLE,
  ON_OFFICIAL_LIST,
  READ_NO_TRACE,
  confirmationSplit,
  evidenceSources,
  officialListSplit,
  sourcesLastRead,
} from '../aggregate/method';
import { worksWithStaffAuthor } from '../aggregate/metrics';
import { ChartTable } from '../charts/ChartTable';
import { ProportionCard } from '../charts/ProportionCard';
import { RankedBarCard } from '../charts/RankedBarCard';
import { otherColour, seriesColour } from '../charts/palette';
import { StalenessNotice } from '../components/StalenessNotice';
import type { ExportDocument } from '../contract/types';
import { CRITERION_LABELS } from '../filter/describe';
import { EMPTY_FILTER } from '../filter/state';
import { encodeFilterToQuery } from '../filter/url';
import { formatDate } from '../format/date';
import { formatCount, pluralize } from '../format/number';
import { metricDefinitions, type MetricDefinition } from '../method/definitions';
import type { SourceRead } from '../aggregate/method';

export interface MethodProps {
  doc: ExportDocument;
  /** The overview's route, which every "show me these publications" link is built from. */
  overviewHref: string;
  /** In-app navigation back, when the reader arrived from the overview rather than cold. */
  onClose?: () => void;
  /** Injected in tests so the staleness threshold is exercised without freezing the clock. */
  now?: Date;
}

const PUBLICATION_UNIT = { one: 'publication', many: 'publications' };

/**
 * Scroll and focus the definition a headline figure linked to (docs/06 §4.2).
 *
 * A link from the overview is a full navigation, so the app boots before the target exists and
 * the browser's own fragment handling has already run and found nothing. Focusing rather than
 * only scrolling is what makes the link work for a reader who is not using a pointer: without
 * it, the next Tab starts at the top of a page they have just jumped down.
 */
function useFragmentTarget(ready: boolean): void {
  useEffect(() => {
    if (!ready) return;
    const id = window.location.hash.replace(/^#/, '');
    if (id === '') return;
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView?.();
    target.focus();
  }, [ready]);
}

export function Method({ doc, overviewHref, onClose, now }: MethodProps) {
  const { method, works } = doc;
  const criteria = criteriaBars(works, CRITERION_LABELS);
  const confirmation = confirmationSplit(method);
  const listSplit = officialListSplit(method);
  const sources = evidenceSources(works);
  const lastRead = sourcesLastRead(method);
  const definitions = metricDefinitions(doc);
  const staffAuthored = worksWithStaffAuthor(works);
  const resource = doc.resource.short_name;

  useFragmentTarget(true);

  /** The overview, already filtered — the same query string a chart click would have produced. */
  const filtered = (filter: Partial<typeof EMPTY_FILTER>): string =>
    `${overviewHref}${encodeFilterToQuery({ ...EMPTY_FILTER, ...filter })}`;

  const segmentLabels: Record<string, { label: string; colour: string; meaning: string }> = {
    [INDEPENDENTLY_CONFIRMED]: {
      label: 'Evidence found in the publication itself',
      colour: seriesColour(0),
      meaning: `Listed by ${resource}, and the publication or its metadata also records the use.`,
    },
    [READ_NO_TRACE]: {
      label: 'Full text read, no mention found',
      colour: seriesColour(1),
      meaning: 'Listed only. The text was read in full and names nothing we could match.',
    },
    [NOT_READABLE]: {
      label: 'Full text could not be read',
      colour: otherColour(),
      meaning: 'Listed only. No machine-readable full text was available to search.',
    },
    [ON_OFFICIAL_LIST]: {
      label: `On ${resource}’s own publications page`,
      colour: seriesColour(0),
      meaning: `Recorded on the resource’s own list of publications.`,
    },
    [BEYOND_OFFICIAL_LIST]: {
      label: 'Found beyond that list',
      colour: seriesColour(2),
      meaning: 'Included on evidence in the publication or its metadata, and not on the list.',
    },
  };

  const segments = (proportion: typeof confirmation) =>
    proportion.segments.map((segment) => ({
      key: segment.key,
      value: segment.value,
      label: segmentLabels[segment.key]?.label ?? segment.key,
      colour: segmentLabels[segment.key]?.colour ?? otherColour(),
      meaning: segmentLabels[segment.key]?.meaning ?? '',
    }));

  return (
    <main className="page method-page">
      <header className="page-header">
        <h1>How this was assembled</h1>
        <p>
          What has to be true of a publication for it to appear on this site, how much of that the
          project can show for itself, and what it is known to miss. Every figure below is over all{' '}
          {pluralize(works.length, 'publication')} and is not affected by any filter.
        </p>
        <p>
          {onClose ? (
            <button type="button" className="detail-close" onClick={onClose}>
              Back to the publications
            </button>
          ) : (
            <a className="detail-close" href={overviewHref}>
              See all publications
            </a>
          )}
        </p>
      </header>

      <StalenessNotice generatedAt={doc.generated_at} {...(now ? { now } : {})} />

      {/* --- docs/05 §10, "How the corpus is assembled" ------------------------------------ */}
      <h2 id="how-the-corpus-is-assembled">How the corpus is assembled</h2>
      <p>
        A publication appears here when at least one of four things is recorded about it: that{' '}
        {resource} lists it on its own publications page; that the publication gives {resource}’s
        award identifier as funding; that a member of {resource}’s staff is thanked for analysis or
        technical help, in a paper published while they worked there; or that the publication names
        the resource or its facilities, in its text, in an author’s affiliation or in the
        description of a deposited dataset.
      </p>
      <p>
        Each of those is a fact held in a source that can be named, linked and dated, and each
        publication’s own page shows the ones it carries, quoted as published rather than
        summarised. <strong>Inclusion is decided by that evidence and by nothing else</strong> — not
        by who the authors are, not by which department they sit in, and not by anyone’s judgement
        after the fact. The same rules run unattended every week and produce the same answer from
        the same sources, which is what makes a figure on this site something a reader can check
        rather than something they have to accept.
      </p>

      <RankedBarCard
        title="How each publication is known"
        chartLabel="Publications by how they are known to have used the resource"
        description="The four ways a publication qualifies, over the whole corpus."
        note={
          <>
            <strong>The bars overlap and sum to more than the number of publications.</strong>{' '}
            {pluralize(criteria.overlapping, 'publication')} of the{' '}
            {pluralize(criteria.works, 'publication')} satisfy more than one, so the bars total{' '}
            {formatCount(criteria.total)}. This is a set of overlapping facts, not a division of the
            corpus into parts, which is why it is neither a pie chart nor the proportion bars below.
          </>
        }
        rows={criteria.items.map((item) => ({
          key: item.key,
          label: item.label,
          value: item.count,
        }))}
        unit={PUBLICATION_UNIT}
        valueAxisLabel="Publications"
        categoryHeader="How it is known"
        tableCaption="Publications by how they are known to have used the resource, over the whole corpus."
      />

      <p className="method-links">
        Each of these is also a filter on the publication list.{' '}
        {criteria.items.map((item, index) => (
          <span key={item.key}>
            {index > 0 ? ' · ' : ''}
            <a href={filtered({ criterion: [item.criterion] })}>{item.label}</a>
          </span>
        ))}
      </p>

      <h3 id="what-is-deliberately-not-evidence">What is deliberately not evidence</h3>
      <p>
        Several things look like evidence and are not counted as any. The exclusions are as much a
        part of how this corpus was assembled as the four criteria, and each of them would have made
        the count larger.
      </p>
      <ul className="method-list">
        <li>
          <strong>Co-authorship by a staff member.</strong> A member of {resource}’s staff is an
          author on {pluralize(staffAuthored, 'publication')} here, and that fact on its own never
          includes a publication: the question is whether the resource was used, not who wrote the
          paper. Every one of those {formatCount(staffAuthored)} is here for one of the four reasons
          above, and would be here without the staff author.
        </li>
        <li>
          <strong>Other proteomics facilities</strong> at the same university and in the same city.
          Their names resemble {resource}’s closely enough to match a careless search, and a paper
          that names one of them and not {resource} is not a {resource} paper.
        </li>
        <li>
          <strong>Software, web tools and instrument designs</strong> that originated at {resource}.
          They are used worldwide by people who have never contacted the facility. Citing a program
          is not using the facility, and counting it would turn a publication record into a software
          citation count.
        </li>
      </ul>

      {/* --- docs/05 §10, "What is independently confirmed" ------------------------------- */}
      <h2 id="what-is-independently-confirmed">What is independently confirmed</h2>
      <p>
        {pluralize(method.official_list_total, 'publication')} are on {resource}’s own publications
        page. For {formatCount(method.independently_confirmed)} of them the project also found the
        use recorded in the publication itself — in an acknowledgement, an affiliation, or funding
        metadata — without relying on the list. The remaining{' '}
        {pluralize(method.listing_only, 'publication')} rest on the listing alone, and they divide
        in two.
      </p>

      <ProportionCard
        title="The publications on the resource’s own list"
        chartLabel="Publications on the resource’s own list, by what else was found"
        description="Every publication on the list, divided by whether the project found the use recorded in the publication itself, and if not, whether its full text could be read at all."
        note={
          <>
            Whether a full text could be read is recorded when the data is built; a publication that
            becomes readable later moves from one part to the other on a later run. A publication on
            the list is included because it is on the list, whichever part it falls in.
          </>
        }
        segments={segments(confirmation)}
        total={confirmation.total}
        unit={PUBLICATION_UNIT}
        categoryHeader="What was found"
        valueHeader="Publications"
        tableCaption="Publications on the resource’s own list, by what else was found."
      />

      <p>
        <strong>The two parts that are not confirmed are different failures.</strong> A publication
        whose full text was read and mentions nothing has a gap in its acknowledgements. A
        publication whose full text could not be read has a gap in what its publisher makes
        available. Only the first is a fact about the resource; the second is a fact about open
        access, and no amount of work on this method would change it.
      </p>
      <p>
        “Read” is exact here and worth stating. It means the publication’s full text was retrieved
        as structured document markup from PubMed Central or Europe PMC and searched sentence by
        sentence, including its acknowledgements, funding statement, methods and author notes. It
        does not mean an abstract, a title or a database record was searched. A publication counts
        as unreadable when no such text was available: not in PubMed Central, or in it with the body
        withheld by the publisher.
      </p>

      {/* --- docs/05 §10, "What the pipeline adds" ---------------------------------------- */}
      <h2 id="what-this-adds">What this adds to the resource’s own list</h2>
      <p>
        {pluralize(method.beyond_official_list, 'publication')} here are included on evidence found
        in the publication or its metadata and are <strong>not</strong> on {resource}’s own
        publications page.
      </p>

      <ProportionCard
        title="The corpus against the resource’s own list"
        chartLabel="Publications by whether they appear on the resource’s own list"
        description="Every publication on this site, divided by whether it appears on the resource’s own publications page."
        note={
          <>
            These publications are shown throughout the site as ordinary publications; this page
            carries the count.{' '}
            <a href={filtered({ onOfficialList: false })}>
              Show the {formatCount(method.beyond_official_list)} not on the list
            </a>
            .
          </>
        }
        segments={segments(listSplit)}
        total={listSplit.total}
        unit={PUBLICATION_UNIT}
        categoryHeader="Where it is recorded"
        valueHeader="Publications"
        tableCaption="Publications by whether they appear on the resource’s own list."
      />

      {/* --- docs/05 §10, "What is known to be missed" ------------------------------------ */}
      <h2 id="what-is-missed">What is known to be missed</h2>
      <p>
        A publication that used the resource and records no trace of it anywhere that can be read is
        not found by this method and is not counted here. Three cases are known and accepted:
      </p>
      <ul className="method-list">
        <li>
          <strong>No mention anywhere in the paper.</strong> Nothing automatic can reach it unless
          it is on the resource’s own list.
        </li>
        <li>
          <strong>Text that is not machine-readable.</strong> Not in PubMed Central, or in it with
          no body text released, and absent from OpenAlex’s full-text index. The{' '}
          {formatCount(method.listing_only_text_unavailable)} in the chart above are the part of
          this that is visible from inside the corpus; the rest is not.
        </li>
        <li>
          <strong>An acknowledgement behind a paywall,</strong> mostly in the early years. The
          project has no text-mining agreement with publishers.
        </li>
      </ul>
      <p>
        This page states the limit rather than estimating a total. A figure for what is missing
        would be a guess, and a guess set beside measured numbers reads like one of them.
      </p>

      {/* --- docs/05 §10, "Where the numbers come from" ----------------------------------- */}
      <h2 id="where-the-numbers-come-from">Where the numbers come from</h2>
      <p>
        Every figure on this site comes from one of the sources below. The counts are how many
        publications carry evidence read from each; the dates are when each was last read for this
        data.
      </p>

      <RankedBarCard
        title="Where the evidence was found"
        chartLabel="Publications by the source their evidence was read from"
        description="How many publications carry at least one piece of evidence read from each source, over the whole corpus."
        note={
          <>
            <strong>These overlap as well.</strong> A publication can be on the resource’s list and
            name it in its acknowledgements, so it is counted under both and the bars total{' '}
            {formatCount(sources.total)} over {pluralize(sources.works, 'publication')}. A source
            that produced no evidence does not appear.
          </>
        }
        rows={sources.items.map((item) => ({
          key: item.key,
          label: item.label,
          value: item.count,
        }))}
        unit={PUBLICATION_UNIT}
        valueAxisLabel="Publications"
        categoryHeader="Source"
        tableCaption="Publications by the source their evidence was read from, over the whole corpus."
      />

      <ChartTable<SourceRead>
        caption="Each source and the date it was last read for this data."
        rows={lastRead}
        rowKey={(row) => row.name}
        columns={[
          { key: 'name', header: 'Source', value: (row) => row.name },
          { key: 'date', header: 'Last read', value: (row) => formatDate(row.date) },
        ]}
      />

      <p className="chart-card-note">
        {doc.sources.notes.join(' ')} Citation figures were read from {doc.sources.citations.name}{' '}
        on {formatDate(doc.sources.citations.as_of)}.
      </p>

      {/* --- docs/05 §5.1 and §11.4: the qualifications that recur across the site. -------- */}
      <h2 id="what-these-figures-do-not-claim">What these figures do not claim</h2>
      <p>
        Four qualifications apply wherever the figures appear, and a reader who does not know them
        will read more into a chart than it says.
      </p>
      <ul className="method-list">
        <li>
          <strong>Nothing here is a causal claim.</strong> The defensible statement is that these
          publications record use of the resource and that they were cited this many times. That the
          resource <em>caused</em> the citations is a different claim, and nothing in this project
          tests it.
        </li>
        <li>
          <strong>“Research groups” is a proxy, not a count of groups.</strong> It is the number of
          distinct corresponding authors. Not every publication marks one, and a single group may
          publish under several people, so the figure is neither the number of laboratories served
          nor a bound on it. Distinct last authors is reported beside it because the two disagree
          and neither is the truth.
        </li>
        <li>
          <strong>Institutions and countries are floors.</strong> They count affiliations that
          resolved to a ROR identifier; an affiliation string that carries none cannot be counted at
          all, and many do not. The real numbers are higher by an unknown amount.
        </li>
        <li>
          <strong>The current year, {String(doc.period.last_year)}, is incomplete</strong> wherever
          it appears, and is drawn and labelled as partial. Read as a full year it shows a decline
          that is an artifact of the calendar. At the other end,{' '}
          {doc.period.citation_years_from === null ? (
            <>
              {doc.sources.citations.name} reports no citations by year for these publications at
              all, so every citation falls outside the per-year charts.
            </>
          ) : (
            <>
              {doc.sources.citations.name} reports citations by year only from{' '}
              {String(doc.period.citation_years_from)}, while the publications start in{' '}
              {String(doc.period.first_year)}: the {formatCount(doc.period.citations_before_window)}{' '}
              citations received before that are in every total and in none of the per-year charts.
            </>
          )}
        </li>
      </ul>

      {/* --- docs/06 §4.2: "every figure links to its definition on the method page" ------ */}
      <h2 id="definitions">What each figure means</h2>
      <p>
        The exact definition of every figure the site shows, with its value over the whole corpus.
        The same figures beside the charts respond to whatever filter is active; these do not.
      </p>
      <dl className="definition-list">
        {definitions.map((definition: MetricDefinition) => (
          <div className="definition" key={definition.id} id={definition.id} tabIndex={-1}>
            <dt>
              {definition.term}
              {definition.value === undefined ? null : (
                <>
                  {' '}
                  <span className="definition-value">{definition.value}</span>
                </>
              )}
            </dt>
            <dd>{definition.definition}</dd>
          </div>
        ))}
      </dl>

      {/* --- docs/05 §10, "How current it is" --------------------------------------------- */}
      <h2 id="how-current-this-is">How current this is</h2>
      <p>
        This data was generated on {formatDate(doc.generated_at)} and is normally refreshed weekly
        by an automated run. If it is ever more than two weekly runs old, the page says so above the
        figures rather than presenting them as current.
      </p>
      <p>
        The run was <code>{doc.run_id}</code>, from pipeline version {doc.pipeline_version} under
        rule version {doc.rule_version}. The rules that decide inclusion are versioned because they
        change: a rule change can add a publication, and it can remove one, in which case the
        evidence that used to include it is kept.
      </p>
      <p>
        A mistake here can be corrected. The project records overrides for exactly that purpose, and
        an override appears on a publication’s page as the judgement it is, attributed and dated.
        Report one against the repository this page is built from.
      </p>
    </main>
  );
}
