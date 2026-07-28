# Incident Response Runbook

## Detection

Review `/api/observability/status`, `/api/alerts`, container health, and
the observability JSON Lines log.

## Triage

1. Confirm Gateway and Scheduler container status.
2. Review request and correlation IDs.
3. Identify increased error or latency counters.
4. Review runtime and scheduler records.
5. Confirm authentication and rate-limit behavior.

## Containment

Stop the Scheduler before stopping the Gateway when duplicate execution
or publication risk exists.

## Recovery

Restart the Gateway, verify health, run a protected API smoke test, then
restart the Scheduler.