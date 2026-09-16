# Backup and Restore

Recovery operations are governed by the [KIDULTS Platform Constitution](../../CONSTITUTION.md). These procedures must preserve deterministic recovery, independent validation, append-only evidence, explicit authority, and fail-closed outcomes; uncertainty is `HOLD`, never `PASS`.

## Backup

Use the SQLite online backup API through:

```powershell
python -m scripts.backup_runtime `
  --database data/kaios.db `
  --output backups/kaios.db
```

The backup creates:

- the SQLite backup file
- a JSON manifest
- SHA-256 checksum
- size metadata
- integrity status

## Restore

Restores require explicit confirmation:

```powershell
python -m scripts.restore_runtime `
  --backup backups/kaios.db `
  --target data/kaios.db `
  --confirm
```

The restore verifies the checksum, file size, and SQLite integrity before
replacing the target database.
