# Holistic Repository Inventory

## Repository Baseline

| Metric | Count |
|---|---:|
| Repository files | 506 |
| Runtime candidates | 159 |
| Build/runtime manifests | 25 |
| Test files | 23 |
| Database/migration files | 13 |
| Runtime route signals | 153 |
| Initial debt signals | 14 |
| Actionable keyword debt | 0 |
| Duplicate filenames | 4 |

## Area Counts

| Area | Files |
|---|---:|
| apps | 7 |
| packages | 71 |
| scripts | 33 |
| infrastructure | 13 |
| contracts | 35 |
| docs | 108 |

## Applications

- artfund-institutional-beta
- artfund-institutional-staging
- dual-staging-http-runtime
- kidults-enterprise-beta
- kidults-enterprise-staging

## Shared KAIOS Capability Packages

- autonomous-alert-engine
- autonomous-product-certification
- autonomous-report-engine
- autonomous-source-adapters
- deterministic-scoring-engine
- dual-portal-api-wiring
- dual-portal-quality-certification
- dual-staging-integration
- dual-staging-runtime-deployer
- entity-resolution
- governance-contracts
- index-auto-publisher
- portal-export-pipeline
- publication-orchestrator
- quality-anomaly-engine
- source-execution-control
- staging-deployment-runner
- staging-runtime-evidence

## Vertical-Specific Packages

### Kidults

- kidults-entity-contracts
- kidults-enterprise-portal-contracts

### Artfund

- artfund-entity-contracts
- artfund-institutional-portal-contracts

## Initial Findings

1. Kidults and Artfund already have separate staging and beta application surfaces.
2. A shared dual-staging HTTP runtime exists.
3. Shared KAIOS packages cover acquisition, normalization, scoring, reporting, publication, certification, deployment and alerting.
4. Vertical-specific entity and portal contracts are separated.
5. The package count is high relative to the application count and requires dependency-boundary review.
6. No explicit actionable TODO or FIXME debt was found.
7. Structural debt may still exist through overlap, unused packages, bypass paths or duplicated staging and beta logic.
8. Repository deployment unit files were not detected because active systemd units are installed outside the repository.
9. File presence does not prove runtime usage or production deployment.

## Primary Audit Questions

1. Which packages are imported by the actual runtime entrypoint?
2. Which packages are only contracts or evidence layers?
3. Do staging and beta applications duplicate UI or runtime responsibilities?
4. Do publication, export and index packages overlap?
5. Do deployment runner and runtime deployer packages overlap?
6. Are all database migrations mapped to Kidults, Artfund or shared governance?
7. Is there one canonical source-to-publication flow?

## Current Assessment

Repository maturity: **Advanced foundation**

Repository clarity: **Partial**

Launch readiness evidence: **Incomplete**

Refactor readiness: **Ready for dependency tracing**

## Next Step

Produce a runtime dependency map and identify Keep, Merge, Refactor and Delete candidates using actual imports and execution paths.
