from __future__ import annotations

import sqlite3

import pytest

from app.recovery.backup import (
    create_sqlite_backup,
    restore_sqlite_backup,
    verify_sqlite_backup,
)


def create_database(path) -> None:
    with sqlite3.connect(path) as connection:
        connection.execute(
            "CREATE TABLE runtime_runs "
            "(id INTEGER PRIMARY KEY, status TEXT)"
        )
        connection.execute(
            "INSERT INTO runtime_runs(status) "
            "VALUES ('published')"
        )
        connection.commit()


def test_backup_and_restore_round_trip(
    tmp_path,
) -> None:
    source = tmp_path / "source.db"
    backup = tmp_path / "backup.db"
    restored = tmp_path / "restored.db"

    create_database(source)
    manifest = create_sqlite_backup(
        source,
        backup,
    )

    assert manifest.integrity == "ok"
    assert verify_sqlite_backup(
        backup
    ).sha256 == manifest.sha256

    restore_sqlite_backup(
        backup,
        restored,
    )

    with sqlite3.connect(restored) as connection:
        row = connection.execute(
            "SELECT status FROM runtime_runs"
        ).fetchone()

    assert row == ("published",)


def test_tampered_backup_is_rejected(
    tmp_path,
) -> None:
    source = tmp_path / "source.db"
    backup = tmp_path / "backup.db"

    create_database(source)
    create_sqlite_backup(
        source,
        backup,
    )

    with backup.open("ab") as handle:
        handle.write(b"tamper")

    with pytest.raises(ValueError):
        verify_sqlite_backup(backup)