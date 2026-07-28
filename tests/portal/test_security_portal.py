from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_portal_contains_security_login_contract() -> None:
    html = (
        ROOT / "public" / "portal" / "index.html"
    ).read_text(encoding="utf-8")

    assert 'id="security-login"' in html
    assert 'id="security-token-input"' in html
    assert "/portal/assets/security.css" in html
    assert "/portal/assets/security.js" in html


def test_security_assets_use_session_storage() -> None:
    javascript = (
        ROOT
        / "public"
        / "portal"
        / "assets"
        / "security.js"
    ).read_text(encoding="utf-8")

    assert "sessionStorage" in javascript
    assert "Authorization" in javascript
    assert "Bearer " in javascript