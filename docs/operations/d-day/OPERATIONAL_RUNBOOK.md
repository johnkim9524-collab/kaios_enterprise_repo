# KIDULTS D-Day Operational Runbook

Use this sequence for provider timeout, provider unavailable, rights revoked, schema change, evidence conflict and Current SOLD delay.

## Detection
Alert on timeout, non-2xx transport, schema digest drift, expired rights, evidence digest conflict, freshness breach or zero admission.

## Isolation
Open the provider circuit, quarantine the batch and deny every downstream action. Unaffected providers remain partitioned.

## Recovery
Timeout/unavailable: bounded backoff. Rights revoked: no retry until new approval. Schema change: validate a control fixture. Evidence conflict: preserve both versions. Current SOLD delay: mark stale and withhold Confidence.

## Verification
Run provider simulation, disaster scenarios, Current SOLD qualification and exact-head CI. A replay must be idempotent; a conflicting replay must reject.

## Communication
Publish internal state using governed vocabulary, exact run ID, SHA, failure class, affected lineage and unblock condition.
