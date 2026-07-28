from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_recovery_scripts_exist() -> None:
    required = [
        "scripts/backup_runtime.py",
        "scripts/restore_runtime.py",
        "scripts/release_gate.py",
        "scripts/rollback_release.py",
    ]

    for relative in required:
        assert (ROOT / relative).is_file()


def test_restore_requires_confirmation() -> None:
    content = (
        ROOT / "scripts" / "restore_runtime.py"
    ).read_text(encoding="utf-8")

    assert "--confirm" in content
    assert "is required for restore" in content


def test_rollback_defaults_to_reviewed_revert() -> None:
    content = (
        ROOT / "scripts" / "rollback_release.py"
    ).read_text(encoding="utf-8")

    assert "reviewed revert pull request" in content