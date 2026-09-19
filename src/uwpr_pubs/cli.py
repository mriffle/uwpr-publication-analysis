"""The `uwpr-pubs` command (docs/03-retrieval-pipeline.md §8). Subcommands arrive with the pipeline."""

import argparse
from collections.abc import Sequence

from uwpr_pubs import __version__


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="uwpr-pubs", description="Find and track publications supported by UWPR."
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    parser.parse_args(argv)
    parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
