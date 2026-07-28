from __future__ import annotations

import json
import subprocess
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

from app.release_certification.versioning import (
    ReleaseVersion,
)


@dataclass(frozen=True, slots=True)
class CertificationResult:
    schema_version: int
    certified_at: str
    release_version: str
    release_tag: str
    commit_sha: str
    branch: str
    tests_passed: bool
    docker_compose_valid: bool
    smoke_test_passed: bool
    rollback_certified: bool
    working_tree_clean: bool
    artifact_retention_days: int
    certified: bool

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def git_output(*args: str) -> str:
    completed = subprocess.run(
        ["git", *args],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return completed.stdout.strip()


def certify_release(
    *,
    version: ReleaseVersion,
    tests_passed: bool,
    docker_compose_valid: bool,
    smoke_test_passed: bool,
    rollback_certified: bool,
    artifact_retention_days: int = 90,
) -> CertificationResult:
    if artifact_retention_days < 30:
        raise ValueError(
            "Release artifacts must be retained "
            "for at least 30 days."
        )

    clean = (
        git_output(
            "status",
            "--porcelain",
        )
        == ""
    )

    certified = all(
        [
            tests_passed,
            docker_compose_valid,
            smoke_test_passed,
            rollback_certified,
            clean,
        ]
    )

    return CertificationResult(
        schema_version=1,
        certified_at=datetime.now(
            UTC
        ).isoformat(),
        release_version=version.value,
        release_tag=version.tag,
        commit_sha=git_output(
            "rev-parse",
            "HEAD",
        ),
        branch=git_output(
            "branch",
            "--show-current",
        ),
        tests_passed=tests_passed,
        docker_compose_valid=(
            docker_compose_valid
        ),
        smoke_test_passed=(
            smoke_test_passed
        ),
        rollback_certified=(
            rollback_certified
        ),
        working_tree_clean=clean,
        artifact_retention_days=(
            artifact_retention_days
        ),
        certified=certified,
    )


def require_certified(
    result: CertificationResult,
) -> None:
    if not result.certified:
        failed = [
            name
            for name, passed in [
                (
                    "tests",
                    result.tests_passed,
                ),
                (
                    "docker_compose",
                    result.docker_compose_valid,
                ),
                (
                    "smoke_test",
                    result.smoke_test_passed,
                ),
                (
                    "rollback",
                    result.rollback_certified,
                ),
                (
                    "working_tree",
                    result.working_tree_clean,
                ),
            ]
            if not passed
        ]
        raise RuntimeError(
            "Production certification failed: "
            + ", ".join(failed)
        )


def write_certification(
    path: Path,
    result: CertificationResult,
) -> None:
    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )
    path.write_text(
        json.dumps(
            result.to_dict(),
            indent=2,
        ),
        encoding="utf-8",
    )