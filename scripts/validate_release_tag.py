from __future__ import annotations

import argparse
import subprocess

from app.release_certification.versioning import (
    read_version,
    validate_tag,
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--tag",
        default=None,
    )
    args = parser.parse_args()

    version = read_version()
    tag = args.tag

    if tag is None:
        completed = subprocess.run(
            [
                "git",
                "describe",
                "--tags",
                "--exact-match",
            ],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        tag = completed.stdout.strip()

    validate_tag(version, tag)
    print(
        f"Release tag validated: {tag}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())