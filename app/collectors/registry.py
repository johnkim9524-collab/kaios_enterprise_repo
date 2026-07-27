from __future__ import annotations

from app.collectors.adapters import FallbackSourceAdapter, FixtureSourceAdapter, LiveSourceAdapter, RSSLiveSourceAdapter, SourceAdapter
from app.core.modes import RuntimeMode


class AdapterRegistry:
    def __init__(self, mode: RuntimeMode) -> None:
        self.mode = mode
        self._source_overrides: dict[str, SourceAdapter] = {}
        self._mode_adapters: dict[RuntimeMode, SourceAdapter] = {
            RuntimeMode.FIXTURE: FixtureSourceAdapter(),
            RuntimeMode.FALLBACK: FallbackSourceAdapter(),
            RuntimeMode.LIVE: LiveSourceAdapter(),
        }
        self._live_adapters: dict[str, SourceAdapter] = {
            "rss": RSSLiveSourceAdapter(),
            "atom": RSSLiveSourceAdapter(),
        }

    def register_source(self, source_id: str, adapter: SourceAdapter) -> None:
        self._source_overrides[source_id] = adapter

    def resolve(self, source: dict) -> SourceAdapter:
        source_id = str(source["id"])
        if source_id in self._source_overrides:
            return self._source_overrides[source_id]
        if self.mode is RuntimeMode.LIVE:
            adapter_name = str(source.get("adapter", "")).strip().lower()
            if adapter_name in self._live_adapters:
                return self._live_adapters[adapter_name]
        return self._mode_adapters[self.mode]