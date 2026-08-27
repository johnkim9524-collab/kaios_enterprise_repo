from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path
import sqlite3
from threading import Lock
from time import monotonic, sleep, time


@dataclass(frozen=True, slots=True)
class RateLimitResult:
    allowed: bool
    limit: int
    remaining: int
    retry_after_seconds: int


class InMemoryRateLimiter:
    """Process-local limiter retained for isolated unit tests only."""

    def __init__(
        self,
        limit: int,
        window_seconds: int,
    ) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(
        self,
        key: str,
    ) -> RateLimitResult:
        now = monotonic()
        cutoff = now - self.window_seconds

        with self._lock:
            events = self._events[key]

            while events and events[0] <= cutoff:
                events.popleft()

            if len(events) >= self.limit:
                retry_after = max(
                    1,
                    int(
                        self.window_seconds
                        - (now - events[0])
                    ),
                )

                return RateLimitResult(
                    allowed=False,
                    limit=self.limit,
                    remaining=0,
                    retry_after_seconds=retry_after,
                )

            events.append(now)

            return RateLimitResult(
                allowed=True,
                limit=self.limit,
                remaining=max(
                    0,
                    self.limit - len(events),
                ),
                retry_after_seconds=0,
            )


class DurableRateLimiter:
    """SQLite-backed limiter whose decisions survive process restarts.

    Each check is serialized with ``BEGIN IMMEDIATE`` so concurrent worker
    processes sharing the same database cannot independently spend the same
    remaining request slot. WAL mode is established during schema bootstrap,
    not on every connection, avoiding a journal-mode lock race during
    concurrent construction. The database contains only opaque rate-limit
    keys and timestamps; no bearer-token material is persisted.
    """

    _INITIALIZE_ATTEMPTS = 20
    _INITIALIZE_RETRY_SECONDS = 0.05

    def __init__(
        self,
        limit: int,
        window_seconds: int,
        path: Path | str,
    ) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            self.path,
            timeout=30.0,
            isolation_level=None,
        )
        connection.execute("PRAGMA busy_timeout=30000")
        connection.execute("PRAGMA synchronous=FULL")
        return connection

    def _initialize(self) -> None:
        last_error: sqlite3.OperationalError | None = None
        for attempt in range(self._INITIALIZE_ATTEMPTS):
            connection = self._connect()
            try:
                # journal_mode is persistent database metadata. Configure it
                # only at bootstrap; normal request connections must not
                # renegotiate journal mode under contention.
                connection.execute("PRAGMA journal_mode=WAL")
                connection.execute("BEGIN IMMEDIATE")
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS rate_limit_events (
                        key TEXT NOT NULL,
                        occurred_at REAL NOT NULL
                    )
                    """
                )
                connection.execute(
                    """
                    CREATE INDEX IF NOT EXISTS rate_limit_events_key_time_idx
                    ON rate_limit_events (key, occurred_at)
                    """
                )
                connection.execute("COMMIT")
                return
            except sqlite3.OperationalError as error:
                if connection.in_transaction:
                    connection.execute("ROLLBACK")
                if "locked" not in str(error).lower():
                    raise
                last_error = error
            finally:
                connection.close()
            if attempt + 1 < self._INITIALIZE_ATTEMPTS:
                sleep(self._INITIALIZE_RETRY_SECONDS)
        assert last_error is not None
        raise last_error

    def check(self, key: str) -> RateLimitResult:
        now = time()
        cutoff = now - self.window_seconds
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "DELETE FROM rate_limit_events WHERE occurred_at <= ?",
                (cutoff,),
            )
            rows = connection.execute(
                """
                SELECT occurred_at
                FROM rate_limit_events
                WHERE key = ?
                ORDER BY occurred_at ASC
                """,
                (key,),
            ).fetchall()

            if len(rows) >= self.limit:
                retry_after = max(
                    1,
                    int(self.window_seconds - (now - float(rows[0][0]))),
                )
                connection.execute("COMMIT")
                return RateLimitResult(
                    allowed=False,
                    limit=self.limit,
                    remaining=0,
                    retry_after_seconds=retry_after,
                )

            connection.execute(
                "INSERT INTO rate_limit_events (key, occurred_at) VALUES (?, ?)",
                (key, now),
            )
            used = len(rows) + 1
            connection.execute("COMMIT")
            return RateLimitResult(
                allowed=True,
                limit=self.limit,
                remaining=max(0, self.limit - used),
                retry_after_seconds=0,
            )
        except Exception:
            if connection.in_transaction:
                connection.execute("ROLLBACK")
            raise
        finally:
            connection.close()
