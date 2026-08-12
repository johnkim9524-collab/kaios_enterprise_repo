# KIDULTS Operational Registry Validation

## Local validation

```bash
node scripts/kidults/coordination/validate-coordination.mjs
node scripts/kidults/registry/validate-operational-registry.mjs
```

## Automated validation

`.github/workflows/kidults-operational-registry-validate.yml` runs on relevant pull requests, pushes to `main`, and manual dispatch.

## Fail-closed checks

- Required coordination and operational registry files exist and parse as JSON.
- Four Core Tracks A/B/C/D are registered.
- Exactly eight Core Verticals are registered.
- Registry record counts match index entries.
- Every indexed record path exists.
- Record IDs match index IDs and are globally unique.
- Current pointers resolve to registered records.
- The provider-independent baseline pointer resolves.
- Track B cannot have an Assessment while no Candidate Snapshot exists.

A failed check blocks merge and Production promotion.
