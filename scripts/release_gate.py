from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

from app.recovery.release import (
    build_release_manifest,
    release_gate,
    write_release_manifest,
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
        "--manifest",
        default="release/release-manifest.json",
    )
    args = parser.parse_args()

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

    manifest = build_release_manifest(
        tests_passed=tests_passed,
        docker_compose_valid=docker_valid,
    )
    write_release_manifest(
        Path(args.manifest),
        manifest,
    )
    release_gate(manifest)

    print("Release gate passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())