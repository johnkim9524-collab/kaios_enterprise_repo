# KIDULTS Autonomous Intelligence Deployment Checklist

## Locked surface
- KIDULTS Portal Visual Baseline v1.0 remains locked.
- Backend integration may update data only, not portal layout or visual tokens.

## Required before deployment
1. Create Cloudflare D1 database `kidults-intelligence-db`.
2. Replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.jsonc`.
3. Apply migrations `0001` and `0002`.
4. Set `INGEST_TOKEN` as a Worker secret for staging/production.
5. Configure `SOURCE_ADAPTERS_JSON` with approved normalized feed endpoints.
6. Keep source credentials in Worker secrets; do not commit them.
7. Run `pnpm --dir services/kidults-autonomous-intelligence typecheck`.
8. Start local Worker and verify `/health`.
9. Run `/internal/collect` and inspect `collector_runs` and `audit_log`.
10. Run `/internal/autonomous-cycle`.
11. Confirm incomplete runs are `blocked` and do not replace `publication_state`.
12. Accumulate at least three succeeded intelligence runs for correlation readiness.
13. Confirm `/v1/intelligence/current` returns only the promoted production snapshot.
14. Configure portal API routing so `/v1/intelligence/current` resolves to this Worker, or set `window.KIDULTS_INTELLIGENCE_API` before the bridge loads.
15. Verify `?data=preview` still uses the frozen preview dataset.

## Production gate
A snapshot is promotable only when both gates pass:
- Core evidence gate: minimum evidence, categories and source families.
- Portal contract gate: sufficient trend history and correlation history.

Failure must retain the prior promoted snapshot.
