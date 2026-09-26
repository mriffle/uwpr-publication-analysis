"""The content-addressed download cache (docs/02-data-model.md §12).

Bodies live in `blobs/ab/cd/<sha256>`; `index.jsonl` records the request, its URL with secrets
stripped, the status, the time, the content type and the hash. The cache only ever makes a run
faster: a run on an empty cache must produce the same store (docs/03 §1).

`tests/recordings/` uses the same format, which is what `replay` mode reads.

A POST (NIH RePORTER and USAspending take a JSON body) is keyed by its method and the hash of its
body as well, and its index line says so in two extra fields. A GET's key and its index line are
exactly what they were before POST existed, so every cache entry and recording made before it is
still found (docs/03 §7, changed 2026-09-26).
"""

import hashlib
import json
from dataclasses import asdict, dataclass, fields
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from uwpr_pubs.secrets import scrub_bytes, strip_params, strip_url
from uwpr_pubs.store.io import write_bytes_atomic, write_text_atomic


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def body_digest(body: bytes) -> str:
    """The hash of a request body, taken after any key value in it is redacted.

    Redacting first keeps a key out of the one place a body reaches disk, and keeps a recording
    made with the real key answering a replay made with a fake one.
    """
    return sha256_hex(scrub_bytes(body))


def request_key(
    url: str, params: dict[str, str] | None = None, method: str = "GET", body: bytes | None = None
) -> str:
    """A stable key for one request, with secrets removed so keys never reach disk.

    A GET without a body keeps the key it has always had. Anything else is keyed by its method and
    its body's hash too, so two POSTs to one URL with different bodies are different requests.
    """
    safe_url = strip_url(url)
    query = urlencode(sorted(strip_params(params or {}).items()))
    if method == "GET" and body is None:
        return sha256_hex(f"{safe_url}\n{query}".encode())
    return sha256_hex(f"{method}\n{safe_url}\n{query}\n{body_digest(body or b'')}".encode())


@dataclass(frozen=True)
class Fetched:
    """One response, as handed to a cache. `body` is the response; `body_sha256` the request's."""

    url: str
    params: dict[str, str]
    status: int
    content_type: str
    body: bytes
    retrieved: str
    method: str = "GET"
    body_sha256: str | None = None


# Written to an index line only when a record differs from them, so a GET's line is unchanged.
LINE_DEFAULTS: dict[str, object] = {"method": "GET", "body_sha256": None}


@dataclass(frozen=True)
class CacheRecord:
    key: str
    url: str
    params: dict[str, str]
    status: int
    retrieved: str
    content_type: str
    sha256: str
    size: int
    method: str = "GET"
    body_sha256: str | None = None  # the request body's hash, for a POST

    @classmethod
    def from_line(cls, raw: dict[str, Any]) -> "CacheRecord":
        """Tolerant of fields it does not know, so a later format's line does not stop a load."""
        known = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in raw.items() if k in known})

    def to_line(self) -> str:
        data = {k: v for k, v in asdict(self).items() if not (k in LINE_DEFAULTS and v == LINE_DEFAULTS[k])}
        return json.dumps(data, sort_keys=True, ensure_ascii=False) + "\n"


class Cache:
    """An append-only index plus content-addressed blobs."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.index_path = root / "index.jsonl"
        self._records: dict[str, CacheRecord] = {}
        if self.index_path.exists():
            for line in self.index_path.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    record = CacheRecord.from_line(json.loads(line))
                    self._records[record.key] = record

    def blob_path(self, digest: str) -> Path:
        return self.root / "blobs" / digest[:2] / digest[2:4] / digest

    def __contains__(self, key: str) -> bool:
        return key in self._records and self.blob_path(self._records[key].sha256).exists()

    def get(self, key: str) -> tuple[CacheRecord, bytes] | None:
        record = self._records.get(key)
        if record is None:
            return None
        blob = self.blob_path(record.sha256)
        if not blob.exists():
            return None
        return record, blob.read_bytes()

    def put(self, key: str, fetched: Fetched) -> CacheRecord:
        digest = sha256_hex(fetched.body)
        blob = self.blob_path(digest)
        if not blob.exists():
            write_bytes_atomic(blob, fetched.body)
        record = CacheRecord(
            key=key,
            url=strip_url(fetched.url),
            params=strip_params(fetched.params),
            status=fetched.status,
            retrieved=fetched.retrieved,
            content_type=fetched.content_type,
            sha256=digest,
            size=len(fetched.body),
            method=fetched.method,
            body_sha256=fetched.body_sha256,
        )
        self._records[key] = record
        line = record.to_line()
        existing = self.index_path.read_text(encoding="utf-8") if self.index_path.exists() else ""
        write_text_atomic(self.index_path, existing + line)
        return record

    def cache_ref(self, key: str) -> str | None:
        """The `sha256:…` reference the store uses (docs/02 §12)."""
        record = self._records.get(key)
        return f"sha256:{record.sha256}" if record else None
