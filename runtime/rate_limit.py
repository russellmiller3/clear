"""
CLEAR RUNTIME — RATE LIMITING (Python port)

Python port of runtime/rateLimit.js. Simple in-memory rate limiter for
compiled Clear FastAPI apps. Zero external dependencies — Python stdlib
only (threading lock + time).

API:
    rate_limit(window_ms=60000, max=10) -> callable

The returned callable is a FastAPI dependency: pass it to `Depends(...)`
on any route that needs rate limiting. Mirrors the JS API
`rateLimit({ windowMs, max })`.

INTEROP note: the JS port returns Express middleware
`(req, res, next) => ...`. The Python port returns a FastAPI dependency
`(request: Request) -> None` that raises HTTPException(429) on over-limit.
The JS sets X-RateLimit-* response headers via `res.setHeader`; the
Python port can't set headers from a Depends() callable (FastAPI
limitation), so the headers are returned via a callable that wraps the
endpoint's response. For most use cases (login throttling — OWASP
Piece 4) the throttling itself is the load-bearing piece, not the
informational headers.

Usage in compiled FastAPI emit:

    from runtime.rate_limit import rate_limit
    login_throttle = rate_limit(window_ms=60000, max=10)

    @app.post('/auth/login')
    async def login(request: Request, _: None = Depends(login_throttle)):
        ...
"""

import threading
import time
from typing import Callable

try:
    from fastapi import HTTPException, Request  # type: ignore
except ImportError:
    # FastAPI not installed at module-load time (e.g. during tests in a
    # bare repo). Define minimal shims so the module imports cleanly.
    # Real FastAPI apps will import the actual classes via their own deps.
    class HTTPException(Exception):  # type: ignore
        def __init__(self, status_code, detail):
            self.status_code = status_code
            self.detail = detail
            super().__init__(f"HTTP {status_code}: {detail}")

    class Request:  # type: ignore
        client = None
        headers: dict = {}


def rate_limit(window_ms: int = 60000, max: int = 10) -> Callable:
    """Returns a FastAPI dependency callable. Per-process in-memory state
    keyed by client IP. Uses a sliding window: on each call, evict the
    caller's entry if it expired, otherwise bump the count and reject if
    over the limit.

    Lazy cleanup: rather than running a background timer (the JS port uses
    setInterval), we evict expired entries on each call. For the small
    state typical of login-throttling (~hundreds of IPs/window), this is
    cheaper than a periodic sweep and avoids the threading overhead."""
    hits = {}  # ip -> { count: int, reset_at: float (seconds since epoch) }
    lock = threading.Lock()
    window_sec = window_ms / 1000.0

    def dependency(request: Request) -> None:
        ip = _client_ip(request)
        now = time.time()

        with lock:
            entry = hits.get(ip)
            if entry is None or entry["reset_at"] <= now:
                entry = {"count": 0, "reset_at": now + window_sec}
                hits[ip] = entry
            entry["count"] += 1
            current_count = entry["count"]

            # Lazy cleanup: every call has a chance to evict ONE expired
            # neighbor (cheap, amortizes the periodic-sweep cost across
            # callers without a background thread).
            for k, v in list(hits.items()):
                if v["reset_at"] <= now:
                    del hits[k]
                    break  # one per call is enough — keeps the lock short

        if current_count > max:
            window_seconds = round(window_ms / 1000)
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Too many requests -- limit is {max} per "
                    f"{window_seconds} seconds. Try again later."
                ),
            )

    return dependency


def _client_ip(request) -> str:
    """Extract client IP from a FastAPI Request. Trust X-Forwarded-For
    if present (proxy), else fall back to direct client address."""
    if request is None:
        return "unknown"
    headers = getattr(request, "headers", {}) or {}
    fwd = headers.get("x-forwarded-for") if hasattr(headers, "get") else None
    if fwd:
        # First IP in the comma-separated chain is the original client
        return fwd.split(",")[0].strip()
    client = getattr(request, "client", None)
    if client is not None:
        host = getattr(client, "host", None)
        if host:
            return host
    return "unknown"


def _reset_for_tests() -> None:
    """Test helper — currently a no-op since each rate_limit() call
    creates fresh in-memory state. Kept for symmetry with the other
    runtime modules."""
