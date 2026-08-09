# KIDULTS Security / SRE / Recovery Baseline

Status: internal control baseline. This document does **not** certify live production behavior.

## Security operating rules

- GitHub Actions should use least-privilege permissions; read-only contents access is the default for certification jobs.
- Secrets must never be committed to source, fixtures, reports, screenshots, or generated evidence.
- Secret inventory fields: owner, purpose, environment, provider, created date, last rotation, next rotation, revocation procedure, blast radius.
- Rotation policy: immediately after suspected disclosure; otherwise according to provider risk and no later than the approved enterprise interval.
- Critical third-party Actions should be evaluated for commit-SHA pinning. Version tags may remain only where operational maintainability is judged to outweigh supply-chain risk and the decision is documented.

## Reliability contracts

Critical unknown state => fail closed. Production publication, billing, provider mutation, customer mutation, and authority expansion remain blocked without explicit authorization.

Required SRE evidence classes:
1. structured logs with correlation/run IDs;
2. service and provider metrics;
3. traces for critical acquisition-to-publication paths;
4. alerts tied to SLO/error-budget burn;
5. bounded retry with exponential backoff/jitter;
6. circuit breaker and provider timeout policy;
7. queue backpressure and admission control;
8. DLQ, quarantine and replay proof;
9. idempotency/duplicate-event protection;
10. backup/restore evidence and recovery drills.

## Incident runbook

1. Detect and classify impact.
2. Freeze unsafe publication or mutation paths.
3. Preserve evidence, correlation IDs and affected entity/provider set.
4. Determine whether data, runtime, credential or provider fault is primary.
5. Apply bounded recovery. Do not loop indefinitely.
6. Quarantine corrupt/ambiguous data.
7. Roll back only to a known-good baseline.
8. Verify recovery against invariants and SLOs.
9. Record customer/business impact and follow-up action.

## Provider outage runbook

- Primary unavailable: use a validated fallback only when provenance and freshness requirements remain satisfied.
- Independent-verification source unavailable: critical facts must be downgraded or blocked when verification is mandatory.
- All acceptable sources unavailable: fail closed; never manufacture live evidence.

## Data corruption runbook

- Stop downstream scoring/publication for affected records.
- Quarantine affected partitions/entities.
- Identify last known-good evidence point.
- Replay deterministically from retained raw/evidence data.
- Re-run dedupe, entity resolution and provenance checks before release.

## Credential failure runbook

- Disable affected integration path.
- Do not log secret values.
- Rotate/revoke credential through authorized process.
- Verify least privilege before restoring service.

## Canary / rollback

Canary release requires defined cohort, success metrics, rollback threshold, evidence window and explicit production authority. Rollback must be deterministic and auditable.

## Recovery objectives

RTO/RPO values are governed by `services/kidults-autonomous-intelligence/policy/p0-sre-reliability-baseline.json`. A declared objective is not considered proven until a controlled recovery drill produces evidence.

## Explicit limitation

Synthetic and static-control evidence may validate design and fail-closed behavior, but cannot be represented as live availability, live failover, live RTO/RPO or unattended-operation proof.
