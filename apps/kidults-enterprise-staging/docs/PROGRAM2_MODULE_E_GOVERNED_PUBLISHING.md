# Program 2 Module E — Governed Publishing

## Objective

Convert governed insights into publication candidates without bypassing quality, evidence, privacy, or production-promotion controls.

## Pipeline

Collector → Normalization → Intelligence Graph → Insight Engine → Publication Gate → Candidate Outputs

## Publication gate

An insight is eligible only when all conditions pass:

- score meets the configured threshold
- confidence meets the configured threshold
- at least two evidence identifiers are present
- risk signals are held for human review

## Outputs

The publisher creates a local snapshot containing:

- archive candidate records
- executive feed candidate records
- search candidate records
- held records and gate reasons
- source lineage
- production-promotion authorization state

No production portal files are overwritten by this module.

## PowerShell validation

```powershell
git fetch origin
git checkout feat/kidults-program2-module-e-governed-publishing

New-Item -ItemType Directory -Force .local-data | Out-Null
Copy-Item examples\collector-input.sample.json .local-data\collector-input.json -Force

npm run collector:run
npm run normalize:run
npm run graph:build
npm run insight:build
npm run publish:build
npm run publish:status
npm run build:sprint26e
```

Expected baseline:

```text
tests 75
pass 75
fail 0
```

## Portal integration boundary

Module E creates governed candidate data only. The public portal is connected in the next integration release, where approved candidate outputs are mapped into the existing public intelligence build and deployed through staging before production promotion.
