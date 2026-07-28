from __future__ import annotations

import pytest

from app.release_certification.certification import (
    CertificationResult,
    require_certified,
)


def result(**overrides) -> CertificationResult:
    values = {
        "schema_version": 1,
        "certified_at": (
            "2026-01-01T00:00:00+00:00"
        ),
        "release_version": "0.9.0",
        "release_tag": "v0.9.0",
        "commit_sha": "abc123",
        "branch": "main",
        "tests_passed": True,
        "docker_compose_valid": True,
        "smoke_test_passed": True,
        "rollback_certified": True,
        "working_tree_clean": True,
        "artifact_retention_days": 90,
        "certified": True,
    }
    values.update(overrides)
    return CertificationResult(**values)


def test_certified_release_passes() -> None:
    require_certified(result())


def test_failed_release_is_blocked() -> None:
    with pytest.raises(RuntimeError):
        require_certified(
            result(
                smoke_test_passed=False,
                certified=False,
            )
        )