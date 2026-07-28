from __future__ import annotations

import argparse
import subprocess


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--commit",
        required=True,
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
    )
    args = parser.parse_args()

    subprocess.run(
        [
            "git",
            "cat-file",
            "-e",
            f"{args.commit}^{{commit}}",
        ],
        check=True,
    )

    print(
        "Rollback target validated: "
        f"{args.commit}"
    )

    if args.dry_run:
        print(
            "Dry run only. No repository state changed."
        )
        return 0

    raise SystemExit(
        "Operational rollback must be performed "
        "through a reviewed revert pull request."
    )


if __name__ == "__main__":
    raise SystemExit(main())