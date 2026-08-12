# KIDULTS A-B-C Collaboration Bootstrap

**Version:** 1.0.0  
**Effective:** 2026-08-12 KST  
**Canonical integration board:** [Issue #234](https://github.com/johnkim9524-collab/kaios_enterprise_repo/issues/234)  
**Integration gate:** [Issue #238](https://github.com/johnkim9524-collab/kaios_enterprise_repo/issues/238)

## Purpose

This directory is the startup package for the three parallel KIDULTS workstreams.

- **Track A — Kidults 120 Score**: produces versioned intelligence snapshot candidates.
- **Track B — Rankability Gate**: independently validates one exact snapshot candidate.
- **Track C — Portal V502 & Data Connection**: renders only released, versioned intelligence artifacts.

ChatGPT conversations are working rooms. GitHub issues, versioned registries, contracts, release manifests, evidence references, and the three official Books are the shared operating record.

## Required reading order

Every human, AI agent, or service joining a workstream must read these files in order:

1. `coordination/kidults/README.md`
2. `coordination/kidults/registry/program-registry.json`
3. `coordination/kidults/registry/roles-and-responsibilities.json`
4. `coordination/kidults/registry/operating-cadence.json`
5. The track-specific bootstrap file in this directory
6. `docs/operations/KIDULTS_ABC_SHARED_DIRECTIVE_V1.md`

## Track bootstrap files

- `TRACK_A_120_SCORE_BOOTSTRAP.md`
- `TRACK_B_RANKABILITY_BOOTSTRAP.md`
- `TRACK_C_PORTAL_V502_BOOTSTRAP.md`

## Mandatory common keys

All cross-track artifacts must carry the same immutable identifiers:

```text
snapshot_id
methodology_version
generated_at
source_mode
evidence_lineage_version
```

A snapshot-ID mismatch blocks handoff and Production promotion.

## Official artifact chain

```text
Track A: snapshot-candidate.json
        ↓ same snapshot_id
Track B: rankability-assessment.json
        ↓ same snapshot_id
Track C: portal-release-manifest.json
        ↓
Portal QA result
        ↓
Program Owner Production decision
```

## Common operating rules

1. **Generate, validate, approve, and publish are separate responsibilities.**
2. **The Portal renders intelligence and never computes rankability or readiness.**
3. **Rankability validates intelligence and never edits source data.**
4. **The 120 track produces candidates and never self-approves Production.**
5. **Current data describes current observability under explicit assumptions; it does not establish permanent or absolute superiority.**
6. **The eight Core Verticals are the stable coverage structure; the Featured Set is dynamic.**
7. **Missing data must remain missing and must never be silently converted to zero.**
8. **No chat-only statement becomes official until it is registered in GitHub and synchronized into the applicable Book.**
9. **Every release requires a rollback target.**
10. **Proof before procurement.**

## Reporting cadence

- Track A: hourly plus material-event reports
- Track B: every material snapshot candidate plus gate-change reports
- Track C: every contract/release change plus rendering/asset failure reports
- Integrated executive digest: 06:00 KST daily
- Three-Book synchronization review: Sunday and after material doctrine/architecture changes

## Startup acknowledgment

After reading the required materials, each track must post an acknowledgment in its canonical issue containing:

```text
role accepted
canonical issue number
current snapshot_id or waiting state
inputs available
outputs committed
known blockers
next reporting time
```

Canonical issues:

- Track A: #235
- Track B: #236
- Track C: #237
