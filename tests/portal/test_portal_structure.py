from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PORTAL_ROOT = ROOT / "public/portal"


def test_portal_files_exist() -> None:
    required_files = [
        PORTAL_ROOT / "index.html",
        PORTAL_ROOT / "assets/portal.css",
        PORTAL_ROOT / "assets/portal.js",
    ]

    for path in required_files:
        assert path.is_file(), (
            f"Missing portal file: {path}"
        )


def test_portal_has_mobile_viewport() -> None:
    html = (
        PORTAL_ROOT
        / "index.html"
    ).read_text(
        encoding="utf-8-sig"
    )

    assert 'name="viewport"' in html
    assert "width=device-width" in html
    assert "viewport-fit=cover" in html


def test_portal_uses_gateway_endpoints() -> None:
    script = (
        PORTAL_ROOT
        / "assets/portal.js"
    ).read_text(
        encoding="utf-8-sig"
    )

    required_endpoints = [
        "/api/health",
        "/api/status",
        "/api/edition",
        "/api/collector?mode=fixture",
        "/api/runtime?mode=fixture",
    ]

    for endpoint in required_endpoints:
        assert endpoint in script


def test_portal_has_responsive_guards() -> None:
    css = (
        PORTAL_ROOT
        / "assets/portal.css"
    ).read_text(
        encoding="utf-8-sig"
    )

    assert "overflow-x: hidden" in css
    assert "@media (max-width: 760px)" in css
    assert "@media (max-width: 430px)" in css
    assert "min-height: 44px" in css