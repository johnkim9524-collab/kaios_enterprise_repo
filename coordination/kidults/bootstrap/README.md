# KIDULTS A-B-C-D Collaboration Bootstrap

**Version:** 1.1.0  
**Effective:** 2026-08-12 KST  
**Canonical integration board:** [Issue #234](https://github.com/johnkim9524-collab/kaios_enterprise_repo/issues/234)  
**Integration gate:** [Issue #238](https://github.com/johnkim9524-collab/kaios_enterprise_repo/issues/238)

## Purpose

This directory is the startup package for four KIDULTS workstreams.

- **Track A — 120 Intelligence Factory:** produces versioned intelligence snapshot candidates and Evidence Packages.
- **Track B — Rankability & Validation Gate:** independently validates one exact snapshot candidate.
- **Track C — Portal V502 & Experience Layer:** renders only released, versioned intelligence artifacts.
- **Track D — Data Platform & Production Reliability:** publishes and operates approved intelligence after all gates and G5 approval.

## Required reading order

1. `coordination/kidults/README.md`
2. `coordination/kidults/registry/README.md`
3. `coordination/kidults/registry/catalog.json`
4. The track record under `coordination/kidults/registry/track/records/`
5. The role record under `coordination/kidults/registry/role/records/`
6. The track-specific bootstrap file in this directory
7. The applicable schemas, contracts and handoff records

## Track bootstrap files

- `TRACK_A_120_SCORE_BOOTSTRAP.md`
- `TRACK_B_RANKABILITY_BOOTSTRAP.md`
- `TRACK_C_PORTAL_V502_BOOTSTRAP.md`
- `TRACK_D_DATA_PLATFORM_BOOTSTRAP.md`

## Mandatory common keys

```text
snapshot_id
methodology_version
generated_at
source_mode
evidence_lineage_version
registry_version
```

A snapshot-ID mismatch blocks handoff and Production promotion.

## Official artifact chain

```text
Track A: snapshot-candidate.json + Evidence Package
        ↓ same snapshot_id
Track B: rankability-assessment.json
        ↓
Track C: portal-release-manifest.json + Portal QA
Track D: runtime-readiness-record.json + rollback verification
        ↓
Program Owner: production-decision.json
        ↓
Track D: published-snapshot.json + production-release-record.json
```

## Common rules

1. Generate, validate, approve and publish are separate responsibilities.
2. Portal renders intelligence and never computes ranking/readiness.
3. Rankability never edits Track A evidence.
4. Track D makes approved intelligence operational and cannot approve Production.
5. Current data does not establish absolute or permanent superiority.
6. The eight Core Verticals are stable; Featured Set is dynamic.
7. Missing data is never silently converted to zero.
8. No chat-only result becomes official without Registry entry.
9. Every release requires rollback.
10. Proof before procurement.

## Reporting cadence

- Track A: hourly plus material-event reports
- Track B: every material candidate plus gate-change reports
- Track C: every contract/release change plus rendering/asset failures
- Track D: every deployment/runtime/incident event plus health reports
- Integrated digest: 06:00 KST daily
- Three-Book synchronization: Sunday and after material changes

## Startup acknowledgment

Post in the canonical issue:

```text
role accepted
canonical issue
current snapshot_id or waiting state
inputs available
outputs committed
known blockers
next reporting time
```

Issues: Track A #235 · Track B #236 · Track C #237 · Track D #240
