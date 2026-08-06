# Program 2 Module C — Intelligence Graph

## Objective

Convert normalized collectible intelligence into a deterministic, lineage-preserving graph for downstream insight generation. This module does not publish public content.

## Graph model

### Node types
- item
- brand
- category
- source
- year

### Relations
- BRANDED_BY
- IN_CATEGORY
- OBSERVED_AT
- RELEASED_IN
- ACTIVE_IN

Every edge preserves the source observation identifier. Stable SHA-256 identifiers make repeated builds deterministic.

## PowerShell validation

```powershell
git fetch origin
git checkout feat/kidults-program2-module-c-intelligence-graph
cd apps\kidults-enterprise-staging

New-Item -ItemType Directory -Force .local-data | Out-Null
Copy-Item examples\collector-input.sample.json .local-data\collector-input.json -Force

npm run collector:run
npm run normalize:run
npm run graph:build
npm run graph:status
npm run build:sprint26c
```

Expected baseline:

```text
tests 59
pass 59
fail 0
```

## Output

```text
.local-data\graph\intelligence-graph.json
```

## Governance
- accepts only `kidults.normalized.v1`
- no direct publishing
- no personal data
- deterministic identifiers
- source observation lineage retained on all semantic edges
- local and staging output only
