# KIDULTS A-B-C Shared Collaboration Directive v1.0

**Effective date:** 2026-08-12 KST  
**Audience:** Track A, Track B, Track C, all supporting AI agents and services  
**Program Owner:** John  
**Integration Conductor:** Atlas  
**Canonical board:** GitHub Issue #234  
**Track issues:** #235, #236, #237  
**Integration gate:** #238

---

## Official announcement

KIDULTS is now operated as one integrated intelligence program rather than three isolated chat projects.

The three workstreams retain independent responsibilities, but all work must use the same registry, identifiers, contracts, evidence references, gate process and official three-Book structure.

```text
Track A — Kidults 120 Score
creates an immutable snapshot candidate
        ↓
Track B — Rankability Gate
independently validates the exact candidate
        ↓
Integration Gate
verifies contract, asset, rights, QA and rollback
        ↓
Track C — Portal V502 & Data Connection
renders the released snapshot
        ↓
Program Owner
approves Production promotion and residual risk
```

> One Program. One Language. One Standard. One Source of Truth.

---

## What is official

Official program memory consists of:

- `coordination/kidults/`
- GitHub Issues #234–#238
- Merged contracts, registries, evidence references and release manifests
- Master Book, Baseline Book and Architecture Book

ChatGPT conversations are working rooms. A chat statement is not official by itself.

---

## Common doctrine

1. The eight Core Verticals are the stable coverage structure.
2. The Current Featured Set, Hero, representative objects, signals and research are dynamic.
3. Current measurements express current observability and readiness under explicit assumptions; they do not establish permanent or absolute superiority.
4. The 120 track generates intelligence candidates.
5. Rankability independently validates candidates.
6. Portal V502 presents released intelligence and never calculates it.
7. Generate, validate, approve and publish are separate responsibilities.
8. Missing data remains missing; it must never be silently converted to zero.
9. Every cross-track artifact uses one immutable `snapshot_id`.
10. Every release has a rollback target.
11. Proof before procurement.
12. No new doctrine or terminology becomes official only inside a chat session.

---

# Track A — Kidults 120 Score

## Role

Primary PoC intelligence producer and current-readiness measurement track.

## Job description

Track A discovers what Right Data is required, measures what the current system can observe, improves speed, quality and scale, preserves provider-independent baselines and produces reproducible snapshot candidates.

## Required deliverables

- `snapshot-candidate.json`
- Run manifest
- Hourly reports
- Material-event reports
- Eight-Vertical readiness metrics
- Precision, demand, scarcity, confidence, freshness and source-diversity evidence
- Stress and scale evidence
- Provider-gap requirements

## Authority

- Choose experiments within approved PoC scope
- Recommend current Featured candidates
- Recommend collection and scoring priorities
- Mark internal readiness before independent review

## Prohibited

- Direct Portal publication
- Self-approval of Production
- Permanent-superiority claims
- Historical-baseline overwrite
- Missing-to-zero conversion
- Provider-contract approval
- Modification of Track B assessment

## Cadence

- Hourly report
- Immediate material-event report
- Daily handoff before the integrated digest

---

# Track B — Rankability Gate

## Role

Independent validator before ranking, market-data spend and Production promotion.

## Job description

Track B evaluates one exact immutable snapshot candidate and determines whether ranking is currently justified, stable and evidence-supported. It defines blockers and measurable exit criteria without modifying Track A data.

## Required deliverables

- `rankability-assessment.json`
- Gate state: `blocked`, `conditional`, or `publishable`
- Blocking-dimension analysis
- Exit criteria
- Sensitivity and stability report
- Provider-spend readiness recommendation
- Residual-risk statement

## Authority

- Set the independent Rankability Gate state
- Block release on insufficient evidence
- Recommend conditional release with explicit limits
- Request additional evidence from Track A

## Prohibited

- Source-data or Track A metric changes
- Portal visual selection
- Provider-contract approval
- Assessment reuse for another snapshot ID
- Permanent-superiority interpretation
- Final Production approval

## Cadence

- Every material candidate
- Immediate report on gate-state change
- Daily handoff before the integrated digest

---

# Track C — Portal V502 & Data Connection

## Role

Published-snapshot consumer, presentation layer and Portal QA track.

## Job description

Track C builds a modular premium intelligence interface that renders only approved versioned snapshots and registry-selected editorial assets. It exposes current data mode, snapshot ID, freshness, confidence and interpretation limits without performing intelligence calculations.

## Required deliverables

- `portal-release-manifest.json`
- V502 Portal implementation
- Contract-validation result
- Desktop/tablet/mobile QA result
- Performance and accessibility result
- Asset and rights readiness reference
- Release notes
- Rollback target

## Authority

- Choose implementation details that preserve approved contracts and design system
- Block release on contract, asset, rights, responsive or performance failure
- Request missing contracts and assets
- Recommend Portal release readiness

## Prohibited

- Ranking or readiness calculation
- Independent Featured-Set selection
- Raw PoC/provider data access
- Data alteration for design convenience
- Prototype or uncleared Production assets
- Missing-to-zero conversion
- Release without responsive QA and rollback

## Cadence

- Every material contract/release change
- Immediate failure report
- Daily handoff before the integrated digest

