"""The redacted PMC documents in `tests/fixtures/jats` (docs/08 §6, P10).

These are real PMC records with every text node replaced by a length-matched placeholder, except
the sentences the store already quotes as evidence. They exist because hand-written JATS lacks
the things that actually break a parser: a DOCTYPE, namespaces, inline markup, `<label>`
numbering, nested blocks and the removed sections sitting among the kept ones.

Two guards run over them. One keeps the repository clean: the repository is public, and no real
prose may reach it. The other keeps the fixture set honest: it must go on exercising every
behaviour of Phase 1 §6.1, or a regression in one of them would pass unnoticed.

Regenerate them with:

    uv run python tools/redact_jats.py --store <a store> --out tests/fixtures/jats
"""

import re
from pathlib import Path

import pytest
from defusedxml import ElementTree

from uwpr_pubs.config import load_config
from uwpr_pubs.evidence import EXCERPT_LIMIT
from uwpr_pubs.text import TextRules, parse_jats, split_sentences, text_rules

JATS = Path(__file__).resolve().parent / "fixtures" / "jats"
DOCUMENTS = sorted(JATS.glob("*.xml"))

# A redacted character is x, X or 0; anything else is text somebody wrote.
REAL_PROSE = re.compile(r"[a-wyzA-WYZ1-9]")
BLOCKS = {"p", "title", "aff", "fn", "td", "th", "li", "caption", "funding-statement"}


@pytest.fixture(scope="module")
def rules() -> TextRules:
    return text_rules(load_config().rules["text"])


def local(tag: object) -> str:
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def real_span(text: str) -> int:
    """How much of this string is readable: first real character to last, inclusive.

    A kept excerpt sits at the front of its sentence and the rest is placeholder, so the span is
    what the repository actually discloses.
    """
    positions = [i for i, character in enumerate(text) if REAL_PROSE.match(character)]
    return positions[-1] - positions[0] + 1 if positions else 0


def text_nodes(path: Path) -> list[str]:
    root = ElementTree.fromstring(path.read_bytes().decode("utf-8"))
    found = []
    for node in root.iter():
        for value in (node.text, node.tail):
            cleaned = " ".join((value or "").split())
            if cleaned:
                found.append(cleaned)
    return found


def test_there_are_fixtures_to_test() -> None:
    assert DOCUMENTS, "run tools/redact_jats.py to build the fixture set"


@pytest.mark.parametrize("path", DOCUMENTS, ids=lambda p: p.name)
def test_no_real_prose_survives_redaction(path: Path, rules: TextRules) -> None:
    """The repository is public. Only sentences the store already quotes may be readable.

    Redaction works sentence by sentence, so a paragraph may be long while only one sentence in
    it is real. What must stay bounded is each run of real text, not the node around it: this is
    the over-long text guard of docs/08 §6.
    """
    for node in text_nodes(path):
        for sentence in split_sentences(node, rules):
            span = real_span(sentence)
            assert span <= EXCERPT_LIMIT, f"{span} characters of un-redacted text: {sentence[:120]}"


@pytest.mark.parametrize("path", DOCUMENTS, ids=lambda p: p.name)
def test_every_fixture_still_parses(path: Path, rules: TextRules) -> None:
    document = parse_jats(path.read_bytes(), rules)
    assert document is not None
    assert document.sentences


def test_the_fixture_set_covers_every_section_6_1_behaviour(rules: TextRules) -> None:
    """A coverage matrix: if the set stops exercising one of these, say so loudly."""
    tags: set[str] = set()
    sections: set[str] = set()
    nested_blocks = labelled_affiliation = False
    for path in DOCUMENTS:
        root = ElementTree.fromstring(path.read_bytes().decode("utf-8"))
        tags |= {local(element.tag) for element in root.iter()}
        for element in root.iter():
            if local(element.tag) == "aff" and any(local(c.tag) == "label" for c in element):
                labelled_affiliation = True
            if local(element.tag) in BLOCKS and any(
                local(c.tag) in BLOCKS for c in element.iter() if c is not element
            ):
                nested_blocks = True
        document = parse_jats(path.read_bytes(), rules)
        assert document is not None
        sections |= {sentence.section for sentence in document.sentences}

    # Parts §6.1 removes, which must be present to prove they are removed.
    assert {"ref-list", "contrib-group", "table-wrap"} <= tags
    # Parts §6.1 keeps.
    assert {"body", "back", "ack", "aff", "author-notes"} <= tags
    assert {"funding-group", "fn-group", "supplementary-material"} <= tags
    # Structural behaviours.
    assert labelled_affiliation, "no <aff> with a <label> to drop"
    assert nested_blocks, "no block nested inside another block"
    # Sections located from the tree.
    assert {"acknowledgements", "affiliation", "methods", "main text"} <= sections


@pytest.mark.parametrize("path", DOCUMENTS, ids=lambda p: p.name)
def test_removed_parts_never_reach_the_sentences(path: Path, rules: TextRules) -> None:
    """References, tables and the author list stay out of the text, in real documents too."""
    document = parse_jats(path.read_bytes(), rules)
    assert document is not None
    root = ElementTree.fromstring(path.read_bytes().decode("utf-8"))
    whole = document.text
    for element in root.iter():
        if local(element.tag) != "ref-list":
            continue
        for node in element.iter():
            cleaned = " ".join((node.text or "").split())
            if len(cleaned) > EXCERPT_LIMIT:
                assert cleaned not in whole
