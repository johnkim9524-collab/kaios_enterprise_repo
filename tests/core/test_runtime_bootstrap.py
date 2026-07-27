from __future__ import annotations

from app.agent import KAIOSAgent
from app.collectors.source_collector import SourceCollector
from app.core.errors import LiveModeUnavailableError
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


def test_live_collection_fails_without_adapters() -> None:
    collector = SourceCollector(RuntimeMode.LIVE)

    try:
        collector.collect()
    except LiveModeUnavailableError:
        pass
    else:
        raise AssertionError(
            "Live mode must fail until verified adapters exist."
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