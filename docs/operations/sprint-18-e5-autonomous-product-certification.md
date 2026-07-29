# Sprint 18-E5 Autonomous Product Certification Runbook

## Purpose

Verify the complete autonomous product chain for Kidults and Artfund before Week 6 Release Candidate work begins.

## Validation Order

1. Run package TypeScript checks.
2. Run autonomous product certification tests.
3. Verify report claim evidence and methodology manifests.
4. Verify alert delivery gates, deduplication, and cooldown behavior.
5. Verify index publication IDs, checksums, immutable history, and rollback references.
6. Verify recoverable gaps schedule retry and hard governance failures create incidents.
7. Verify Kidults and Artfund failures remain isolated.
8. Verify all six product surfaces meet quality thresholds.
9. Record the machine-readable gate result.

## Required Commands

```powershell
pnpm --filter @kaios/autonomous-product-certification check
pnpm --filter @kaios/autonomous-product-certification test
pnpm -r check
pnpm -r test
```

## Failure Handling

- Evidence, coverage, or stale freshness gaps may schedule bounded retry.
- Rights, methodology, confidence, checksum, invalid data, or provenance failures block publication and require an incident.
- Rollback never deletes or overwrites the original publication.
- Certification failure does not affect Kidults Production.

## Promotion Boundary

Passing this Sprint authorizes Week 6 Release Candidate implementation only. It does not authorize direct Production deployment, public Artfund release, or disclosure of illustrative staging values.
