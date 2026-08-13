# KIDULTS PoC-to-Production Gates v1.0

## Purpose

PoC is free to experiment. Production is promoted only through measured, independent and reversible gates.

```text
PoC experiment
  → Snapshot candidate
  → Independent Rankability validation
  → Asset / rights / Portal QA
  → Program Owner approval
  → Production
  → Continuous 120 improvement
```

## G0 — Baseline locked

Required:

- Eight Core Verticals identified
- Source and provider mode declared
- Methodology and lineage versions declared
- Assumptions and interpretation limits declared
- Reproducible provider-independent baseline preserved

Block when the baseline is mutable, non-reproducible or interpreted as permanent superiority.

## G1 — Snapshot contract valid

Required:

- `snapshot-candidate.json` validates
- Eight vertical entries exist
- Same snapshot, methodology and lineage IDs are used
- Missing data remains missing
- Evidence references resolve
- Historical baselines remain intact

## G2 — Rankability complete

Required:

- `rankability-assessment.json` validates
- Assessment references the exact candidate snapshot ID
- Gate state is explicit
- Blocking dimensions and exit criteria are measurable
- Provider-spend recommendation is explicit

A `blocked` state stops promotion. A `conditional` state requires explicit residual-risk acceptance.

## G3 — Asset and rights ready

Required:

- Featured objects and Hero come from the approved snapshot
- Editorial assets are Production Ready
- Rights state is Rights Cleared
- Hero, Gallery, Mobile, Research and Thumbnail variants meet release requirements
- Asset and rights versions are recorded

## G4 — Portal and operational QA pass

Required:

- Portal release manifest validates
- Portal consumes published snapshot and registries only
- Desktop, tablet and mobile QA pass
- Accessibility and performance pass
- No ranking calculation or missing-to-zero conversion exists in Portal
- Monitoring and rollback target exist
- Only intended files are included

## G5 — Program Owner approval

John reviews:

- Integrated evidence
- Rankability state
- Residual risks
- Provider and cost implications
- Rollback readiness
- Strategic timing

Only G5 promotes to Production.

## Shadow Production

New providers, algorithms or pipelines run in Shadow mode before replacing Production.

Recommended initial period: 7–14 consecutive days.

Compare:

- Coverage uplift
- Precision
- Demand and scarcity evidence
- Freshness
- Source diversity
- Failure and retry rate
- Cost
- Rank stability
- Featured-set changes
- Human intervention frequency

## Production rollback

Every release keeps:

```text
current release
previous release
archived release history
```

Rollback sequence:

1. Disable current release
2. Promote previous approved snapshot/release
3. Invalidate Portal cache
4. Open incident
5. Preserve evidence and timeline
6. Complete root-cause and corrective-action review

## Fail-closed conditions

- Snapshot-ID mismatch
- Missing lineage or methodology
- Rankability blocked
- Rights or asset not ready
- Missing data converted to zero
- Portal modifies intelligence result
- No rollback target
- Critical stress or scale failure unresolved
- Provider dependency without fallback
