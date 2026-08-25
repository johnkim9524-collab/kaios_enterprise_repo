# KIDULTS Portal Current-Truth Surface Remediation v1

## Trigger
Remote Cloudflare staging deployment exposed stale preview-baseline values on the public staging surface while current Track A/Registry truth has no immutable snapshot candidate, no Evidence Package and no rankability assessment.

## Root cause
`apps/kidults-enterprise-staging/public/portal/data/portal-summary.json` still contained old preview values (`18.7M+`, `500+`, `417`, `73`, `126`, `15`, `94%`). The Workspace status-source defect was separately corrected on main by Registry-only sourcing; this remediation closes the remaining homepage/summary leakage.

## Remediation
- Portal summary fails closed when no current candidate/Evidence Package is registered.
- Coverage/composition renderers expose unavailable state rather than stale or fabricated metrics.
- CI blocks reintroduction of stale preview claims.
- Existing Registry-only Workspace status sourcing remains intact.

## Current truth boundary
- snapshot-candidate.json: NONE
- Evidence Package: NONE
- rankability-assessment.json: NOT CREATED
- Candidate publication: PROHIBITED
- Production/Public: HOLD
- enterprise.kidults.com cutover: NOT AUTHORIZED

## Deployment consequence
The existing `kidults-workspace-staging` Cloudflare Pages project may auto-deploy corrected `main` after merge. The custom domain must not move until remote staging is re-verified and explicit G5 approval is obtained.
