# Sprint 19-A1 — Kidults Production Promotion Gate

## Objective

Decide whether the certified Kidults staging release candidate is eligible for a controlled production promotion without affecting Artfund or weakening governance controls.

## Required Evidence

- Final Week 6 staging certification is PASS.
- Kidults production stability evidence is current.
- Production and staging environment differences are documented.
- Database migration impact is non-destructive.
- Backup and rollback rehearsal evidence is current.
- Authenticated and unauthenticated production smoke plans are defined.
- Desktop and 320 px mobile portal acceptance criteria are explicit.
- Publication, alert delivery, and index publishing remain separately gated.

## Decision Outcomes

- `go`: all mandatory gates pass and rollback is verified.
- `hold`: one or more recoverable readiness gaps remain.
- `rollback`: production change has been attempted and a critical gate fails.

## Mandatory Gates

1. Runtime health and stability.
2. Authentication and RBAC.
3. Database integrity and migration safety.
4. Backup and restore readiness.
5. Portal desktop and mobile quality.
6. Rights, methodology, confidence, evidence, and freshness controls.
7. Production observability and incident response.
8. Explicit executive promotion authorization.

## Safe Defaults

- Production promotion is unauthorized until the final decision record says `go`.
- Report publishing remains disabled.
- Alert delivery remains disabled.
- Index publishing remains disabled.
- Artfund production promotion remains unauthorized.

## Execution Order

1. Inventory the current Kidults production runtime.
2. Compare production and certified staging configurations.
3. Review the 30-day stability evidence.
4. Verify backup, restore, and rollback procedures.
5. Run a read-only production smoke rehearsal.
6. Score the promotion gate.
7. Record `go`, `hold`, or `rollback`.

## Acceptance Criteria

- No production secret is committed.
- No destructive migration is permitted.
- Production and staging databases remain separate.
- Unauthenticated premium access fails closed.
- Viewer export remains prohibited.
- Mobile 320 px has no horizontal overflow.
- Rollback can be completed from a verified backup.
- The final promotion decision is machine-readable and human-readable.
