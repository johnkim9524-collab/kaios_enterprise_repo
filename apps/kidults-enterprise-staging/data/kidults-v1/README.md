# KIDULTS V1 Real Data Engine

This directory is the governed input boundary for the KIDULTS Public Enterprise V1.0 baseline.

## Inputs

- `signals.csv`: normalized category-level observations with source IDs and timestamps.
- `methodology.json`: scoring weights, confidence rules and release controls.

## Output

Run:

```powershell
python apps/kidults-enterprise-staging/scripts/generate_kidults_v1.py
```

The generator writes:

`apps/kidults-enterprise-staging/public/public-enterprise-preview/intelligence-data.json`

## Release rules

The generator fails when required columns are missing, category coverage is below the baseline, or the missing-value ratio exceeds the methodology contract.

## Data status

The included rows are a governed baseline template, not independently verified production market data. Replace rows only with attributable observations that preserve source lineage.
