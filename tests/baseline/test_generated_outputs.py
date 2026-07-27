from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def read_json(path: Path) -> dict:
    return json.loads(
        path.read_text(encoding="utf-8-sig")
    )


def test_intelligence_output_contains_canonical_fields() -> None:
    output_path = ROOT / "public/monthly-data.json"

    assert output_path.is_file()

    payload = read_json(output_path)

    required_fields = {
        "edition",
        "generated_at",
        "platform",
        "system",
        "kidult_100_index",
        "collector_sentiment",
        "confidence_engine",
        "top_50_brands",
        "industry_map",
        "geography",
    }

    assert required_fields.issubset(payload.keys())
    assert payload["platform"] == "KIDULTS"


def test_health_output_contains_canonical_fields() -> None:
    output_path = ROOT / "public/api/health.json"

    assert output_path.is_file()

    payload = read_json(output_path)

    required_fields = {
        "checked_at",
        "status",
        "checks",
    }

    assert required_fields.issubset(payload.keys())
    assert payload["status"] in {
        "operational",
        "degraded",
        "failed",
    }
    assert isinstance(payload["checks"], list)


def test_fallback_signals_are_explicit() -> None:
    raw_path = ROOT / "data/raw/latest_signals.json"

    if not raw_path.exists():
        return

    payload = read_json(raw_path)

    for signal in payload.get("signals", []):
        assert "mode" in signal
        assert signal["mode"] in {
            "fixture",
            "fallback",
            "live",
        }