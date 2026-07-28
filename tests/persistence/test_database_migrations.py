from __future__ import annotations

from pathlib import Path

from app.persistence.database import (
    MIGRATIONS_ROOT,
    SQLiteDatabase,
)


def migration_count() -> int:
    return len(
        list(
            Path(
                MIGRATIONS_ROOT
            ).glob("*.sql")
        )
    )


def test_migration_creates_required_tables(
    tmp_path,
) -> None:
    database = SQLiteDatabase(
        tmp_path / "kaios-test.db"
    )

    database.migrate()

    with database.connect() as connection:
        rows = connection.execute(
            """
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
            """
        ).fetchall()

    tables = {
        row["name"]
        for row in rows
    }

    required_tables = {
        "schema_migrations",
        "runtime_runs",
        "stage_executions",
        "source_executions",
        "publications",
        "scheduler_state",
        "runtime_locks",
    }

    assert required_tables.issubset(
        tables
    )


def test_migration_is_idempotent(
    tmp_path,
) -> None:
    database = SQLiteDatabase(
        tmp_path / "kaios-test.db"
    )

    database.migrate()
    database.migrate()

    with database.connect() as connection:
        row = connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM schema_migrations
            """
        ).fetchone()

    assert (
        row["count"]
        == migration_count()
    )


def test_each_migration_is_recorded_once(
    tmp_path,
) -> None:
    database = SQLiteDatabase(
        tmp_path / "kaios-test.db"
    )

    database.migrate()
    database.migrate()

    with database.connect() as connection:
        rows = connection.execute(
            """
            SELECT version, COUNT(*) AS count
            FROM schema_migrations
            GROUP BY version
            ORDER BY version
            """
        ).fetchall()

    assert rows

    assert all(
        row["count"] == 1
        for row in rows
    )

    assert len(rows) == migration_count()