# Intelligence Holdings Cloudflare Pages → Workers Migration V1

**Status:** MANDATORY / FAIL-CLOSED MIGRATION  
**Owner:** KPMO  
**Tracking:** #1698  
**Principles:** AUTONOMOUS → GLOBAL → IRREPLACEABLE VALUE → TRANSPARENT

## Decision

Adopt **Pages freeze → Workers rebuild → shadow validation → explicit release gate → controlled cutover → observation → Pages retirement**.

The current Pages surface is a frozen legacy serving surface. Git merge is not deployment authority, deployment is not Public approval, and Public approval is not Production approval.

## Current internal execution state

- Existing Pages automatic Production Git deployment: recorded OFF by prior repository evidence.
- Existing Pages Preview deployment: recorded OFF / none by prior repository evidence.
- Repository inventory contract: `coordination/kidults/governance/cloudflare-pages-to-workers-inventory-v1.json`.
- Canonical shared responsive Portal source: `apps/kidults-enterprise-staging/public/portal`.
- Non-production Workers Static Assets scaffold: `infrastructure/cloudflare/workers/kidults-public-portal-shadow/wrangler.jsonc`.
- Shadow scaffold has **zero production routes and zero custom domains**.
- No Cloudflare deployment, route/domain mutation, credential use or Pages deletion is performed by the scaffold.

## Phase 0 — Freeze

Keep automatic Pages Production and Preview deployment disabled. Existing Pages is service continuity only. No new Git merge may acquire ambient Public deployment authority.

## Phase 1 — Inventory

Inventory must bind:

- exact Pages project identity;
- domain and route map;
- DNS bindings;
- static assets and any Pages Functions;
- inbound and outbound callers;
- deployment/rollback history;
- custom-domain dependencies;
- external integrations that would break if Pages is removed.

Repository-known facts may be recorded immediately. Unknown live Cloudflare facts remain explicit gaps and block cutover/retirement until independently read back.

## Phase 2 — Workers build

Target group architecture:

- **IH Edge Control Plane:** release provenance, route policy, security/access boundary, observability, deployment receipt, rollback.
- **Kidults Public Portal:** Workers Static Assets using the canonical shared responsive Portal source.
- **Kidults Workspace:** separate authenticated/private boundary when enabled.
- **Kidults Edge API:** Workers compute only when an edge API is actually required.
- **Evidence assets:** separate governed object storage when large/durable assets require it.

Verticals reuse the shared IH edge control plane rather than reproducing deployment governance brand by brand.

The shadow Worker service must contain no production route or custom-domain attachment. Deployment itself remains a separately authorized external mutation.

## Phase 3 — Shadow validation

Before any domain cutover prove:

- desktop/mobile parity;
- navigation and browser lifecycle;
- asset SHA-256 and MIME correctness;
- cache semantics;
- accessibility;
- API/failure boundaries;
- security headers and access policy where applicable;
- error/latency receipt;
- no stale intelligence or authority widening.

## Phase 4 — Release gate

Required exact bindings:

`protected-main SHA → build digest → release manifest → Public authorization receipt → rollback target → deployment plan`.

No merge, CI green, Worker build, worker.dev URL or deployment success can substitute for Public authorization.

## Phase 5 — Controlled cutover

Only after explicit Public authority:

1. deploy the exact approved Worker artifact;
2. bind Worker version/deployment ID;
3. move only the explicitly approved route/domain;
4. read back route/domain ownership;
5. execute smoke tests;
6. preserve immediate rollback target.

## Phase 6 — Observation

Use a bounded observation window and track error rate, latency, desktop/mobile/browser parity, stale-value behavior and rollback readiness. Any critical regression returns traffic to the proven rollback target.

## Phase 7 — Pages retirement

Pages may be detached/deleted only after:

- Workers serves the intended production domain correctly;
- observation passes;
- zero required callers are proven;
- zero required Pages routes/functions remain;
- custom domain is detached from Pages;
- required deployment/audit history is preserved;
- independent Cloudflare read-back confirms the retirement state.

Deletion is the final action, not the first migration action.

## Absolute invariants

**MAIN != DEPLOY != PUBLIC APPROVAL != PRODUCTION APPROVAL**

No automatic Public/Production deployment from Git push/merge. No Pages deletion before proven cutover. No production route in the internal shadow scaffold. Unknown live dependencies fail closed.

## Authority boundary

Internal design, inventory schemas, code, validators and non-deployed scaffold work are reversible and autonomous. Cloudflare deployments, domains/routes, settings, credentials, spend/contracts, Pages deletion, Public, Production and G5 remain separately authorized external/protected actions.
