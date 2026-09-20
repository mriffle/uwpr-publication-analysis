# Runbook

Operating this system, written for whoever is holding it — not for the person who built it
([docs/07-operations.md](docs/07-operations.md) O7, §13). It assumes no memory of the project.

**What it is.** A weekly GitHub Actions run finds publications supported by the UW Proteomics
Resource, decides inclusion automatically, and commits the result to `main`. A static web page
reads that result. Nobody approves anything week to week. The whole thing costs about **$0.52 a
year** (OpenAlex; everything else is free).

**Where things are.**

| Thing | Where |
|---|---|
| The record | `store/` on `main` — one JSON file per included publication, committed |
| What the page reads | `export/uwpr_publications.json` and `export/lookup_index.json`, committed |
| The rules and the configuration | `config/*.yaml`, `overrides.yaml` |
| The weekly run | `.github/workflows/update.yml` — Mondays 13:17 UTC |
| The app's deploy | `.github/workflows/pages.yml` — on a change to `web/` |
| The live site | the `gh-pages` branch, served by GitHub Pages |
| Run reports | `store/runs/<run id>.md`, and each run's job summary in Actions |

---

## 1. Who to contact

| Role | Person |
|---|---|
| **Maintainer** | Michael Riffle — <mriffle@uw.edu> |
| **Fallback** | **Not yet named.** See below. |

**The fallback is the largest unmitigated risk in this project** (docs/07 §7, §16 item 1). The
system is built to run unattended for years; what it is least protected against is not a technical
failure but the maintainer becoming unavailable with nobody else holding the notifications, the
repository access or the context. Naming a second person, giving them repository admin, and having
them read this page once is the entire mitigation. Record the name here when it is decided.

Nobody currently owns acting on the publications the run finds that are **absent from UWPR's own
publications page** (33 of 339 as of 2026-09-20; docs/07 §9.1). Worth naming at the same time.

## 2. Setup, once

