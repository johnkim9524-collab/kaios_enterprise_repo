from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.agent import KAIOSAgent
from app.collectors.source_collector import SourceCollector
from app.config.status import configuration_status
from app.core.modes import RuntimeMode
from app.persistence.repository import RunHistoryRepository
from app.scheduler.service import SchedulerService


ROOT = Path(__file__).resolve().parents[2]


class GatewayService:
    def __init__(
        self,
        history_repository: RunHistoryRepository | None = None,
    ) -> None:
        self.history_repository = (
            history_repository
            if history_repository is not None
            else RunHistoryRepository()
        )

    def _read_json(
        self,
        relative_path: str,
    ) -> dict[str, Any]:
        path = ROOT / relative_path

        if not path.is_file():
            raise FileNotFoundError(
                f"Gateway resource not found: {relative_path}"
            )

        return json.loads(
            path.read_text(
                encoding="utf-8-sig"
            )
        )

    def health(self) -> dict[str, Any]:
        return self._read_json(
            "public/api/health.json"
        )

    def status(self) -> dict[str, Any]:
        return self._read_json(
            "public/api/status.json"
        )

    def edition(self) -> dict[str, Any]:
        return self._read_json(
            "public/monthly-data.json"
        )

    def collector(
        self,
        mode: RuntimeMode,
    ) -> dict[str, Any]:
        return SourceCollector(
            mode=mode
        ).collect()

    def runtime(
        self,
        mode: RuntimeMode,
    ) -> dict[str, Any]:
        return KAIOSAgent(
            mode=mode,
            history_repository=self.history_repository,
        ).run(
            trigger_type="api"
        )

    def runs(
        self,
        limit: int = 20,
    ) -> dict[str, Any]:
        runs = self.history_repository.list_runs(
            limit=limit
        )

        return {
            "count": len(runs),
            "limit": limit,
            "runs": runs,
        }

    def run_detail(
        self,
        run_id: str,
    ) -> dict[str, Any] | None:
        return self.history_repository.get_run(
            run_id
        )
    def scheduler_status(self) -> dict[str, Any]:
        return SchedulerService(
            history_repository=self.history_repository
        ).status()

    def config_status(self) -> dict[str, Any]:
        return configuration_status()
