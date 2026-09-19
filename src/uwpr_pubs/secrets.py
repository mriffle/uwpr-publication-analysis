"""Keeping API keys out of everything the pipeline writes (docs/03-retrieval-pipeline.md §7).

One place does the stripping, and logging, the cache, recordings and the run report all call it.
Two layers, because either alone can leak: query parameters known to carry keys are redacted by
name, and the key values themselves are redacted wherever they appear.
"""

import os
from collections.abc import Iterable, Mapping
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

SECRET_PARAMS = frozenset({"api_key", "apikey", "api-key", "token", "access_token"})
SECRET_ENV_VARS = ("OPEN_ALEX_API_KEY", "NCBI_API_KEY")
REDACTED = "REDACTED"


def secret_values(env: Mapping[str, str] | None = None) -> list[str]:
    """The key values currently in the environment, longest first so overlaps redact fully."""
    source = os.environ if env is None else env
    values = [value.strip() for name in SECRET_ENV_VARS if (value := source.get(name, ""))]
    return sorted({v for v in values if v}, key=len, reverse=True)


def strip_params(params: Mapping[str, str]) -> dict[str, str]:
    return {k: (REDACTED if k.lower() in SECRET_PARAMS else v) for k, v in params.items()}


def strip_url(url: str) -> str:
    """Redact secret query parameters, keeping the rest of the URL readable."""
    parts = urlsplit(url)
    if not parts.query:
        return url
    pairs = [
        (key, REDACTED if key.lower() in SECRET_PARAMS else value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
    ]
    return urlunsplit(parts._replace(query=urlencode(pairs)))


def scrub(text: str, extra: Iterable[str] = (), env: Mapping[str, str] | None = None) -> str:
    """Redact secret parameters and any literal key value appearing in the text."""
    cleaned = strip_url(text) if "?" in text else text
    for value in [*secret_values(env), *[e for e in extra if e]]:
        cleaned = cleaned.replace(value, REDACTED)
    return cleaned


def scrub_bytes(data: bytes, env: Mapping[str, str] | None = None) -> bytes:
    for value in secret_values(env):
        data = data.replace(value.encode("utf-8"), REDACTED.encode("utf-8"))
    return data
