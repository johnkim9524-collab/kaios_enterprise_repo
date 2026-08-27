from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from app.security.rate_limit import DurableRateLimiter


def test_durable_rate_limit_survives_restart(tmp_path: Path) -> None:
    database = tmp_path / "rate-limit.sqlite3"
    first = DurableRateLimiter(limit=2, window_seconds=3600, path=database)

    assert first.check("viewer:127.0.0.1").allowed is True
    assert first.check("viewer:127.0.0.1").allowed is True

    restarted = DurableRateLimiter(limit=2, window_seconds=3600, path=database)
    denied = restarted.check("viewer:127.0.0.1")

    assert denied.allowed is False
    assert denied.remaining == 0
    assert denied.retry_after_seconds > 0


def test_durable_rate_limit_serializes_concurrent_slots(tmp_path: Path) -> None:
    database = tmp_path / "rate-limit.sqlite3"

    def consume(_: int) -> bool:
        limiter = DurableRateLimiter(limit=5, window_seconds=3600, path=database)
        return limiter.check("operator:127.0.0.1").allowed

    with ThreadPoolExecutor(max_workers=12) as pool:
        decisions = list(pool.map(consume, range(12)))

    assert sum(decisions) == 5
    assert len(decisions) - sum(decisions) == 7


def test_durable_rate_limit_isolated_by_key(tmp_path: Path) -> None:
    database = tmp_path / "rate-limit.sqlite3"
    limiter = DurableRateLimiter(limit=1, window_seconds=3600, path=database)

    assert limiter.check("viewer:10.0.0.1").allowed is True
    assert limiter.check("viewer:10.0.0.1").allowed is False
    assert limiter.check("viewer:10.0.0.2").allowed is True
