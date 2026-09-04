# KIDULTS Integrated Coordination Hub

**Version:** 1.2  
**Effective date:** 2026-09-03  
**Program owner:** John / `johnkim9524-collab`  
**Integration conductor and registry custodian:** Atlas  
**Canonical board:** GitHub Issue #234

## Purpose

This directory is the shared operating memory for six accountable KIDULTS workstreams:

1. **Track A — Intelligence Factory & Current-SOLD Engine**
2. **Track B — Rankability & Validation Gate**
3. **Track C — Portal V502 & Experience Layer**
4. **Track D — Data Platform & Production Reliability**
5. **Track E — Executive Operating System**
6. **Track Z — Provider, Rights & External Source Authority**

ChatGPT conversations are working rooms. GitHub issues, versioned registry records, schemas, contracts, handoffs, merged releases and the three official Books are the official shared record.

## Primary operating flow

```text
Track Z: lawful source, provider and rights authority
        ↓
Track A / ASI: Observation → Atomic Current-SOLD Admission
        ↓
Track A: Current-SOLD Event → Canonical Evidence
        ↓
Track D: append-only private ledger and recovery evidence
        ↓
Track A: immutable snapshot candidate + Evidence Package
        ↓
Track B: independent rankability assessment of the exact pair
        ↓
Integration Gate G0–G2
        ↓
Track C: Portal release candidate and experience QA
Track D: runtime, deployment, monitoring and rollback preparation
Track E: executive lifecycle, blocker and decision projection
        ↓ parallel outputs
Integration Gate G3–G4
        ↓
Program Owner: G5 Production approval
        ↓
Track D: snapshot publication and Production deployment
        ↓
Track C: post-deploy experience verification
        ↓
Portal / Research / Archive
```

## Current-SOLD ownership

Current-SOLD is a KIDULTS-owned intelligence product and a **Track A accountable job**.

- Track A owns the product contract, atomic admission, canonical event, Evidence and Candidate/Evidence handoff.
- ASI executes the Track A runtime.
- KPMO owns governance, approval, receipt authority and Red-Team controls.
- Track Z supplies lawful provider/source and field-by-purpose rights authority.
- Track D supplies private runtime, append-only PostgreSQL, PITR and restore proof.
- Track B independently validates one immutable Candidate/Evidence pair and cannot alter source Evidence.
- Track C renders only an approved Projection.

Canonical JD:

- `coordination/kidults/governance/track-a-current-sold-job-description-v1.json`
- `docs/kidults/governance/track-a-current-sold-job-description-v1.md`

## Canonical issues

- **#234** — Integrated Operating Board
- **#235** — Track A: Intelligence Factory & Current-SOLD Engine
- **#236** — Track B: Rankability & Validation Gate
- **#237** — Track C: Portal V502 & Experience Layer
- **#238** — Integration and Production Gate
- **#240** — Track D: Data Platform & Production Reliability
- **#256** — Track E: Executive Operating System
- **#1166** — Track Z: Provider/Rights operating control

## Canonical Registry

The canonical target is the `Index + Immutable Records` model under:

`coordination/kidults/registry/`

- `catalog.json` — registry catalog and ownership
- `<registry>/index.json` — registry index and current pointers
- `<registry>/records/*.json` — immutable records
- `registry-engine/` — schemas, templates and validation rules

Legacy flat JSON files in `registry/` remain compatibility inputs during migration but do not supersede registered immutable records.

## Core rules

1. One immutable `snapshot_id` per promotion cycle.
2. Generate, validate, approve and publish are separate responsibilities.
3. Track A owns the Current-SOLD engine, Evidence and candidates but cannot self-publish or self-approve Track B.
4. Track B validates one exact candidate/evidence pair and cannot alter source evidence.
5. Track C renders approved intelligence and never calculates readiness, admission or ranking.
6. Track D operates approved intelligence and never approves Production.
7. Track Z provides upstream source/provider/rights authority and never owns KIDULTS canonical identity.
8. Track E projects lifecycle and governance truth and never creates market truth.
9. Missing values remain missing; silent zero conversion is prohibited.
10. Every release requires a verified rollback target.
11. Current measurements describe current observability, not permanent superiority.
12. No chat-only doctrine becomes official without Registry and change-control evidence.
13. Master Book, Baseline Book and Architecture Book remain the only official Book structure.
14. Proof before procurement.
15. Current-SOLD sample size is claim-specific and policy-derived; rights and schema are per-record census gates.
16. All tracks, engines and provider negotiations consume `current-sold-sample-governance-v1.json` and its alignment contract.
17. A release request automatically selects the minimum evidence tier; no lower tier can satisfy a higher claim.
18. CONTROL, fixture, committed replay and private candidate output never increment lawful empirical Current-SOLD.
19. Current-SOLD canonical admission must use the atomic Track A entrypoint; low-level classifiers are internal primitives.
20. Public, Production and G5 remain separate explicit gates.

## Standard artifact chain

```text
current-sold batch receipt
current-sold event + Canonical Evidence
append-only ledger write receipt
snapshot-candidate.json
Evidence Package
rankability-assessment.json
portal-release-manifest.json
runtime-readiness-record.json
portal-qa-result.json
production-decision.json
published-snapshot.json
production-release-record.json
```

All cycle artifacts reference the same `snapshot_id`, methodology version and evidence-lineage version.

## Product positioning

The canonical KIDULTS category definition, customer value propositions, product hierarchy, Core/provider boundary, commercial packaging and claims policy are defined in:

- [KIDULTS Product Positioning & Value Proposition v1.0](./KIDULTS_PRODUCT_POSITIONING_VALUE_PROPOSITION_V1.md)
- [KIDULTS Target Market Competitiveness Strategy v1.0](./KIDULTS_TARGET_MARKET_COMPETITIVENESS_STRATEGY_V1.md)
- [KIDULTS Official Competitor Registry v1](./market/competitor-registry-v1.json)

These records define the product contract and the value-chain execution strategy. They do not create a live Projection, authorize a provider, approve external spend or change the Production/Public/G5 HOLD.
