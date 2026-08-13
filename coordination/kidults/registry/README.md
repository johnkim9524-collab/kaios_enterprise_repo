# KIDULTS Operational Registry v1.0

This directory is the canonical GitHub-based operating registry for the KIDULTS Integrated Intelligence Program.

## Architecture

Each registry uses:

```text
<registry>/
├─ index.json
└─ records/
   └─ <immutable-record>.json
```

`index.json` is a catalog and current-pointer file. Business data is stored in immutable record files.

## Rules

1. Stable IDs are never reused.
2. Published records are never edited in place; corrections create a new record/version.
3. Cross-track links use IDs and canonical references, not duplicated embedded data.
4. Missing data remains missing and is never silently converted to zero.
5. Registry ownership, record production, independent validation, approval and publication remain separated.
6. Chat messages are working-room content and are not official until registered.
7. Every Production release has an approved rollback target.
8. Legacy flat registry files remain compatibility inputs during migration; this Index + Records structure is the canonical target.
