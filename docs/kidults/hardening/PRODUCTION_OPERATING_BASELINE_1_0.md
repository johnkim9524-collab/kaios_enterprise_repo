# KIDULTS Production Operating Baseline 1.0

## Release semantics

- **GA 1.0** means the governed runtime baseline is stable enough for controlled production validation; it does not mean Data GA, Operational GA or Commercial GA are automatically certified.
- Every release must identify code version, policy version, data/evidence mode, migration impact, rollback point and known limitations.
- Synthetic fixtures and simulation evidence are never substituted for live operational or commercial proof.

## Mandatory pre-release gates

1. deterministic Node/toolchain/dependency install;
2. typecheck;
3. runtime smoke;
4. unit/integration tests and coverage threshold;
5. Truth Layer acceptance;
6. relevant certification regression;
7. security/SRE baseline audit;
8. no unauthorized authority expansion or mutation path.

## Operating mode states

`SYNTHETIC_BASELINE`, `EVIDENCE`, `CONTROLLED_LIVE`, `PRODUCTION_LIVE`.

Transitions must be explicit and evidence-backed. `liveValidationCertified=true` is forbidden without authoritative live evidence.

## Runtime authority

Routine bounded automation is permitted only within policy. Legal, financial, strategic, security and provider-contract decisions remain human-authorized. Production publication, billing/customer mutation and provider mutation require the authority defined for that action.

## Failure behavior

Critical unknown, missing provenance, invalid rights, unsafe freshness, unrecoverable provider failure or corrupt data => fail closed. Recovery is bounded, observable and auditable; no infinite retry or silent degradation.

## Evidence retention

Preserve run IDs, policy/methodology version, source/provenance, important decisions, recovery/rollback state and output fingerprints. Evidence must support later reproduction and root-cause review.

## Controlled-live exit criteria

Data provenance/quality thresholds pass on authoritative records; alerts/metrics/traces are observable; recovery/failover/rollback have controlled evidence; unattended-operation KPIs are measured; commercial rights are verified for the delivered scope.

## Current limitation

This document establishes operating and release hygiene. Actual controlled-live evidence and commercial validation remain required before declaring the corresponding GA gates complete.
