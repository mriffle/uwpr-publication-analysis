"""Scrubbing responses before they become test recordings (docs/03 §12.3, P10).

The repository is public and holds no full text and no abstracts, so scrubbing happens when a
recording is made, not when it is used: abstract fields are stripped from JSON, and a full-text
XML response is not recorded at all — those tests use a synthetic document instead.
`violations` backs the guard test that fails if anything slipped through.
"""

import json
from typing import Any

ABSTRACT_KEYS = frozenset({"abstract_inverted_index", "abstractText", "abstract", "abstractTextFull"})
FULL_TEXT_MARKERS = (b"<body", b"<article ", b"<article>", b"<!DOCTYPE article")


def strip_abstracts(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: strip_abstracts(v) for k, v in value.items() if k not in ABSTRACT_KEYS}
    if isinstance(value, list):
        return [strip_abstracts(v) for v in value]
    return value


def looks_like_full_text(body: bytes) -> bool:
    head = body[:4096]
    return any(marker in head for marker in FULL_TEXT_MARKERS)


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
    return body


def violations(body: bytes) -> list[str]:
    """Why this body may not be committed; empty when it is safe."""
    problems: list[str] = []
    if looks_like_full_text(body):
        problems.append("looks like full text")
    for key in ABSTRACT_KEYS:
        if f'"{key}"'.encode() in body:
            problems.append(f"contains {key}")
    return problems
