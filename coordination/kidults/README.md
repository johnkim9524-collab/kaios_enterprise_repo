# KIDULTS Integrated Coordination Hub

**Version:** 1.1  
**Effective date:** 2026-08-12  
**Program owner:** John / `johnkim9524-collab`  
**Integration conductor and registry custodian:** Atlas  
**Canonical board:** GitHub Issue #234

## Purpose

This directory is the shared operating memory for four KIDULTS workstreams:

1. **Track A — 120 Intelligence Factory**
2. **Track B — Rankability & Validation Gate**
3. **Track C — Portal V502 & Experience Layer**
4. **Track D — Data Platform & Production Reliability**

ChatGPT conversations are working rooms. GitHub issues, versioned registry records, schemas, contracts, handoffs, merged releases and the three official Books are the official shared record.

## Primary operating flow

```text
Track A: immutable snapshot candidate + Evidence Package
        ↓
Track B: independent rankability assessment of the exact snapshot ID
        ↓
Integration Gate G0–G2
        ↓
Track C: Portal release candidate and experience QA
Track D: runtime, deployment, monitoring and rollback preparation
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

## Canonical issues

- **#234** — Integrated Operating Board
- **#235** — Track A: 120 Intelligence Factory
- **#236** — Track B: Rankability & Validation Gate
- **#237** — Track C: Portal V502 & Experience Layer
- **#238** — Integration and Production Gate
- **#240** — Track D: Data Platform & Production Reliability

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
3. Track A produces candidates and cannot self-publish.
4. Track B validates one exact candidate and cannot alter source evidence.
5. Track C renders approved intelligence and never calculates readiness or ranking.
6. Track D operates approved intelligence and never approves Production.
7. Missing values remain missing; silent zero conversion is prohibited.
8. Every release requires a verified rollback target.
9. Current measurements describe current observability, not permanent superiority.
10. No chat-only doctrine becomes official without Registry and change-control evidence.
11. Master Book, Baseline Book and Architecture Book remain the only official Book structure.
12. Proof before procurement.

## Standard artifact chain

```text
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
