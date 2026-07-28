from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.recovery.backup import (
    create_sqlite_backup,
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database",
        default="data/kaios.db",
    )
    parser.add_argument(
        "--output",
        required=True,
    )
    args = parser.parse_args()

    manifest = create_sqlite_backup(
        Path(args.database),
        Path(args.output),
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