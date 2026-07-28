from __future__ import annotations

import json
import subprocess
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path


@dataclass(frozen=True, slots=True)
class ReleaseManifest:
    version: int
    created_at: str
    commit_sha: str
    branch: str
    tests_passed: bool
    working_tree_clean: bool
    docker_compose_valid: bool

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def _git(*args: str) -> str:
    completed = subprocess.run(
        ["git", *args],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return completed.stdout.strip()


def build_release_manifest(
    *,
    tests_passed: bool,
    docker_compose_valid: bool,
) -> ReleaseManifest:
    return ReleaseManifest(
        version=1,
        created_at=datetime.now(UTC).isoformat(),
        commit_sha=_git("rev-parse", "HEAD"),
        branch=_git(
            "branch",
            "--show-current",
        ),
        tests_passed=tests_passed,
        working_tree_clean=(
            _git("status", "--porcelain") == ""
        ),
        docker_compose_valid=(
            docker_compose_valid
        ),
    )


def write_release_manifest(
    path: Path,
    manifest: ReleaseManifest,
) -> None:
    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )
    path.write_text(
        json.dumps(
            manifest.to_dict(),
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def release_gate(
    manifest: ReleaseManifest,
) -> None:
    failures = []

    if not manifest.tests_passed:
        failures.append("tests")
    if not manifest.working_tree_clean:
        failures.append("working_tree")
    if not manifest.docker_compose_valid:
        failures.append("docker_compose")

    if failures:
        raise RuntimeError(
            "Release gate failed: "
            + ", ".join(failures)
        )