# A13-B11 Intelligence Product Expansion Baseline

## Objective

Expand the A13-B10 editorial collector intelligence portal into a broader decision product without changing the approved visual foundation.

## Required product modules

1. Category Intelligence Matrix
2. Cultural Durability / Canon Strength
3. Method & Trust
4. Data-backed benchmark controls
5. Time-series data contract for 1M, 3M, 6M and 1Y horizons

## Architecture contract

- Keep the existing `/a13-b10/` staging route.
- Keep one HTML file, one physical CSS file and one interaction JavaScript file.
- Add structured JSON data under `/a13-b10/data/`.
- Do not inject stylesheets at runtime.
- Production remains untouched.

## Visual contract

- Preserve the approved ivory, ink, forest and restrained gold system.
- Preserve the approved Hero, score ring and editorial typography.
- New modules must use the existing desktop content width.
- Mobile must remain usable at 320px, 360px, 390px and 430px.
- Prevent horizontal overflow and clipped table content.

## Data contract

- All staging metrics remain visibly illustrative.
- Category scores publish momentum and confidence separately.
- Canon Strength and Cultural Durability must expose their component dimensions.
- Method & Trust must explain source breadth, refresh cadence and evidence lineage.
- Benchmark controls must read from structured time-series data instead of changing labels only.

## Merge gates

- Category matrix renders from structured data.
- Canon module renders all four durability dimensions.
- Method & Trust publishes the four methodology principles.
- Category and horizon controls update a real series dataset.
- Desktop and mobile regression tests pass.
- Main remains production-safe.
