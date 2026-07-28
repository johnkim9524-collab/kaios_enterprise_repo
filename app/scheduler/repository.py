from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from app.persistence.database import SQLiteDatabase
from app.utils.time import now_iso

LOCK_NAME = "kaios-runtime"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


class SchedulerRepository:
    def __init__(self, database: SQLiteDatabase | None = None, database_path: str | Path | None = None) -> None:
        self.database = database if database is not None else SQLiteDatabase(database_path)
        self.database.migrate()

    def acquire_lock(self, owner_id: str, ttl_seconds: int, now: datetime | None = None) -> bool:
        timestamp = now or utc_now()
        acquired_at = timestamp.isoformat()
        expires_at = (timestamp + timedelta(seconds=ttl_seconds)).isoformat()
        with self.database.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT owner_id, expires_at FROM runtime_locks WHERE lock_name = ?",
                (LOCK_NAME,),
            ).fetchone()
            if row is not None:
                current_expiry = parse_timestamp(row["expires_at"])
                if current_expiry > timestamp and row["owner_id"] != owner_id:
                    connection.rollback()
                    return False
            connection.execute(
                """
                INSERT INTO runtime_locks (lock_name, owner_id, acquired_at, heartbeat_at, expires_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(lock_name) DO UPDATE SET
                    owner_id = excluded.owner_id,
                    acquired_at = excluded.acquired_at,
                    heartbeat_at = excluded.heartbeat_at,
                    expires_at = excluded.expires_at
                """,
                (LOCK_NAME, owner_id, acquired_at, acquired_at, expires_at),
            )
            connection.commit()
        return True

    def heartbeat(self, owner_id: str, ttl_seconds: int) -> bool:
        timestamp = utc_now()
        with self.database.connect() as connection:
            cursor = connection.execute(
                "UPDATE runtime_locks SET heartbeat_at = ?, expires_at = ? WHERE lock_name = ? AND owner_id = ?",
                (timestamp.isoformat(), (timestamp + timedelta(seconds=ttl_seconds)).isoformat(), LOCK_NAME, owner_id),
            )
            connection.commit()
        return cursor.rowcount == 1

    def release_lock(self, owner_id: str) -> bool:
        with self.database.connect() as connection:
            cursor = connection.execute(
                "DELETE FROM runtime_locks WHERE lock_name = ? AND owner_id = ?",
                (LOCK_NAME, owner_id),
            )
            connection.commit()
        return cursor.rowcount == 1

    def get_lock(self) -> dict[str, Any] | None:
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT lock_name, owner_id, acquired_at, heartbeat_at, expires_at FROM runtime_locks WHERE lock_name = ?",
                (LOCK_NAME,),
            ).fetchone()
        if row is None:
            return None
        result = dict(row)
        result["stale"] = parse_timestamp(result["expires_at"]) <= utc_now()
        return result

    def update_state(self, scheduler_id: str, enabled: bool, interval_seconds: int, runtime_mode: str, **values: Any) -> None:
        timestamp = now_iso()
        with self.database.connect() as connection:
            connection.execute(
                """
                INSERT INTO scheduler_state (
                    scheduler_id, enabled, interval_seconds, runtime_mode,
                    last_tick_at, last_run_id, last_run_status,
                    last_run_started_at, last_run_completed_at,
                    next_run_at, last_error, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(scheduler_id) DO UPDATE SET
                    enabled = excluded.enabled,
                    interval_seconds = excluded.interval_seconds,
                    runtime_mode = excluded.runtime_mode,
                    last_tick_at = COALESCE(excluded.last_tick_at, scheduler_state.last_tick_at),
                    last_run_id = COALESCE(excluded.last_run_id, scheduler_state.last_run_id),
                    last_run_status = COALESCE(excluded.last_run_status, scheduler_state.last_run_status),
                    last_run_started_at = COALESCE(excluded.last_run_started_at, scheduler_state.last_run_started_at),
                    last_run_completed_at = COALESCE(excluded.last_run_completed_at, scheduler_state.last_run_completed_at),
                    next_run_at = excluded.next_run_at,
                    last_error = excluded.last_error,
                    updated_at = excluded.updated_at
                """,
                (
                    scheduler_id, 1 if enabled else 0, interval_seconds, runtime_mode,
                    values.get("last_tick_at"), values.get("last_run_id"), values.get("last_run_status"),
                    values.get("last_run_started_at"), values.get("last_run_completed_at"),
                    values.get("next_run_at"), values.get("last_error"), timestamp,
                ),
            )
            connection.commit()

    def get_state(self, scheduler_id: str) -> dict[str, Any] | None:
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT * FROM scheduler_state WHERE scheduler_id = ?",
                (scheduler_id,),
            ).fetchone()
        if row is None:
            return None
        result = dict(row)
        result["enabled"] = bool(result["enabled"])
        return result