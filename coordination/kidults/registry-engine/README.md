# KIDULTS Registry Engine v1.0

The Registry Engine defines and validates the GitHub-based `Index + Immutable Records` operating model.

## Structure

```text
coordination/kidults/registry/
├─ catalog.json
└─ <registry>/
   ├─ index.json
   └─ records/
      └─ <immutable-record>.json
```

## Invariants

1. Registry indexes contain catalogs and current pointers, not full business payloads.
2. Records are stored one file per immutable stable ID.
3. Published and approved records are never modified in place.
4. Corrections create a new record or version and preserve history.
5. Cross-track references use canonical IDs.
6. `record_count` equals the number of index entries.
7. Every index record path must resolve and the file ID must match the index ID.
8. Missing values stay missing; silent zero conversion is prohibited.
9. Snapshot, assessment and release artifacts in one cycle use the same `snapshot_id`.
10. Registry validation is fail-closed.

## Validation

```bash
node scripts/kidults/registry/validate-operational-registry.mjs
```

The validator checks JSON parsing, required index fields, record counts, duplicate IDs, record-path resolution, four-track registration, eight Core Verticals, baseline pointer integrity and Track B waiting-state consistency.
