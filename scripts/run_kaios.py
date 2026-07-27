from __future__ import annotations

import json
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


from app.agent import KAIOSAgent
from app.core.modes import RuntimeMode


def main() -> int:
    mode = RuntimeMode.parse(
        os.getenv(
            "KAIOS_RUNTIME_MODE",
            RuntimeMode.FIXTURE.value,
        )
    )

    trigger_type = os.getenv(
        "KAIOS_TRIGGER_TYPE",
        "manual",
    ).strip().lower()

    result = KAIOSAgent(
        mode=mode
    ).run(
        trigger_type=trigger_type
    )

    print(
        json.dumps(
            result,
            ensure_ascii=False,
            indent=2,
        )
    )

    return 0 if result["published"] else 1


if __name__ == "__main__":
    raise SystemExit(main())