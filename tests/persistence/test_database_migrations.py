from __future__ import annotations

from app.persistence.database import (
    SQLiteDatabase,
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

    assert row["count"] == 1