# Sprint 20-A9-A — App Data and Quality Contract

## Objective

Freeze one deterministic public data contract before the V22 portal shell and runtime bindings are integrated.

## Canonical artifacts

- `apps/kidults-enterprise-staging/public/data/portal-data-contract.json`
- `apps/kidults-enterprise-staging/public/data/quality-status.json`
- `apps/kidults-enterprise-staging/portal-data-contract.test.mjs`

## Public surfaces

The contract defines required and optional fields for:

1. Intelligence
2. Markets
3. Kidult 100
4. Archive
5. Methodology
6. Status
7. Access

## Quality states

The canonical public enum is:

- `operational`
- `degraded`
- `critical`
- `delayed`
- `under_review`
- `insufficient_evidence`
- `monitoring_pending`

No Track B or Track C implementation may introduce an additional public quality state without updating this contract and its tests.

## Fallback order

Every public data surface follows this deterministic order:

1. use the last good public publication;
2. render a safe placeholder;
3. hide optional metrics.

Required sections must remain structurally present even when optional metrics are unavailable.

## Public and protected boundary

Public output may include status, timestamps, aggregate metrics, alerts safe for public display, scores, confidence grades, coverage stages and report metadata.

The following remain prohibited from public assets:

- credentials and tokens;
- server paths;
- source secrets;
- personal data;
- private exports;
- internal incident notes.

## Stable DOM hooks

Track B must implement the selectors declared in `dom_hooks`. Track C must consume those selectors rather than introducing competing IDs or selectors.

## Validation

Run from the repository root:

```bash
node --test apps/kidults-enterprise-staging/portal-data-contract.test.mjs
node -e "JSON.parse(require('fs').readFileSync('apps/kidults-enterprise-staging/public/data/portal-data-contract.json','utf8'))"
```

Acceptance requires:

- all contract tests pass;
- both JSON files parse successfully;
- current staging quality status belongs to the canonical enum;
- `production_promotion_authorized` remains `false`;
- no production files are changed.

## Handoff

Track B owns the V22 portal shell and must preserve the declared hooks.

Track C owns functional binding and certification and must use the declared field map, status labels and fallback order.
