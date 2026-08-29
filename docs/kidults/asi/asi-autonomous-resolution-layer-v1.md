# KIDULTS ASI Autonomous Resolution Layer v1

**Owner:** KPMO  
**Priority:** P0  
**Direction:** Autonomous → Global → Irreplaceable Value → Transparent

## Purpose

The current ASI chain generated a valid 672-action P1 preflight queue, but generating actions is not the same as resolving them. This layer executes seven KIDULTS-owned resolution engines and forces every current action into a terminal, evidence-bounded state.

It does not manufacture a rights pass or Evidence admission. It first applies the cheapest decisive test: whether a discovery-metadata candidate can satisfy the requested current-SOLD or liquidity evidence class.

## Executable engine chain

```text
P1 Action Queue
        ↓
Action Dependency Graph Engine
        ↓
Resolution Scheduler
        ↓
Semantic Resolution Engine
        ↓
Rights Resolution Engine
        ↓
Factual-Origin Resolution Engine
        ↓
Evidence Admission Engine
        ↓
Resolution Learning Engine
        ↓
Gate 1 Re-evaluation
        ↓
Purpose Rights Eligibility Gate
        ↓
Rights-Clear Replacement Mission Queue
```

## 1. Action Dependency Graph Engine

Every P1 action becomes a node. Every Gate 1 grain becomes a re-evaluation node. Semantic triage controls whether the six more expensive candidate-level preflight actions should execute, and all seven terminal action states bind to the Gate 1 re-evaluation.

## 2. Resolution Scheduler

The scheduler runs four deterministic batches:

1. semantic triage;
2. conditional source preflight;
3. Gate 1 re-evaluation;
4. purpose-rights-gated replacement-profile mission generation.

A terminal semantic rejection short-circuits unnecessary rights, robots, schema, region and independence probes without calling those checks PASS.

## 3. Rights Resolution Engine

A candidate rejected for the required evidence class does not need a target-site rights probe for that grain. The engine records rights as `UNKNOWN_NOT_ADJUDICATED`, creates no rights pass, and records why the action was superseded.

Robots disclosure is not permission. A Terms link is not a rights pass. Reachability is not admission.

## 4. Semantic Resolution Engine

The governing rule is:

> Discovery metadata is not a sold transaction, and discovery metadata is not a liquidity exposure denominator.

A candidate with `DISCOVERY_METADATA_ONLY`, no acquired target content, no explicit terminal SOLD state, no realized price/currency and no exposure denominator is terminally rejected for `CURRENT_SOLD_TRANSACTION` and `LIQUIDITY_TIME_TO_SALE_EXPOSURE`.

Mission-level rejection is not global source retirement. The same source may remain useful for identity, reference, provenance or other evidence classes.

## 5. Factual-Origin Resolution Engine

Host, publisher, provider and factual origin remain separate. A distinct host is not automatically a distinct factual origin. When a grain is semantically rejected, factual-origin work is terminalized as unnecessary for that grain rather than falsely promoted.

## 6. Evidence Admission Engine

Gate 1 is re-evaluated only after all seven actions are terminal. Semantically incompatible grains become `REJECT`, not indefinite `HOLD`. The Evidence Admission Candidate is rejected for source-role incompatibility, with zero admitted Evidence and zero Market Events.

## 7. Resolution Learning Engine

The layer versions and preserves the reusable rule:

```text
DISCOVERY_METADATA_ONLY
+ no target content
+ current-SOLD/liquidity demand
→ terminal semantic rejection
→ supersede expensive preflight
→ generate replacement-source mission
```

The rule is evidence-bound and cannot be silently rewritten.

## Replacement-source mission queue

All 192 current missions are crosswalked to the governed v1 source frontier and the 16 registered strict market-adapter profiles. Up to three slots are generated per mission:

1. primary registered profile;
2. independent fallback registered profile;
3. factual-origin replacement profile.

A registered profile is not a rights pass, not an implemented adapter, not proven independent, and not admitted Evidence. Only `RIGHTS_CLEAR_FOR_PURPOSE` sources may occupy a replacement slot or enter the adapter-acquisition backlog. Unknown, conditional, denied, paid-but-unapproved, login-gated, robots-blocked, or permission-pending sources remain in the explicit rights preflight queue. Discovery metadata never clears this gate.

The current preflight contains 16 registered profiles, with 0 rights-clear profiles and 16 rights-hold profiles. Therefore the current replacement queue has 0 filled slots, 0 adapter-backlog items, and 16 rights-preflight items. This is an intentional fail-closed result, not a software implementation gap.

## Automatic activation

```text
Successful P1 Source Preflight
or relevant protected-main push
or hourly schedule at :22
        ↓
Restore one coherent P1 artifact
        ↓
Build twice and compare
        ↓
Validate seven engines
        ↓
Reject false promotion mutations
        ↓
KPMO receipt + 90-day artifact
```

Manual dispatch remains recovery or explicit replay only. If no successful exact-main P1 artifact exists, the recovery lane first reuses an already queued or running exact-main P1. Only when none exists does it dispatch one P1 run, wait for its terminal success for at most 600 seconds, and then read back that exact run's single artifact for up to 60 additional seconds to tolerate GitHub artifact-index eventual consistency. A failed or timed-out P1, missing artifact, or duplicate artifact fails the ARL run closed; an ancestor artifact is never substituted. The total recovery bound is 660 seconds.

## Hard boundaries

```text
Action terminalized ≠ Action PASS
Semantic rejection ≠ Rights denial
Mission-level rejection ≠ Global source retirement
Registered profile ≠ Rights verified
Rights preflight ≠ Rights clear
Rights clear required before acquisition priority
Registered profile ≠ Adapter implemented
Gate 1 reject ≠ Evidence admission
Discovery metadata ≠ Sold transaction
Discovery metadata ≠ Liquidity exposure
```
