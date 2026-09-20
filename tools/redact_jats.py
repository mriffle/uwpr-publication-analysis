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

KEEP_LIMIT = 300  # what the store publishes (uwpr_pubs.evidence.EXCERPT_LIMIT)
SENTENCE = re.compile(r"(?<=[.;])(?=\s)")
DOCTYPE = re.compile(r"<!DOCTYPE[^>]*>")
TITLE_LIMIT = 80  # a section heading; anything longer is prose and is redacted
MIN_MATCH = 40  # an excerpt shorter than this must match exactly, not as a prefix


def local(tag: object) -> str:
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


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


def matching(sentence: str, excerpts: set[str]) -> str | None:
    """The stored excerpt this sentence is, if it is one.

    The whole excerpt must match, not a prefix of it. Matching on the first 120 characters let a
    plain address through because it happened to open the same way as a published one — and the
    only excerpts that need prefix treatment are those the store truncated, which are still a
    genuine prefix of the sentence they came from.
    """
    candidate = normalise(sentence)
    if not candidate:
        return None
    for excerpt in excerpts:
        core = excerpt.rstrip("…").strip()
        if candidate == excerpt or (len(core) >= MIN_MATCH and candidate.startswith(core)):
            return core
    return None


def keep_only_what_is_published(sentence: str, core: str) -> str:
    """Put back exactly the text the store publishes, and redact the rest, length for length.

    A stored excerpt is truncated to about 300 characters; the sentence it came from can be much
    longer. Writing the excerpt itself, rather than a prefix of the raw sentence, is what makes
    the disclosure provably equal to what the store already carries.
    """
    kept = core[:KEEP_LIMIT]
    return kept + redact(sentence[len(kept) :])


def redact_text(text: str | None, excerpts: set[str]) -> str | None:
    """Sentence by sentence, so a quoted sentence survives and its neighbours do not."""
    if not text:
        return text
    out = []
    for part in SENTENCE.split(text):
        core = matching(part, excerpts)
        out.append(keep_only_what_is_published(part, core) if core else redact(part))
    return "".join(out)


def redact_tree(element: Element, excerpts: set[str]) -> None:
    tag = local(element.tag)
    if tag == "title" and element.text and len(element.text) <= TITLE_LIMIT:
        # A section heading is a structural label, not prose, and §6.1 locates the methods and
        # acknowledgement sections by reading it. Redacting it would make that untestable.
        pass
    elif tag == "label":
        # §6.1 drops `<label>`, so no stored excerpt can have come from one. Keeping text here
        # because it resembles an excerpt found elsewhere would publish what the store does not.
        element.text = redact(element.text) if element.text else element.text
    else:
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
        target = args.out / f"{name}.xml"
        ElementTree(root).write(target, encoding="unicode", xml_declaration=True)
        # ElementTree drops the DOCTYPE, and a DOCTYPE is one of the reasons these documents are
        # real rather than hand-written: a parser that has never met one still has to cope.
        doctype = DOCTYPE.search(source.read_bytes().decode("utf-8", "replace"))
        if doctype:
            body = target.read_text(encoding="utf-8")
            declaration, _, rest = body.partition("?>")
            target.write_text(f"{declaration}?>\n{doctype.group(0)}{rest}", encoding="utf-8")
        written += 1
        print(f"{name}.xml  kept {len(excerpts)} excerpt(s)")
    print(f"\n{written} documents written to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
