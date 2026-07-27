from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol
from urllib.request import Request, urlopen


@dataclass(frozen=True)
class HttpPayload:
    url: str
    status_code: int
    content_type: str
    body: bytes


class HttpFetcher(Protocol):
    def fetch(self, url: str, timeout_seconds: float) -> HttpPayload:
        ...


class UrllibHttpFetcher:
    def __init__(self, user_agent: str = "KAIOS-Autonomous-MVP/1.0") -> None:
        self.user_agent = user_agent

    def fetch(self, url: str, timeout_seconds: float) -> HttpPayload:
        request = Request(
            url,
            headers={
                "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
                "User-Agent": self.user_agent,
            },
        )
        with urlopen(request, timeout=timeout_seconds) as response:
            status_code = int(getattr(response, "status", 200))
            if status_code < 200 or status_code >= 300:
                raise RuntimeError(f"RSS request returned HTTP {status_code}.")
            content_type = response.headers.get("Content-Type", "")
            body = response.read()
        if not body:
            raise RuntimeError("RSS request returned an empty response.")
        return HttpPayload(url=url, status_code=status_code, content_type=content_type, body=body)