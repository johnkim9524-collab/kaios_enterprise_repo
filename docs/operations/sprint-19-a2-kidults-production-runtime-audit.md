# Sprint 19-A2 — Kidults Production Runtime Audit

## Objective

Audit the current Kidults Production runtime against the certified staging baseline and produce an evidence-based promotion readiness decision.

## Scope

- Inventory the current Production runtime, containers, systemd units, ports, reverse proxy, database, backup, secrets, and monitoring.
- Compare Production and Staging configuration, runtime behavior, authentication, database schema, publication controls, and portal routes.
- Verify stability evidence, backup/restore integrity, rollback feasibility, and failure isolation.
- Produce a machine-readable readiness score and explicit `go`, `hold`, or `rollback` recommendation.

## Mandatory Evidence

1. Production health and runtime inventory.
2. Production database integrity and schema fingerprint.
3. Production backup age, checksum, restore rehearsal, and rollback evidence.
4. Authentication and RBAC probes.
5. Unauthenticated premium access denial.
6. Viewer export denial.
7. Desktop and 320 px mobile portal checks.
8. Staging versus Production configuration delta.
9. Publication, alert delivery, and index publishing state.
10. Incident response and observability readiness.

## Scoring

- Runtime and availability: 20
- Database and migration safety: 15
- Backup and rollback: 15
- Authentication and RBAC: 15
- Portal and mobile quality: 10
- Governance and trust controls: 15
- Observability and incident response: 10

Maximum score: 100.

## Decision Rules

- `go`: score at least 90, every mandatory gate passes, no unresolved critical delta.
- `hold`: score 70–89, or any recoverable mandatory gap remains.
- `rollback`: score below 70, destructive or unsafe delta, failed restore, failed authentication, or evidence of Production instability.

## Fail-Closed Controls

- Default decision is `hold`.
- Production promotion remains unauthorized during this audit.
- Report, alert, and index publishing remain disabled unless separately approved.
- Artfund Production promotion remains unauthorized.
- Unknown or restricted rights block customer-facing output.
- Any failed backup restore, authentication bypass, or destructive schema delta blocks promotion.

## Deliverables

- Production inventory evidence.
- Staging/Production delta report.
- Readiness scorecard JSON.
- Promotion recommendation.
- Remediation backlog for every failed or partial gate.

## Current Status

This Sprint creates the audit framework and evidence capture package. It does not promote or modify the current Kidults Production runtime.