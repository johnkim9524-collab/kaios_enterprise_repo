from __future__ import annotations

import os
import sqlite3
from pathlib import Path

from app.utils.time import now_iso


ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_ROOT = Path(__file__).resolve().parent / "migrations"


def default_database_path() -> Path:
    configured = os.getenv(
        "KAIOS_DATABASE_PATH",
        "data/kaios.db",
    ).strip()

    path = Path(configured)

    if path.is_absolute():
        return path

    return ROOT / path


class SQLiteDatabase:
    def __init__(
        self,
        path: str | Path | None = None,
    ) -> None:
        self.path = Path(
            path
            if path is not None
            else default_database_path()
        )

    def connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        connection = sqlite3.connect(
            self.path,
            timeout=10,
        )

        connection.row_factory = sqlite3.Row

        connection.execute(
            "PRAGMA foreign_keys = ON"
        )
        connection.execute(
            "PRAGMA busy_timeout = 10000"
        )
        connection.execute(
            "PRAGMA journal_mode = WAL"
        )

        return connection

    def migrate(self) -> None:
        migration_files = sorted(
            MIGRATIONS_ROOT.glob("*.sql")
        )

        with self.connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version TEXT PRIMARY KEY,
                    applied_at TEXT NOT NULL
                )
                """
            )

            applied_versions = {
                row["version"]
                for row in connection.execute(
                    "SELECT version FROM schema_migrations"
                ).fetchall()
            }

            for migration_file in migration_files:
                version = migration_file.stem

                if version in applied_versions:
                    continue

                sql = migration_file.read_text(
                    encoding="utf-8-sig"
                )

                connection.executescript(sql)

                connection.execute(
                    """
                    INSERT INTO schema_migrations (
                        version,
                        applied_at
                    )
                    VALUES (?, ?)
                    """,
                    (
                        version,
                        now_iso(),
                    ),
                )

            connection.commit()