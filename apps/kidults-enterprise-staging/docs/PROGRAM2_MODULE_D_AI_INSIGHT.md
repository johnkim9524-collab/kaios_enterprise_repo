# Program 2 Module D — Governed Insight Engine

## Objective

Convert the deterministic Kidults intelligence graph into explainable executive signals without direct publishing or autonomous external claims.

## Flow

```text
Collector → Normalization → Intelligence Graph → Insight Snapshot
```

## Generated insight types

- category momentum
- category signal
- brand opportunity
- brand signal
- evidence concentration risk

Every insight includes a score, confidence value, recommendation, evidence lineage and explainability metrics.

## Governance

- accepts only `kidults.graph.v1`
- preserves observation IDs as evidence lineage
- no personal data
- no external AI API dependency
- deterministic rule-governed output
- no direct publishing
- confidence is bounded from 0 to 1

## PowerShell validation

```powershell
cd apps\kidults-enterprise-staging
New-Item -ItemType Directory -Force .local-data | Out-Null
Copy-Item examples\collector-input.sample.json .local-data\collector-input.json -Force
npm run collector:run
npm run normalize:run
npm run graph:build
npm run insight:build
npm run insight:status
npm run build:sprint26d
```

Expected baseline: 67 tests passed, 0 failed.

## Output

```text
.local-data\insights\insight-snapshot.json
```
