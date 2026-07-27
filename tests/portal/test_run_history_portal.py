from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PORTAL_ROOT = ROOT / "public" / "portal"
ASSETS_ROOT = PORTAL_ROOT / "assets"


def read_portal_file(
    relative_path: str,
) -> str:
    return (
        PORTAL_ROOT / relative_path
    ).read_text(
        encoding="utf-8-sig"
    )


def test_portal_contains_run_history_structure() -> None:
    content = read_portal_file(
        "index.html"
    )

    required_ids = {
        'id="runHistoryCount"',
        'id="refreshRunsButton"',
        'id="recentRuns"',
        'id="runDetail"',
    }

    for required_id in required_ids:
        assert required_id in content


def test_portal_contains_run_history_headings() -> None:
    content = read_portal_file(
        "index.html"
    )

    assert "Run History" in content
    assert "Recent Runs" in content
    assert "Run Detail" in content
    assert "PERSISTENT OPERATIONS" in content


def test_portal_loads_run_history_assets() -> None:
    content = read_portal_file(
        "index.html"
    )

    assert (
        "/portal/assets/run-history.css"
        in content
    )

    assert (
        "/portal/assets/run-history.js"
        in content
    )


def test_run_history_assets_exist() -> None:
    assert (
        ASSETS_ROOT / "run-history.css"
    ).is_file()

    assert (
        ASSETS_ROOT / "run-history.js"
    ).is_file()


def test_run_history_javascript_uses_api_routes() -> None:
    content = read_portal_file(
        "assets/run-history.js"
    )

    assert '"/api/runs?limit=20"' in content
    assert "/api/runs/" in content
    assert "encodeURIComponent(runId)" in content


def test_run_history_javascript_renders_all_sections() -> None:
    content = read_portal_file(
        "assets/run-history.js"
    )

    required_text = {
        "Run Summary",
        "Stage Timeline",
        "Source Executions",
        "Publication",
        "No publication was recorded",
    }

    for value in required_text:
        assert value in content


def test_run_history_javascript_handles_errors() -> None:
    content = read_portal_file(
        "assets/run-history.js"
    )

    assert "run.error" in content
    assert "run-error" in content
    assert "Run history request failed" in content


def test_portal_runtime_dispatches_history_refresh_event() -> None:
    content = read_portal_file(
        "assets/portal.js"
    )

    pattern = re.compile(
        r'new\s+CustomEvent\s*\(\s*'
        r'"kaios:runtime-complete"',
        re.MULTILINE,
    )

    assert pattern.search(content)
    assert "window.dispatchEvent(" in content


def test_run_history_listens_for_runtime_event() -> None:
    content = read_portal_file(
        "assets/run-history.js"
    )

    assert (
        '"kaios:runtime-complete"'
        in content
    )

    assert "loadRuns" in content


def test_run_history_css_is_mobile_responsive() -> None:
    content = read_portal_file(
        "assets/run-history.css"
    )

    assert (
        "@media (max-width: 900px)"
        in content
    )

    assert (
        "@media (max-width: 560px)"
        in content
    )

    assert (
        "grid-template-columns: 1fr"
        in content
    )


def test_run_history_css_prevents_content_overflow() -> None:
    content = read_portal_file(
        "assets/run-history.css"
    )

    assert "min-width: 0" in content
    assert "overflow-wrap: anywhere" in content


def test_run_cards_are_real_buttons() -> None:
    content = read_portal_file(
        "assets/run-history.js"
    )

    assert (
        'document.createElement("button")'
        in content
    )

    assert (
        'button.type = "button"'
        in content
    )