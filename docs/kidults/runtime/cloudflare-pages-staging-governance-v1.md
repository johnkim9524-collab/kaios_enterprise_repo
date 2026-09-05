# KIDULTS Cloudflare Pages STAGING Governance v1

## Decision

`kidults-workspace-staging` remains the controlled static STAGING mirror for the canonical shared/original KIDULTS Portal. It is not a separate mobile product and it is not the platform Production surface.

The project lifecycle is now fixed as **KEEP / FROZEN → Production stabilization → RETIRE**. It is a temporary remote validation surface, not a permanent platform product asset.

The following platform assets are preserved independently of this STAGING project and must not be treated as retirement targets merely because the STAGING Pages project is later removed:

- KIDULTS Portal
- KIDULTS Workspace
- KIDULTS Intelligence Runtime (KIR)
- Registry and Evidence chain
- Track B validation chain
- Projection chain

## Required steady state

- Git-integrated automatic deployments: disabled.
- Production-branch automatic deployments: disabled.
- Preview branch setting: `none`.
- Preview include/exclude lists: empty.
- Visible Preview deployments: `0` after approved cleanup.
- Deployments: explicit owner-authorized `workflow_dispatch` only.
- Source: exact live protected-main SHA only.
- Deployment method: Wrangler Direct Upload to the existing Git-integrated Pages project.
- Read-only drift audit: every 30 minutes, on protected-main push, and on demand.
- Deployment inventory pagination: Cloudflare Pages maximum `per_page=25`; all pages are bounded, and skipped attempts are separated from materialized deployments.
- Preview deletion: emergency manual operation only.
- Production-environment deployment deletion: prohibited.
- Public / platform Production / G5: HOLD.
- Current lifecycle state: `KEEP_FROZEN`.
- Any additional STAGING mutation: HOLD unless separately authorized.

Cloudflare calls the stable branch of a Pages project its “production” environment. In this policy that label remains internal to the STAGING project and never constitutes platform Production authorization.

## Retirement gate

`kidults-workspace-staging` must **not** be deleted while it remains the controlled remote Portal validation surface before platform Production stabilization.

Retirement becomes eligible only after all of the following are evidenced:

1. Platform Production cutover is completed under the existing approval gates.
2. Production smoke and E2E verification are terminal PASS.
3. STAGING runtime, route, domain and service dependencies are confirmed zero.
4. No remaining required validation flow depends on `kidults-workspace-staging`.
5. 24-hour post-cutover observation is PASS.
6. 72-hour stability observation is PASS.
7. Final Cloudflare inventory and dependency proof are PASS.

After those preconditions, retirement follows the canonical estate sequence:

`INVENTORY → DEPENDENCY_PROOF → REMOVE_CRON_QUEUE_WRITES → REMOVE_DATA_SECRET_SERVICE_BINDINGS → OBSERVE_24H → MIGRATE_OR_REMOVE_ROUTE → OBSERVE_72H → DELETE_RESOURCE → POST_DELETE_SMOKE_TEST`

Deleting this STAGING project does not authorize or imply deletion of Portal, Workspace, KIR, Registry/Evidence, Track B or Projection assets. It also does not change Public / Production / G5 authority.

## Safe landing sequence

The governance PR must not merge while the Pages project can still auto-deploy `main`, because the merge itself would create another ambient deployment.

1. In Cloudflare Pages, open `kidults-workspace-staging` and disable automatic production branch deployments.
2. Set Preview branch deployments to `None` and save.
3. Verify the existing `kidults-cloudflare-readonly` token has Pages Read permission; do not grant it Pages Edit.
4. Confirm the project settings read back as:
   - `production_deployments_enabled=false`
   - `preview_deployment_setting=none`
5. Merge the governance PR only after that external read-back.
6. Create GitHub Environment `kidults-cloudflare-staging-deploy` with deployment branch policy restricted to protected `main`.
7. Add a temporary minimum-scope Pages Edit token and account ID as environment secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
8. Run `KIDULTS Cloudflare Pages Emergency Control v1` only when settings containment or Preview deletion is required.
9. Run `KIDULTS Cloudflare Pages Governed STAGING Deploy v1` for the exact live main SHA.
10. Confirm `KIDULTS Cloudflare Pages Boundary Readonly v1` returns `COMPLETE_VERIFIED`.
11. Remove the temporary write token after the governed deployment unless another explicitly approved operation is pending.

The existing `kidults-cloudflare-readonly` environment remains read-only and must not be repurposed for mutation. On-demand inventory is performed by the read-only workflow, not by the mutation workflow.

## Manual workflow confirmations

Governed STAGING deploy:

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

No workflow in this package deletes a Cloudflare Pages production-environment deployment.
