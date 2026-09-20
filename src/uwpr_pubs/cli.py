"""The `uwpr-pubs` command (docs/03-retrieval-pipeline.md §8).

The remaining subcommands (run, fixtures, smoke, explain, report) arrive with the pipeline.
"""

import argparse
import os
from collections.abc import Callable, Sequence
from pathlib import Path

from uwpr_pubs import __version__
from uwpr_pubs.channels import ALL_CHANNELS
from uwpr_pubs.config import ConfigError, load_config
from uwpr_pubs.context import RunContext
from uwpr_pubs.http import Mode
from uwpr_pubs.pipeline import RunOptions, run_pipeline
from uwpr_pubs.runtime import api_keys, build_client
from uwpr_pubs.smoke import run_smoke
from uwpr_pubs.validate import validate_store


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
        channels=tuple(args.channels.split(",")) if args.channels else ALL_CHANNELS,
        summary_out=Path(args.summary_out) if args.summary_out else None,
    )
    result = run_pipeline(config, client, context, options)
    print(result.report)
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as handle:
            handle.write(f"status={result.status}\nrun_id={result.run_id}\n")
    return 1 if result.status == "failed" else 0


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
    run.add_argument("--summary-out", help="where to write the report, even if the run fails")

    handlers: dict[str, Callable[[argparse.Namespace], int]] = {
        "validate": _validate,
        "config": _config,
        "smoke": _smoke,
        "run": _run,
    }
    args = parser.parse_args(argv)
    handler = handlers.get(args.command or "")
    if handler is None:
        parser.print_help()
        return 0
    return handler(args)


if __name__ == "__main__":
    raise SystemExit(main())
