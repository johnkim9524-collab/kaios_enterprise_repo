from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from typing import Any


class SecurityAuditLogger:
    def __init__(
        self,
        path: Path,
    ) -> None:
        self.path = path
        self._lock = Lock()

    def record(
        self,
        *,
        event: str,
        identity: str,
        path: str,
        client_ip: str,
        outcome: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        entry = {
            "timestamp": datetime.now(UTC).isoformat(),
            "event": event,
            "identity": identity,
            "path": path,
            "client_ip": client_ip,
            "outcome": outcome,
            "details": details or {},
        }

        self.path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        line = json.dumps(
            entry,
            ensure_ascii=False,
            separators=(",", ":"),
        )

        with self._lock:
            with self.path.open(
                "a",
                encoding="utf-8",
            ) as handle:
                handle.write(line + "\n")