from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

from app.release_certification.certification import (
    certify_release,
    require_certified,
    write_certification,
)
from app.release_certification.versioning import (
    read_version,
)


def command_ok(
    command: list[str],
) -> bool:
    return (
        subprocess.run(
            command,
            check=False,
        ).returncode
        == 0
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--smoke-base-url",
        required=True,
    )
    parser.add_argument(
        "--output",
        default=(
            "release/"
            "production-certification.json"
        ),
    )
    args = parser.parse_args()

    version = read_version()

    tests_passed = command_ok(
        [
            "python",
            "-m",
            "pytest",
            "-q",
        ]
    )
    docker_valid = command_ok(
        [
            "docker",
            "compose",
            "config",
        ]
    )
    smoke_passed = command_ok(
        [
            "python",
            "-m",
            "scripts.production_smoke",
            "--base-url",
            args.smoke_base_url,
        ]
    )
    rollback_certified = command_ok(
        [
            "python",
            "-m",
            "scripts.rollback_release",
            "--commit",
            "HEAD",
            "--dry-run",
        ]
    )

    result = certify_release(
        version=version,
        tests_passed=tests_passed,
        docker_compose_valid=docker_valid,
        smoke_test_passed=smoke_passed,
        rollback_certified=rollback_certified,
    )

    write_certification(
        Path(args.output),
        result,
    )
    require_certified(result)

    print(
        "Production release certified: "
        f"{version.tag}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())