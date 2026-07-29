# Sprint 18-E3 — Daily Index Auto-Publishing

## Objective

Publish governed daily index points for Kidults and Artfund without mutating historical records.

## Authorized Scope

- Kidult 100 daily staging publication
- Artfund Global Art Market Index daily staging publication
- immutable index history
- retryable publication attempts
- explicit rollback audit
- no public release of illustrative staging values

## Publication Gate

A point may publish only when:

1. the methodology is approved or active;
2. confidence is at least 70;
3. evidence count is positive;
4. source coverage is positive;
5. rights are approved;
6. freshness is current;
7. Artfund provenance is not disputed;
8. the index value is finite.

## Failure Recovery

Automatic retry is allowed only for recoverable gaps:

- missing evidence expected from a delayed source;
- missing source coverage expected from a partial batch;
- stale data expected to refresh in the next run.

Rights, methodology, invalid-value, and provenance failures require remediation and do not auto-retry.

## Rollback

Rollback never deletes or overwrites the original publication. It creates an immutable rollback event referencing the publication checksum and reason.

## Verification

```powershell
pnpm --filter @kaios/index-auto-publisher test
pnpm --filter @kaios/index-auto-publisher check
```

SQLite staging verification:

```bash
sqlite3 index-staging.db < infrastructure/staging/0008_index_auto_publishing.sql
sqlite3 index-staging.db "PRAGMA integrity_check;"
```

## Production Constraint

Kidults Production is unchanged. Artfund Production readiness is not claimed. Promotion requires a separate release gate.
