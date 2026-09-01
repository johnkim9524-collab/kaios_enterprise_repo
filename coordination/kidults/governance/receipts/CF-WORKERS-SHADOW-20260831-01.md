## PROGRAM OWNER EXTERNAL-MUTATION APPROVAL RECEIPT

**Approval ID:** `CF-WORKERS-SHADOW-20260831-01`

I, the Program Owner acting through the authenticated GitHub account `johnkim9524-collab`, explicitly authorize the following narrowly bounded external mutation:

- exactly **one** governed manual `workflow_dispatch` execution from the then-current protected `main`;
- target service: `kidults-public-portal-shadow` only;
- target surface: non-Production Cloudflare Workers `workers.dev` only;
- maximum provider deployment attempts: **1**; the authorization is consumed when the governed workflow is dispatched, whether the run passes or fails;
- Production routes allowed: **0**;
- custom domains allowed: **0**;
- automatic merge/push deployment: forbidden;
- Cloudflare Pages deletion or retirement mutation: forbidden;
- Public promotion: not authorized;
- Production promotion: not authorized;
- G5 promotion: not authorized;
- external spend, contract change, new credential creation, credential scope expansion, or unrelated provider mutation: not authorized.

Execution is permitted only after a clean candidate is re-cut from current protected `main`, the immutable receipt URL for this comment is bound into the authorization record, exact-head required checks are terminal GREEN, governed landing completes, and live-`main` read-back matches the execution SHA before provider credentials are resolved.

This receipt grants no standing authority and no replay authority. Any second dispatch, retry, broader route/domain binding, Pages deletion, Public/Production/G5 action, or scope change requires a new explicit approval receipt.

**Approval state:** `AUTHORIZED_ONE_SHOT_NON_PRODUCTION_WORKERS_DEV_ONLY`

**Date:** `2026-08-31 KST`
