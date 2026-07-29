# Sprint 18-F5 — Actual Dual Staging Execution

## Objective

Execute the dual release candidate in an isolated staging environment, collect runtime evidence, and produce the final Week 6 certification result.

## Scope

- Create isolated governance, Kidults, and Artfund staging databases.
- Apply only deterministic non-destructive migrations.
- Verify database integrity.
- Run authenticated and unauthenticated API probes.
- Verify Viewer export denial.
- Verify Kidults and Artfund portal runtime at 320 px.
- Rehearse backup and restore for all three databases.
- Verify failure isolation and safe publication defaults.
- Generate the final machine-readable Week 6 certification.

## Server Prerequisites

- Linux host with Bash, Python 3, SQLite 3, curl, sha256sum, and Git.
- A dedicated staging directory separate from Kidults Production.
- Staging-only API endpoints.
- Staging Viewer and Operator tokens stored outside Git.
- Publication and production promotion disabled.

## Required Environment File

Create `infrastructure/staging/.env.dual-staging` from the example and set only staging values.

Required controls:

```text
KAIOS_ENVIRONMENT=staging
KAIOS_PRODUCTION_PROMOTION_AUTHORIZED=false
KAIOS_REPORT_PUBLISHING_ENABLED=false
KAIOS_ALERT_DELIVERY_ENABLED=false
KAIOS_INDEX_PUBLISHING_ENABLED=false
```

Never commit tokens or secrets.

## Execution Order

```bash
chmod +x scripts/staging/execute-dual-staging-runtime.sh
chmod +x scripts/staging/verify-dual-staging-runtime.sh
chmod +x scripts/staging/finalize-week6-certification.py

scripts/staging/execute-dual-staging-runtime.sh
scripts/staging/verify-dual-staging-runtime.sh
python3 scripts/staging/finalize-week6-certification.py
```

## PASS Criteria

- All three staging databases pass `PRAGMA integrity_check`.
- Unauthenticated premium endpoints return 401.
- Authenticated Viewer snapshots return 200.
- Viewer exports return 403.
- Kidults and Artfund mobile portal probes return 200 at 320 px.
- Backup and restore checksums match for all databases.
- Failure isolation is true for both verticals.
- Publication remains disabled.
- Production promotion remains unauthorized.
- Final certification is `pass`.

## Fail-Closed Rules

Any missing evidence, failed probe, checksum mismatch, production reference, destructive migration, enabled publication, or authorized production promotion blocks certification.

## Important Limitation

This package prepares and validates actual staging execution. The final PASS claim is valid only after the scripts are executed on the staging host and `artifacts/staging-evidence/week-6-final-certification.json` reports `certification: pass`.
