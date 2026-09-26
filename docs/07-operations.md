# Phase 7 — Operations Specification

**Status:** Agreed · 2026-09-20 · the last specification. Changes from here are made deliberately,
dated, and noted in this header.

**Changes since agreement** (2026-09-20, all found while implementing it):
- *§8, rolling back the app also rolls back the data.* The row said "no data is involved and
  nothing is at risk", which is wrong: both halves live on one branch, so rewinding `gh-pages`
  rewinds `data/` with it. The rollback is two steps, and the runbook gives the second.
- *§4.2, honouring "the data commit still stands" costs the alert.* A persistently failing publish
  is silent until O3's staleness notice fires on the page. Stated rather than left to be
  discovered.
- *§3, `export/` is committed by the run.* It was not: the commit named only `store/`. Fixed in
  code, with a CI check that the committed export matches the committed store.
- *§16, §9.1's missing-from-site list has nowhere to appear.* The run report has no such section;
  only the count exists, and only in the export.
**Purpose:** define where this runs, how the app is published, how a failure becomes visible, and
who is responsible when it does.
**Depends on:** [03](03-retrieval-pipeline.md) (frozen), which already specifies the run, its
failure handling and its workflow; [05](05-metrics-and-data-contract.md) and
[06](06-web-app.md) (agreed), which specify what is published.
**Replaces:** the unreviewed draft of 2026-09-19, which assumed incremental, full and audit run
modes, a human-merged pull request per run, tier-gated publishing and a private roster — none of
which survive. The pipeline does a full sweep every run, commits directly to `main`, and there are
no tiers and no roster.

---

## 1. What is already settled

This spec does not re-decide these. They are listed so it is clear what is left.

| Settled | Where |
|---|---|
| Weekly scheduled run, Mondays 13:17 UTC, plus a manual trigger | D9, [03](03-retrieval-pipeline.md) §11.3; `update.yml` |
| A full sweep every run; no watermarks, no incremental mode | [03](03-retrieval-pipeline.md) P1 |
| One bot commit per run, directly to `main`, after the validation gate | [03](03-retrieval-pipeline.md) C3 |
| A failing source degrades the run and never shrinks the data | [03](03-retrieval-pipeline.md) P4, §9 |
| A run that needs a person raises `alert`: data is written and committed, then the job fails so GitHub emails | [03](03-retrieval-pipeline.md) P12 |
| Secrets are GitHub Actions secrets, scoped per step, and the commit is scanned before it is pushed | [03](03-retrieval-pipeline.md) C5, §11.3 |
| Public repository, Apache-2.0, jointly held by Michael Riffle and the University of Washington | [08](08-implementation.md) §8 |
| No UW branding; no cookies, analytics or third-party runtime requests | [06](06-web-app.md) B9, B10 |

**Measured, on the first real unattended run (2026-09-20):** 4m 34s on a cold cache, **$0.0100**,
435 requests. The estimate it replaced was five times high.

## 2. Decisions

Agreed 2026-09-20.

| # | Decision | Why |
|---|---|---|
| O1 | **The app is published to GitHub Pages from a `gh-pages` branch holding the built site.** | §4. The weekly data publish must not depend on a JavaScript build succeeding. |
| O2 | **A data update copies only the export files onto `gh-pages`. It never runs the app build.** | §4.2. Decouples the most routine operation from the most fragile one. |
| O3 | **The page states its own staleness.** If the data is older than 14 days — two missed runs — the page says so, in place, rather than presenting old numbers as current. | §5. This is the honest counterpart to a silent pipeline failure, and it is what turns an invisible outage into a visible one. |
| O4 | **The maintainer is named, with a named fallback**, and both are recorded in `RUNBOOK.md`. | §7. A scheduled system with no owner decays silently. |
| O5 | **A bad data commit is fixed forward with an override, not reverted.** Reverting is reserved for a corrupted store and is the one genuinely dangerous operation here. | §8. Reverting can cause a permanent work ID to be re-minted against a different paper. |
| O6 | **A major `schema_version` change ships the pipeline and the app together,** app first. | §10. |
| O7 | **`RUNBOOK.md` is written before the schedule is relied upon**, and its rollback path is rehearsed once. | §13. An untested rollback is not a rollback. |
| O8 | **Dependabot covers npm as well as Actions**, monthly. | §11, and it incidentally mitigates §12's inactivity risk. |

