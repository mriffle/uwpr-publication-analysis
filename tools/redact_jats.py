"""Turn cached PMC full text into committable test documents (docs/08 §6, P10).

The repository is public and holds no full text, but a parser tested only on hand-written JATS
would still fall over on the real thing: real PMC XML has a DOCTYPE, namespaces, inline markup,
`<label>` numbering, nested blocks and entities that nobody writes by hand.

So this keeps the *document* and throws away the *prose*. Every element, attribute and structural
detail survives; every text node is replaced by a length-matched placeholder, except the sentences
already committed to the store as evidence excerpts, which are public anyway.

Run it locally against a warm cache:

    uv run python tools/redact_jats.py --store /tmp/scratch-store --out tests/fixtures/jats
"""

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path
from xml.etree.ElementTree import Element, ElementTree  # writing back out is not parsing

from defusedxml.ElementTree import fromstring  # P14: never the bare stdlib parser

KEEP_LIMIT = 400  # the schema's excerpt ceiling; nothing longer is ever kept
SENTENCE = re.compile(r"(?<=[.;])(?=\s)")
PREFIX = 120  # how much of a truncated excerpt must match


def normalise(text: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", text).split())


def redact(text: str) -> str:
    """Same length, same shape, no content: letters become x, digits become 0."""
    out = []
    for character in text:
        if character.isspace() or not character.isalnum():
            out.append(character)
        elif character.isdigit():
            out.append("0")
        elif character.isupper():
            out.append("X")
        else:
            out.append("x")
    return "".join(out)


def keeps(sentence: str, excerpts: set[str]) -> bool:
    """True when this sentence is one the store already quotes."""
    candidate = normalise(sentence)
    if not candidate or len(candidate) > KEEP_LIMIT:
        return False
    for excerpt in excerpts:
        core = excerpt.rstrip("…").strip()
        if candidate == excerpt or (core and candidate.startswith(core[:PREFIX])):
            return True
    return False


def redact_text(text: str | None, excerpts: set[str]) -> str | None:
    """Sentence by sentence, so a quoted sentence survives and its neighbours do not."""
    if not text:
        return text
    return "".join(part if keeps(part, excerpts) else redact(part) for part in SENTENCE.split(text))


def redact_tree(element: Element, excerpts: set[str]) -> None:
    element.text = redact_text(element.text, excerpts)
    element.tail = redact_text(element.tail, excerpts)
    for child in element:
        redact_tree(child, excerpts)


def excerpts_for(store: Path) -> dict[str, set[str]]:
    """Every committed excerpt, indexed by the cache reference it was read from."""
    found: dict[str, set[str]] = {}
    for path in sorted((store / "works").glob("W-??????.json")):
        work = json.loads(path.read_text(encoding="utf-8"))
        for entry in work["evidence"]:
            cache = (entry.get("source") or {}).get("cache")
            if cache and entry.get("excerpt"):
                found.setdefault(cache, set()).add(normalise(entry["excerpt"]))
    return found


def blob(cache: Path, reference: str) -> Path:
    digest = reference.removeprefix("sha256:")
    return cache / "blobs" / digest[:2] / digest[2:4] / digest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--store", type=Path, required=True, help="a store built by a live run")
    parser.add_argument("--cache", type=Path, default=Path("cache"))
    parser.add_argument("--out", type=Path, default=Path("tests/fixtures/jats"))
    parser.add_argument("--limit", type=int, default=12, help="how many documents to write")
    args = parser.parse_args()

    by_cache = excerpts_for(args.store)
    args.out.mkdir(parents=True, exist_ok=True)
    written = 0
    for reference, excerpts in sorted(by_cache.items()):
        source = blob(args.cache, reference)
        if written >= args.limit or not source.exists():
            continue
        try:
            root = fromstring(source.read_bytes().decode("utf-8", "replace"))
        except Exception as error:
            print(f"skipped {reference}: {error}", file=sys.stderr)
            continue
        redact_tree(root, excerpts)
        name = reference.removeprefix("sha256:")[:12]
        ElementTree(root).write(args.out / f"{name}.xml", encoding="unicode", xml_declaration=True)
        written += 1
        print(f"{name}.xml  kept {len(excerpts)} excerpt(s)")
    print(f"\n{written} documents written to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
