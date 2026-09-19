# Phase 7 — Operations Specification

> **Starting point only.** Drafted ahead of discussion; nothing here has been reviewed or agreed.
> Expect it to be reworked when we reach this phase.

**Status:** Unreviewed starting point · 2026-09-19
**Purpose:** define where the pipeline runs, how often, how the app is published, and how we
notice when something breaks.

## 1. Run cadence (D9)

| Run | Frequency | What it does |
|---|---|---|
| Incremental | Weekly | New/changed works since watermark (60-day overlap), metrics refresh, export, reports |
| Full | Monthly, and on any config change | All channels without date filters; retries unavailable full text |
| Audit | Quarterly | Recall vs official list, per-channel precision from decisions, capture–recapture estimate |

Publication indexing lags by weeks, so runs more frequent than weekly add cost without benefit.

## 2. Execution environment

Two viable options; choose one (D8):

- **A. Scheduled CI job in the git host** (e.g. GitHub Actions). The run commits store changes to
  a branch and opens a pull request containing the run summary; merging publishes. Gives review,
  history and notifications for free. Needs the repository to be hosted there and secrets stored
  in the CI system.
- **B. Cron on a UW-managed machine.** Same commands; commits locally and pushes. Simpler access
  to internal resources (e.g. a user roster), but monitoring and notification must be built.

Default: **A**, with `roster.yaml` kept in a private repository.

## 3. Publishing flow

```
scheduled run ─► store updated on branch ─► validate ─► export JSON ─► build dist/index.html
              ─► PR with run summary + review queue ─► human merges ─► deploy static file
```

- **Gate:** export and build happen only if validation passes (Phase 3 §8). A failed run leaves
  the live page untouched.
- **Automatic vs gated publishing:** tier-1 additions are backed by explicit evidence, so the
  default is to publish them automatically on merge of the run PR; nothing at tier 2–3 changes
  the default public view until a reviewer decides. If UWPR prefers, every change can wait for
  review.
- **Deploy:** copy `dist/index.html` to the UWPR web server sub-path (or static hosting). Keep
  the previous N builds for rollback.

## 4. Monitoring and alerts

A run notifies the maintainer (email or chat) when:

- any stage fails, or validation blocks an export;
- the official-list parser sees a structural change or a sharp count drop;
- a channel's hit count deviates strongly from its trailing average, or returns zero;
- a source has failed on consecutive runs (watermark stalled);
- API spend approaches the ceiling;
- no successful run has completed within 2× the scheduled interval (dead-man check).

Every run writes `reports/run_summary.md`: new works by tier and channel, tier changes, new
preprint→article links, retractions detected, queue size and backlog, source health, API calls
and cost.

## 5. Secrets, budgets, politeness

- NCBI and OpenAlex keys in the scheduler's secret store; never in the repo or logs.
- Contact address in every request's `User-Agent`/`mailto`.
- OpenAlex is usage-priced but a free account key allows $1/day, far above the estimated cost of
  a run (< $0.10). Per-run ceiling $0.50; the run reads the `x-ratelimit-remaining-usd` header and
  stops optional channels if it runs low. No paid plan is needed.
- Respect `robots.txt` and publisher terms for any HTML retrieval.

## 6. Data retention and backup

- Git is the record for store, curation and config. Remote hosting is the backup.
- `data/raw/` is a cache: not in git, but retained on the runner (or in object storage) because
  it backs evidence provenance. If lost, it can be refetched, except for content that has since
  changed upstream — acceptable, because evidence rows carry their own excerpts.
- Official-list snapshots are committed (small, and the primary source).

## 7. Maintenance

| Trigger | Action |
|---|---|
| Staff join or leave | Update `staff.yaml` with tenure dates → full run |
| New instrument | Update `instruments.yaml` |
| UWPR changes identifier or acknowledgement wording | Update `search_terms.yaml`; old terms are kept forever |
| Source API changes or is retired | Channel adapter fix; live smoke test catches this |
| Schema change | Bump `schema_version`; app and pipeline released together |
| Annual | Dependency updates; review of open questions and thresholds; roster refresh from UWPR records |

A short `RUNBOOK.md` will cover: running manually, reading a run summary, working the review
queue, rolling back a bad publish, and rotating keys.

## 8. Ownership

Named maintainer for the pipeline, named reviewer for curation (D5), and a named fallback for
each. Without an owner, scheduled systems decay silently — the dead-man check in §4 exists to
make that visible.

## 9. Open questions

1. Option A or B; where is the repository hosted, and is it public? (D8)
2. Where is the page hosted, and who can deploy to it?
3. Auto-publish tier-1 changes, or gate every change on review?
4. Who receives alerts?

## 10. Exit criteria

- [ ] Cadence, environment and hosting chosen.
- [ ] Publishing gate policy agreed.
- [ ] Owners named.
