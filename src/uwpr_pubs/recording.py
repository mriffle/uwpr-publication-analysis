"""Scrubbing responses before they become test recordings (docs/03 §12.3, P10).

The repository is public and holds no full text and no abstracts, so scrubbing happens when a
recording is made, not when it is used: abstract fields are stripped from JSON, a PubMed record's
`<Abstract>` is cut from its XML, and a full-text XML response is not recorded at all — those
tests use a synthetic document instead. `violations` backs the guard test that fails if anything
slipped through.

NIH RePORTER carries a grant's abstract as `abstract_text` and its public-health statement as
`phr_text`; both are stripped like any other abstract (docs/03 §12.3, changed 2026-09-26).
"""

import json
import re
from typing import Any

ABSTRACT_KEYS = frozenset(
    {"abstract_inverted_index", "abstractText", "abstract", "abstractTextFull", "abstract_text", "phr_text"}
)
FULL_TEXT_MARKERS = (b"<body", b"<article ", b"<article>", b"<!DOCTYPE article")
# PubMed's efetch XML: `<Abstract>` and any translated `<OtherAbstract …>`, each holding the text in
# `<AbstractText>` elements. The name must end at the tag, so `<AbstractText>` alone is not taken
# for the start of one.
XML_ABSTRACT = re.compile(rb"<(Other|)Abstract(?:\s[^>]*)?>.*?</\1Abstract>", re.DOTALL)
XML_ABSTRACT_TEXT = b"<AbstractText"


def strip_abstracts(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: strip_abstracts(v) for k, v in value.items() if k not in ABSTRACT_KEYS}
    if isinstance(value, list):
        return [strip_abstracts(v) for v in value]
    return value


def looks_like_full_text(body: bytes) -> bool:
    head = body[:4096]
    return any(marker in head for marker in FULL_TEXT_MARKERS)


def strip_xml_abstracts(body: bytes) -> bytes:
    return XML_ABSTRACT.sub(b"", body)


def prepare_recording(content_type: str, body: bytes) -> bytes | None:
    """The bytes to record, or None when this response must never be committed."""
    if looks_like_full_text(body):
        return None
    if "json" in content_type.lower() or body[:1] in (b"{", b"["):
        try:
            parsed = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return body
        return json.dumps(strip_abstracts(parsed), sort_keys=True, ensure_ascii=False).encode("utf-8")
    stripped = strip_xml_abstracts(body)
    # Abstract text outside an element the pattern knows is a shape nobody has seen: not recorded.
    return None if XML_ABSTRACT_TEXT in stripped else stripped


def violations(body: bytes) -> list[str]:
    """Why this body may not be committed; empty when it is safe."""
    problems: list[str] = []
    if looks_like_full_text(body):
        problems.append("looks like full text")
    for key in sorted(ABSTRACT_KEYS):
        if f'"{key}"'.encode() in body:
            problems.append(f"contains {key}")
    if XML_ABSTRACT_TEXT in body:
        problems.append("contains AbstractText")
    return problems
