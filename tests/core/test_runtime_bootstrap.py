from __future__ import annotations

from app.agent import KAIOSAgent
from app.collectors.adapters import RSSLiveSourceAdapter
from app.collectors.registry import AdapterRegistry
from app.collectors.source_collector import SourceCollector
from app.core.modes import RuntimeMode


def test_fixture_collection_is_deterministic() -> None:
    first = SourceCollector(RuntimeMode.FIXTURE).collect()
    second = SourceCollector(RuntimeMode.FIXTURE).collect()

    assert first == second
    assert first["mode"] == "fixture"
    assert all(
        signal["mode"] == "fixture"
        for signal in first["signals"]
    )


def test_fallback_collection_is_explicit() -> None:
    result = SourceCollector(RuntimeMode.FALLBACK).collect()

    assert result["mode"] == "fallback"
    assert all(
        signal["mode"] == "fallback"
        for signal in result["signals"]
    )


def test_live_collection_has_verified_adapter() -> None:
    collector = SourceCollector(RuntimeMode.LIVE)
    live_sources = [
        source
        for source in collector.sources
        if source.get("enabled")
        and source.get("live_enabled")
    ]

    assert live_sources
    assert all(
        source.get("adapter") in {"rss", "atom"}
        for source in live_sources
    )
    assert all(
        isinstance(
            AdapterRegistry(
                RuntimeMode.LIVE
            ).resolve(source),
            RSSLiveSourceAdapter,
        )
        for source in live_sources
    )


def test_agent_returns_canonical_runtime_contract() -> None:
    result = KAIOSAgent(RuntimeMode.FIXTURE).run()

    assert result["published"] is True
    assert result["mode"] == "fixture"
    assert result["error"] is None

    stage_names = [
        stage["name"]
        for stage in result["stages"]
    ]

    assert stage_names == [
        "collector",
        "normalizer",
        "score_engine",
        "intelligence_writer",
        "quality_gate",
        "publisher",
        "health_monitor",
    ]
