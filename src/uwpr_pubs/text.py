"""Structural text extraction from JATS XML (Phase 1 §6.1).

Flattening the XML with `itertext()` glues headings onto the sentences that follow them
("...-80C. Mass spectrometry Mass spectrometry was carried out..."), which makes the excerpts
unusable. So the tree is walked instead: every leaf block element is split into sentences on its
own, text is never merged across blocks, and a block's position in the tree gives the evidence
section.

Pure: bytes in, dataclasses out. Nothing here fetches anything.
"""

import html
import re
import unicodedata
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from html.entities import html5
from typing import Any, Literal, cast
from xml.etree.ElementTree import Element, ParseError  # parsing itself is defusedxml's (P14)

from defusedxml.common import DefusedXmlException
from defusedxml.ElementTree import fromstring

from uwpr_pubs.store.models import Section

# An initial ("P." in "P. D. von Haller") or a run of them ("P.D.") never ends a sentence. The
# first version split those, which hid 11 staff acknowledgements (Phase 1 §6.1).
INITIAL = re.compile(r"(?:^|[\s(\[.])[A-Z]$")
# A character reference still in the text after parsing, because the source escaped it twice:
# PMC6379364's funding statement has `&amp;apos;`, which parses to the literal `&apos;`.
LEFTOVER_REFERENCE = re.compile(r"&(?:#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});")

NormalisationForm = Literal["NFC", "NFD", "NFKC", "NFKD"]


@dataclass(frozen=True)
class TextRules:
    """The §6.1 vocabulary, compiled once from `rules.yaml`."""

    remove: frozenset[str]
    keep: frozenset[str]
    blocks: frozenset[str]
    drop: frozenset[str]
    sentence_end: re.Pattern[str]
    abbreviations: tuple[str, ...]
    sections: Mapping[str, Section]
    methods_title: re.Pattern[str]
    ack_title: re.Pattern[str]
    ack_whole_block_fallback: bool
    normalisation: NormalisationForm


def text_rules(config: Mapping[str, Any]) -> TextRules:
    return TextRules(
        remove=frozenset(config["remove_elements"]),
        keep=frozenset(config["keep_elements"]),
        blocks=frozenset(config["block_elements"]),
        drop=frozenset(config["drop_elements"]),
        sentence_end=re.compile(config["sentence_end"]),
        abbreviations=tuple(config["abbreviations"]),
        sections=cast(Mapping[str, Section], dict(config["sections"])),
        methods_title=re.compile(config["methods_title_pattern"]),
        ack_title=re.compile(config["ack_title_pattern"]),
        ack_whole_block_fallback=bool(config["ack_whole_block_fallback"]),
        normalisation=cast(NormalisationForm, config["unicode_normalisation"]),
    )


@dataclass(frozen=True)
class Block:
    """One leaf block element's own text, with the section it sits in."""

    element: str
    section: Section
    text: str


@dataclass(frozen=True)
class Sentence:
    text: str
    section: Section
    block: int  # index into Document.blocks, so "the sentence before" never crosses a block
    index: int


@dataclass(frozen=True)
class Document:
    blocks: tuple[Block, ...]
    sentences: tuple[Sentence, ...]
    affiliations: tuple[str, ...]
    author_names: tuple[str, ...]
    body_available: bool

    @property
    def text(self) -> str:
        """Everything kept, for tests that run over the whole paper (R2's substring)."""
        return " ".join(block.text for block in self.blocks)

    def previous(self, sentence: Sentence) -> Sentence | None:
        """The sentence before, within the same block (§6.6's thanks verb may sit there)."""
        if sentence.index == 0:
            return None
        for candidate in self.sentences:
            if candidate.block == sentence.block and candidate.index == sentence.index - 1:
                return candidate
        return None  # pragma: no cover - indices are contiguous within a block

    def ack_blocks(self) -> tuple[Block, ...]:
        """Acknowledgements as whole blocks: §6.1's fallback when splitting hides a name."""
        return tuple(block for block in self.blocks if block.section == "acknowledgements")


def _local(tag: object) -> str:
    """JATS from different feeds may be namespaced; comments and PIs have non-string tags."""
    if not isinstance(tag, str):
        return ""
    return tag.rsplit("}", 1)[-1]


def unescape_leftovers(text: str) -> str:
    """Decode the character references a source left in its text, and nothing else.

    Only a numeric reference or a known name decodes. `html.unescape` alone also decodes a legacy
    name that runs into other letters, so `&notes;` would become `¬es;`.
    """

    def decoded(found: re.Match[str]) -> str:
        reference = found.group()
        return html.unescape(reference) if reference[1] == "#" or reference[1:] in html5 else reference

    return LEFTOVER_REFERENCE.sub(decoded, text)


def _normalise(text: str, form: NormalisationForm) -> str:
    return " ".join(unicodedata.normalize(form, unescape_leftovers(text)).split())


def _accumulate(element: Element, rules: TextRules, parts: list[str], *, stop_at_blocks: bool) -> None:
    """Inline markup is kept; dropped and removed subtrees are not.

    A skipped child still contributes its **tail**: `<aff><label>1</label>The address</aff>` keeps
    the address, which is the whole point of dropping `<label>` rather than the element around it.
    """
    if element.text:
        parts.append(element.text)
    for child in element:
        tag = _local(child.tag)
        skip = tag in rules.drop or tag in rules.remove or (stop_at_blocks and tag in rules.blocks)
        if not skip:
            _accumulate(child, rules, parts, stop_at_blocks=stop_at_blocks)
        if child.tail:
            parts.append(child.tail)


