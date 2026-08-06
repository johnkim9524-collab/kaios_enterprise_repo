# Sprint 25 — Enterprise Intelligence Dashboard

## Objective

Create a private, governed executive command surface that combines CRM, AI operations and public intelligence snapshots without exposing personal contact data.

## Governance

- Staging/local only
- Production promotion disabled
- Human approval required
- Auto-send disabled
- Public PII exposure blocked
- Generated outputs are local runtime artifacts

## Windows PowerShell

Run from `apps/kidults-enterprise-staging`.

```powershell
$env:KAIOS_ENVIRONMENT="staging"
$env:KAIOS_PRODUCTION_PROMOTION_AUTHORIZED="false"
$env:KIDULTS_CONVERSION_DATA_DIR="$PWD\.local-data\conversions"

npm run build:sprint25
npm start
```

Open:

```text
http://127.0.0.1:4190/executive/
```

## Operator commands

```powershell
npm run executive:build
npm run executive:status
```

## Validation target

```text
tests 39
pass 39
fail 0
```

## Expected dashboard

- Executive brief
- Recommended next move
- Active pipeline
- High-value opportunities
- Pending decisions
- Average opportunity score
- Approved and sent counts
- Conversion rate
- Pipeline state distribution
- Demand category distribution
- Intelligence asset posture
- Governance safeguards
- Links to Operations CRM and AI Operations

## Runtime output cleanup

Generated dashboards and local state are runtime artifacts. To return the working tree to its committed baseline:

```powershell
git restore public/public-enterprise-preview
git clean -fd public/operations public/operations-ai public/executive .local-data
git status
```
