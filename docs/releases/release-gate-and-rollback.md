# Release Gate and Rollback

## Release Gate

The release gate requires:

- full test suite success
- clean Git working tree
- valid Docker Compose configuration

Run:

```powershell
python -m scripts.release_gate
```

A release manifest is written under `release/`.

## Rollback

Rollback targets must be valid commits. Use dry-run validation first:

```powershell
python -m scripts.rollback_release `
  --commit <commit-sha> `
  --dry-run
```

Production rollback must use a reviewed revert pull request. Direct reset
or force-push rollback is prohibited.