def _own_text(element: Element, rules: TextRules) -> str:
    """A leaf block's own text: what it says, minus anything a nested block says."""
    parts: list[str] = []
    _accumulate(element, rules, parts, stop_at_blocks=True)
    return _normalise("".join(parts), rules.normalisation)


def _full_text(element: Element, rules: TextRules) -> str:
    """Every descendant's text, used for affiliations and section titles."""
    parts: list[str] = []
    _accumulate(element, rules, parts, stop_at_blocks=False)
    return _normalise("".join(parts), rules.normalisation)


def _titled(chain: Sequence[Element], rules: TextRules, pattern: re.Pattern[str]) -> bool:
    """True when a `sec` in the chain has a title matching the pattern (§6.1)."""
    for element in chain:
        if _local(element.tag) != "sec":
            continue
        for child in element:
            if _local(child.tag) == "title" and pattern.search(_full_text(child, rules)):
                return True
    return False


def _section(chain: Sequence[Element], rules: TextRules) -> Section:
    for element in reversed(chain):
        mapped = rules.sections.get(_local(element.tag))
        if mapped:
            return mapped
    # Some papers write their acknowledgement as a plain <sec> rather than an <ack>.
    if _titled(chain, rules, rules.ack_title):
        return "acknowledgements"
    if _titled(chain, rules, rules.methods_title):
        return "methods"
    return "main text"


def _walk(element: Element, chain: tuple[Element, ...], rules: TextRules, out: list[Block]) -> None:
    tag = _local(element.tag)
    if tag in rules.remove or tag in rules.drop or tag == "aff":
        return  # affiliations are collected separately, so those inside contrib-group survive
    here = (*chain, element)
    if tag in rules.blocks:
        text = _own_text(element, rules)
        if text:
            out.append(Block(element=tag, section=_section(here, rules), text=text))
    for child in element:
        _walk(child, here, rules, out)


def _kept_roots(root: Element, rules: TextRules) -> list[Element]:
    """The outermost kept subtrees (§6.1 item 4); a nested one is covered by its ancestor."""
    roots: list[Element] = []
    stack = [root]
    while stack:
        element = stack.pop(0)
        tag = _local(element.tag)
        if tag in rules.remove:
            continue
        if tag in rules.keep:
            roots.append(element)
            continue
        stack = list(element) + stack
    return roots


def _elements(root: Element, tag: str) -> list[Element]:
    return [element for element in root.iter() if _local(element.tag) == tag]


def _author_names(root: Element, rules: TextRules) -> tuple[str, ...]:
    """Contributor names, kept out of the sentences but needed for R7's not-an-author test."""
    names: list[str] = []
    for group in _elements(root, "contrib-group"):
        for contrib in _elements(group, "contrib"):
            if contrib.get("contrib-type", "author") != "author":
                continue
            surname = next((_full_text(e, rules) for e in _elements(contrib, "surname")), "")
            given = next((_full_text(e, rules) for e in _elements(contrib, "given-names")), "")
            plain = next((_full_text(e, rules) for e in _elements(contrib, "string-name")), "")
            name = plain or " ".join(part for part in (given, surname) if part)
            if name and name not in names:
                names.append(name)
    return tuple(names)


def _is_abbreviation(prefix: str, abbreviations: Iterable[str]) -> bool:
    for abbreviation in abbreviations:
        if not prefix.endswith(abbreviation):
            continue
        before = prefix[: -len(abbreviation)]
        if not before or not before[-1].isalnum():
            return True
    return False


def split_sentences(text: str, rules: TextRules) -> list[str]:
    """Split on `.` or `;` before whitespace, except after an initial or a title (§6.1 item 6)."""
    sentences: list[str] = []
    start = 0
    for match in rules.sentence_end.finditer(text):
        prefix = text[: match.start()]
        if INITIAL.search(prefix) or _is_abbreviation(prefix, rules.abbreviations):
            continue
        piece = text[start : match.end()].strip()
        if piece:
            sentences.append(piece)
        start = match.end()
    tail = text[start:].strip()
    if tail:
        sentences.append(tail)
    return sentences


def parse_jats(data: bytes | str, rules: TextRules) -> Document | None:
    """A Document, or None when the XML will not parse at all.

    A parsed document with no `<body>` is still returned: its front matter carries affiliations
    and its back matter the acknowledgements, both of which are evidence.
    """
    text = data.decode("utf-8", errors="replace") if isinstance(data, bytes) else data
    try:
        root = fromstring(text)
    except (ParseError, DefusedXmlException, ValueError):
        return None

    affiliations: list[str] = []
    for element in _elements(root, "aff"):
        value = _full_text(element, rules)
        if value and value not in affiliations:
            affiliations.append(value)

    blocks: list[Block] = [Block(element="aff", section="affiliation", text=value) for value in affiliations]
    body_available = False
    for kept in _kept_roots(root, rules):
        found: list[Block] = []
        _walk(kept, (), rules, found)
        tag = _local(kept.tag)
        if not found:
            # A kept part whose content sits in no block element of its own: `<funding-group>`
            # states the award in `<award-id>`, and §6.1 asks for `<ack>` to be searched whole
            # when splitting would lose it. Either way the text is evidence and must not vanish.
            whole = _full_text(kept, rules)
            if whole:
                found.append(Block(element=tag, section=_section((kept,), rules), text=whole))
        if found and tag == "body":
            body_available = True
        blocks.extend(found)

    sentences: list[Sentence] = []
    for position, block in enumerate(blocks):
        for index, piece in enumerate(split_sentences(block.text, rules)):
            sentences.append(Sentence(text=piece, section=block.section, block=position, index=index))

    return Document(
        blocks=tuple(blocks),
        sentences=tuple(sentences),
        affiliations=tuple(affiliations),
        author_names=_author_names(root, rules),
        body_available=body_available,
    )
