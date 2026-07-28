from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_portal_contains_observability_contract() -> None:
    html = (
        ROOT / "public" / "portal" / "index.html"
    ).read_text(encoding="utf-8")

    assert 'id="observability-status"' in html
    assert "/portal/assets/observability.css" in html
    assert "/portal/assets/observability.js" in html