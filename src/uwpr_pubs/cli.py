"""The `uwpr-pubs` command (docs/03-retrieval-pipeline.md §8)."""

import argparse
import os
from collections.abc import Callable, Sequence
from pathlib import Path

from uwpr_pubs import __version__
from uwpr_pubs.channels import ALL_CHANNELS
from uwpr_pubs.config import ConfigError, load_config
from uwpr_pubs.context import RunContext
from uwpr_pubs.explain import explain
from uwpr_pubs.fixtures import evaluate
from uwpr_pubs.http import Mode
from uwpr_pubs.pipeline import RunOptions, run_pipeline
from uwpr_pubs.runtime import api_keys, build_client
from uwpr_pubs.sample import SAMPLE_RUN_YEAR, build_sample, case_report, missing_cases
from uwpr_pubs.smoke import run_smoke
from uwpr_pubs.stages.export import resource_block, schema_problems
from uwpr_pubs.stages.export import write as write_export
from uwpr_pubs.store.paths import StorePaths
from uwpr_pubs.store.read import read_store
from uwpr_pubs.validate import validate_export, validate_store


def _validate(args: argparse.Namespace) -> int:
    report = validate_store(Path(args.store), Path(args.overrides) if args.overrides else None)
    print(f"store: {args.store}  " + report.summary().splitlines()[0])
    for warning in report.warnings:
        print("WARN ", warning)
    for error in report.errors:
        print("ERROR", error)
    print(report.summary().splitlines()[1])
    return 0 if report.ok else 1


def _config(args: argparse.Namespace) -> int:
    try:
        config = load_config(Path(args.dir) if args.dir else None)
    except ConfigError as exc:
        print(f"ERROR {exc}")
        return 1
    print(f"rule version:       {config.rule_version}")
    print(f"rules fingerprint:  {config.rules_fingerprint}")
    print(f"config fingerprint: {config.config_fingerprint}")
    print(f"staff: {len(config.staff)}  channels: {len(config.enabled_channels())} enabled  ")
    print(f"fixtures: {len(config.fixtures)}  overrides: {len(config.overrides)}")
    return 0


def _smoke(args: argparse.Namespace) -> int:
    try:
        config = load_config()
    except ConfigError as exc:
        print(f"ERROR {exc}")
        return 1
    api_keys()  # reads .env for local runs, before the client is built
    client = build_client(config, mode=Mode.LIVE, cache_root=Path(args.cache) if args.cache else None)
    checks = run_smoke(config, client)
    for check in checks:
        print(check.line())
    spend = client.budget.spent_usd
    print(f"\nOpenAlex spend: ${spend:.4f}   calls: {sum(u.calls for u in client.usage.values())}")
    return 0 if all(check.ok for check in checks) else 1


def _run(args: argparse.Namespace) -> int:
    try:
        config = load_config()
    except ConfigError as exc:
        print(f"ERROR {exc}")
        return 1
    api_keys()  # local runs read .env; CI passes secrets as environment variables
    mode = Mode(args.mode)
    store = Path(args.store)
    context = RunContext.now(mode=mode.value, store=store)
    client = build_client(config, mode=mode, cache_root=Path(args.cache) if args.cache else None)
    options = RunOptions(
        store=store,
        mode=mode,
        dry_run=args.dry_run,
        # A partial run must not commit, advance any last_seen or remove anything (§8), which
        # RunOptions enforces: naming channels is enough to make the run read-only for git.
        channels=tuple(args.channels.split(",")) if args.channels else ALL_CHANNELS,
        summary_out=Path(args.summary_out) if args.summary_out else None,
        no_commit=args.no_commit,
    )
    result = run_pipeline(config, client, context, options)
    print(result.report)
    if result.commit:
        print(f"committed {result.commit}")
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        # `commit` is how the workflow knows whether there is anything to push, and which commit
        # to scan for a leaked key before it does (§11.3). Empty means the run changed nothing.
        with open(output, "a", encoding="utf-8") as handle:
            handle.write(f"status={result.status}\nrun_id={result.run_id}\ncommit={result.commit or ''}\n")
    return 1 if result.status == "failed" else 0


def _explain(args: argparse.Namespace) -> int:
    store = Path(args.store)
    if not store.is_dir():
        print(f"ERROR no store at {store}")
        return 1
    found, text = explain(read_store(store), args.identifier)
    print(text)
    return 0 if found else 1


def _report(args: argparse.Namespace) -> int:
    paths = StorePaths(Path(args.store))
    reports = sorted(paths.runs.glob("*.md")) if paths.runs.is_dir() else []
    if args.run_id:
        wanted = paths.run_report(args.run_id)
        if not wanted.is_file():
            print(f"ERROR no report for run {args.run_id} in {paths.runs}")
            return 1
        print(wanted.read_text(encoding="utf-8"))
        return 0
    if not reports:
        print(f"ERROR no run reports in {paths.runs}")
        return 1
    print(reports[-1].read_text(encoding="utf-8"))  # run ids start with the time, so last is latest
    return 0


