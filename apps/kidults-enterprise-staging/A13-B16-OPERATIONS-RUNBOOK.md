# A13-B16 Operations Runbook

## Daily staging execution

```bash
cd /opt/intelligence-holdings/staging/kaios-enterprise
node apps/kidults-enterprise-staging/scripts/run-a13-b16-autonomous-operations.mjs
```

## Verification

```bash
node --test \
  apps/kidults-enterprise-staging/a13-b10-baseline-lock.test.mjs \
  apps/kidults-enterprise-staging/a13-b11-intelligence-product.test.mjs \
  apps/kidults-enterprise-staging/a13-b12-live-data-integration.test.mjs \
  apps/kidults-enterprise-staging/a13-b13-live-source-resilience.test.mjs \
  apps/kidults-enterprise-staging/a13-b14-integrated-intelligence-activation.test.mjs \
  apps/kidults-enterprise-staging/a13-b15-external-source-certification.test.mjs \
  apps/kidults-enterprise-staging/a13-b16-autonomous-operations-certification.test.mjs
```

## Generated outputs

- `public/a13-b10/data/generated/kidult-100.json`
- `public/a13-b10/data/generated/monthly-intelligence.json`
- `public/a13-b10/data/generated/readiness.json`
- `public/a13-b10/data/generated/external-source-certification.json`
- `public/a13-b10/data/generated/operations-health.json`
- `public/a13-b10/data/generated/autonomous-operations.json`

## Degraded operation

A single-provider timeout, schema failure or two-provider partial failure must preserve available evidence and report `degraded` health. Do not promote production while degraded.

## Total provider failure

1. Confirm `operations-health.json` reports fallback verification.
2. Confirm `/a13-b10/data/intelligence-product.json` remains available.
3. Keep production promotion blocked.
4. Re-run B15 certification after provider recovery.

## Staging rollback

```bash
cd /opt/intelligence-holdings/staging/kaios-enterprise
git fetch origin
git switch main
git reset --hard origin/main
```

For a branch-specific rollback, reset to the latest known certified commit and restart the staging HTTP process. Never force production promotion from a degraded or blocked state.

## Secret handling

- Never commit `.env` files containing values.
- Never print provider API keys.
- Use only the environment variable names defined in `.env.external-sources.example`.
- Rotate credentials outside the repository.
