# KIDULTS Integrated Coordination Hub

**Version:** 1.0  
**Effective date:** 2026-08-12  
**Program owner:** John / `johnkim9524-collab`  
**Integration conductor:** Atlas  
**Canonical board:** GitHub Issue #234

## Purpose

This directory is the shared operating memory for the three parallel KIDULTS workstreams:

1. **Track A — Kidults 120 Score**
2. **Track B — Rankability Gate**
3. **Track C — Portal V502 & Data Connection**

ChatGPT conversations are working rooms. GitHub issues, versioned registry files, schemas, merged code, release manifests, and the three official Books are the official shared record.

## Primary operating flow

```text
Track A: 120 snapshot candidate
        ↓
Track B: independent rankability assessment
        ↓
Integration Gate: contract, rights, QA and release decision
        ↓
Track C: Portal V502 release manifest and rendering
        ↓
Program Owner: Production approval
        ↓
Published snapshot / Portal / Research / Archive
```

## Canonical issues

- **#234** — Integrated Operating Board
- **#235** — Track A: Kidults 120 Score
- **#236** — Track B: Rankability Gate
- **#237** — Track C: Portal V502 & Data Connection
- **#238** — Integration Gate

## Registry files

- `registry/program-registry.json` — program, tracks, issues and official sources
- `registry/roles-and-responsibilities.json` — role definitions, JD, authority and prohibitions
- `registry/operating-cadence.json` — reporting cadence, handoffs and escalation rules

## Official announcement

The human-readable shared announcement is maintained at:

`docs/operations/KIDULTS_SHARED_PROGRAM_ANNOUNCEMENT_V1.md`

## Core rules

1. **One snapshot ID:** all handoff artifacts in one release cycle use the same immutable `snapshot_id`.
2. **Separation of duties:** generation, independent validation, approval and publication are separate responsibilities.
3. **Portal is a consumer:** Portal V502 renders approved intelligence and does not calculate rankings.
4. **Rankability is independent:** it assesses a snapshot and does not alter source data.
5. **120 does not self-publish:** Track A produces candidates but cannot approve Production.
6. **Fail closed:** missing lineage, ID mismatch, unresolved rights, silent zero conversion or missing rollback blocks promotion.
7. **Three-Book discipline:** material decisions synchronize to Master Book, Baseline Book and Architecture Book; no fourth Book is introduced.
8. **No chat-only doctrine:** new terminology or policy is not official until registered here or in the canonical issues and approved through change control.

## Standard artifact chain

```text
snapshot-candidate.json
rankability-assessment.json
portal-release-manifest.json
portal-qa-result.json
production-decision.json
```

Each artifact references the same `snapshot_id`, methodology version and evidence lineage.
