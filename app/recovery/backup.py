from __future__ import annotations

import hashlib
import json
import shutil
import sqlite3
from contextlib import closing
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path


@dataclass(frozen=True, slots=True)
class BackupManifest:
    version: int
    created_at: str
    source_path: str
    backup_path: str
    sha256: str
    size_bytes: int
    integrity: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as handle:
        for chunk in iter(
            lambda: handle.read(1024 * 1024),
            b"",
        ):
            digest.update(chunk)

    return digest.hexdigest()


def sqlite_integrity(path: Path) -> str:
    if not path.is_file():
        raise FileNotFoundError(path)

    with closing(sqlite3.connect(path)) as connection:
        row = connection.execute(
            "PRAGMA integrity_check"
        ).fetchone()

    result = str(row[0]) if row else "unknown"

    if result.lower() != "ok":
        raise ValueError(
            f"SQLite integrity check failed: {result}"
        )

    return result


def create_sqlite_backup(
    source_path: Path,
    backup_path: Path,
) -> BackupManifest:
    if not source_path.is_file():
        raise FileNotFoundError(source_path)

    backup_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with closing(
        sqlite3.connect(source_path)
    ) as source:
        with closing(
            sqlite3.connect(backup_path)
        ) as destination:
            source.backup(destination)
            destination.commit()

    integrity = sqlite_integrity(backup_path)

    manifest = BackupManifest(
        version=1,
        created_at=datetime.now(UTC).isoformat(),
        source_path=str(source_path),
        backup_path=str(backup_path),
        sha256=sha256_file(backup_path),
        size_bytes=backup_path.stat().st_size,
        integrity=integrity,
    )

    manifest_path = backup_path.with_suffix(
        backup_path.suffix + ".manifest.json"
    )
    manifest_path.write_text(
        json.dumps(
            manifest.to_dict(),
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    return manifest


def load_manifest(
    backup_path: Path,
) -> BackupManifest:
    manifest_path = backup_path.with_suffix(
        backup_path.suffix + ".manifest.json"
    )

    payload = json.loads(
        manifest_path.read_text(
            encoding="utf-8"
        )
    )

    return BackupManifest(**payload)


def verify_sqlite_backup(
    backup_path: Path,
) -> BackupManifest:
    manifest = load_manifest(backup_path)

    if sha256_file(backup_path) != manifest.sha256:
        raise ValueError(
            "Backup checksum verification failed."
        )

    if backup_path.stat().st_size != manifest.size_bytes:
        raise ValueError(
            "Backup size verification failed."
        )

    sqlite_integrity(backup_path)

    return manifest


def restore_sqlite_backup(
    backup_path: Path,
    target_path: Path,
) -> BackupManifest:
    manifest = verify_sqlite_backup(
        backup_path
    )

    target_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    temporary_path = target_path.with_suffix(
        target_path.suffix + ".restore.tmp"
    )

    if temporary_path.exists():
        temporary_path.unlink()

    shutil.copy2(
        backup_path,
        temporary_path,
    )

    sqlite_integrity(temporary_path)

    if target_path.exists():
        target_path.unlink()

    temporary_path.replace(target_path)
    sqlite_integrity(target_path)

    return manifest