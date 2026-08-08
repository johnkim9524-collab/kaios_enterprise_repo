# KIDULTS Autonomous Intelligence Architecture

## Runtime path

Approved Sources
→ Configured Source Adapters
→ NormalizedEvidence Contract
→ Canonical Entity Registry
→ Evidence Ledger
→ Observations
→ Methodology Registry
→ Intelligence Run
→ Core Production Gate
→ Portal Contract Gate
→ Immutable Publication Snapshot
→ Promoted Publication State
→ `/v1/intelligence/current`
→ Locked KIDULTS Portal

## Safety invariants

1. No source-specific payload reaches scoring directly.
2. No evidence without provenance is accepted by an adapter contract.
3. No failed or incomplete run replaces the last promoted production snapshot.
4. No staging snapshot is returned by the production current-intelligence endpoint.
5. Portal preview mode remains isolated from the autonomous backend.
6. Portal Visual Baseline v1.0 is read-only for autonomous jobs.
7. Methodology version and evidence cutoff are attached to every intelligence run.
8. Raw payload hashes and audit events preserve lineage.

## Publication readiness

Core gate currently requires:
- minimum accepted evidence count
- minimum category count
- minimum active source-family count

Portal contract gate additionally requires:
- at least two trend snapshots
- at least three succeeded runs in the correlation window
- at least three category observations for every displayed correlation category

Only a snapshot passing both gates can update `publication_state.portal`.
