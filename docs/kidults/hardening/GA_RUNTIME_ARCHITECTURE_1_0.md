# KIDULTS GA Runtime Architecture 1.0

## Purpose

A15–A40 are retained as certification/evidence history. They are not the preferred mental model for day-to-day production operation.

## Live control-plane model

**Policy → Runtime → Assurance → Decision → Action → Verification**

- **Policy**: authority boundaries, rights, SLOs, cost limits and fail-closed rules.
- **Runtime**: collect, validate, normalize, resolve, score, analyze and publish within policy.
- **Assurance**: provenance, data quality, freshness, security, cost and reliability checks.
- **Decision**: deterministic or governed AI decision with confidence and evidence.
- **Action**: bounded execution; strategic/legal/financial/security/provider-contract decisions remain human-authorized.
- **Verification**: outcome, evidence, observability, rollback/recovery and audit trail.

## Separation of concerns

1. `src/` — live runtime and product/control code.
2. `scripts/` — certification, migration, audit and operational tooling.
3. `scripts/lib/` — shared engines/registries/helpers used by certification tooling.
4. `fixtures/` — deterministic scenario input only; never represented as live data.
5. `reports/` — generated evidence and certification outputs.
6. `policy/` — machine-readable authority, reliability, provider and KPI contracts.
7. `docs/kidults/` — historical stage documentation and executive architecture context.

## Simplification direction

Future certification refactors should converge on a shared certification engine with scenario registry, policy/invariant registry, evidence resolver and standard reporter. Stage-specific scripts should primarily declare scenario/configuration differences rather than duplicate orchestration.

## Historical boundary

A1–A40 documentation and evidence remain immutable history except for factual corrections. Current GA operating documentation starts with this baseline and subsequent versioned ADRs/runbooks.

## Release hygiene

- GA runtime changes require deterministic CI, typecheck, tests and relevant certification regression.
- Synthetic/evidence and live operational states are explicitly distinct.
- Production mutation requires authority appropriate to the action.
- Release notes must state data mode, evidence class and rollback impact.

## Current limitation

This architecture baseline improves maintainability and operating clarity but does not by itself prove live Data GA, Operational GA or Commercial GA.
