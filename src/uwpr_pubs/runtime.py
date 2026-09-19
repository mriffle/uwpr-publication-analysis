"""Building the HTTP client from configuration (docs/03-retrieval-pipeline.md §7).

The impure edge: this is where the environment's API keys, the real clock and the network are
picked up. Everything downstream takes the client as an argument.
"""

import os
from pathlib import Path

from uwpr_pubs.cache import Cache
from uwpr_pubs.config import Config
from uwpr_pubs.http import Budget, HttpClient, HttpxTransport, Mode, RateLimiter
from uwpr_pubs.schemas import project_root

USER_AGENT_PREFIX = "uwpr-pubs"


def load_dotenv() -> None:
    """For local runs: read `.env` without overwriting anything already set. CI uses secrets."""
    try:
        path = project_root() / ".env"
    except FileNotFoundError:
        return
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, _, value = stripped.partition("=")
        os.environ.setdefault(name.strip(), value.strip().strip("\"'"))


def api_keys() -> tuple[str | None, str | None]:
    """The OpenAlex key, and the optional NCBI key that raises its rate limit."""
    load_dotenv()
    return os.environ.get("OPEN_ALEX_API_KEY") or None, os.environ.get("NCBI_API_KEY") or None


def build_client(
    config: Config,
    *,
    mode: Mode = Mode.LIVE,
    cache_root: Path | None = None,
    recordings_root: Path | None = None,
    version: str = "0.1.0",
) -> HttpClient:
    root = project_root()
    settings = config.settings
    openalex = settings["openalex"]
    recordings = Cache(recordings_root) if recordings_root else None
    if mode is Mode.REPLAY and recordings is None:
        recordings = Cache(root / "tests" / "recordings")
    return HttpClient(
        contact=config.contact,
        user_agent=f"{USER_AGENT_PREFIX}/{version}",
        mode=mode,
        cache=Cache(cache_root or root / "cache"),
        recordings=recordings,
        budget=Budget(
            max_run_usd=float(openalex["max_run_usd"]),
            min_remaining_usd=float(openalex["min_remaining_usd"]),
        ),
        rate_limiter=RateLimiter(settings["rate_limits"]),
        transport=HttpxTransport(),
        max_attempts=int(settings["max_attempts"]),
    )
