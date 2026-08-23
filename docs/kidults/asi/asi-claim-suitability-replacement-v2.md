# KIDULTS ASI Claim-Suitability Resolution and Replacement v2

**Owner:** KPMO  
**Priority:** P0  
**Direction:** Autonomous → Global → Irreplaceable Value → Transparent

## Purpose

The current bounded candidates were discovered through public metadata. They are valid source-discovery candidates, but the current observation does not establish a terminal sold transaction or an exposure-and-outcome liquidity record.

This layer stops leaving those candidate–mission grains in an ambiguous HOLD. It resolves each current observation to a precise terminal claim-suitability decision, retires only the unsupported evidence role, and automatically opens a replacement mission and adapter requirement.

```text
Current metadata-only candidate grain
        ↓
Claim-Suitability Resolution Engine
        ↓
Gate 1 Terminal Decision Engine
        ↓
Candidate Role Retirement Engine
        ↓
Replacement Mission Generator
        ↓
Adapter Requirement Compiler
        ↓
KPMO Receipt + Artifact
```

## Claim-Suitability Resolution Engine

For the current mission classes:

- `CURRENT_SOLD_TRANSACTION`
- `LIQUIDITY_TIME_TO_SALE_EXPOSURE`

public discovery metadata does not contain the required terminal event, realized price, exposure denominator, censoring, failed-sale state, object identity, condition, rights and factual-origin evidence.

The current observation is therefore resolved as:

```text
REJECT_CURRENT_OBSERVATION_NOT_CLAIM_SUITABLE
```

This is a rejection of the current candidate–mission evidence role. It is not a claim that the market event did not occur and not a ban on the source.

## Gate 1 Terminal Decision Engine

A hard semantic insufficiency is terminal for the current observation. The engine converts the ambiguous current HOLD into a deterministic `REJECT` recommendation while preserving:

- zero Gate 1 PASS;
- zero Evidence Admission;
- re-entry when a new evidence-bearing observation exists;
- all original candidate and mission lineage.

## Candidate Role Retirement Engine

The candidate remains available as discovery context, source identity or replacement research input.

```text
Retired role: current-SOLD / liquidity evidence
Retained role: discovery context candidate
```

Reject current observation ≠ Negative market fact.  
Candidate role retirement ≠ Global source ban.  
Semantic rejection ≠ Rights denial.

## Replacement Mission Generator

Every governed mission receives three new claim-suitable source-lane obligations:

1. `PRIMARY_CLAIM_SUITABLE_LANE`
2. `INDEPENDENT_FALLBACK_LANE`
3. `DISTINCT_FACTUAL_ORIGIN_LANE`

For current SOLD, the source must expose terminal sold state, realized price, currency, event time, object identity and condition/comparability.

For liquidity, the source must expose exposure start, exposure end or censoring, terminal outcome, failed or withdrawn state and object identity.

No provider is preselected and no task creates rights or admission.

## Adapter Requirement Compiler

Each scope × region × evidence-class mission receives a source-specific adapter requirement containing:

- schema version and drift control;
- field-purpose rights;
- listing-as-sold rejection;
- temporal coherence;
- source-owner and factual-origin lineage;
- deterministic duplicate grain;
- provider-direct truth/index/projection prohibition;
- fixture/empirical separation.

Adapter requirement ≠ Adapter implementation.  
Fixture PASS ≠ Empirical Evidence Admission.

## Automatic execution

The workflow activates on:

- relevant protected-main push;
- every hour at minute 32;
- successful `KIDULTS ASI Autonomous Resolution Layer v1` completion;
- successful `KIDULTS ASI P1 Source Preflight v1` completion.

Manual dispatch remains recovery or explicit replay only.

The workflow restores current P0B, P1 and P2 artifacts, builds twice, proves deterministic replay, validates all decisions and queues, rejects false market facts, global source bans, provider preselection, adapter implementation, Evidence Admission and manual-only activation, then emits a KPMO receipt and 90-day artifact.

## Outputs

```text
claim-suitability-resolution-ledger-v2.json
gate1-terminal-resolution-ledger-v2.json
candidate-role-retirement-ledger-v2.json
replacement-mission-queue-v2.json
adapter-requirement-queue-v2.json
claim-suitability-replacement-manifest-v2.json
```

## Truth boundary

This layer terminally resolves the current metadata-only observations and creates exact replacement work. It executes no target-host egress, selects no provider, implements or activates no source-specific adapter, admits no evidence, creates no market event and creates no Snapshot Candidate.
