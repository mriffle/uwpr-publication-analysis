"""Grant numbers a paper states in its JATS XML (docs/09).

Two kinds, read differently:

- **`<award-group>`** is the publisher's structured funding metadata. Each `<award-id>` is taken
  as written, with the names and Funder Registry IDs of the group's `<funding-source>`s; deciding
  what it is belongs to the resolver.
- **Prose** — `<funding-statement>`, `<ack>`, and funding footnotes, notes and sections — yields
  only *full-format* numbers: an NIH activity code, institute code and serial (`R01 GM086688`,
  `5R01GM086688-05`), or an NIH contract or task order (`HHSN272201700059C`, `75N93020F00001`).
  Each comes with about 150 characters of context. A partial number (`GM086688`, "NIH R01",
  "K99/R00") names no grant on its own, and a pattern cannot tell any other agency's number from
  a catalogue number or a strain name in running text, so neither is taken from prose.

Pure: XML in, dataclasses out, parsed with defusedxml (P14). Self-contained, so it depends on
neither the text rules nor the number parser.
"""

import re
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Literal
from xml.etree.ElementTree import Element, ParseError  # parsing itself is defusedxml's (P14)

from defusedxml.common import DefusedXmlException
from defusedxml.ElementTree import fromstring

Kind = Literal["award", "nih", "contract"]
Where = Literal["award-group", "funding-statement", "ack", "fn", "notes", "sec"]

CONTEXT = 150
DASHES = "\\-\u2010\u2011\u2012\u2013\u2014\u2212"
PART = f"[\\s{DASHES}]?"  # one optional space or dash between the parts of a number
# Institute codes as they appear in project numbers, current and retired.
NIH_ICS = (
    "AA|AG|AI|AR|AT|CA|CM|DA|DC|DE|DK|DP|EB|ES|EY|GM|HB|HD|HG|HL|HS|HV|LM|MD|MH|MN|NB|NR|NS|OD|RM|RR|TR|TW"
)
# Optional application type, activity code (a letter, a letter or digit, a digit: R01, DP3, UL1,
# and RO1 for the O-for-zero typo), institute, serial, and optional support year and suffix.
NIH_NUMBER = re.compile(
    f"(?<![A-Za-z0-9])(?:[1-9]{PART})?[A-Z][A-Z0-9][0-9]{PART}(?:{NIH_ICS}){PART}[0-9]{{4,9}}"
    f"(?:[{DASHES}][0-9]{{2}}(?:[AS][0-9]{{1,2}})?)?(?![A-Za-z0-9])"
)
CONTRACT_NUMBER = re.compile(
    f"(?<![A-Za-z0-9])(?:HHSN{PART}[0-9]{{9,12}}[A-Z]?|75N[0-9]{{5}}[A-Z][0-9]{{5}})(?![A-Za-z0-9])"
)
PATTERNS: tuple[tuple[Kind, re.Pattern[str]], ...] = (("nih", NIH_NUMBER), ("contract", CONTRACT_NUMBER))

FUNDING_TYPES = frozenset(
    {"financial-disclosure", "supported-by", "funding", "funding-information", "financial-support"}
)
# A footnote of any type that says it is about funding ("This work was supported by…").
FUNDING_WORDS = re.compile(r"\b(?:fund(?:s|ed|ing)?|financial|grants?|support(?:ed)?)\b", re.IGNORECASE)
# A section or note titled as funding. Narrower than the footnote test: a methods section titled
# "Support vector machines" is not one.
FUNDING_TITLE = re.compile(
    r"\b(?:fund(?:s|ed|ing)?|financial|grants?)\b|^(?:sources? of )?support\W*$", re.IGNORECASE
)
# Elements whose boundaries separate words: flattening `<title>Funding</title><p>This…` must not
# give "FundingThis…".
SPACED = frozenset(
    {
        "ack",
        "award-group",
        "award-id",
        "fn",
        "funding-source",
        "funding-statement",
        "institution",
        "list",
        "list-item",
        "notes",
        "p",
        "sec",
        "td",
        "th",
        "title",
    }
)
DROPPED = frozenset({"label"})


@dataclass(frozen=True)
class FundingString:
    """One grant number as the paper states it, and where."""

    raw: str
    kind: Kind
    where: Where
    funders: tuple[str, ...] = ()
    funder_ids: tuple[str, ...] = ()
    context: str = ""


