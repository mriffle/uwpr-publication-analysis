"""The content-addressed download cache (docs/02-data-model.md §12).

Bodies live in `blobs/ab/cd/<sha256>`; `index.jsonl` records the request, its URL with secrets
stripped, the status, the time, the content type and the hash. The cache only ever makes a run
faster: a run on an empty cache must produce the same store (docs/03 §1).

`tests/recordings/` uses the same format, which is what `replay` mode reads.
"""

import hashlib
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from urllib.parse import urlencode

from uwpr_pubs.secrets import strip_params, strip_url
from uwpr_pubs.store.io import write_bytes_atomic, write_text_atomic


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def request_key(url: str, params: dict[str, str] | None = None) -> str:
    """A stable key for one request, with secrets removed so keys never reach disk."""
    safe_url = strip_url(url)
    query = urlencode(sorted(strip_params(params or {}).items()))
    return sha256_hex(f"{safe_url}\n{query}".encode())


@dataclass(frozen=True)
class Fetched:
    """One response, as handed to a cache."""

    url: str
    params: dict[str, str]
    status: int
    content_type: str
    body: bytes
    retrieved: str


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


class Cache:
    """An append-only index plus content-addressed blobs."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.index_path = root / "index.jsonl"
        self._records: dict[str, CacheRecord] = {}
        if self.index_path.exists():
            for line in self.index_path.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    record = CacheRecord(**json.loads(line))
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
        )
        self._records[key] = record
        line = json.dumps(asdict(record), sort_keys=True, ensure_ascii=False) + "\n"
        existing = self.index_path.read_text(encoding="utf-8") if self.index_path.exists() else ""
        write_text_atomic(self.index_path, existing + line)
        return record

    def cache_ref(self, key: str) -> str | None:
        """The `sha256:…` reference the store uses (docs/02 §12)."""
        record = self._records.get(key)
        return f"sha256:{record.sha256}" if record else None
