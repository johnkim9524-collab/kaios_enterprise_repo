# KIDULTS ASI Snapshot Readiness Factory v2.1

**Owner:** KPMO  
**Priority:** P3  
**Direction:** Autonomous → Global → Irreplaceable Value → Transparent

## Purpose

This factory consumes an exactly bound P0B → P1 → P2 v2 chain and answers whether the chain contains lawful, current, admitted market evidence sufficient to generate a content-addressed `snapshot-candidate.json` and `evidence-package.json` pair. Content addressing and atomic local creation are not immutable storage or artifact attestation.

The factory is fail-closed without being deadlocked. The ten evidence and governance prerequisites are evaluated before generation. The existence of the two outputs is checked only after generation; output absence is never used as an input prerequisite. When every prerequisite passes, the pair is generated in one staging directory and exposed by one atomic directory rename. Pair generation still does not start Track B, authorize publication, authorize production, or claim immutable storage. Track B remains blocked until immutable-storage and cryptographic artifact-attestation receipts exist and the canonical handoff passes.

## Current P0B → P1 → P2 v2 chain

```text
P0B bounded discovery candidates
        ↓
P1 classification / qualification / Gate 1 / admission preflight
        ↓
P2 KIDULTS-owned Source Intelligence Graph v2
        ↓
P3 Snapshot Readiness Factory v2.1
```

The verified bounded pre-admission baseline remains:

| Input | Current evidence-bound count |
|---|---:|
| Missions | 192 |
| Source candidates | 482 |
| Canonical hosts | 111 |
| Gate 1 decisions | 576 |
| Gate 1 PASS | 0 |
| Gate 1 HOLD | 576 |
| P1 preflight actions | 672 |
| P1 preflight actions completed | 0 |
| P2 graph nodes | 2,774 |
| P2 graph edges | 6,278 |
| Admitted evidence | 0 |
| Market events | 0 |
| Snapshot candidates | 0 |
| Track B input pairs | 0 |

These are baseline facts, not hard-coded success values. Each run recomputes readiness from the restored, digest-bound inputs.

## Ten prerequisites and two output assertions

The ten pre-generation prerequisites are:

1. Mission source-candidate coverage;
2. Primary, fallback, replacement-host, and regional coverage;
3. Gate 1 source safety and completed preflight actions;
4. Purpose-specific rights;
5. Market-semantic sufficiency;
6. Factual-origin independence;
7. Lawful evidence admission with exact event binding;
8. Current dated SOLD transaction evidence;
9. Liquidity and time-to-sale evidence;
10. A digest-bound Market Event Graph.

The two post-generation assertions are:

11. Immutable Evidence Package storage and attestation exist and validate;
12. Exact Snapshot Candidate / Evidence Package Track B input pair exists and validates.

Assertions 11 and 12 remain `NOT_EVALUATED` after local content-addressed generation because this repository does not implement immutable storage or cryptographic artifact attestation. They may become `PASS` only from externally verified receipts. This separation removes the former factory liveness cycle without falsely promoting local files to immutable evidence.

## Lawful evidence admission boundary

Every admitted record must bind through an exact, unique P0 candidate → mission slot → Gate 1 grain → admission identity join. The admission's candidate, mission, market cell, evidence class, rights decision, collection authority, and completed candidate-specific preflight actions must agree with that chain; orphan, duplicate, and cross-mission substitutions fail closed.

Rights evidence is typed at Source × Purpose grain and requires `COLLECT`, `STORE`, `DERIVE`, and `DISPLAY`, owner and purpose identity, jurisdiction, effective/expiry times, a non-zero document digest, and a non-placeholder HTTPS evidence URI. A dated SOLD record additionally requires transaction time, positive amount and ISO currency, canonical asset identity, venue, and grade/condition. Liquidity evidence requires exposure start/end semantics, an explicit censoring state, and a recomputable duration. Placeholder/reserved URLs are forbidden.

P2 must expose exactly one market event for each admitted record. Its evidence ID, rights state, observation time, source payload digest, and canonical record digest must match the admitted record. P2 graph, manifest, value receipt, and lineage counts and digests must agree.

## Conditional output sets

Every run creates:

```text
snapshot-readiness-ledger-v2.json
immutable-blocker-package-v2.json
admission-demand-package-v2.json
track-b-handoff-readiness-v2.json
snapshot-readiness-manifest-v2.json
```

A blocked run additionally creates only:

```text
snapshot-non-generation-receipt-v2.json
```

A lawful prerequisite-ready run instead creates an atomic content-addressed pair and an attestation-pending receipt:

