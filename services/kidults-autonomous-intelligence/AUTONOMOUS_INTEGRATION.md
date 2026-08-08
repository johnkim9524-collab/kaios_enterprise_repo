# KIDULTS Autonomous Intelligence Integrated Pipeline

Status: implementation baseline
Visual baseline: KIDULTS Portal Visual Baseline v1.0 LOCKED

## System contract

Sources -> Source Adapters -> Normalization -> Entity Resolution -> Evidence Ledger -> Canonical Observations -> Methodology Registry -> Intelligence Run -> Production Gate -> Immutable Publication Snapshot -> Portal/API/Archive

## Five source families

1. Marketplace
2. Auction
3. Brand Direct
4. Editorial
5. Cultural Signal

Every adapter must emit the same NormalizedEvidence contract from `src/adapters.ts`. No source-specific payload may enter scoring directly.

## Production rules

- Provenance is mandatory.
- Raw payload hash is retained.
- Evidence is immutable; corrections supersede prior evidence.
- Methodology version is attached to every intelligence run.
- Publication is blocked unless the production gate passes.
- Portal visual baseline is not changed by autonomous jobs.
- Production portal reads only promoted publication snapshots, never raw collector output.

## Autonomous cycle

1. Collect enabled adapters.
2. Normalize and validate evidence.
3. Resolve canonical entity identity.
4. Deduplicate by source/external id/payload hash.
5. Persist evidence and observations.
6. Run deterministic methodology.
7. Evaluate production gate.
8. Build immutable portal payload.
9. Promote only eligible payload.
10. Retain prior promoted payload on failure.
11. Record audit and collector run state.

## Failure containment

A failed collector cannot erase or replace the last valid production snapshot. A failed methodology run cannot publish. A source outage reduces freshness/coverage and is recorded; it does not synthesize replacement evidence.

## Next implementation gate

Real source connectors require source-specific access methods, terms/licensing review, credentials where applicable, rate limits, and fixtures. Until those are configured, adapters remain contracts rather than fabricated collectors.
