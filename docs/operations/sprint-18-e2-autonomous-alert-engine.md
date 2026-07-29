# Sprint 18-E2 — Autonomous Alert Engine

## Objective

Implement governed, deterministic alert evaluation and delivery eligibility for Kidults and Artfund.

## Scope

- Kidults brand, category, liquidity, and market-risk alerts
- Artfund artist, auction-liquidity, provenance, and market-risk alerts
- Evidence, rights, confidence, methodology, freshness, and provenance gates
- Deterministic alert IDs, checksums, and deduplication keys
- Cooldown suppression
- Immutable evaluation and delivery audit tables

## Delivery Flow

1. Receive a governed signal.
2. Match the active alert policy.
3. Verify severity and threshold.
4. Verify rights, confidence, evidence, methodology, and freshness.
5. Verify Artfund provenance status where applicable.
6. Produce an eligible or blocked evaluation.
7. Apply deduplication and cooldown.
8. Queue approved delivery channels.
9. Persist every evaluation and delivery event.

## Fail-Closed Rules

- Unknown, restricted, expired, or disputed rights block delivery.
- Confidence below the policy threshold or below 70 blocks delivery.
- Missing evidence blocks delivery.
- Draft or deprecated methodology blocks delivery.
- Stale or expired data blocks delivery.
- Disputed Artfund provenance blocks delivery.
- Viewer-facing delivery does not authorize export or write access.

## Staging Validation

```powershell
pnpm --filter @kaios/autonomous-alert-engine test
pnpm --filter @kaios/autonomous-alert-engine check
```

Apply the migration only to the isolated staging database:

```powershell
sqlite3 .\data\dual-staging.db ".read infrastructure/staging/0007_autonomous_alert_archive.sql"
sqlite3 .\data\dual-staging.db "PRAGMA integrity_check;"
```

Expected result:

```text
ok
```

## Production Constraint

This Sprint does not modify Kidults Production and does not claim Artfund Production readiness. Delivery connectors remain staging contracts until a separate promotion gate is passed.
