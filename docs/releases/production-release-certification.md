# Production Release Certification

## Release Version

KAIOS uses Semantic Versioning. The repository `VERSION` file is the
single source of truth. Git tags must use the same value with a `v`
prefix.

Example:

```text
VERSION: 0.9.0
Git tag: v0.9.0
```

## Certification Requirements

A production release requires:

- full test-suite success
- valid Docker Compose configuration
- healthy production smoke test
- rollback target validation
- clean Git working tree
- release artifact retention of at least 30 days

## Local Certification

Start the runtime, then run:

```powershell
python -m scripts.certify_production_release `
  --smoke-base-url http://localhost:8000
```

## Release Tag

After the release pull request is merged:

```powershell
git switch main
git pull origin main
git tag -a v0.9.0 -m "KAIOS v0.9.0"
git push origin v0.9.0
```

Tag publication triggers the production release workflow.