---

# Shared handoff contract

Every cross-track handoff must include:

```text
handoff_id
from_track
to_track
snapshot_id
artifact_reference
artifact_version
requested_action
deadline
known_limitations
acceptance_criteria
```

The receiver must respond with one of:

```text
accepted
rejected
correction_requested
```

Silence is not approval. A receiver must not directly rewrite the producer's artifact.

---

# Integration gates

```text
G0 — Baseline locked
G1 — Snapshot contract valid
G2 — Rankability assessment complete
G3 — Asset and rights ready
G4 — Portal contract and responsive QA pass
G5 — Program Owner Production approval
```

Promotion is blocked by:

- Snapshot-ID mismatch
- Missing lineage or methodology version
- Rankability state `blocked`
- Missing evidence
- Missing values converted to zero
- Uncleared or non-Production asset
- Portal-computed rank/readiness
- No rollback target
- Unresolved critical stress or scale failure

---

# Reporting and communication

## Track reports

Every report contains:

1. Objective
2. Completed deliverables
3. Key findings
4. Evidence references
5. Blockers and risks
6. Decisions requested
7. Handoffs
8. Next actions and timing

## Integrated report

Atlas prepares the integrated executive digest at 06:00 KST with:

- Latest snapshot and artifact IDs
- Status of A, B and C
- Gate status
- Cross-track blockers
- Material changes
- Decisions required from John
- Provider implications
- Release readiness
- Next 24-hour handoffs

## Special-event reporting

Report immediately for:

- Snapshot candidate ready
- Rankability gate change
- Featured Set change
- Significant metric or source change
- Contract/schema break
- Rights/asset failure
- Stress/scale failure
- Portal release/rollback failure
- Provider assumption change

---

# GitHub operating discipline

- #234 is the canonical integrated board.
- #235 is Track A's operating issue.
- #236 is Track B's operating issue.
- #237 is Track C's operating issue.
- #238 is the promotion gate.
- At most one active implementation branch per track.
- Each PR names the track, snapshot ID, gate state and rollback target.
- Cross-track contract changes require producer and consumer review.
- Never use `git add .` in a mixed working tree.
- Unmerged branches and chat messages are not Production truth.

---

# Immediate instructions

## To Track A

Lock the current provider-independent baseline, finish the active enrichment pipeline without overwriting it, issue the next immutable candidate and hand it to Track B.

## To Track B

Wait for the exact candidate ID, validate rankability independently, issue one gate state with measurable exit criteria and notify the Integration Gate.

## To Track C

Stop extending hardcoded V501 data. Build V502 as a registry and published-snapshot consumer. Render the eight stable Core Verticals and a dynamic Current Featured Set. Modularize all editorial assets.

## To Atlas

Maintain registries, contracts, gates, handoffs, 06:00 digest, decision traceability and three-Book synchronization.

## To John

Approve material scope, Provider spend, residual risk and Production promotion based on integrated evidence.

---

# Copy-paste startup messages

## Message to Track A

```text
You are Track A — Kidults 120 Score in the KIDULTS Integrated Intelligence Program.
Read coordination/kidults/bootstrap/README.md and TRACK_A_120_SCORE_BOOTSTRAP.md.
Your official issue is #235. GitHub is the canonical record; this chat is a working room.
You produce immutable snapshot candidates with evidence lineage and hourly/material-event reports.
You do not publish to Portal, self-approve Production, overwrite baselines, convert missing data to zero, or claim permanent superiority.
Acknowledge your role in #235 using the bootstrap template, lock the current provider-independent baseline, and report the next candidate snapshot ID and next hourly report time.
```

## Message to Track B

```text
You are Track B — Independent Rankability Gate in the KIDULTS Integrated Intelligence Program.
Read coordination/kidults/bootstrap/README.md and TRACK_B_RANKABILITY_BOOTSTRAP.md.
Your official issue is #236. GitHub is the canonical record; this chat is a working room.
You assess one exact immutable snapshot ID and publish blocked, conditional or publishable with measurable exit criteria.
You do not modify Track A data, select Portal visuals, approve Provider contracts, or reuse assessments for another snapshot.
Acknowledge your role in #236 and state whether you are waiting for a candidate or assessing one exact snapshot ID.
```

## Message to Track C

```text
You are Track C — Portal V502 & Data Connection in the KIDULTS Integrated Intelligence Program.
Read coordination/kidults/bootstrap/README.md and TRACK_C_PORTAL_V502_BOOTSTRAP.md.
Your official issue is #237. GitHub is the canonical record; this chat is a working room.
You render only approved versioned snapshots and Production-ready registry assets.
You do not calculate rankings, select Featured items, read raw PoC/provider data, convert missing data to zero, or publish prototype assets.
Acknowledge your role in #237, stop extending hardcoded V501 content, and state your plan for the V502 snapshot/registry consumer and first release manifest.
```

---

## Closing

The three tracks are intentionally independent but no longer isolated.

- Track A creates intelligence.
- Track B validates intelligence.
- Track C communicates intelligence.
- Atlas integrates and verifies the full program.
- John decides strategy, Provider commitment, residual risk and Production.

**One Program. One Language. One Standard. One Source of Truth.**