## 3. The weekly data update

Built and proven. `update.yml` does the following, and each part is there for a measured reason
([08](08-implementation.md) §3.4): secrets scoped to the three steps that need them; a guard so an
unset optional secret does not make the key scan match every line; a full-depth checkout because
the push rebases; a git identity because a runner has none; the report posted with `if: always()`
so a run that stopped at the gate still explains itself; and the alert check last, so the data
lands before the job fails.

**What a normal week changes:** `official_list/entries.jsonl`, `metrics/`, `runs/`, `export/`, and
a `last_seen` refresh about once a month ([02](02-data-model.md) §15).

**`export/` is committed by the run itself** — which is not what the code did. Stage 11 wrote it
and the commit named only `store/`, so every weekly run built the export on the runner and threw
it away, leaving `main` advertising whichever export a person last committed. Three specs already
said otherwise ([02](02-data-model.md) §3, [03](03-retrieval-pipeline.md) §5 stage 0, and this
section), so this was code catching up with them rather than a decision. `check.yml` now also
rebuilds the export and diffs it against the committed one, so the two cannot drift again.

**The download cache is an accelerator only.** GitHub evicts caches that go unused, and a weekly
run sits near that boundary, so the cache may or may not survive from one week to the next.
**This does not matter**, and the measurement is why: a full cold-cache run is 4m 34s and $0.0100.
The pipeline is required to be correct with an empty cache
([03](03-retrieval-pipeline.md) §1), and the cost of being wrong about the cache is four minutes.

**A source being down does not stop the run** (changed 2026-09-20, [03](03-retrieval-pipeline.md)
§8). The smoke check reports an outage and lets the run proceed to degrade honestly; it still
blocks on an authentication failure or a source whose shape has changed, because those need a
person rather than patience. Proven the hard way: the first hand-triggered run was skipped
entirely because Europe PMC returned 503 on two of nine queries, and the re-run completed with
those two queries named as degradations and no works changed.

**What an outage actually costs.** Nothing already found: works accumulate and a failing source
never shrinks the data (P4, principle 3). What is deferred is *discovery* — a paper only that
channel would have nominated waits for the next run. That is survivable **only because every run
is a full sweep with no watermark** (P1): were the pipeline incremental, a missed window would be
missed permanently, and a transient 503 would silently leave a hole nothing would ever fill.

**Cadence stays weekly.** Publication indexing lags by weeks, so a faster cadence buys nothing. A
failed run leaves the data untouched and the next week retries; a week of staleness in publication
data is immaterial, and `workflow_dispatch` covers the case where it is not.

## 4. Publishing the app

### 4.1 Why a branch, and not a build on every update

The obvious arrangement — one workflow that builds the app and publishes it together with the
current data — couples data freshness to the health of a JavaScript toolchain. A dependency
resolution failure, a transitive breakage or an expired action would then stop the *data* being
published, which is the one thing that must keep working unattended for years.

So the built site lives on a `gh-pages` branch, and the two things that change it are separate:

| Trigger | What it does | Runs npm? |
|---|---|---|
| A change to `web/` on `main` | Build the app, replace the app files on `gh-pages` | Yes |
| A successful weekly data update | Copy `export/*.json` onto `gh-pages` | **No** |

This also makes [06](06-web-app.md) §11.1's durability argument operational rather than
theoretical: because the app fetches its data at runtime, the deployed site keeps working **and
keeps showing current data** even if the toolchain that built it can no longer be built. The
branch is the deployed artifact, so what is live is inspectable and revertible with ordinary git.

The cost is a build product in version control. That is a real but small price — a few hundred
kilobytes — and it buys the ability to see and revert exactly what is being served.

### 4.2 Mechanics

- The data copy must touch **only** the export files, and the app deploy must touch only the app
  files. Neither may clobber the other.
