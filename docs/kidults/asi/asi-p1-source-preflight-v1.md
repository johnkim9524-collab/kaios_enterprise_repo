# KIDULTS ASI P1 Source Classification and Admission Preflight v1

**Owner:** KPMO  
**Priority:** P1  
**Execution:** Preliminary classification, qualification, Gate 1 decision, and runtime preflight  
**Direction:** Autonomous → Global → Irreplaceable Value → Transparent

## Purpose

P1 converts the source candidates observed in P0B into purpose-specific candidate–mission grains. Every grain is compiled into the existing four Source Classification fleets and seven Source Qualification fleets.

This stage preserves all unknown owner, factual-origin, rights, market-semantic, regional, access, schema, independence, and freshness states as `HOLD`. Canonical endpoint and host identity are the only positive preliminary classification facts.

## Execution chain

```text
P0B Source Candidate Registry
+
Mission Candidate Binding Ledger
        ↓
Candidate–Mission Grain Compiler
        ↓
4 Classification Tasks per Grain
+
7 Qualification Tasks per Grain
        ↓
Actual ASI Runtime Alignment Preflight
        ↓
Gate 1 Source-Safety Decision
        ↓
Evidence Admission Candidate Register
        ↓
Targeted Preflight Action Queue
        ↓
KPMO Receipt and Artifact
```

## Classification fleets

1. `SOURCE_SITE_IDENTITY_OWNER_LINEAGE`
2. `SOURCE_SCOPE_ROLE_CLASSIFICATION`
3. `SOURCE_REGION_LANGUAGE_CLASSIFICATION`
4. `SOURCE_MARKET_SEMANTICS_CLASSIFICATION`

Preliminary classification state:

- Canonical host: `PASS`, bounded to endpoint and host identity only;
- Owner and factual origin: `HOLD / UNKNOWN`;
- Provenance: discovery lineage only, not factual origin;
- Scope relevance and source role: hints only;
- Region and language: hints only, not coverage;
- Market semantics: not verified.

## Qualification fleets

1. `SOURCE_UTILITY_VALUE_ANALYSIS`
2. `SOURCE_RIGHTS_COMPLIANCE_ANALYSIS`
3. `SOURCE_TECHNICAL_ACCESS_SCHEMA_ANALYSIS`
4. `SOURCE_COVERAGE_BIAS_ANALYSIS`
5. `SOURCE_INDEPENDENCE_REDUNDANCY_ANALYSIS`
6. `SOURCE_FRESHNESS_STABILITY_ANALYSIS`
7. `SOURCE_COST_ROI_ANALYSIS`

All critical qualification states remain `HOLD` until evidence exists. Utility and ROI values are advisory only. They cannot create permission or admission.

## Gate 1 Source Safety

A Gate 1 PASS requires all of the following:

```text
Canonical Source Identity
Owner and Factual Origin Traceable
Purpose-Specific Rights Sufficient
Market Semantics Verified
Technical Access and Schema Preflight
Regional Relevance Verified
No Provider-Direct Path
No Unresolved Critical Conflict
```

Metadata hints cannot satisfy these requirements. Missing or unknown evidence produces `HOLD`, not PASS or REJECT.

## Evidence Admission Candidate Register

Every current candidate–mission grain is registered for future evaluation, but remains:

```text
NOT_READY_GATE1_HOLD
```

An Evidence Admission Candidate is not admitted evidence.

## Targeted Preflight Action Queue

Seven deduplicated actions are generated per unique source candidate:

1. Source owner and factual-origin classification;
2. Purpose-specific rights and terms preflight;
3. Robots, rate-limit, and access preflight;
4. Market-semantic and source-role verification;
5. Regional relevance and language verification;
6. Schema and identifier-surface preflight;
7. Independence and source-removal clustering.

The queue is machine-readable and linked to all affected grains and missions. This stage does not authorize or execute a target-site network probe.

## Automatic activation

```text
Relevant protected-main push
or hourly schedule at minute 52
or successful P0B Bounded Discovery Candidates run
        ↓
Rebuild current P0B candidate outputs
        ↓
Compile classification and qualification grains
        ↓
Run all tasks through ASI Runtime Alignment
        ↓
Emit Gate 1 decisions and action queue
        ↓
Reject overclaim mutations
        ↓
KPMO Receipt and Artifact
```

Manual dispatch remains only for recovery or explicit replay.

## Truth boundaries

```text
Canonical Host ≠ Source Owner
Discovery Provider ≠ Factual Origin
Scope Hint ≠ Relevance PASS
Region Hint ≠ Regional Coverage
Public Metadata ≠ Market Evidence
Rights UNKNOWN ≠ ALLOW
Robots UNKNOWN ≠ ALLOW
Technical Access UNKNOWN ≠ PASS
Gate 1 HOLD ≠ PASS or REJECT
Evidence Admission Candidate ≠ Admitted Evidence
Priority ≠ Permission
```

## Next stage

P1B executes bounded, read-only source-safety preflights where publicly lawful and technically permitted. It must produce evidence-backed Owner/Factual-Origin, Rights, Access, Semantic, Regional, Schema, and Independence assertions before any Gate 1 PASS can exist.
