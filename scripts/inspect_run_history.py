from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


from app.persistence.repository import (
    RunHistoryRepository,
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Inspect KAIOS persistent run history."
    )

    parser.add_argument(
        "--run-id",
        help="Return one complete runtime record.",
    )

    parser.add_argument(
        "--limit",
        type=int,
        default=20,
        help="Maximum number of recent runs.",
    )

    arguments = parser.parse_args()

    repository = RunHistoryRepository()

    if arguments.run_id:
        payload = repository.get_run(
            arguments.run_id
        )
    else:
        payload = repository.list_runs(
            limit=arguments.limit
        )

    print(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=2,
        )
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())