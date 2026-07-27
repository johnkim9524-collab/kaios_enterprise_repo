from __future__ import annotations

from app.collectors.adapters import RSSLiveSourceAdapter
from app.collectors.contracts import AdapterContext
from app.collectors.live_http import HttpPayload
from app.core.modes import RuntimeMode


RSS_BODY = b"""<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Kidult News</title>
    <item>
      <guid>entry-one</guid>
      <title>LEGO collector demand expands</title>
      <link>https://example.test/lego</link>
      <description>LEGO collector evidence.</description>
    </item>
  </channel>
</rss>
"""


class FakeFetcher:
    def fetch(
        self,
        url: str,
        timeout_seconds: float,
    ) -> HttpPayload:
        return HttpPayload(
            url=url,
            status_code=200,
            content_type="application/rss+xml",
            body=RSS_BODY,
        )


def test_live_adapter_meets_minimum_brand_coverage() -> None:
    signals = RSSLiveSourceAdapter(
        fetcher=FakeFetcher()
    ).collect(
        AdapterContext(
            mode=RuntimeMode.LIVE,
            source={
                "id": "official_rss",
                "name": "Official RSS",
                "type": "official",
                "weight": 0.3,
                "url": "https://example.test/rss",
                "timeout_seconds": 3,
                "max_entries": 10,
            },
            brands=[
                {
                    "id": "lego",
                    "name": "LEGO",
                    "category": "Construction",
                    "region": "Global",
                },
                {
                    "id": "pokemon",
                    "name": "The Pokemon Company",
                    "category": "Characters",
                    "region": "Global",
                },
                {
                    "id": "bandai",
                    "name": "Bandai",
                    "category": "Figures",
                    "region": "Global",
                },
            ],
        )
    )

    brand_ids = {
        signal["brand_id"]
        for signal in signals
    }

    assert len(brand_ids) >= 3
    assert min(
        signal["confidence"]
        for signal in signals
    ) >= 82
    assert all(
        signal["source_url"]
        for signal in signals
    )
    assert all(
        signal["payload_hash"]
        for signal in signals
    )