# Kidults Live Collector Activation Runbook

## Objective

Transition Kidults from fixture-mode certification to live RSS collection without weakening the validated production security, backup, or rollback controls.

## Initial Live Source

Use a broad Google News RSS query as the first production discovery feed:

`https://news.google.com/rss/search?q=%28collectibles%20OR%20%22trading%20cards%22%20OR%20%22designer%20toys%22%20OR%20%22action%20figures%22%29%20when%3A7d&hl=en-US&gl=US&ceid=US%3Aen`

This is a discovery source, not the final proprietary source stack. Source provenance, duplicate suppression, relevance filtering, and publisher-level quality scoring remain mandatory.

## Production Environment Changes

Set:

- `KAIOS_RUNTIME_MODE=live`
- `KAIOS_SCHEDULER_RUNTIME_MODE=live`
- `KAIOS_LIVE_RSS_URL=<approved feed URL>`
- `KAIOS_LIVE_HTTP_TIMEOUT_SECONDS=15`
- `KAIOS_LIVE_RETRY_DELAY_SECONDS=3`

Do not change:

- authentication
- RBAC tokens
- database path
- backup timer
- Caddy routing
- Cloudflare proxy

## Pre-Activation Gate

1. Gateway is healthy.
2. Scheduler is running.
3. External health is operational.
4. Authenticated fixture collector passes.
5. Latest backup manifest reports `integrity=ok`.
6. A rollback copy of `.env.production` exists.

## Activation Procedure

1. Back up `.env.production`.
2. Validate the RSS endpoint returns HTTP 200 and XML.
3. Update the three live-mode environment values.
4. Recreate Gateway and Scheduler containers.
5. Confirm both containers are running.
6. Run one authenticated live collector request.
7. Confirm source count, successful source count, timestamps, and database growth.
8. Confirm no secret values appear in logs.

## Acceptance Criteria

- Gateway remains healthy.
- Scheduler remains running.
- Live collector returns HTTP 200.
- Collector payload reports `mode=live`.
- At least one source succeeds.
- `collected_at` is a current timestamp, not the fixture timestamp.
- SQLite database size is equal to or greater than the pre-activation size.
- External unauthenticated collector remains HTTP 401.
- Backup service remains enabled.

## Rollback

Restore the previous environment file and recreate the containers. Expected rollback values:

- `KAIOS_RUNTIME_MODE=fixture`
- `KAIOS_SCHEDULER_RUNTIME_MODE=fixture`
- `KAIOS_LIVE_RSS_URL=`

## Stability Baseline

Track daily for 30 days:

- gateway uptime
- scheduler uptime
- collector success rate
- source success rate
- new signal count
- duplicate count
- database growth
- backup success
- API p95 latency
- manual intervention minutes

## Quality Position

The initial feed validates autonomous production collection only. It does not by itself establish the Kidults product moat. The long-term defensibility must come from multi-source institutional coverage, proprietary normalization, entity resolution, scoring, historical archives, and editorial interpretation.
