# Intelligence Holdings Cloudflare Pages → Workers Migration V1

**Status:** APPROVED DIRECTION / IMPLEMENTATION GOVERNED / EXTERNAL CUTOVER NOT YET AUTHORIZED  
**Owner:** KPMO  
**Issue:** #1698

## 1. Decision

Adopt the following migration path:

**Pages freeze → dependency inventory → Workers rebuild → shadow validation → explicit release gate → controlled cutover → observation → Pages retirement/deletion.**

The legacy Pages project is a temporary frozen serving surface, not the future deployment authority.

## 2. Architectural doctrine

`MAIN != DEPLOY != PUBLIC APPROVAL != PRODUCTION APPROVAL`.

GitHub `main` is source/code authority only. A merge must not deploy Public or Production automatically. Workers deployment must be an explicit, exact-SHA/artifact-bound operation with its own authorization and receipt. Deployment success never creates Production or G5 authority.

## 3. Target Intelligence Holdings edge platform

### IH shared edge control plane

Own centrally:

- release provenance and release manifests;
- routing policy and route ownership;
- deployment receipts and exact source/artifact binding;
- observability and failure classification;
- security/access boundary;
- rollback control;
- vertical deployment-governance inheritance.

### Kidults public portal

Serve public static experience through Workers Static Assets or an equivalent governed Workers static edge surface. Do not attach the production custom domain during the build/shadow phases.

### Kidults workspace

Treat authenticated/private Workspace as a separate application/security boundary when enabled. It may share the IH edge control plane, but public and authenticated authorization surfaces must not be conflated.

### Edge API

Use Worker code only where application/edge logic is required. Static delivery should remain static; avoid adding compute merely because Workers is available.

## 4. Migration gates

### Phase 0 — Freeze

Required truth:

- automatic Pages Production Git deployment OFF;
- Preview deployment OFF;
- no ambient merge-to-public deployment authority;
- existing Pages service retained only to avoid outage during migration.

### Phase 1 — Inventory

Before any cutover, bind:

- exact Pages project identity;
- custom domains and DNS/routes;
- static assets and redirects;
- Pages Functions if any;
- API/runtime dependencies;
- external/internal callers;
- cache behavior and headers;
- existing rollback/deployment history.

Unknown dependency means `HOLD`, not "probably unused".

### Phase 2 — Workers build

Create a non-production Workers target with:

- exact build input path;
- deterministic static build;
- explicit service name;
- no production custom domain/route;
- no automatic Git deployment;
- controlled environment configuration;
- receipt-ready deployment metadata.

### Phase 3 — Shadow validation

Validate the non-production Workers URL for:

- desktop/mobile responsive parity;
- root/workspace/navigation behavior;
- JS/CSS/image/font asset integrity;
- MIME/cache behavior;
- accessibility;
- browser lifecycle and history/BFCache where material;
- API/export authority boundaries;
- security headers and access behavior;
- latency/error behavior;
- exact asset/source digest binding.

A shadow pass is not Public approval.

### Phase 4 — Explicit release gate

Cutover eligibility requires:

- exact protected-main SHA;
- build artifact digest;
- release manifest;
- Portal/Track C acceptance;
- Track D runtime/rollback readiness;
- explicit Public authorization receipt;
- known rollback target;
- exact domain/route mutation plan.

### Phase 5 — Controlled cutover

Perform only after the external/Public gate is satisfied:

- deploy exact approved Workers artifact;
- attach/switch exact domain/route;
- read back deployment/version/route;
- perform smoke and browser acceptance;
- retain immutable deployment receipt.

### Phase 6 — Observation

Keep the legacy rollback option during a bounded observation window. Track error rate, latency, navigation, asset integrity, browser parity, security and customer-visible regressions. Any material regression triggers rollback or HOLD.

### Phase 7 — Pages retirement

Only after successful cutover and observation:

- prove zero required callers;
- prove zero required routes/domains;
- detach custom-domain bindings;
- preserve required audit/deployment evidence;
- independently read back Cloudflare state;
- then delete the Pages project.

Deletion is the final step, never the migration mechanism.

## 5. Track ownership

- **KPMO:** migration accountability, canonical truth, gates, conflict resolution.
- **Track C:** Portal/Workspace UX, responsive parity, accessibility, browser acceptance.
- **Track D:** Workers runtime, routing, deployment, observability, rollback, receipts.
- **Track E:** platform strategy, customer/product implications, migration economics and prioritization.
- **Track Z:** Cloudflare/provider economics, dependency, contract/rights and exit/substitution view where material.
- **Red-Team:** adversarial pre-cutover and pre-retirement validation.

## 6. Anti-regression rules

The new Workers architecture must not recreate the Pages failure mode. Therefore:

- no `push main → deploy production` trigger;
- no deployment without exact source SHA and artifact digest;
- no Public domain attachment from PR validation;
- no stale same-branch artifact substitution;
- no deployment-success-to-Production/G5 promotion;
- no Pages deletion while route/caller inventory is incomplete;
- no vertical-specific duplicate release-control plane without explicit exception.

## 7. Current boundary

This document authorizes internal architecture, code, tests and non-production preparation only. Cloudflare settings, credentials, deployments, routes/domains, deletion, spend/contracts, Public, Production and G5 remain separately authorized actions.
