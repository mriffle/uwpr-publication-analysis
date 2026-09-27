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
| The grants the papers list, and their amounts | `store/funding/` — four files, committed (§15) |
| The weekly run | `.github/workflows/update.yml` — Saturdays 07:17 UTC (03:17 or 02:17 in New York) |
| The app's deploy | `.github/workflows/pages.yml` — on a change to `web/` |
| The live site | the `gh-pages` branch, served by GitHub Pages |
| Run reports | `store/runs/<run id>.md`, and each run's job summary in Actions |

---

## 1. Who to contact

| Role | Person |
|---|---|
| **Maintainer** | Michael Riffle — <mriffle@uw.edu> |
| **Fallback** | Michael Hoopmann — <hoopmann@uw.edu> (named 2026-09-26) |

**Why there is a fallback** (docs/07 §7). The system is built to run unattended for years; what
it is least protected against is not a technical failure but the maintainer becoming unavailable
with nobody else holding the notifications, the repository access or the context. Naming a second
person was the first step. The rest is giving them repository admin and having them read this page
once.

**The fallback does not get the weekly run's failure email.** GitHub sends a *scheduled* run's
failure notification to one person: whoever created the workflow, or last changed its `cron` line
(or re-enabled it after GitHub disabled it). Here that is the maintainer. Watching the repository
does not add anyone. The fallback's signals are a failed run on the Actions tab, and the page's own
staleness notice after 14 days (docs/07 O3). Taking over the email means changing the `cron` line
in `update.yml` and committing it as yourself.

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
   this setting is why (docs/08 §3.4).
3. **Watch the repository with Actions failure notifications enabled**, for the maintainer and the
   fallback. This is the *only* alert channel (§5). Notification routing for a *scheduled*
   workflow is not the same as for a push: its failure email goes only to the person who created
   the workflow or last changed its `cron` line (§1). Confirm it once by deliberately failing a
   run — see §7 — rather than assuming it.

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

A count below its floor is followed by a **control query** on the same source, and the line says
what it found. "The control query found 352521, so the source is fine and our query is not" is a
`FAIL`: the source answers, so the query or a field name has changed, and that needs a person.
"The control query found only 0, so the source is empty" is a `DOWN`, and the week goes ahead.

**The funding sources come last, under their own heading, and never stop the week**, whatever
they show (docs/09 F16): funding must never hold up the publication update. The verdict names any
that are `DOWN` or `FAIL`, and the funding stage degrades without them. A `FAIL` there still needs
a person, just not before the run: a `403` from NIH RePORTER may mean it has blocked the address.

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
6. **Funding** — the grants, their total and what moved, and what needs a person. See §15.
7. **Degradations** and **Notes**.

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
| NIH RePORTER answered HTTP 403: possible IP block | RePORTER may have blocked the address | Stop and wait: §15, "NIH RePORTER answered 403" |
| The funding total fell more than 5% | Grants left in a run where every funding source answered | Read the Funding section's grants no longer listed: §15 |
| A grant override names an NIH grant RePORTER does not hold | A typo in the override's `grant` | Check the number in RePORTER, then correct `overrides.yaml`: §15 |
| The funding stage failed, or refused its own output | A funding bug; the stored funding was carried forward and the publication data updated as usual | The cause is under Degradations; fix the stage. Funding never holds up the week |
| The export is over its data budget | `export/uwpr_publications.json` passed 500 KiB gzipped | It was published anyway; docs/09 §13.5 has the budget and the headroom |

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
- target: W-000686           # a work ID, never a DOI or PMID
  action: exclude            # include | exclude | merge | split | grant (§15)
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
- **Name a work ID, not a DOI or a PMID.** The pipeline matches overrides by work ID only, so
  any other target is rejected when the config loads, and the run stops (`does not match
  '^W-[0-9]{6}$'`). Find the work ID with `uwpr-pubs explain <doi>`; a candidate has one too.

