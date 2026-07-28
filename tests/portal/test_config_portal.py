from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]


def test_portal_contains_configuration_health_contract() -> None:
    html = (ROOT / "public" / "portal" / "index.html").read_text(encoding="utf-8")
    assert 'id="configuration-health"' in html
    assert 'id="config-health-status"' in html
    assert "/portal/assets/config.css" in html
    assert "/portal/assets/config.js" in html


def test_configuration_assets_are_responsive() -> None:
    css = (ROOT / "public" / "portal" / "assets" / "config.css").read_text(encoding="utf-8")
    javascript = (ROOT / "public" / "portal" / "assets" / "config.js").read_text(encoding="utf-8")
    assert "@media (max-width:760px)" in css
    assert "@media (max-width:480px)" in css
    assert 'fetch("/api/config/status"' in javascript