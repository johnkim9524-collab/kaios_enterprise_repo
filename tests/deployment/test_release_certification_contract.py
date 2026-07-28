from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_version_file_exists() -> None:
    assert (
        ROOT / "VERSION"
    ).read_text(
        encoding="utf-8"
    ).strip() == "0.9.0"


def test_release_workflow_exists() -> None:
    assert (
        ROOT
        / ".github"
        / "workflows"
        / "production-release.yml"
    ).is_file()


def test_release_scripts_exist() -> None:
    required = [
        "scripts/generate_release_notes.py",
        "scripts/validate_release_tag.py",
        "scripts/production_smoke.py",
        "scripts/certify_production_release.py",
    ]

    for relative in required:
        assert (ROOT / relative).is_file()