Then run and confirm. Each run records a fingerprint of the overrides it ran with, so the next
run sees the change and re-evaluates every work:

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
| `update.yml` | Saturdays 07:17 UTC, or on demand | Runs the pipeline, commits `store/` and `export/` to `main`, pushes, then copies `export/*.json` onto `gh-pages` | **No** |
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
secret to a wrong value, run `update` by hand, and check the failure email arrives — then put the
secret back. A run started by hand emails the person who started it, so this proves that person's
settings; a *scheduled* failure emails only the workflow's `cron` owner (§1). The scheduled route
to the maintainer was proven by a real failure on 2026-09-21.

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
- Dependabot's pull requests — Actions, npm and `uv.lock`, monthly. Merging them is also what
  keeps the repository looking active to GitHub, which is part of what keeps the schedule running
  (docs/07 §12). A green check does not prove an npm bump is safe: `npm ci` installs the lockfile
  as it stands and ignores a peer-dependency conflict, so also run
  `npm install --package-lock-only --ignore-scripts` on the branch, which fails with `ERESOLVE` if
  the bump breaks a peer. Some majors are held back on purpose in `.github/dependabot.yml`, each
  with its reason; remove an entry when its reason goes away.
- **uv itself is not in those pull requests.** Its minor version is pinned by
  `[tool.uv] required-version` in `pyproject.toml`, which CI's `setup-uv` reads. When a new minor
  appears (`uv self update --dry-run`, or `brew info uv`), read its release notes for breaking
  changes, then move `required-version` and the `uv_build` bound in `[build-system]` together,
  upgrade uv locally, and run `uv sync --locked --all-groups` and the checks before pushing.

## 12. Once a year

- Re-read the open items in each spec in `docs/`.
- Confirm the recall baseline still reflects reality.
- Confirm notification routing still works (§7).
- **In January**, add the year just ended to the exchange rates (§15).

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

## 15. Funding

Each run also records the grants the included papers list and what each is worth
([docs/09-funding-impact.md](docs/09-funding-impact.md)). It happens after inclusion is decided,
and **it never holds up the publication update**: a funding source that fails degrades the run,
a funding bug alerts, and either way the stored funding is carried forward (docs/09 F16).

- `store/funding/citations.jsonl` — every string each paper's sources write as a grant number, and
  what it was decided to be; `grants.jsonl` — each grant, its facts and its amount;
  `lookups.jsonl` — what the sources were asked and did not have, remembered so it is not asked
  weekly; `agencies.jsonl`.
- `config/funding.yaml` — agencies, patterns, exclusions and thresholds, versioned by
  `funding_version`. `config/exchange_rates.yaml` — not versioned. **Grant overrides** live in
  `overrides.yaml` with the others.
- **Two figures per grant.** The store holds each grant's **lifetime total**, its whole award as
  its funder records it. The site's totals add a smaller figure, the **counted amount**: the
  grant's funding from 2006, when UWPR began, through the year of the latest publication listing
  it (docs/09 F17, §7.4). The counting is done at export, from the store, and needs no source.

### Reading the Funding section

It follows the works' changes in the report (§3):

- **mode.** `incremental` most weeks: RePORTER's links for every paper, PubMed and Crossref for new
  papers only, new strings, and the facts of grants still active. `full refresh` every 28 days,
  after a `funding_version` bump, or with `--funding full`: everything re-read and re-decided.
  "a full refresh is due, and waits for RePORTER's window" appears only on a run started by hand
  outside that window; the next Saturday run does the refresh.
- **grants** and **total**, with the change since the last run. **The total is the store's
  lifetime sum** — every known amount, whole — **not the site's headline**, which counts each
  grant only from 2006 to its latest listing paper (below). The total usually moves a little,
  as active grants add fiscal years. **It falling by more than 5% in a run where every source
  answered raises an alert**: read *Grants no longer listed*. A grant goes when the last paper
  listing it leaves — an exclusion, a rule change, a merge — and the list names the papers. To see
  what the store held before, `git show HEAD~1:store/funding/grants.jsonl | grep '"NIH:R21AI123456"'`.
  A fall in a degraded run raises nothing, because a source that is down never removes anything.
- **strings excluded** — counted, never funding: things that are not grants (an antibody name, a
  year, a funder's ID), the resource code `UWPR95794` (evidence the paper used UWPR, never a
  grant), and DOE facility contracts.
- **requests** — how many requests each source was sent. RePORTER's is the one to watch: at most
  one a second always, at most 60 on a weekday outside its window.
- The stage's own notes, such as a refresh deferred or questions left for next week.

Then what needs a person, each list stopping at 50 with "and N more":

- **New unresolved strings** — below.
- **Grant overrides not applied** — an override whose string its paper does not show. Usually a
  typo in `raw`, or the wrong work; `explain` the work to see its strings as written.
