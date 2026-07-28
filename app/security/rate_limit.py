from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from threading import Lock
from time import monotonic


@dataclass(frozen=True, slots=True)
class RateLimitResult:
    allowed: bool
    limit: int
    remaining: int
    retry_after_seconds: int


class InMemoryRateLimiter:
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