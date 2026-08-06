# Program 2 Module B — Governed Normalization

## Objective
Transform accepted collector observations into canonical, reviewable intelligence records without publishing them directly.

## Pipeline

```text
collector-snapshot.json
  -> canonical title
  -> brand mapping
  -> category mapping
  -> release year extraction
  -> confidence score
  -> duplicate resolution
  -> publish candidate or review queue
  -> normalization-snapshot.json
```

## Governance

- Collector lineage is preserved on every normalized record.
- Collector-rejected evidence cannot become a publish candidate.
- Confidence below 0.70 requires review.
- Unresolved categories require review.
- No normalized record is published by this module.
- Output is written atomically under `.local-data`.

## Windows PowerShell

```powershell
cd apps\kidults-enterprise-staging

New-Item -ItemType Directory -Force .local-data | Out-Null
Copy-Item examples\collector-input.sample.json .local-data\collector-input.json -Force

npm run collector:run
npm run normalize:run
npm run normalize:status
npm run build:sprint26b
```

Expected baseline:

```text
tests 53
pass 53
fail 0
```

## Outputs

```text
.local-data\collector\collector-snapshot.json
.local-data\normalization\normalization-snapshot.json
```

The normalized snapshot is the governed input for Program 2 Module C — Intelligence Graph.
