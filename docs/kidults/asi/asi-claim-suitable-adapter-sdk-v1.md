# KIDULTS ASI Claim-Suitable Adapter SDK v1

**Owner:** KPMO  
**Priority:** P0  
**Direction:** Autonomous → Global → Irreplaceable Value → Transparent

## Purpose

The claim-suitability replacement layer produces 192 adapter requirements. This SDK turns every requirement into a reusable KIDULTS-owned adapter-family contract, deterministic fixture proof and exact source-specific development item.

```text
Replacement Mission Queue
        ↓
Adapter Requirement Queue
        ↓
Strict Adapter SDK
        ↓
Adapter Family Registry
        ↓
Fixture Certification
        ↓
Development Backlog
        ↓
Source-specific mapping and bounded live extraction
```

## Strict Adapter SDK

The SDK validates two event contracts:

### Terminal sold transaction

Required controls include:

- exact schema version;
- source record and object identity;
- explicit terminal `SOLD` state;
- positive realized price;
- ISO currency;
- event and observation time coherence;
- condition or comparability segment;
- source owner and factual origin;
- collect, store and derive rights;
- deterministic duplicate grain.

The SDK rejects listing, bid, ask, offer and reserve observations as sold.

### Exposure and terminal outcome

Required controls include:

- exposure start;
- terminal outcome or explicit censoring;
- exposure end or censoring time;
- failed or withdrawn-state treatment;
- object identity;
- source owner and factual origin;
- collect, store and derive rights;
- deterministic duplicate grain.

## Adapter Family Registry

Requirements are grouped by:

```text
Domain × Evidence Class
```

The current 8 domains and 2 evidence classes produce 16 adapter-family contracts. Each family preserves all governed scopes and regions, required semantics, rights, fields and fail-closed controls.

## Fixture Certification

Every family runs a deterministic positive fixture through the actual SDK twice. Fixture outputs remain permanently:

```text
fixture_only = true
empirical = false
promotable = false
```

Fixture PASS ≠ Live Extraction.  
Live Extraction ≠ Rights PASS.  
Rights PASS ≠ Evidence Admission.

Negative mutation tests reject:

- listing as sold;
- missing rights;
- missing source owner or factual origin;
- zero or invalid realized price;
- invalid currency or time order;
- exposure without an end or censoring state;
- fixture promotion.

## Development Backlog

All 192 requirements receive an exact development item with:

- adapter-family binding;
- scope, domain, region and evidence class;
- required source role and lane class;
- source-profile selection prerequisite;
- source schema observation and versioning prerequisite;
- field-purpose rights prerequisite;
- source-owner and factual-origin prerequisite;
- source-specific mapping and live extraction state.

No provider or adapter is preselected.

## Automatic execution

The workflow activates on:

- relevant protected-main push;
- every hour at minute 42;
- successful `KIDULTS ASI Claim-Suitability Replacement v2` completion.

Manual dispatch remains recovery or explicit replay only.

The workflow restores the latest replacement artifact, builds twice, proves deterministic replay, validates all family, fixture and backlog outputs, runs direct SDK controls, rejects semantic, rights, promotion and implementation overclaims, then emits a KPMO receipt and 90-day artifact.

## Outputs

```text
adapter-family-registry-v1.json
adapter-fixture-certification-v1.json
adapter-development-backlog-v1.json
adapter-sdk-manifest-v1.json
```

## Truth boundary

The generic SDK and 16 adapter-family contracts are implemented and fixture-certified. Source-specific mappings and live extraction are not yet verified. No target-host egress, Evidence Admission, Market Event or Snapshot Candidate is created.
