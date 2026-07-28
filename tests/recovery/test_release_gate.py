from __future__ import annotations

import pytest

from app.recovery.release import (
    ReleaseManifest,
    release_gate,
)


def manifest(**overrides) -> ReleaseManifest:
    values = {
        "version": 1,
        "created_at": "2026-01-01T00:00:00+00:00",
        "commit_sha": "abc123",
        "branch": "main",
        "tests_passed": True,
        "working_tree_clean": True,
        "docker_compose_valid": True,
    }
    values.update(overrides)
    return ReleaseManifest(**values)


def test_release_gate_passes() -> None:
    release_gate(manifest())


def test_release_gate_blocks_failed_tests() -> None:
    with pytest.raises(RuntimeError):
        release_gate(
            manifest(
                tests_passed=False
            )
        )


def test_release_gate_blocks_dirty_tree() -> None:
    with pytest.raises(RuntimeError):
        release_gate(
            manifest(
                working_tree_clean=False
            )
        )