def _local(tag: str) -> str:
    """A tag without its namespace. The parser keeps no comments, so every tag is a name."""
    return tag.rsplit("}", 1)[-1]


def _gather(element: Element, drop: frozenset[str], parts: list[str]) -> None:
    tag = _local(element.tag)
    if tag in drop:
        return
    spaced = tag in SPACED
    if spaced:
        parts.append(" ")
    parts.append(element.text or "")
    for child in element:
        _gather(child, drop, parts)
        parts.append(child.tail or "")
    if spaced:
        parts.append(" ")


def _text(element: Element, drop: frozenset[str] = DROPPED) -> str:
    parts: list[str] = []
    _gather(element, drop, parts)
    return " ".join("".join(parts).split())


def _descendants(element: Element, tag: str) -> list[Element]:
    return [child for child in element.iter() if _local(child.tag) == tag]


def _title(element: Element) -> str:
    for child in element:
        if _local(child.tag) == "title":
            return _text(child)
    return ""


def _awards(root: Element) -> Iterator[FundingString]:
    for group in _descendants(root, "award-group"):
        names: list[str] = []
        ids: list[str] = []
        for source in _descendants(group, "funding-source"):
            institutions = _descendants(source, "institution")
            if institutions:
                parts = [_text(institution) for institution in institutions]
            else:  # the name written straight into the element, beside any registry ID
                parts = [_text(source, DROPPED | {"institution-id"})]
            names += [name for name in parts if name and name not in names]
            ids += [
                value
                for value in (_text(i) for i in _descendants(source, "institution-id"))
                if value and value not in ids
            ]
        for award in _descendants(group, "award-id"):
            raw = _text(award)
            if raw:
                yield FundingString(raw, "award", "award-group", tuple(names), tuple(ids))


def _where(element: Element) -> Where | None:
    """Whether this element is prose that states funding, and which kind."""
    tag = _local(element.tag)
    if tag == "funding-statement":
        return "funding-statement"
    if tag == "ack":
        return "ack"
    if tag == "fn":
        declared = (element.get("fn-type") or "").lower()
        return "fn" if declared in FUNDING_TYPES or FUNDING_WORDS.search(_text(element)) else None
    if tag == "notes":
        declared = (element.get("notes-type") or "").lower()
        return "notes" if "fund" in declared or FUNDING_TITLE.search(_title(element)) else None
    if tag == "sec":
        declared = (element.get("sec-type") or "").lower()
        return "sec" if "fund" in declared or FUNDING_TITLE.search(_title(element)) else None
    return None


def _prose(element: Element) -> Iterator[tuple[Where, Element]]:
    """The outermost funding prose elements: one inside another is read once, as the outer."""
    where = _where(element)
    if where is not None:
        yield where, element
        return
    for child in element:
        yield from _prose(child)


def _context(text: str, start: int, end: int) -> str:
    spare = max(0, CONTEXT - (end - start))
    low = max(0, start - spare // 2)
    high = min(len(text), max(end, low + CONTEXT))
    low = max(0, min(low, high - CONTEXT))
    snippet = text[low:high].strip()
    return ("…" if low > 0 else "") + snippet + ("…" if high < len(text) else "")


def _numbers(where: Where, text: str) -> Iterator[FundingString]:
    for kind, pattern in PATTERNS:
        for found in pattern.finditer(text):
            yield FundingString(
                found.group(), kind, where, context=_context(text, found.start(), found.end())
            )


def funding_strings(xml: bytes | str) -> list[FundingString] | None:
    """Every grant number the XML states, in document order; None when it will not parse."""
    text = xml.decode("utf-8", errors="replace") if isinstance(xml, bytes) else xml
    try:
        root = fromstring(text)
    except (ParseError, DefusedXmlException, ValueError):
        return None
    found: list[FundingString] = []
    seen: set[tuple[str, ...]] = set()
    for item in _awards(root):
        key = (item.kind, item.raw, *item.funders, "|", *item.funder_ids)
        if key not in seen:
            seen.add(key)
            found.append(item)
    for where, element in _prose(root):
        for item in _numbers(where, _text(element)):
            key = (item.kind, item.where, item.raw)
            if key not in seen:
                seen.add(key)
                found.append(item)
    return found
