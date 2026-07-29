# Sprint 18-F4 — Staging Runtime Evidence

## Objective

Capture, verify, and preserve actual staging execution evidence for the dual release candidate.

## Required Evidence

1. Migration execution for governance, Kidults, and Artfund databases
2. Authenticated and unauthenticated API probes
3. Desktop portal runtime checks
4. Mobile 320 px runtime checks with no horizontal overflow
5. Backup and restore checksum rehearsal
6. Cross-vertical failure-isolation rehearsal

## Important Distinction

This package does not claim that staging execution has already passed. It provides the machine-readable schema, validator, capture script, and certification logic required to record actual results.

## Execution Order

1. Create isolated staging databases.
2. Run non-destructive migrations in the approved order.
3. Start staging runtimes with publication disabled.
4. Execute authenticated API probes.
5. Verify desktop and mobile portal behavior.
6. Create backups and restore into isolated rehearsal databases.
7. Compare SHA-256 checksums and integrity results.
8. Inject one vertical failure and verify the other vertical remains available.
9. Complete the evidence JSON and run certification.

## Pass Conditions

- Every required probe exists and has status `pass`.
- Environment equals `staging`.
- Production promotion remains unauthorized.
- Report, alert, and index publication remain disabled.
- Backup and restored database checksums match.
- Immutable audit history remains present.
- Kidults and Artfund failures remain isolated.

## Fail-Closed Conditions

Any `fail` or `not_run` probe keeps Week 6 staging certification blocked.

## Production Impact

None. Production promotion requires a separate decision and evidence package.
