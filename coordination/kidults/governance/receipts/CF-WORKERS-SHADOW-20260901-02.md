## PROGRAM OWNER EXTERNAL-MUTATION APPROVAL RECEIPT V2

**Approval ID:** `CF-WORKERS-SHADOW-20260901-02`

I, the Program Owner acting through the authenticated GitHub account `johnkim9524-collab`, explicitly authorize the following narrowly bounded external mutation:

- exactly **one** governed manual `workflow_dispatch` execution of `.github/workflows/kidults-cloudflare-workers-shadow-deploy-v2.yml` from the then-current protected `main`;
- target service: `kidults-public-portal-shadow` only;
- target surface: non-Production Cloudflare Workers `workers.dev` only;
- maximum workflow dispatches: **1**;
- maximum provider deployment attempts: **1**; the authorization is consumed when the first v2 workflow is dispatched, whether the run passes or fails;
- Production routes allowed: **0**;
- custom domains allowed: **0**;
- Cloudflare Pages deletion, retirement, or domain detach mutation: forbidden;
- automatic merge/push deployment: forbidden;
- Public promotion: not authorized;
- Production promotion: not authorized;
- G5 promotion: not authorized;
- external spend, contract change, new credential creation, credential scope expansion, or unrelated provider mutation: not authorized.

Execution is permitted only after the approval receipt URL for this comment is bound into the committed authorization record; the v2 workflow uses a canonical receipt under `${RUNNER_TEMP}` outside checkout-clean scope; a provider-attempt marker is written immediately before Wrangler execution; an always-finalizer preserves a truthful sanitized receipt; the v2 lane and secret registry are updated atomically; exact-head required checks are terminal GREEN; governed landing completes; and live protected-`main` read-back matches the execution SHA before provider credentials are resolved.

This receipt grants no standing authority and no replay authority. Any rerun, second dispatch, broader route/domain binding, Pages mutation, Public/Production/G5 action, spend/contract change, new credential or scope expansion, or unrelated provider mutation requires a new explicit approval receipt.

**Approval state:** `AUTHORIZED_ONE_SHOT_NON_PRODUCTION_WORKERS_DEV_ONLY`

**Date:** `2026-09-01 KST`