Local work needs [uv](https://docs.astral.sh/uv/) and Node 22+.

```bash
uv sync --locked --all-groups                    # Python: creates .venv
cp .env.example .env                             # then paste in OPEN_ALEX_API_KEY
cd web && npm ci                                 # the app
```

`.env` is git-ignored and must stay that way. The key is *also* a GitHub Actions repository
secret, which is what CI uses; the local copy is only for running the pipeline by hand.

### Repository settings a person must set

These cannot be set from a workflow.

1. **Settings → Pages → Build and deployment → Source: Deploy from a branch → `gh-pages` / `(root)`.**
   The branch is created by the first run of `pages.yml`, so do this after that run, or the
   setting will not offer the branch.
2. **Settings → Actions → General → Workflow permissions.** The weekly run and the deploy both
   push, and both declare `permissions: contents: write`. If a push is ever refused with a 403,
   this setting is why (docs/08 §8 item 1).
3. **Watch the repository with Actions failure notifications enabled**, for the maintainer and the
   fallback. This is the *only* alert channel (§5). Notification routing for a *scheduled*
   workflow is not the same as for a push, so confirm it once by deliberately failing a run —
   see §7 — rather than assuming it.

## 3. Run the pipeline by hand

The weekly run needs nothing from anyone. Run it by hand when a correction has been made, or to
check something.

**In GitHub** — the normal way. Actions → **update** → *Run workflow*. It does exactly what the
schedule does: commits to `main`, pushes, and publishes the export to `gh-pages`.

**Locally, against a scratch store** — safe, changes nothing, costs about **$0.01** and takes
about four minutes:

```bash
uv run uwpr-pubs run --store /tmp/scratch-store
```

Any store outside a git repository is simply not committed. Keep the scratch store **outside this
repository**: the export is written to a sibling of the store, so `--store ./anything` would
overwrite the real `export/`.

**Locally, against the real store** — only when you mean it. It writes `store/` and `export/` and
makes a commit, which you then push yourself:

```bash
uv run uwpr-pubs run                             # --store store is the default
git log -1 --stat                                # read what it did
git push
tools/publish-site.sh data export                # put the new data on the live site
```

Other things worth knowing:

```bash
uv run uwpr-pubs run --dry-run --store /tmp/s    # every stage, writes nothing
uv run uwpr-pubs smoke                           # does every source still answer? (~$0.001)
uv run uwpr-pubs config                          # rule version and fingerprints
```

**`smoke` prints three states, and only one of them stops the week** (docs/03 §8). `PASS` is fine;
`DOWN` is a source that is down or timing out, which is reported and forgiven — the run proceeds
and degrades (§4); `FAIL` is a key, a query or a source's shape that has changed, and needs a
person. The last line says which it was and whether the run may proceed, and the exit code is what
`update.yml` reads. So a green smoke step does **not** mean every source answered: read its
verdict line, or the run's own Degradations section, for that.

A run refuses to start if `store/` or `export/` has uncommitted changes. That is deliberate: a run
interrupted part-way through writing would otherwise be read back as though it were the record.
Commit the changes, or discard them with `git checkout -- store export && git clean -fd store export`.

### Reading the report

```bash
uv run uwpr-pubs report --store store            # the latest run
uv run uwpr-pubs report 2026-09-20T17-07-live --store store
```

In CI the same report is the job summary, and it is there even when the run failed before writing
anything. Read it in this order:

1. **The status line** — `OK`, `DEGRADED`, `ALERT` or `FAILED`, the duration, the OpenAlex spend
   and the rule version. Spend should be about $0.0100; the per-run ceiling is $0.50.
2. **Alerts**, if any. Each one names what happened and what to do. See §4.
3. **The channel table, before believing any number under it.** A channel showing 0 nominations
   that normally shows hundreds means it did not run — and recall can still look fine while that
   is true, which is how a whole class of channels silently stopped during development without
   anyone noticing (docs/08 §5).
4. **Quality** — recall on the official list, against the **82% baseline** (208/253 on
   2026-09-20), and the test papers: 19 as expected, 2 known misses, 0 failing.
5. **Store counts**, then **new works**, **works removed**, **works merged** and **official list**
   changes. A normal week changes very little.
6. **Degradations** and **Notes**.

## 4. `degraded` and `alert`

They mean different things and only one of them wants you.

### `degraded` — a source failed; nothing was lost

A source did not answer, so the run used what it already had. **No data is ever removed because a
source was unavailable.** One degraded run is not a problem and needs no action; the next week
retries.

What to do: nothing, unless it repeats. Note which source it was, from the Degradations section.
Three consecutive degraded runs from the same source raises an `alert` by itself.

If the source is the **official publications list**, look closer — the list parser is loud by
design (every page must yield entries, and the total may not fall more than 10%), so a degradation
there usually means UWPR's page changed structure rather than that the server was down. The
snapshots in `store/official_list/pages/` show what the page looked like before and after. Fix the
parser; the run will have changed nothing in the meantime.

### `alert` — something needs a person

**The data was still written and committed.** An alert is not a failed run; it is a run that
finished and then deliberately failed the *job* so that GitHub emails somebody. The Alerts section
of the report names the reason and the suggested action. The usual causes:

| Alert | What it means | What to do |
|---|---|---|
| Recall fell more than 5 points below the 82% baseline | A rule change or a source change is dropping papers UWPR lists | §6: compare against the previous commit before concluding anything |
| The official list shrank more than 10% | UWPR's page changed, or the parser broke | Check `store/official_list/pages/`; fix the parser |
| A source failed three runs in a row | That source's data is going stale | Check the source; nothing has been removed |
| A channel deviated sharply from its trailing average | Usually an API change | Compare the channel table with the previous run's report |
| OpenAlex spend approaching the ceiling | Something is querying far more than it should | The measured figure is $0.0100 against a $0.50 per-run ceiling and a $1/day key allowance |
| The data could not be committed | The run wrote the store but git refused | Commit `store/` and `export/` by hand, then check the repository state |

### The run failed outright

Nothing was written; the previous data stands. The report is still in the job summary and says
why. Re-run it; if it fails the same way, it is a real fault.

### The page says the data is stale

The page states its own staleness when the data is more than **14 days** old — two missed weekly
runs (docs/07 O3). That notice is the safety net for the failure the run's own alerting cannot
report: **the schedule silently stopping.** GitHub disables scheduled workflows in repositories
that have gone quiet, and it warns by email first. If the page says it is stale:

1. Actions → **update** → is the schedule still listed and enabled? Re-enable it if not.
2. Was there a run? If the last run succeeded, then the *publish* to `gh-pages` failed rather than
   the run — that step is deliberately allowed to fail without failing the run (docs/07 §4.2).
   Republish by hand from a clean checkout of `main`: `tools/publish-site.sh data export`.

## 5. Corrections: someone says a paper is wrong

The store is public and will be read by people who know these papers better than any rule does.

**1. Check the claim against the evidence.** This answers most reports outright:

```bash
uv run uwpr-pubs explain 10.1016/j.xcrp.2025.103090 --store store   # a DOI
uv run uwpr-pubs explain 25556233 --store store                     # a PMID
uv run uwpr-pubs explain W-000432 --store store                     # a work id
```

It prints the records, every piece of evidence with its excerpt and source URL, and, for a paper
that was considered and rejected, the reason and the near-miss signals. Exit status 1 means the
identifier is not in the store at all.

**2. If the rules were right, reply with the evidence.** This is the ordinary outcome and the
reason the evidence is published at all.

**3. If the rules were wrong in a way that generalises, change the rule** — §6.

**4. If it does not generalise, add an override** — below.

### Adding an override

`overrides.yaml` at the repository root. It is the only routine human input besides configuration,
and every entry is attributed and dated, because an override asserts a judgement rather than a
measurement.

```yaml
- target: W-000686           # a work id. See the warning below.
  action: exclude            # include | exclude | merge | split
  reason: >-
    One or two sentences saying what was checked and why the rules do not reach it. Written for
    a stranger reading it in five years.
  by: mriffle
  date: 2026-09-20
```

- `merge` takes a list of two or more work IDs (`target: [W-000329, W-000735]`); the **lowest ID
  survives** and the rest become aliases.
- `split` also needs `records:`.
- **An override cannot beat R1.** A paper on UWPR's own publications page cannot be excluded.
- **Name a work ID, not a DOI or a PMID.** The schema accepts a DOI or PMID target, but the
  pipeline matches overrides by work ID only, so such an entry is accepted, validated and then
  **silently ignored** (docs/08 §8 item 8). Find the work ID with `uwpr-pubs explain <doi>`.

Then run and confirm. `overrides.yaml` is part of the config fingerprint, so the next run
re-evaluates every work:

```bash
uv run uwpr-pubs run --store /tmp/scratch-store   # check it does what you meant
uv run uwpr-pubs explain W-000686 --store /tmp/scratch-store
```

Commit the override, push, and let the weekly run pick it up — or run for real (§3) if it should
take effect now.

## 6. Changing a rule, and re-measuring recall

A rule change re-evaluates **every** work in the store: evidence that no longer holds is
superseded, and a work can lose its last evidence and leave. Treat it accordingly.

1. **Edit `config/rules.yaml` (or `staff.yaml`)** and **bump `rule_version`** in `rules.yaml` to
   the next `YYYY-MM-DD.N`. This is not optional: the run refuses to start if the rules
   fingerprint changed while the version did not. Adding or removing a staff member is a rule
   change, because tenure decides what R7 accepts.
2. **Measure the change, properly.** A recall figure is only meaningful against one measured the
   same way on the same day — recorded tables go stale, and comparing against one once showed a
   392-candidate regression that had never happened (docs/08 §5). So:

   ```bash
   git stash                                        # or check out the previous commit in a worktree
   uv run uwpr-pubs run --store /tmp/before
   git stash pop
   uv run uwpr-pubs run --store /tmp/after
   uv run uwpr-pubs report --store /tmp/before | head -20
   uv run uwpr-pubs report --store /tmp/after  | head -20
   ```

   Both runs share the download cache, so the second is much faster. Two runs cost about $0.02.
3. **Read both reports** — recall on the official list, the test papers, and the per-rule counts.
   **A change that fixes one paper and drops five listed ones is a bad trade**, and only the
   measurement shows it. The baseline is 82% (208/253).
4. **Run the offline gate**, which includes the Phase 1 test papers:
   ```bash
   uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest
   uv run uwpr-pubs fixtures --store store
   ```
5. Commit with the measurement in the message, push, and let the weekly run apply it — or run for
   real (§3).

**Note also:** UWPR changing its acknowledgement wording adds a term to `rules.yaml`; **old terms
are never removed**, because old papers keep the old wording.

## 7. The two workflows, and confirming the alerting works

| Workflow | When | What it does | Runs npm? |
|---|---|---|---|
| `update.yml` | Mondays 13:17 UTC, or on demand | Runs the pipeline, commits `store/` and `export/` to `main`, pushes, then copies `export/*.json` onto `gh-pages` | **No** |
| `pages.yml` | A push to `main` touching `web/`, or on demand | Builds the app and replaces the app files on `gh-pages` | Yes |
| `check.yml` | Every push and pull request | The quality gate: Python and the web app | Yes |

The separation is the point (docs/07 O1, O2): a broken JavaScript toolchain must never be able to
stop the *data* being published. The two halves of `gh-pages` are disjoint — `data/` belongs to
the weekly update, everything else to the deploy — and `tools/publish-site.sh` is what keeps them
that way.

**Publishing the data does not need a pipeline run.** `export/` is committed, so from a clean
checkout of `main`:

```bash
tools/publish-site.sh data export
```

That is also how the site is bootstrapped, and how a failed weekly publish is recovered.

**Confirm the alerting once** (docs/07 §6), because notification routing for a scheduled workflow
is discovered during an outage otherwise. Break a run deliberately — for example set the OpenAlex
secret to a wrong value, run `update` by hand, and check the failure email arrives at both
addresses — then put the secret back.

## 8. Rolling back an app deploy

Safe. No data is involved; `gh-pages` holds a build product and nothing else.

```bash
git fetch origin gh-pages
git log --oneline origin/gh-pages          # find the last good "Deploy the app from …"
git push --force-with-lease=gh-pages:$(git rev-parse origin/gh-pages) \
    origin <good-commit>:refs/heads/gh-pages
```

Then **put the current data back**, because rewinding the branch rewinds `data/` to whatever that
commit held:

```bash
tools/publish-site.sh data export          # from a clean checkout of main
```

Fix forward afterwards: the next push to `web/` redeploys, so leave the branch rolled back only as
long as it takes to fix the app.

**Do not roll back by reverting the commit on `main` that caused it** unless the app source really
is wrong; a bad *deploy* is a fact about the branch, not about `main`.

## 9. Do not revert a data commit

**This is the one genuinely dangerous operation in the project** (docs/07 O5, §8).

Work IDs are permanent and are minted in the order records are first seen. If a run mints
`W-000900` and that commit is reverted, the next run mints `W-000900` again — and if the inputs
have shifted in between, it may mint it **against a different paper**. Any link issued in the
meantime then resolves to the wrong publication, silently, with nothing anywhere recording that it
happened. The store's whole identity model assumes minting is append-only.

So:

| Situation | Do this |
|---|---|
| A work should not have been included, or should have been | An override (§5), attributed and dated, then a run. The store records the change and why |
| A rule produced a wrong result generally | A rule change with a `rule_version` bump (§6), which re-evaluates every work |
| **The store is genuinely corrupted** | Revert — and **treat re-minting as expected**: afterwards check `aliases.json` and verify that no previously published ID now points at a different paper |
| A bad app deploy | §8. Nothing is at risk |

Reverting is reserved for the third row. Everything else is fixed forward.

## 10. Rotating the OpenAlex key

The key allows $1 a day; the pipeline spends about $0.01 a week. Rotate it if it leaks, if it
expires, or if anything logs it.

1. Get a new key from OpenAlex, for **mriffle@uw.edu** — the contact address this project sends to
   every API, set in `config/settings.yaml`. No other personal address is used anywhere.
2. **GitHub → Settings → Secrets and variables → Actions → `OPEN_ALEX_API_KEY` → Update.**
3. Update the local `.env` too, if you run the pipeline by hand.
4. Confirm: Actions → **update** → *Run workflow*, and check the run reaches "Check each source
   still answers" and spends money. Or locally, `uv run uwpr-pubs smoke`.
5. Revoke the old key.

The key is stripped from every URL that is logged or cached, and every commit the bot makes is
scanned for both secrets before it is pushed. `NCBI_API_KEY` is optional and currently unset; it
would make a cold-cache run about three times faster and nothing else.

**Never commit `.env`, a key, full text or abstracts.** The repository is public.

## 11. Once a month

Ten minutes, reading the latest run report (§3):

- Status, spend and duration.
- **The channel table first.** Then recall against 82%, then the per-rule counts.
- Anything under Degradations.
- Dependabot's pull requests — Actions and npm, monthly. Merging them is also what keeps the
  repository looking active to GitHub, which is part of what keeps the schedule running
  (docs/07 §12). Review `uv.lock` at the same time.

## 12. Once a year

- Re-read the open items in each spec in `docs/`.
- Confirm the recall baseline still reflects reality.
- Confirm notification routing still works (§7).

## 13. Regenerating the export by hand

`export/` is committed and must match the store it was built from; `check.yml` fails if it drifts,
which happens when `config/settings.yaml`'s `resource` block changes without a re-run.

```bash
uv run uwpr-pubs export --store store --out export
git add export && git commit -m "Rebuild the export"
```

It is deterministic — every field comes from the store's own latest run manifest — so running it
twice produces byte-identical files.

## 14. If the store is lost

Git is the record and GitHub is the backup. Clone it. Keep a local clone; permanent IDs make the
history worth more than a cache would be.