```text
snapshot-candidate.json
evidence-package.json
snapshot-pair-generation-receipt-v2.json
```

The ready and blocked conditional sets are mutually exclusive. `rankability-assessment.json`, `live-admission-manifest.json`, and `projection-admission-receipt.json` are always forbidden.

## Current blockers and admission demand

The current zero-admission baseline remains blocked by the failing evidence/governance prerequisites: replacement or regional coverage, Gate 1 or preflight completion, purpose-specific rights, market semantics, factual-origin independence, evidence admission, dated SOLD evidence, liquidity evidence, and Market Event Graph binding. Exact blocker counts and affected counts are derived from each run instead of being assumed.

The admission-demand package preserves all current P1 actions as machine-readable execution demand. It reports action type, candidate, host, expected output, impacted grain and mission counts, execution state, and permission boundary. It is neither admitted evidence nor an Evidence Package.

## Exact upstream artifact restore

P3 never scans the repository-wide first 100 artifacts and never falls back to an artifact from any branch.

For a `workflow_run` trigger, the event's P2 run ID and head SHA are authoritative inputs but still must equal the live observed `main` head. For schedule or exact-main recovery dispatch, P3 selects one successful `main` run of the exact P2 workflow at the live main SHA and then fetches that run by ID. A dispatch from any non-main ref fails closed. P3 requires:

- the exact workflow path, successful conclusion, repository, `main` branch, and 40-character head SHA;
- the run head to equal live `main`, a strict completion timestamp, and no more than 24 hours between completion/readback and graph snapshot time;
- exactly one unexpired P2 artifact from that run, bound to the same run ID/head SHA and a provider artifact digest, with the downloaded archive SHA-256 equal to that provider digest;
- P0B and P1 artifact IDs taken only from the restored P2 KPMO receipt;
- exact P0B/P1 names, `main` metadata, non-expired status, provider artifact digests, and matching downloaded archive SHA-256 values;
- P2 receipt source SHA and graph digest matching the selected P2 run and manifest; and
- restored P0B/P1 content digests matching the inputs recorded in P2 lineage.

The binding validator has mutation cases for run/head mismatch, stale/non-current main runs, non-main and failed runs, expired or mismatched artifacts, downloaded-archive digest substitution, receipt-ID substitution, wrong artifact name, and lineage-content substitution.

## Atomic generation and Track B boundary

The factory refuses an existing destination directory, writes all outputs into a new private staging directory, validates conditional absence while still staged, and exposes the complete result with one directory rename. The generated files contain canonical payload digests, file digests, source graph binding, the complete upstream binding receipt and digest, mutual Snapshot/Evidence IDs, and one exact pair digest. A deterministic liveness test proves blocked non-generation, lawful prerequisite-ready generation, identical replay, atomic commit, and 15 fail-closed mutations covering identity, semantics, rights, time, upstream freshness/digests, and false attestation.

After pair generation, `track-b-handoff-readiness-v2.json` remains `PAIR_GENERATED_STORAGE_AND_ATTESTATION_REQUIRED`; immutable storage and artifact attestation are false, `track_b_submission_eligible` remains false, and `independent_assessment_started` remains false. The provider artifact receipt is captured after upload but explicitly remains attestation-pending. External immutable storage, cryptographic attestation, and canonical handoff must all pass before Track B may begin.

## Automatic execution

Pull requests execute only secretless static and liveness validation and cannot publish an authoritative Candidate/Evidence artifact. The authoritative job activates only on exact `refs/heads/main` from a successful exact P2 workflow run, the hourly `:07` schedule, or an exact-main recovery dispatch. Schedule and recovery dispatch both require a successful exact P2 run at the live main SHA; a branch-selected dispatch fails closed. The job restores the exact fresh upstream chain, validates receipt and lineage bindings, builds twice, proves deterministic replay, validates conditional outputs and digests, executes liveness and mutation tests, and emits a KPMO receipt, a uniquely main-SHA/run-ID-named 90-day content-addressed artifact, and a separate provider artifact receipt. The 90-day artifact is not immutable evidence or a Track B input without external receipts.

## Fail-closed truth boundaries

```text
Source Candidate ≠ Evidence
Gate 1 HOLD ≠ PASS
Preflight Action ≠ Completed Preflight
Host ≠ Factual Origin
Admission Candidate ≠ Admitted Evidence
Unbound Source Intelligence Graph ≠ Market Evidence Graph
Blocker Package ≠ Evidence Package
Snapshot Readiness ≠ Snapshot Candidate
Pair Generated ≠ Track B Ready
Track B Waiting ≠ Track B Started
```

Public release and production remain `HOLD` in every P3 state.
