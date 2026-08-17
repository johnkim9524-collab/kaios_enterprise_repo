# KIDULTS Phase 2 — Content, Data & Provider Plan v1

**Effective:** 2026-08-16  
**Owner:** KPMO / Atlas  
**Execution board:** #294  
**Production:** HOLD

## Objective

Connect product functions and governed data to the Portal without allowing the Portal to calculate intelligence or consume raw Provider payloads.

## Operating sequence

```text
Self-collected Evidence
→ Registered Evidence Lineage
→ Immutable Snapshot Candidate
→ Independent Assessment
→ Approved Publication Contract
→ Portal Consumption
```

Provider work runs in parallel as a requirement and shadow-integration stream:

```text
Gap Quantification
→ Provider Requirement
→ Rights / Schema / Freshness Contract
→ Shadow Ingestion
→ Incremental Value Test
→ Spend Decision
→ Contract
→ Separate Production Gate
```

## Content workstream

1. Monthly Intelligence content contract.
2. Vertical Intelligence contract.
3. Object Intelligence contract.
4. Kidult 100 publication contract.
5. Evidence Definition panels for every public metric.

No content becomes public solely because a file exists. It needs Snapshot alignment, methodology, evidence lineage, rights and an accepted publication state.

## Data connection workstream

The Portal now consumes `data-source-manifest-v1.json` through a fail-closed gateway.

- Required local contracts must resolve.
- Remote source URLs are prohibited.
- Internal Provider Shadow payloads are withheld.
- Quality and Monthly feeds cannot overlay public metrics until their exact contract passes.
- Missing values remain missing.
- Candidate data remains unavailable until Track B and the Integration Gate clear it.

## Provider strategy

### SELF-FIRST

- Identity / canon
- Market observation
- Availability
- Culture / attention
- Macro and category signals

### HYBRID

- Auction and private-sale events

### PROVIDER-REQUIRED

- Authoritative sold transactions
- Defensible provenance event history
- Authentication and condition observations

Provider outreach must request exact fields, stable identifiers, provenance, freshness, permitted use, retention and incremental delivery.

## Track handoffs

- **A → B:** immutable Candidate + Evidence Package.
- **B → KPMO / C:** exact Snapshot assessment and gate result.
- **C:** consumes only released contracts.
- **D:** connects non-Production runtime and read-only monitoring.
- **E:** reads connection, Provider, Snapshot, Assessment and Runtime truth.
- **KPMO:** accepts residual risk and controls G5.