- The data copy runs after the push in `update.yml`, conditional on the run having committed.
  A run that wrote nothing publishes nothing.
- **If the copy fails, the data commit still stands.** Publishing is downstream of the record;
  the store on `main` is the record, and `gh-pages` is a view of it that can be rebuilt.
- **The cost of that is the alert.** Letting the publish fail without failing the job is the only
  way to honour the line above, so a *persistently* failing publish is silent until O3's 14-day
  staleness notice fires on the page itself. That is the designed net rather than an oversight,
  and it is the reason O3 exists — but it means the page, not the workflow, is what reports a
  broken publish.

### 4.3 Address and base path

The site is a GitHub Pages project site, so it is served under a sub-path and the app is built
with a matching base path ([06](06-web-app.md) §3).

**Serving it later from UWPR's own site needs no code change** — a rebuild with a different base
path, and the export files copied alongside. That was the reason the base path is build-time
configuration, and it is the most likely future move, so it should stay true.

A custom domain is not set up for v1 and is not needed.

## 5. Knowing it still works

Three layers, because each catches what the others miss.

**The run tells the workflow.** A run that needs a person finishes with `alert`, and the job then
fails so GitHub sends its standard failure email. A run that fails outright fails the job too.
Both leave the report in the job summary.

**The page tells the reader (O3).** This is the layer the previous draft lacked, and it is the one
that catches the worst failure mode: the schedule silently stopping. If the page's data is older
than **14 days**, the page says so where the reader will see it, rather than presenting stale
figures as current. Fourteen days is two missed runs, which distinguishes a skipped week from
something broken.

This is a requirement on the app, and it belongs to operations because the alternative is a page
that quietly lies for months. It also fits the project's register: a page whose whole argument is
that its numbers are checkable should not misrepresent how current they are.

**A person looks, monthly.** Reading the latest run report: recall against the 82% baseline,
the channel table, the per-rule counts, and anything under the degradation list.
[08](08-implementation.md) §5 records why the channel table in particular must be read before any
number under it is believed — a whole class of channels silently did not run during M3 while
recall still looked fine.

### 5.1 What the run already watches

From [03](03-retrieval-pipeline.md) §9, needing no new work: recall falling more than 5 points
from the 82% baseline; the official list shrinking more than 10%; three consecutive degraded runs;
a channel deviating sharply from its trailing average; OpenAlex spend approaching the per-run
ceiling of $0.50 against a measured $0.0100.

## 6. Alerts: who receives them

GitHub's failure email is the alert channel, so **the named maintainer must be watching the
repository with Actions failure notifications enabled**, and this must be confirmed once by
deliberately failing a run rather than assumed.

For a scheduled workflow, GitHub's notification routing is not the same as for a push, which is
exactly the kind of detail that is discovered during an outage rather than before one. Verifying
it is a two-minute job and is on the exit criteria.

## 7. Ownership

**Needs an answer:** a named maintainer and a named fallback, recorded in `RUNBOOK.md`.

Michael Riffle is the evident maintainer. **The fallback is the real gap.** This system is
designed to run unattended for years on a $0.52-a-year budget; the failure mode it is least
protected against is not technical but the maintainer becoming unavailable with nobody else
holding the keys, the context or the notifications. The runbook exists largely for that person.

## 8. Rollback, and the one dangerous operation

**Prefer fixing forward.** A wrong inclusion or exclusion is corrected with an override and a
re-run (§9), not by rewriting history.

**Reverting a data commit is genuinely dangerous, and this is the reason.** Work IDs are permanent
and are minted in the order records are first seen. If a run mints `W-000900` and that commit is
reverted, the next run mints `W-000900` again — and if the inputs have shifted in the meantime, it
may mint it **against a different paper**. Any link issued in between then resolves to the wrong
publication, silently. The store's whole identity model assumes minting is append-only.

So:

