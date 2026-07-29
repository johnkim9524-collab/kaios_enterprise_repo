# Sprint 18-E4 — Autonomous Publication Orchestrator

## Objective

Coordinate governed report, alert, and index publication for Kidults and Artfund without allowing one product or vertical failure to stop the other.

## Execution Order

1. Load due products by vertical and product kind.
2. Validate rights, methodology, confidence, evidence, coverage, freshness, checksum, and Artfund provenance.
3. Mark recoverable gaps as `retry_scheduled`.
4. Mark non-recoverable governance failures as `blocked` and open an incident.
5. Publish only eligible products.
6. Persist run, item, incident, and rollback audit records.
7. Roll back through a separate immutable event that references the original checksum.

## Isolation Contract

- Kidults and Artfund are evaluated independently.
- Report, alert, and index decisions remain independently auditable.
- A failed Artfund publication does not stop Kidults publication.
- A failed alert does not invalidate a separately eligible index or report.

## Retry Policy

Automatic retry is permitted only for:

- missing evidence expected from a recoverable source delay;
- missing source coverage expected from a recoverable source delay;
- stale, but not expired, input data.

Rights, methodology, invalid checksums, expired data, and disputed provenance require explicit remediation.

## Rollback Contract

A rollback must include:

- vertical;
- product ID;
- original publication ID;
- original checksum;
- explicit reason;
- requested timestamp.

Rollback never deletes or overwrites the historical publication.

## Staging Verification

```powershell
pnpm --filter @kaios/publication-orchestrator test
pnpm --filter @kaios/publication-orchestrator check
```

Apply `infrastructure/staging/0009_publication_orchestrator.sql` only to isolated staging databases.

## Production Restrictions

- No Kidults Production deployment is authorized by this sprint.
- No Artfund Production-readiness claim is authorized.
- No public publication of illustrative staging values is authorized.
- Week 5 certification remains a separate gate.