- **Review lists.** Each entry is listed once, by the run that first finds it, and counted after.
  - *OpenAlex and the agency disagree by more than 1%.* The agency's own figure is used anyway.
    Nothing to do unless the agency's is plainly wrong.
  - *Untagged awards of $20,000,000 or more* (NIH's centre grants aside). If one funds a centre or
    a consortium rather than a project, add its key to `institution_wide.keys` in
    `config/funding.yaml` with a reason, and bump `funding_version` (below). The app then lets
    a reader leave it out.
  - *Grants seen only beside another of their agency.* Often one grant under two identifiers — a
    training-group number beside its project number. If so, a grant override on each paper maps
    the second string to the first grant's key.

A run that decided no funding says so in one line under **Store** instead: disabled
(`enabled: false`), skipped (`--funding skip`, and every `--channels` run), or carried forward
because the stage failed, which also alerts.

### What the site counts of a grant

The report and `explain` give lifetime figures, from the store. What the site counts is in the
export, which each run rebuilds:

```bash
uv run uwpr-pubs explain NIH:P51RR000166 --store store   # lifetime: amount, fiscal years, works
jq '.funding.grants[] | select(.key == "NIH:P51RR000166")
    | {amount_usd, counted_usd, counted_rule, first_year, last_listed_year}' \
    export/uwpr_publications.json
jq '.funding.summary | {amount_usd, counted_usd, grants_by_counted_rule}' \
    export/uwpr_publications.json
```

`explain` prints nothing counted. In the export, `amount_usd` is the lifetime total and
`counted_usd` what the totals count, over every publication listing the grant (the site counts
less under a filter). `counted_rule` says why: `window` (its years from 2006 to the latest listing
paper), `full_amount` (an instrument, counted in full), `ended_before` (funding ended before 2006:
its last five years), `began_after` (began after its latest listing paper: $0), `undated` (no
yearly breakdown: counted whole). The grant's page on the site says the same in words, under
"Counted in the totals", and marks each fiscal year counted or not. A `began_after` grant is
usually a renumbered grant whose predecessor the paper also lists, or one PubMed or NIH attached
to the paper after it was published (docs/09 §3.6, §16 item 14).

### A new unresolved string, and a grant override

A number nothing resolves is kept as a `MISC:` grant: counted, never valued, and shown in the app
as unmatched. Every new one is listed with its paper, the string as written, its sources and the
funders they name. For an NIH-format one, **nearest in RePORTER** lists the cores the store
already knows that it could have meant: one RePORTER holds under the same institute and serial,
one a single digit away, and whether NIH links the paper to it. Nothing is asked to make that list.

1. **Look at the paper's funding.**

   ```bash
   uv run uwpr-pubs explain W-000222 --store store         # every string, how each was decided
   uv run uwpr-pubs explain MISC:U19AG02312 --store store  # the unmatched grant, and its nearest cores
   uv run uwpr-pubs explain NIH:U19AG023122 --store store  # any grant key: facts, amount, who lists it
   ```

2. **Decide what it is.** Look the candidate up on reporter.nih.gov — does its title, investigator
   or institution fit the paper? For another agency's number, that agency's own award search. If
   you cannot tell, leave it: Miscellaneous is an honest answer.
3. **Add a `grant` override** to `overrides.yaml`:

   ```yaml
   - target: W-000222         # the work, never a DOI or a PMID
     action: grant
     raw: U19AG02312          # the string as the report shows it; quote it if it is all digits
     grant: NIH:U19AG023122   # a grant key, or null for "this is not a grant"
     reason: >-
       The string drops the last digit of U19AG023122, and RePORTER's record of that award fits
       the paper: its investigator is the senior author.
     by: mriffle
     date: 2026-10-03
   ```

   The string is matched ignoring case, spaces and dashes, and nothing else: a digit that differs
   is a different string. No `funding_version` bump is needed; overrides apply on every run.
4. **Check it.** `uv run uwpr-pubs validate store` warns
   `grant override: 'U19AG02312' is not seen on W-000222` when the paper does not show that
   string — a typo, or the wrong work. Commit, push, and let the weekly run apply it, or run for
   real (§3). The next report lists it under *Grant overrides not applied* if it still matches
   nothing, and **alerts** if it names an NIH grant RePORTER does not hold. Then
   `explain W-000222` shows the string as `grant, override → NIH:U19AG023122`.

### A full refresh by hand

The weekly run makes one every 28 days and after a `funding_version` bump. Make one by hand only
when the data should not wait: after a source was down for weeks, say, or to see a configuration
change take effect now.

```bash
uv run uwpr-pubs run --funding full        # against the real store, as in §3; then push and publish
```

**Start it only inside RePORTER's window: a Saturday or Sunday, or between 21:00 and 05:00 New
York time.** A full refresh sends RePORTER 100–150 requests (the seed's, on 2026-09-27, sent 58),
and RePORTER's terms ask that large jobs keep to those hours; an address that ignores them can be
blocked. `--funding full` is an instruction, so it skips the window guard and the weekday cap of
60 requests: nothing will stop you on a Tuesday morning. Without it, a refresh that falls due
outside the window is deferred and the run goes ahead incrementally. The workflow's *Run
workflow* button has no funding input; it does what the schedule does.

### NIH RePORTER answered 403

The alert reads "NIH RePORTER answered HTTP 403: possible IP block — RUNBOOK". The run finished;
RePORTER was not asked again, and every grant it holds kept its stored facts and amount.

1. **Stop.** Start no more runs by hand, and do not retry to see whether it has cleared: more
   requests from a blocked address can only make it look worse.
2. **Wait for the next Saturday run.** If RePORTER answers, it was passing, and there is nothing
   more to do. If it keeps answering 403, the three-runs-in-a-row alert follows.
3. **Then write to RePORT@mail.nih.gov.** Say what the project is and who runs it (mriffle@uw.edu,
   the contact every request carries), that it sends at most one request a second and keeps large
   jobs to their window, and ask whether the address is blocked and what they need.

Nothing is lost meanwhile: the stored NIH grants keep their facts and amounts, and new NIH strings
wait for an answer. The publication data goes on updating every week.

### The January exchange-rate update

Amounts in other currencies are converted at the annual average rate for the award's start year,
from `config/exchange_rates.yaml`: the Federal Reserve's G.5A release for the currencies it lists,
and OECD's annual rates for the rest (the Chilean peso among them). The Federal Reserve publishes
G.5A for the year just ended in early January. Until the year is added, an award that started in
it is converted at the latest year the table has, and says so.

1. Read the new release at https://www.federalreserve.gov/releases/g5a/ and add the year to each
   currency, as a quoted decimal string in **US dollars per unit**. G.5A quotes the Australian
   dollar, the euro, the New Zealand dollar and the pound that way; **every other currency it
   quotes per US dollar, and must be inverted**: one divided by the rate, to ten significant
   digits, halves to even. A release revises the years before it, so take those too.
2. Do the same for the currencies that come from OECD, from the dataset and URL in the file's
   `sources`, inverting each.
3. Update `sources` — `retrieved`, `years`, the release named in `dataset`.
4. `uv run uwpr-pubs config` loads the file against its schema; then the checks (§6 step 4).

**No `funding_version` bump.** The rates file is outside the funding fingerprint, and every run
recomputes every amount from the stored facts and the rates. Commit and push; the next run
revalues everything, and the total moves a little.

### Bumping `funding_version`

`config/funding.yaml` carries `funding_version`, `YYYY-MM-DD.N` like `rule_version`. **Any edit to
the file needs a bump** — an agency, a pattern, a not-grant, an institution-wide key, a threshold
— or the run refuses to start: "funding.yaml changed without a new funding_version". The exchange
rates and grant overrides are outside it and need none.

**A bump schedules a full refresh.** Every stored decision was made under the old configuration,
so the next run inside RePORTER's window re-reads everything and decides every string again. The
Saturday run is inside the window; a run by hand on a weekday defers it (and says so). Read that
run's Funding section: the grants new and no longer listed, and the total, are what the change
did. `uv run uwpr-pubs config` prints the version and fingerprint in force.

### Changing a counting constant

The counting rule's constants — the first year counted (2006), how many final years a grant that
ended before it counts (5), and the kinds counted in full (instruments) — are in
`src/uwpr_pubs/funding/counting.py`, **not** in `config/funding.yaml`. **Changing one is a code
change, not a `funding_version` bump**, and needs no refresh and no request: the export reads no
configuration, and every counted figure is recomputed from the stored rows.

1. Edit the constant, and the tests that pin it: `tests/test_funding_counting.py` and the
   export tests, and the app's (`web/test/`, whose builders state the constants and whose cases
   expect their figures). The app's code reads the constants from the export's `funding.counting`.
2. Rebuild both exports: `uv run uwpr-pubs export --store store --out export`, and the sample's
   (`--store samples/store --out samples/export --cases samples/export_cases.json`).
3. Run the checks (§6 step 4), the web suite against both exports included.
4. Add a dated note to docs/09 (F17, §7.4) saying what changed and why, with the new headline.

The app hard-codes none of the constants, so the page follows the data once it is published.