| Situation | Action |
|---|---|
| A work should not have been included, or should have been | An override, attributed and dated, then a manual run. The store records the change and why |
| A rule produced a wrong result generally | A rule change with a `rule_version` bump, which re-evaluates every work and supersedes what no longer holds |
| The store is genuinely corrupted | Revert, and **treat re-minting as expected**: check `aliases.json` afterwards and verify that no previously published ID now points elsewhere |
| A bad app deploy | Rewind `gh-pages` to the previous commit, **then republish the data**. Both halves live on one branch, so rewinding the app also rewinds `data/` to whatever that commit held — the second step is not optional, and `RUNBOOK.md` gives it |

## 9. Corrections

The store is public and will be read by people who know these papers better than any rule does.
The path for a report:

1. Someone reports a wrong inclusion or a missing paper, via the contact on the page
   ([06](06-web-app.md) §4.9).
2. The claim is checked against the evidence — `uwpr-pubs explain <DOI|PMID|W-id>` answers it
   directly, and for a paper that was considered and rejected the candidate line already carries
   the reason and its near-miss signals.
3. If the rules were right, reply with the evidence. This is the ordinary outcome and the reason
   the evidence is published.
4. If the rules were wrong in a way that generalises, change the rule and bump `rule_version`.
   **Re-measure recall before and after** — a change that fixes one paper and drops five listed
   ones is a bad trade, and only measurement shows it.
5. If it does not generalise, add an override with a reason and an attribution.
   [01a](01a-discovery-calibration.md)'s two examples are the model: one wording became a rule
   change because it named the act, the other became an override because no rule could reach it
   without dropping papers UWPR itself lists.
6. Run manually and confirm.

## 9.1 Findings that belong back on UWPR's own page (D10)

Every run identifies works that carry evidence but are absent from UWPR's publications page —
**33 of 339 today**. D10 settled that these should flow back to the site.

This is an operations artifact, not a public claim
([05](05-metrics-and-data-contract.md) A5): the app shows these papers as ordinary publications,
because whether they appear on UWPR's own page is a fact about the page rather than about the
science, and the method page carries only the count.

The list belongs in the run report, where whoever maintains the publications page can read it.
**Nobody currently owns acting on it**, which is a smaller instance of §7's gap: the report is
produced whether or not anyone reads it. Worth naming an owner at the same time as the fallback
maintainer.

## 10. Changing the data contract

The export carries `schema_version`, and the app refuses a major version it does not know, showing
a clear message rather than rendering wrongly ([06](06-web-app.md) §7). That safety net means the
worst case is a visibly broken page, not a quietly wrong one.

**Procedure for a major bump (O6):** the schema, the pipeline's writer and the app's generated
types change together in one reviewed change; the app is deployed first; the next data update then
publishes data the deployed app understands. Additive changes bump the minor version and need no
coordination, because the app ignores fields it does not know.

Because the app's types are generated from the schema ([06](06-web-app.md) B3), a pipeline change
the app has not accounted for fails the build rather than reaching the page.

## 11. Routine maintenance

| Trigger | Action |
|---|---|
| Staff join or leave | Update `staff.yaml` tenure. It is part of the rules fingerprint, so this is a rule change: bump `rule_version` and re-measure recall |
| UWPR changes its acknowledgement wording or identifier | Update `rules.yaml`; **old terms are kept forever**, since old papers keep the old wording |
| UWPR's publications page changes structure | The parser breaks loudly: every page must yield entries and the total may not fall more than 10%. Fix the parser; the page snapshots in `official_list/pages/` show what changed |
| A source API changes | `uwpr-pubs smoke` catches it at the start of the run, before anything is written |
| Dependencies | Dependabot monthly for Actions and npm (O8); `uv.lock` reviewed at the same time |
| Annual | Re-read the open items in each spec; confirm the recall baseline still reflects reality; confirm notification routing still works |

## 12. Risks

Named, with what is done about each. The first is the one most likely to end this project quietly.

