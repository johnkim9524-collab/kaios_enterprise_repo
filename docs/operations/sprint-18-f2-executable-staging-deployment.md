# Sprint 18-F2 — Executable Staging Deployment

## Objective

Turn the dual release-candidate package into an executable staging bundle with deterministic environment validation, ordered migrations, authenticated smoke tests, and a rollback rehearsal.

## Safety boundary

- Staging only.
- Publication flags remain disabled.
- Production promotion remains unauthorized.
- Kidults Production database and runtime are unchanged.
- Artfund Production readiness is not claimed.

## Execution order

```text
validate environment
-> create isolated staging databases
-> verify backup destination
-> apply migrations 0001 through 0009
-> run integrity checks
-> start read-only APIs and portals
-> run authenticated smoke matrix
-> verify failure isolation
-> create backup
-> rehearse restore
-> compare checksums
-> verify immutable audit history
-> issue executable-bundle result
```

## Environment validation

Required values:

- `KAIOS_ENVIRONMENT=staging`
- separate Kidults, Artfund, and governance database URLs
- staging secrets present
- report, alert, and index publication disabled
- Production promotion unauthorized
- confidence threshold at least 70
- approved rights, methodology, evidence, and freshness required
- disputed Artfund provenance blocked

## Migration rules

- Apply only declared migrations.
- Reject destructive migrations.
- Require a checksum for every migration.
- Reject duplicate migration identifiers.
- Record applied order and checksum.
- Run integrity checks after the final migration.

## Authenticated smoke rules

- Unauthenticated premium API access returns `401`.
- Viewer read access returns `200` for eligible snapshots.
- Viewer export returns `403`.
- Operator or Admin export requires a governed ready snapshot.
- Unknown rights, draft methodology, low confidence, missing evidence, expired freshness, and disputed provenance remain blocked.

## Rollback rehearsal

1. Create a staging backup and checksum.
2. Apply an isolated reversible test change.
3. Restore the backup into a clean staging database.
4. Run database integrity checks.
5. Compare original and restored checksums.
6. Verify immutable publication, incident, and rollback history remains queryable.
7. Record the rehearsal result.

## Pass criteria

The bundle passes only when environment validation, migration planning, all smoke cases, failure isolation, backup verification, restore integrity, checksum comparison, and immutable-audit preservation pass.
