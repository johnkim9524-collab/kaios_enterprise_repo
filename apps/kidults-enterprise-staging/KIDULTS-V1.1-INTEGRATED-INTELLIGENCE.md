# KIDULTS V1.1 Integrated Intelligence

## Objective

Connect the frozen V1.0 public experience to one governed data contract supporting public intelligence, monthly reports, retained archives, methodology disclosure, search, API delivery and enterprise access.

## Freeze rule

The V1.0 visual system remains frozen. V1.1 may add data, pages, endpoints and operational wiring, but must not redesign the approved public shell.

## Integrated flow

1. `data/kidult100.json` stores the current governed headline and trend.
2. `data/categories.json` stores category-level scores and evidence context.
3. `data/signals.json` stores signal, confidence, source and geography composition.
4. `data/archive/index.json` registers retained monthly editions.
5. `scripts/build-intelligence.mjs` validates and composes the public runtime payload.
6. `public/public-enterprise-preview/intelligence-data.json` is generated from the governed source files.
7. `public/public-enterprise-preview/api/v1/*.json` exposes stable read-only public endpoints.
8. `public/public-enterprise-preview/search-index.json` supports client-side search.
9. `public/public-enterprise-preview/reports.html`, `archive.html`, `methodology.html` and `api.html` consume the same governed dataset.
10. Enterprise access remains a separate contact workflow and must never modify public intelligence data.

## Source-of-truth policy

- Files under `data/` are source records.
- Files under `public/public-enterprise-preview/` are generated delivery artifacts.
- Generated files must not be edited manually.
- Every monthly release must preserve the previous edition in `data/archive/`.
- Production publication requires validated lineage, completeness and confidence review.

## Release gates

- JSON schema validation passes.
- Headline values reconcile with category and signal inputs.
- Percent compositions total 100.
- Trend dates are ordered and unique.
- Archive edition ID is unique.
- Public API payloads match the generated website payload.
- Mobile layout remains valid from 320px upward.
- No V1.0 typography, spacing, footer or color freeze regression.

## V1.1 deliverables

- Governed data split
- Build script
- Public API v1 payloads
- Archive registry
- Search index
- Methodology metadata
- Enterprise access configuration
- Validation checklist

## Status

This branch is the implementation baseline for V1.1. Data currently remains illustrative until provider lineage and production release approval are completed.