| Risk | Mitigation |
|---|---|
| **GitHub disables the scheduled workflow after a period of repository inactivity.** Whether the bot's own pushes count as activity is **not established**, and it should not be assumed either way. | Dependabot's monthly pull requests create human activity (O8). GitHub warns by email before disabling, which the maintainer must be positioned to receive (§6). The page's own staleness notice (O3) catches it if both fail. **Verify after 60+ days of no human commits that the schedule still fires** — this is on the exit criteria, and it cannot be verified sooner than that |
| The maintainer becomes unavailable | A named fallback and `RUNBOOK.md` (§7). Currently unmet |
| The official-list scraper breaks | Loud by design (§11); a degraded run changes nothing |
| A source changes terms or withdraws access | The run degrades and keeps the data. OpenAlex is the only paid dependency, at $0.52 a year against a $1/day allowance |
| The store is lost | Git is the record and GitHub is the backup; the maintainer keeps a local clone. Permanent IDs make this worth more than a cache would be |
| A published number is wrong | Every figure traces to evidence with a source and date; `explain` answers any single paper; corrections go through §9 |

## 13. `RUNBOOK.md`

Written before the schedule is relied upon (O7), for the person who is not the author. It covers:
running the pipeline by hand and reading its report; what `degraded` and `alert` mean and what to
do about each; adding an override; changing a rule and re-measuring recall; rolling back an app
deploy; **why not to revert a data commit** (§8); rotating the OpenAlex key; and who to contact.

Its rollback path is rehearsed once, on the app deploy, because an untested rollback is a plan
rather than a capability.

## 14. Cost

| Item | Cost |
|---|---|
| OpenAlex | **$0.0100 a run, about $0.52 a year**, against a $1/day allowance |
| GitHub Actions | Free for public repositories |
| GitHub Pages | Free |
| Every other source | No charge |

**Under a dollar a year**, which is worth stating plainly because it is the strongest argument for
keeping the thing running.

## 15. Security, privacy and legal

- **Secrets:** `OPEN_ALEX_API_KEY` is a repository secret; `NCBI_API_KEY` is optional and unset.
  Both are scoped to individual steps, stripped from everything logged or cached, and the run's
  own commit is scanned for them before it is pushed.
- **No personal data** beyond published authorship, and no reader data at all: no cookies, no
  analytics, no third-party requests (B10).
- **The contact address `mriffle@uw.edu` is deliberately public**, sent to APIs as required by
  their terms. No other personal address is used anywhere.
- **Quotation:** the store holds short attributed excerpts of up to about 300 characters, with
  source and retrieval date. `NOTICE` explains this to a reader. Full text and abstracts are never
  committed.

## 16. Open items

0. **§9.1's report section does not exist.** The run report has no missing-from-site list: it
   renders failure, alerts, store, quality, channels, rules, new works, changes, degradations and
   notes, and none of them is D10's. The count is in the export as `summary.beyond_official_list`
   (33 today), and [05](05-metrics-and-data-contract.md) A5 keeps it off the public page, so the
   figure exists and the *list* does not reach anyone. It is a small addition to `report.py`, and
   it is deliberately not made yet, because §9.1 also records that nobody owns acting on it —
   producing a list no one reads is not an improvement.
1. **The named fallback maintainer** (§7). The only decision in this spec that needs a person
   rather than a change.
2. **The inactivity rule** (§12) cannot be verified for at least 60 days. Until then it is a known
   unknown, not a solved problem.
3. **An `NCBI_API_KEY`** would make a cold-cache run about three times faster. Optional; the run
   is 4m 34s without it.
4. **Serving from UWPR's own site** (§4.3) is the most likely future change and needs no code
   change — only a rebuild and a decision.

## 17. Exit criteria

- [x] Cadence, environment and hosting settled.
- [x] Publishing flow decided, and decoupled from the data update.
- [x] Failure visibility specified at all three layers, including the page's own staleness notice.
- [x] Rollback policy decided, including the one operation that must not be routine.
- [ ] Maintainer and fallback named.
- [ ] `gh-pages` publishing implemented and a deploy rolled back once in rehearsal.
- [x] Notification routing confirmed by a failing run — not a deliberate one: the first scheduled
  run failed on 2026-09-21 (docs/08 §3.5), and GitHub's email reached the maintainer.
- [x] `RUNBOOK.md` written.
- [ ] The schedule confirmed to still fire after 60+ days without a human commit.
