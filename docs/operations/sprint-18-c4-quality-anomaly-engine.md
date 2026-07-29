# Sprint 18-C4 — Quality and Anomaly Engine

## Objective

Provide deterministic validation, anomaly detection, duplicate-evidence control, and data-gap detection for Kidults and Artfund staging intelligence flows.

## Shared Execution Order

1. Validate required fields and timestamps.
2. Validate numeric values and currency context.
3. Check rights and confidence eligibility.
4. Detect duplicate evidence hashes.
5. Compare values with historical observations.
6. Detect material data gaps.
7. Apply vertical-specific quality rules.
8. Persist assessment and findings.
9. Route to accept, review, reject, or quarantine.

## Decisions

- `accept`: may continue to scoring and index foundations.
- `review`: retain in staging but exclude from premium surfaces until resolved.
- `reject`: do not use downstream; recollection or correction may be attempted.
- `quarantine`: isolate because of critical rights, provenance, timestamp, or value failure.

## Kidults Controls

- Negative or non-finite prices are quarantined.
- Material price outliers are rejected pending corroboration.
- Duplicate evidence reduces signal quality.
- Market Signal Quality uses evidence count, source coverage, confidence, and duplicate count.

## Artfund Controls

- Disputed provenance quarantines the transaction.
- Provenance completeness contributes to transaction quality.
- Buyer-premium and currency treatment must be methodology-versioned before index use.
- Auction transactions without sufficient evidence remain review-only.

## Operational Isolation

- A failed observation does not fail its source execution.
- A failed source does not fail the other vertical.
- Findings remain queryable and append-only.
- Historical values are not silently overwritten.

## Staging Validation

```bash
pnpm --filter @kaios/quality-anomaly-engine test
pnpm --filter @kaios/quality-anomaly-engine check
```

Apply `infrastructure/staging/0004_quality_anomaly_foundation.sql` only to isolated staging databases.

## Production Restrictions

- Do not apply the migration to Kidults Production.
- Do not publish illustrative Artfund staging values.
- Do not promote observations with unknown or restricted rights.
- Do not publish Artfund transactions with disputed provenance.
- Production promotion requires a separate gate.
