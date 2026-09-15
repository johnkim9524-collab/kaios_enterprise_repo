# KIDULTS D-Day Recovery Guide

This guide covers rollback, recovery, restart, canonical corruption and portal degradation without changing canonical authority.

## Detection
Compare runtime health, append-only receipt digests, canonical identity, projection signature and portal source SHA.

## Isolation
Stop ingress before workers, freeze projection publication, retain append-only evidence, and serve the last verified non-stale read model only.

## Recovery
Restart stateless services first, then workers. Rebuild derived stores from canonical evidence. Restore PostgreSQL/PITR only through the approved runtime procedure. Canonical corruption requires a new append-only generation, never an overwrite.

## Verification
Prove health, reconnect, persistence, replay idempotency, lineage digest parity, portal isolation and zero unauthorized writes.

## Communication
Issue an internal recovery receipt containing recovery point, elapsed recovery time, data-loss boundary, remaining HOLDs and exact validation references.
