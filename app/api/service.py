from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.agent import KAIOSAgent
from app.collectors.source_collector import SourceCollector
from app.core.modes import RuntimeMode


ROOT = Path(__file__).resolve().parents[2]


class GatewayService:
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
            mode=mode
        ).run()