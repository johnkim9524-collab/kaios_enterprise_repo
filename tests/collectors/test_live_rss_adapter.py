from __future__ import annotations

import hashlib
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from app.collectors.adapters import RSSLiveSourceAdapter
from app.collectors.contracts import AdapterContext
from app.collectors.live_http import HttpPayload
from app.core.modes import RuntimeMode

RSS_BODY = b"""<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Kidult News</title><item><guid>entry-one</guid><title>LEGO collector set gains demand</title><link>https://example.test/lego</link><description>LEGO secondary-market interest rises.</description></item><item><guid>entry-one</guid><title>LEGO collector set gains demand</title><link>https://example.test/lego</link><description>Duplicate entry.</description></item><item><guid>entry-two</guid><title>POP MART Labubu release expands</title><link>https://example.test/popmart</link><description>POP MART expands a collectible release.</description></item></channel></rss>"""


class FakeFetcher:
    def __init__(self) -> None:
        self.calls = 0
    def fetch(self, url: str, timeout_seconds: float) -> HttpPayload:
        self.calls += 1
        assert timeout_seconds == 4
        assert url == "https://feed.example.test/rss"
        return HttpPayload(url=url, status_code=200, content_type="application/rss+xml", body=RSS_BODY)


def test_live_rss_adapter_collects_evidence() -> None:
    fetcher = FakeFetcher()
    adapter = RSSLiveSourceAdapter(fetcher=fetcher)
    signals = adapter.collect(AdapterContext(
        mode=RuntimeMode.LIVE,
        source={"id":"official_rss","name":"Official RSS","type":"official","weight":0.3,"url":"https://feed.example.test/rss","timeout_seconds":4,"max_entries":10},
        brands=[
            {"id":"lego","name":"LEGO","category":"Construction","region":"Global"},
            {"id":"popmart","name":"POP MART","category":"Designer Toys","region":"Global"},
        ],
    ))
    assert fetcher.calls == 1
    assert len(signals) == 2
    assert {signal["brand_id"] for signal in signals} == {"lego", "popmart"}
    assert signals[0]["payload_hash"] == hashlib.sha256(RSS_BODY).hexdigest()
    assert signals[0]["source_url"] == "https://feed.example.test/rss"
    assert signals[0]["duplicate_count"] == 1
    assert signals[0]["mode"] == "live"
    assert signals[0]["evidence_url"]


def test_live_rss_adapter_rejects_empty_url(monkeypatch) -> None:
    monkeypatch.delenv("KAIOS_LIVE_RSS_URL", raising=False)
    adapter = RSSLiveSourceAdapter(fetcher=FakeFetcher())
    try:
        adapter.collect(AdapterContext(mode=RuntimeMode.LIVE, source={"id":"official_rss","name":"Official RSS","type":"official","url":""}, brands=[]))
    except RuntimeError as exc:
        assert "URL is not configured" in str(exc)
    else:
        raise AssertionError("Expected a missing URL failure.")


def test_configured_rss_query_keeps_tracked_brands_independent() -> None:
    root = Path(__file__).resolve().parents[2]
    sources = json.loads(
        (root / "config" / "sources.json").read_text(encoding="utf-8-sig")
    )["sources"]
    rss_source = next(source for source in sources if source["id"] == "official_rss")
    query = parse_qs(urlparse(rss_source["url"]).query)["q"][0]
    assert " OR " in query
    for brand in ("LEGO", "Pokemon", "Pop Mart", "Bandai", "Medicom", "Hot Toys"):
        assert brand in query
