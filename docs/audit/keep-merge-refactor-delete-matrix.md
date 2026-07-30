# Keep / Merge / Refactor / Delete Matrix

## Purpose

Classify current applications and packages by their likely strategic role while avoiding premature deletion before runtime usage is proven.

## Decision Rules

### Keep

Retain when the component has a clear, reusable or vertical-specific responsibility.

### Merge Review

Investigate when two components appear to share the same operational responsibility.

### Refactor Review

Retain temporarily, but clarify boundaries, interfaces and ownership.

### Retire Review

Investigate whether the component duplicates a canonical application or runtime path.

### Delete

Delete only after runtime, deployment, migration and contract dependencies are proven absent.

## Shared KAIOS Core

| Component | Decision | Reason |
|---|---|---|
| autonomous-source-adapters | Keep | Shared source acquisition capability |
| source-execution-control | Keep | Shared source execution policy |
| entity-resolution | Keep | Shared normalization and entity resolution |
| deterministic-scoring-engine | Keep | Shared scoring capability |
| quality-anomaly-engine | Keep | Shared quality protection |
| autonomous-report-engine | Keep | Shared report generation |
| publication-orchestrator | Keep | Candidate canonical publication authority |
| autonomous-alert-engine | Keep | Shared alerting and incident signaling |
| governance-contracts | Keep | Shared policy and methodology contracts |
| staging-runtime-evidence | Keep | Deployment and certification evidence |
| dual-staging-integration | Keep pending proof | Shared integration candidate |
| dual-staging-http-runtime | Keep | Candidate canonical staging runtime |

## Vertical-Specific Components

| Component | Decision | Reason |
|---|---|---|
| kidults-entity-contracts | Keep | Kidults-specific domain contract |
| kidults-enterprise-portal-contracts | Keep | Kidults-specific product contract |
| artfund-entity-contracts | Keep | Artfund-specific domain contract |
| artfund-institutional-portal-contracts | Keep | Artfund-specific institutional contract |
| apps/kidults-enterprise-staging | Keep | Candidate canonical Kidults development target |
| apps/artfund-institutional-staging | Keep | Candidate canonical Artfund development target |

## Overlap Review

| Components | Decision | Review Question |
|---|---|---|
| publication-orchestrator / index-auto-publisher | Refactor review | Is index publication a child capability or separate authority? |
| publication-orchestrator / portal-export-pipeline | Refactor review | Does export bypass the canonical publication gate? |
| autonomous-product-certification / dual-portal-quality-certification | Refactor review | Are product and portal certification boundaries distinct? |
| staging-deployment-runner / dual-staging-runtime-deployer | Merge review | Are both required for one deployment flow? |
| dual-staging-integration / dual-portal-api-wiring | Refactor review | Are integration and API wiring responsibilities overlapping? |
| apps/kidults-enterprise-staging / apps/kidults-enterprise-beta | Retire review | Which app is the canonical Kidults target? |
| apps/artfund-institutional-staging / apps/artfund-institutional-beta | Retire review | Which app is the canonical Artfund target? |

## Current Delete Candidates

No component is approved for deletion during Sprint 20-A1.

## Delete Gate

A component may be deleted only when all conditions pass:

1. No runtime import exists.
2. No deployment dependency exists.
3. No database or migration dependency exists.
4. No contract dependency exists.
5. Tests pass after removal.
6. Replacement or retirement evidence is documented.
7. Production and staging behavior remain unchanged.

## Immediate Analysis Priorities

1. Trace imports from apps/dual-staging-http-runtime.
2. Compare staging and beta apps for both verticals.
3. Compare publication-orchestrator with index-auto-publisher.
4. Compare publication-orchestrator with portal-export-pipeline.
5. Compare the two certification packages.
6. Compare the two deployment packages.
7. Confirm one canonical app per vertical.
8. Confirm one canonical publication path.

## Current Assessment

Keep: **Well-defined core and vertical contracts**

Merge review: **Deployment components**

Refactor review: **Publication, certification and API boundaries**

Retire review: **Beta versus staging applications**

Delete: **None approved**
