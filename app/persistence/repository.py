from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any

from app.core.contracts import StageRecord
from app.core.modes import RuntimeMode
from app.persistence.database import SQLiteDatabase
from app.utils.time import now_iso


class RunHistoryRepository:
    def __init__(
        self,
        database: SQLiteDatabase | None = None,
        database_path: str | Path | None = None,
    ) -> None:
        self.database = (
            database
            if database is not None
            else SQLiteDatabase(database_path)
        )

        self.database.migrate()

    def start_run(
        self,
        mode: RuntimeMode,
        trigger_type: str = "manual",
        run_id: str | None = None,
        started_at: str | None = None,
    ) -> str:
        resolved_run_id = (
            run_id
            if run_id is not None
            else str(uuid.uuid4())
        )

        timestamp = started_at or now_iso()

        with self.database.connect() as connection:
            connection.execute(
                """
                INSERT INTO runtime_runs (
                    run_id,
                    trigger_type,
                    runtime_mode,
                    status,
                    published,
                    started_at,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    resolved_run_id,
                    trigger_type,
                    mode.value,
                    "running",
                    0,
                    timestamp,
                    timestamp,
                ),
            )

            connection.commit()

        return resolved_run_id

    def record_stage(
        self,
        run_id: str,
        sequence_number: int,
        stage: StageRecord,
    ) -> None:
        with self.database.connect() as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO stage_executions (
                    run_id,
                    sequence_number,
                    stage_name,
                    status,
                    detail,
                    recorded_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    sequence_number,
                    stage.name,
                    stage.status,
                    stage.detail,
                    now_iso(),
                ),
            )

            connection.commit()

    def record_sources(
        self,
        run_id: str,
        sources: list[dict[str, Any]],
    ) -> None:
        if not sources:
            return

        rows = [
            (
                run_id,
                str(source["source_id"]),
                str(source["source_name"]),
                str(source["source_type"]),
                str(source["status"]),
                int(source["attempts"]),
                int(source.get("signal_count", 0)),
                source.get("error"),
                now_iso(),
            )
            for source in sources
        ]

        with self.database.connect() as connection:
            connection.executemany(
                """
                INSERT INTO source_executions (
                    run_id,
                    source_id,
                    source_name,
                    source_type,
                    status,
                    attempts,
                    signal_count,
                    error,
                    recorded_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows,
            )

            connection.commit()

    def record_publication(
        self,
        run_id: str,
        edition: str,
    ) -> None:
        with self.database.connect() as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO publications (
                    run_id,
                    edition,
                    published_at
                )
                VALUES (?, ?, ?)
                """,
                (
                    run_id,
                    edition,
                    now_iso(),
                ),
            )

            connection.commit()

    def complete_run(
        self,
        run_id: str,
        status: str,
        published: bool,
        edition: str | None,
        duration_ms: int,
        error: dict[str, Any] | None = None,
    ) -> None:
        resolved_error = error or {}

        with self.database.connect() as connection:
            connection.execute(
                """
                UPDATE runtime_runs
                SET
                    status = ?,
                    published = ?,
                    edition = ?,
                    completed_at = ?,
                    duration_ms = ?,
                    error_type = ?,
                    error_stage = ?,
                    error_message = ?
                WHERE run_id = ?
                """,
                (
                    status,
                    1 if published else 0,
                    edition,
                    now_iso(),
                    duration_ms,
                    resolved_error.get("type"),
                    resolved_error.get("stage"),
                    resolved_error.get("message"),
                    run_id,
                ),
            )

            connection.commit()

    def count_runs(self) -> int:
        with self.database.connect() as connection:
            row = connection.execute(
                """
                SELECT COUNT(*) AS count
                FROM runtime_runs
                """
            ).fetchone()

        return int(row["count"])

    def list_runs(
        self,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        resolved_limit = max(
            1,
            min(int(limit), 100),
        )

        with self.database.connect() as connection:
            rows = connection.execute(
                """
                SELECT
                    run_id,
                    trigger_type,
                    runtime_mode,
                    status,
                    published,
                    edition,
                    started_at,
                    completed_at,
                    duration_ms,
                    error_type,
                    error_stage,
                    error_message
                FROM runtime_runs
                ORDER BY started_at DESC
                LIMIT ?
                """,
                (resolved_limit,),
            ).fetchall()

        return [
            self._run_row(row)
            for row in rows
        ]

    def get_run(
        self,
        run_id: str,
    ) -> dict[str, Any] | None:
        with self.database.connect() as connection:
            run_row = connection.execute(
                """
                SELECT
                    run_id,
                    trigger_type,
                    runtime_mode,
                    status,
                    published,
                    edition,
                    started_at,
                    completed_at,
                    duration_ms,
                    error_type,
                    error_stage,
                    error_message
                FROM runtime_runs
                WHERE run_id = ?
                """,
                (run_id,),
            ).fetchone()

            if run_row is None:
                return None

            stage_rows = connection.execute(
                """
                SELECT
                    sequence_number,
                    stage_name,
                    status,
                    detail,
                    recorded_at
                FROM stage_executions
                WHERE run_id = ?
                ORDER BY sequence_number ASC
                """,
                (run_id,),
            ).fetchall()

            source_rows = connection.execute(
                """
                SELECT
                    source_id,
                    source_name,
                    source_type,
                    status,
                    attempts,
                    signal_count,
                    error,
                    recorded_at
                FROM source_executions
                WHERE run_id = ?
                ORDER BY id ASC
                """,
                (run_id,),
            ).fetchall()

            publication_row = connection.execute(
                """
                SELECT
                    edition,
                    published_at
                FROM publications
                WHERE run_id = ?
                """,
                (run_id,),
            ).fetchone()

        result = self._run_row(run_row)

        result["stages"] = [
            dict(row)
            for row in stage_rows
        ]
        result["sources"] = [
            dict(row)
            for row in source_rows
        ]
        result["publication"] = (
            dict(publication_row)
            if publication_row is not None
            else None
        )

        return result

    @staticmethod
    def _run_row(row) -> dict[str, Any]:
        error = None

        if (
            row["error_type"]
            or row["error_stage"]
            or row["error_message"]
        ):
            error = {
                "type": row["error_type"],
                "stage": row["error_stage"],
                "message": row["error_message"],
            }

        return {
            "run_id": row["run_id"],
            "trigger_type": row["trigger_type"],
            "mode": row["runtime_mode"],
            "status": row["status"],
            "published": bool(row["published"]),
            "edition": row["edition"],
            "started_at": row["started_at"],
            "completed_at": row["completed_at"],
            "duration_ms": row["duration_ms"],
            "error": error,
        }