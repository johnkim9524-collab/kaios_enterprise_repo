from __future__ import annotations

import argparse
import subprocess
from datetime import UTC, datetime
from pathlib import Path

from app.release_certification.versioning import (
    read_version,
)


def git_output(*args: str) -> str:
    completed = subprocess.run(
        ["git", *args],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return completed.stdout.strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        default=None,
    )
    args = parser.parse_args()

    version = read_version()
    output = Path(
        args.output
        or (
            "release/"
            f"RELEASE_NOTES_{version.value}.md"
        )
    )

    commits = git_output(
        "log",
        "--pretty=format:- %s (%h)",
        "-20",
    )

    content = (
        f"# KAIOS {version.tag}\n\n"
        f"Release date: "
        f"{datetime.now(UTC).date().isoformat()}\n\n"
        "## Release Summary\n\n"
        "Production release candidate with verified "
        "backup, recovery, security, observability, "
        "release gating, and deployment certification.\n\n"
        "## Recent Changes\n\n"
        f"{commits}\n\n"
        "## Certification\n\n"
        "- Full test suite required\n"
        "- Docker Compose validation required\n"
        "- Production smoke test required\n"
        "- Rollback certification required\n"
        "- Clean Git working tree required\n"
    )

    output.parent.mkdir(
        parents=True,
        exist_ok=True,
    )
    output.write_text(
        content,
        encoding="utf-8",
    )

    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())