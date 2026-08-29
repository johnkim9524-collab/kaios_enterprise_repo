# KIDULTS Cloudflare Pages STAGING Governance v1

## Decision

`kidults-workspace-staging` remains the controlled static STAGING mirror for the canonical shared/original KIDULTS Portal. It is not a separate mobile product and it is not the platform Production surface.

## Required steady state

- Git-integrated automatic deployments: disabled.
- Production-branch automatic deployments: disabled.
- Preview branch setting: `none`.
- Preview include/exclude lists: empty.
- Visible Preview deployments: `0` after approved cleanup.
- All repository mutation entrypoints: **NO-RERUN / hard-disabled**.
- Owner-entered workflow phrases: historical operator metadata only; not authorization.
- Source: exact live protected-main SHA only.
- Deployment method: Wrangler Direct Upload to the existing Git-integrated Pages project.
- Read-only drift audit: every 30 minutes, on protected-main push, and on demand.
- Deployment inventory pagination: Cloudflare Pages maximum `per_page=25`; all pages are bounded, and skipped attempts are separated from materialized deployments.
- Preview deletion and settings containment: HOLD until durable one-shot trust-root activation.
- Production-environment deployment deletion: prohibited.
- Public / platform Production / G5: HOLD.

Cloudflare calls the stable branch of a Pages project its “production” environment. In this policy that label remains internal to the STAGING project and never constitutes platform Production authorization.

## Current safe sequence

The repository may perform read-only inventory only. Do not dispatch or directly invoke a Cloudflare mutation script. The existing STAGING deployment is not classified as governed merely because its provider commit message asserts an approval ID.

1. Keep automatic production branch deployments disabled and Preview branch deployments set to `None`.
2. Keep the existing `kidults-cloudflare-readonly` token read-only.
3. Confirm the project settings read back as:
   - `production_deployments_enabled=false`
   - `preview_deployment_setting=none`
4. Require read-only inventory to report Preview `0` and exact current-main SHA equality.
5. Treat provider commit-message lineage as unverified and keep governed parity on HOLD.
6. Before any future mutation, independently complete every activation prerequisite:
   - deploy the external durable ledger endpoint;
   - provision and independently pin its Ed25519 response key;
   - backfill the historical approval as `CONSUMED`, never `ACTIVE`;
   - verify a signed exact-binding state read-back;
   - prove deployed consumed/expired/replay negative canaries make provider calls `0`;
   - issue a new operation-specific approval for a new exact run/SHA/target.
7. Change the hard-disabled workflow and script gates only in a separately reviewed trust-root change.

The existing `kidults-cloudflare-readonly` environment remains read-only and must not be repurposed for mutation. On-demand inventory is performed by the read-only workflow, not by the mutation workflow.

## Historical confirmation phrases — non-authorizing

These strings must not be used to dispatch a mutation while NO-RERUN is active:

```text
DEPLOY_KIDULTS_WORKSPACE_STAGING
```

Disable all Git automatic deployments:

```text
CONTAIN_KIDULTS_WORKSPACE_STAGING
```

Delete Preview deployments only:

```text
DELETE_PREVIEW_ONLY_KIDULTS_WORKSPACE_STAGING
```

All mutation workflows and direct mutation script modes are currently blocked before provider calls. Public / platform Production / G5 remain HOLD.
