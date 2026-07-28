from __future__ import annotations

import json
import sys

from app.scheduler.service import SchedulerService


def main() -> int:
    service = SchedulerService()
    if "--once" in sys.argv:
        print(json.dumps(service.run_once(), indent=2, ensure_ascii=False))
        return 0
    if not service.config.enabled:
        print("KAIOS Scheduler disabled. Set KAIOS_SCHEDULER_ENABLED=true to start.")
        return 0
    print("KAIOS Autonomous Scheduler starting")
    service.run_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())