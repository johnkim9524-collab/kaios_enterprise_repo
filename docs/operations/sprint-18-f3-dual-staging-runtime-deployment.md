# Sprint 18-F3 — Dual Staging Runtime Deployment

## Objective

Execute and certify the isolated Kidults, Artfund, and governance staging runtimes for the dual release candidate.

## Deployment Order

1. Validate the fail-closed staging environment.
2. Create isolated governance, Kidults, and Artfund databases.
3. Create immutable backups before migration.
4. Apply migrations in deterministic order.
5. Verify database integrity and migration checksums.
6. Start the authenticated read-only staging runtimes.
7. Run Kidults Enterprise and Artfund Institutional API smoke tests.
8. Verify desktop and mobile portal rendering at 320, 390, and 430 pixels.
9. Verify unauthenticated access returns 401 and Viewer export returns 403.
10. Rehearse backup restoration and compare checksums.
11. Confirm publication remains disabled and production promotion remains unauthorized.

## Required Evidence

- Environment validation result
- Database isolation evidence
- Migration IDs and checksums
- Integrity-check output
- Authenticated smoke results
- Portal runtime screenshots or render evidence
- Mobile overflow result
- Backup and restored database checksums
- Rollback event record
- Failure-isolation result

## Fail-Closed Conditions

Deployment certification fails when any of the following is observed:

- Environment is not staging
- Any database path references production
- Publication is enabled
- A destructive migration is detected
- Database isolation fails
- Authentication or RBAC smoke fails
- Mobile horizontal overflow is detected
- Backup and restore checksums differ
- Immutable audit history is not preserved
- A failure crosses vertical boundaries

## Restrictions

- Kidults Production remains unchanged.
- Artfund Production readiness is not claimed.
- No write API is authorized.
- No customer-facing release is authorized.
- Production promotion requires a separate decision record.
