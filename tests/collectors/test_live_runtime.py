from __future__ import annotations

from app.collectors.adapters import RSSLiveSourceAdapter
from app.collectors.live_http import HttpPayload
from app.collectors.registry import AdapterRegistry
from app.collectors.runtime import CollectorRuntime
from app.core.modes import RuntimeMode

RSS_BODY = b"""<?xml version="1.0"?><rss version="2.0"><channel><title>News</title><item><guid>one</guid><title>Bandai figure demand rises</title><link>https://example.test/one</link><description>Bandai collector interest.</description></item></channel></rss>"""


class SuccessfulFetcher:
    def fetch(self, url: str, timeout_seconds: float) -> HttpPayload:
        return HttpPayload(url=url, status_code=200, content_type="application/rss+xml", body=RSS_BODY)


class FailingAdapter:
    def __init__(self) -> None:
        self.calls = 0
    def collect(self, context):
        self.calls += 1
        raise RuntimeError("temporary feed failure")


def test_live_runtime_uses_only_live_enabled_sources() -> None:
    registry = AdapterRegistry(RuntimeMode.LIVE)
    registry.register_source("live-rss", RSSLiveSourceAdapter(fetcher=SuccessfulFetcher()))
    report = CollectorRuntime(mode=RuntimeMode.LIVE, registry=registry, max_attempts=2).collect(
        sources=[
            {"id":"live-rss","name":"Live RSS","type":"official","adapter":"rss","enabled":True,"live_enabled":True,"url":"https://example.test/rss"},
            {"id":"placeholder","name":"Placeholder","type":"community","enabled":True,"live_enabled":False,"url":"https://example.com"},
        ],
        brands=[{"id":"bandai","name":"Bandai","category":"Figures","region":"Global"}],
    )
    payload = report.to_dict()
    assert payload["status"] == "operational"
    assert payload["source_count"] == 1
    assert payload["successful_source_count"] == 1
    assert payload["failed_source_count"] == 0
    assert payload["sources"][0]["status"] == "passed"
    assert payload["sources"][0]["payload_hash"]
    assert payload["signals"][0]["mode"] == "live"


def test_live_runtime_retries_failed_source() -> None:
    registry = AdapterRegistry(RuntimeMode.LIVE)
    adapter = FailingAdapter()
    registry.register_source("failing", adapter)
    report = CollectorRuntime(mode=RuntimeMode.LIVE, registry=registry, max_attempts=3).collect(
        sources=[{"id":"failing","name":"Failing Source","type":"official","enabled":True,"live_enabled":True,"url":"https://example.test/rss"}],
        brands=[],
    )
    payload = report.to_dict()
    assert adapter.calls == 3
    assert payload["status"] == "failed"
    assert payload["failed_source_count"] == 1
    assert payload["sources"][0]["attempts"] == 3
    assert payload["sources"][0]["error"] == "temporary feed failure"