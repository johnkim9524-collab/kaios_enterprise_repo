from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.recovery.backup import (
    restore_sqlite_backup,
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--backup",
        required=True,
    )
    parser.add_argument(
        "--target",
        default="data/kaios.db",
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
    )
    args = parser.parse_args()

    if not args.confirm:
        parser.error(
            "--confirm is required for restore."
        )

    manifest = restore_sqlite_backup(
        Path(args.backup),
        Path(args.target),
    )

    print(
        json.dumps(
            manifest.to_dict(),
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())