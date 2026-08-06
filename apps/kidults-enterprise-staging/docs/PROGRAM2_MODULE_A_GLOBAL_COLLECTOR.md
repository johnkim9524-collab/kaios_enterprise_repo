# Program 2 · Module A — Global Collector Engine

## Objective

Create a governed intake boundary for external collectible-market observations before normalization, scoring and publishing.

## Governance

- local/staging only
- production promotion disabled
- robots and source terms must be respected
- raw observations are retained for a configurable window
- duplicate observations are collapsed by canonical URL, type and normalized title
- no observation is published directly
- downstream normalization remains a separate approval boundary

## Input

Default input file:

```text
.local-data/collector-input.json
```

A sample is available at:

```text
examples/collector-input.sample.json
```

Supported source types:

```text
web, rss, auction, marketplace, museum, brand, provider, social
```

## Commands

```powershell
Copy-Item examples\collector-input.sample.json .local-data\collector-input.json -Force
npm run collector:run
npm run collector:status
npm run build:sprint26a
```

Optional configuration:

```powershell
$env:KIDULTS_COLLECTOR_INPUT_FILE="$PWD\.local-data\collector-input.json"
$env:KIDULTS_COLLECTOR_OUTPUT_DIR="$PWD\.local-data\collector"
$env:KIDULTS_COLLECTOR_RETENTION_DAYS="30"
```

## Output

```text
.local-data/collector/collector-snapshot.json
```

The snapshot includes lineage, fingerprints, canonical URLs, source tier, governance flags, quality score, retention counts and accepted/rejected state.

## Validation

```powershell
npm run build:sprint26a
```

Expected baseline after this module:

```text
45 tests passed
0 failed
```
