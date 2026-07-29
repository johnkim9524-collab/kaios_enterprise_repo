# Sprint 18-D1 — Kidults Enterprise Portal Beta

## Objective
Deliver the first luxury enterprise decision surface wired to methodology-versioned score and index contracts.

## Included
- Kidult 100 overview
- Brand Momentum
- Canon Strength
- Liquidity Grade
- Category Intelligence
- Trust Surface
- Read-only API contract
- Responsive portal shell
- Visibility-gate tests

## Staging rules
1. Values must be labelled illustrative until staging repositories supply certified data.
2. Rights, methodology, confidence, evidence, quality, and freshness gates execute before display.
3. Restricted values render a rights-restricted state, not a placeholder number.
4. Partial data remains explicit.
5. No write API or production database change is authorized.

## Verification
```bash
pnpm --filter @kaios/kidults-enterprise-portal-contracts test
pnpm --filter @kaios/kidults-enterprise-portal-contracts check
```

Review `apps/kidults-enterprise-beta/public/index.html` at desktop, tablet, 390px, 360px, and 320px widths. Confirm no horizontal overflow and minimum 44px mobile navigation targets.

## Promotion gate
Production promotion requires real staging-data wiring, authenticated smoke tests, accessibility review, Product Quality Score at least 90, Data Trust Score at least 90, and Luxury Brand Fit at least 95.
