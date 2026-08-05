# KIDULTS Sprint B34 — Intelligence Engine Foundation

## Objective

Convert the frozen Portal RC1 from a governed presentation layer into a reproducible intelligence-production system.

## Non-negotiable gates

- Portal RC1 design and responsive baseline remain frozen.
- Production claims remain disabled until validated source lineage exists.
- Every published metric must be reproducible from retained normalized observations.
- No collector may write directly to the public portal asset.
- All runtime code, comments and emitted diagnostics remain English-only.

## Target flow

Source registry → Collector adapters → Raw observations → Normalizer → Deduplication → Scoring → Validation → Release candidate asset → Portal

## Work breakdown

### B34-A1 — Source registry and ingestion contract

- Governed source registry
- Source-family classification
- Collection policy and cadence
- Attribution and licensing fields
- Stable observation envelope

### B34-A2 — Raw observation collector shell

- File-based adapter interface
- Deterministic fixture collector
- Raw observation append-only output
- Run manifest and provenance

### B34-A3 — Normalization and identity

- Canonical category names
- Entity and item identifiers
- Currency and date normalization
- Duplicate and replay protection

### B34-A4 — Scoring foundation

- Confidence, velocity, liquidity and canon inputs
- Explicit weights and versioning
- Kidult 100 calculation shell
- Reproducible score manifest

### B34-A5 — Validation and release gate

- Schema validation
- Distribution and completeness checks
- Source-lineage gate
- Staging-only release generation

### B34-A6 — Portal integration certification

- Generate `intelligence-data.next.json`
- Compare with the frozen RC1 asset
- Require explicit promotion to replace the public asset
- Desktop and mobile regression audit

## Definition of done

1. One command builds a deterministic staging intelligence asset from fixtures.
2. A second run produces byte-equivalent output except for explicitly excluded run metadata.
3. Every headline value has retained evidence lineage.
4. Invalid or incomplete data fails closed.
5. The public portal asset is not overwritten automatically.
6. Automated B34 certification passes.

## Initial command set

```powershell
node scripts/kidults/b34/build-intelligence-engine.mjs
node scripts/kidults/b34/audit-intelligence-engine.mjs
```

## Current status

- B34 branch created.
- A1 contract and source registry foundation implemented.
- A2 deterministic fixture pipeline implemented.
- A3–A6 pending.