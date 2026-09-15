# KIDULTS Provider Incident Guide

## Detection
Classify provider offline, network partition, replay, duplicate, clock skew, corruption, rights mismatch, canonical mismatch, partial failure, zero admission or portal isolation.

## Isolation
Fail closed at the earliest affected gate, quarantine immutable inputs and prevent downstream consumption. Never delete incident evidence.

## Recovery
Use bounded retry only for transport faults. Use corrected append-only evidence for data faults. Use new rights authority for rights faults. Rebuild projections after canonical verification.

## Verification
Re-run the exact scenario, its negative mutation, full regression and exact-head audit. Confirm Production/Public/G5 remain HOLD.

## Communication
Record severity, incident ID, times, impacted records, actions, receipts, authority owner and unblock condition. Provider notification requires explicit communication authority.