def _fixtures(args: argparse.Namespace) -> int:
    try:
        config = load_config()
    except ConfigError as exc:
        print(f"ERROR {exc}")
        return 1
    store = Path(args.store)
    if not store.is_dir():
        print(f"ERROR no store at {store}")
        return 1
    results = evaluate(config.fixtures, read_store(store))
    for result in results:
        print(result.line())
    regressions = [result for result in results if result.regressed]
    absent = [result for result in results if result.outcome == "fail" and not result.present]
    print(
        f"\n{sum(1 for r in results if r.outcome == 'pass')} as expected, "
        f"{sum(1 for r in results if r.outcome == 'known_miss')} known misses, "
        f"{len(regressions)} regressed, {len(absent)} not in this store"
    )
    for result in results:
        if result.good_news:
            print(f"GOOD NEWS {result.id}: {result.detail}")
    return 1 if regressions else 0


def _export(args: argparse.Namespace) -> int:
    """Build the app's two files from a store, without a run (docs/05 §4, §13).

    This is how `samples/export/` is regenerated, and it is the only way to produce an export
    from a store the pipeline is not currently writing.
    """
    try:
        config = load_config()
    except ConfigError as exc:
        print(f"ERROR {exc}")
        return 1
    cases = Path(args.cases) if args.cases else None
    document, lookup = build_sample(Path(args.store), cases, resource_block(config), args.rule_version)

    problems = schema_problems(document, lookup)
    problems.extend(validate_export(document, lookup, run_year=SAMPLE_RUN_YEAR).errors)
    absent = missing_cases(document)
    if absent:
        problems.append(f"docs/05 §13 cases not covered: {', '.join(absent)}")
    for problem in problems:
        print("ERROR", problem)
    if problems:
        return 1

    out = Path(args.out)
    write_export(out, document, lookup)
    print(f"{out}: {len(document['works'])} works, {len(lookup['not_included'])} not included")
    print(case_report(document))
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="uwpr-pubs", description="Find and track publications supported by UWPR."
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    subcommands = parser.add_subparsers(dest="command")

    validate = subcommands.add_parser("validate", help="check a store against the schemas and invariants")
    validate.add_argument("store", nargs="?", default="store")
    validate.add_argument("--overrides", help="default: <store>/../overrides.yaml")

    config = subcommands.add_parser("config", help="load config/*.yaml and show its fingerprints")
    config.add_argument("--dir", help="default: <project root>/config")

    smoke = subcommands.add_parser("smoke", help="live check that each source answers as expected")
    smoke.add_argument("--cache", help="default: <project root>/cache")

    run = subcommands.add_parser("run", help="find publications and update the store")
    run.add_argument("--mode", choices=[m.value for m in Mode], default=Mode.LIVE.value)
    run.add_argument("--store", default="store")
    run.add_argument("--cache", help="default: <project root>/cache")
    run.add_argument("--dry-run", action="store_true", help="run every stage but write nothing")
    run.add_argument("--channels", help="comma-separated channel ids; implies no commit")
    run.add_argument("--no-commit", action="store_true", help="write the store but do not commit it")
    run.add_argument("--summary-out", help="where to write the report, even if the run fails")

    explain_command = subcommands.add_parser("explain", help="why one paper is, or is not, included")
    explain_command.add_argument("identifier", help="a work ID, DOI, PMID, PMCID or OpenAlex ID")
    explain_command.add_argument("--store", default="store")

    report_command = subcommands.add_parser("report", help="print a run report (default: the latest)")
    report_command.add_argument("run_id", nargs="?")
    report_command.add_argument("--store", default="store")

    fixtures_command = subcommands.add_parser(
        "fixtures", help="evaluate the Phase 1 test papers against a store"
    )
    fixtures_command.add_argument("--store", default="store")

    export_command = subcommands.add_parser("export", help="build the app's JSON from a store")
    export_command.add_argument("--store", default="samples/store")
    export_command.add_argument("--out", default="samples/export")
    export_command.add_argument("--cases", help="synthetic works for shapes the store cannot hold")
    export_command.add_argument("--rule-version", help="default: the current rules.yaml version")

    handlers: dict[str, Callable[[argparse.Namespace], int]] = {
        "validate": _validate,
        "config": _config,
        "smoke": _smoke,
        "run": _run,
        "explain": _explain,
        "report": _report,
        "fixtures": _fixtures,
        "export": _export,
    }
    args = parser.parse_args(argv)
    handler = handlers.get(args.command or "")
    if handler is None:
        parser.print_help()
        return 0
    return handler(args)


if __name__ == "__main__":
    raise SystemExit(main())
