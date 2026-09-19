"""The `uwpr-pubs` command (docs/03-retrieval-pipeline.md §8).

The remaining subcommands (run, fixtures, smoke, explain, report) arrive with the pipeline.
"""

import argparse
from collections.abc import Callable, Sequence
from pathlib import Path

from uwpr_pubs import __version__
from uwpr_pubs.config import ConfigError, load_config
from uwpr_pubs.http import Mode
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

    handlers: dict[str, Callable[[argparse.Namespace], int]] = {
        "validate": _validate,
        "config": _config,
        "smoke": _smoke,
    }
    args = parser.parse_args(argv)
    handler = handlers.get(args.command or "")
    if handler is None:
        parser.print_help()
        return 0
    return handler(args)


if __name__ == "__main__":
    raise SystemExit(main())
