# KIDULTS Phase 2 — Content, Data & Provider Plan v1.1

**Effective:** 2026-08-30  
**Owner:** KPMO / Atlas  
**Execution board:** #294  
**Production:** HOLD

## Objective

Connect product functions and governed data to the Portal without allowing the Portal to calculate intelligence or consume raw Provider payloads. Provider negotiations, evaluation volumes and content must follow the claim-specific zero-defect sample policy.

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
→ Negotiated Evidence Tier and Volume Band
→ Canary 5
→ Bounded Functional Pilot 30–120
→ Optional Adapter Qualification
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
6. Provider evidence tier and claim-ceiling disclosure for every provider-derived statement.

No content becomes public solely because a file exists. It needs Snapshot alignment, methodology, evidence lineage, rights and an accepted publication state.

Provider-facing and public content must not state or imply that:

- 120 records are a universal launch minimum;
- 120/120 proves Adapter or product reliability;
- a schema probe, canary or pilot means Product, Public or Production connection;
- one provider sample proves market representativeness;
- a credential, membership or technical endpoint creates reuse rights;
- 459, 1,840 or 4,603 are committed purchase volumes.

## Data connection workstream

The Portal consumes `data-source-manifest-v1.json` through a fail-closed gateway.

- Required local contracts must resolve.
- Remote source URLs are prohibited.
- Internal Provider Shadow payloads are withheld.
- Quality and Monthly feeds cannot overlay public metrics until their exact contract passes.
- Missing values remain missing.
- Candidate data remains unavailable until Track B and the Integration Gate clear it.
- Every provider cohort carries sample policy ID/digest, tier, claim ceiling, raw `n`, effective `n`, defect counts, rights census and Track B receipt.

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

Provider outreach must request exact fields, stable identifiers, provenance, freshness, permitted use, retention, deletion, correction, incremental delivery and staged pricing.

### Claim-specific staged evaluation

| Tier | Negotiation volume | Permitted claim |
|---|---:|---|
| Control | 1+ | deterministic mechanics only |
| Canary | 5 | live schema/boundary smoke only |
| Bounded Functional Pilot | 30–120 | private E2E functionality only |
| Adapter Qualification | 459 zero-failure target or exact equivalent | source pipeline qualified |
| Private E2E Reliability | 1,840 zero-failure target or exact equivalent | bounded private reliability |
| Beta Reliability | 4,603 zero-failure target or exact equivalent | bounded beta reliability |

Rights, provenance, identity, schema and critical state are per-record census gates with zero critical-defect tolerance. The statistical targets do not authorize illegal or mismatched records and do not establish market coverage.

The provider-facing default is to discuss only the current stage and initial volume band. Higher tiers are optional capacity and pricing information, not minimum commitments. No annual prepayment, take-or-pay, forced exclusivity or automatic pilot-to-production conversion is accepted before the relevant stage and value gates pass.

## Provider negotiation content

Before any message, TRACK Z prepares an internal brief naming the product decision, evidence gap, requested stage, claim ceiling, rights schedule, fields, commercial ceiling, stop criteria, alternative source and prior communication evidence.

The first provider message must clearly state:

- private non-production purpose;
- staged evaluation and initial volume band;
- no purchase, launch or production commitment;
- exact rights questions;
- retention and deletion posture;
- schema, provenance, rate-limit and staged pricing asks;
- no raw public redistribution unless separately agreed.

Canonical controls:

- `coordination/kidults/governance/provider-evidence-zero-defect-sample-policy-v1.json`
- `coordination/kidults/provider/provider-sample-governance-negotiation-v1.json`
- `docs/strategy/IH_PROVIDER_SAMPLE_GOVERNANCE_NEGOTIATION_V1.md`
- `coordination/kidults/provider/templates/provider-staged-evaluation-content-v1.md`

## Track handoffs

- **TRACK Z:** prepares provider brief/content and negotiates rights, stage, price bands, remedies and exit without committing spend.
- **A → B:** immutable Candidate + Evidence Package with sample-policy binding.
- **B → KPMO / C:** exact cohort, effective sample, confidence-bound, coverage and claim-ceiling assessment.
- **C:** consumes only released contracts and renders the approved evidence tier and claim ceiling.
- **D:** connects non-Production runtime, PostgreSQL/PITR and read-only monitoring.
- **E:** reads connection, Provider, Snapshot, Assessment and Runtime truth.
- **KPMO:** verifies exact-head policy, external communication, spend, contract, credential and G5 boundaries.

## Current external communication state

PSA and HobbyKorea follow-up messages remain `DRAFT_ONLY_NO_SEND`. This plan prepares the negotiation system but grants no external-send, spend, contract, credential, Public, Production or G5 authority.
