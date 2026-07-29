# Week 2 Dual Staging Implementation Plan

## Objective

Implement the approved Sprint 18-A1 contracts in isolated staging environments for Kidults and Artfund without disrupting Kidults production stability measurement.

## Shared KAIOS Workstream

1. Add canonical registry migrations.
2. Add contract validation package.
3. Add evidence-ledger storage boundary.
4. Add methodology registry and semantic-version checks.
5. Add rights-gate enforcement before publication.
6. Add confidence-grade calculation contract.
7. Add autonomous state-machine persistence.
8. Add product-quality gate output.

## Proposed Shared Tables

- `intelligence_sources`
- `intelligence_source_rights`
- `intelligence_source_records`
- `intelligence_evidence`
- `intelligence_entities`
- `intelligence_entity_aliases`
- `intelligence_observations`
- `intelligence_signals`
- `intelligence_scores`
- `intelligence_methodologies`
- `intelligence_methodology_versions`
- `intelligence_indices`
- `intelligence_index_points`
- `intelligence_publications`
- `intelligence_restatements`
- `autonomous_runtime_states`
- `product_quality_reviews`

## Kidults Staging Scope

- Collectibles taxonomy seed
- Kidults ID generator
- Brand, franchise, character, product-line, product, edition, and variant entity types
- five approved source adapters
- raw evidence preservation
- entity-resolution fixture and live tests
- Kidult 100 research methodology registration
- Public and Enterprise portal read-only API contracts

## Artfund Staging Scope

- Art investment taxonomy seed
- Artfund ID generator
- Artist, artwork, edition, provenance-event, exhibition, auction-lot, and transaction entity types
- five approved source adapters
- raw evidence preservation
- artist and artwork entity-matching tests
- Global Art Market Index research methodology registration
- Public and Institutional portal read-only API contracts

## Environment Separation

### Kidults Production

No destructive migration during Week 2. Production continues stability measurement and current live collection.

### Kidults Staging

Separate database, secrets, runtime identifier, and portal host.

### Artfund Staging

Separate database, secrets, runtime identifier, and portal host. No production release until the Artfund staging certification gate passes.

## API Contract Targets

- `GET /api/v1/sources`
- `GET /api/v1/entities`
- `GET /api/v1/entities/{id}`
- `GET /api/v1/entities/{id}/evidence`
- `GET /api/v1/entities/{id}/observations`
- `GET /api/v1/scores`
- `GET /api/v1/indices`
- `GET /api/v1/indices/{code}/history`
- `GET /api/v1/methodologies/{id}`
- `GET /api/v1/publications`

All premium responses must expose freshness, confidence, source coverage, and methodology version where applicable.

## Required Tests

### Contract Tests

- valid Kidults payload passes schema
- valid Artfund payload passes schema
- invalid vertical fails
- missing rights classification fails publication eligibility
- U-grade evidence fails premium eligibility
- invalid methodology version fails

### Database Tests

- raw source records are immutable
- evidence supersession preserves history
- entity aliases remain unique within scope
- fixed input snapshot reproduces the same score and index point
- restatement links affected publications

### Runtime Tests

- successful end-to-end run reaches `published`
- rights failure reaches `quarantined`
- parser drift reaches `degraded` and fallback
- quality failure blocks publication
- failed publication restores last approved artifact

### Portal Tests

- evidence is reachable within one customer interaction
- mobile has no horizontal overflow
- empty, loading, degraded, and error states render correctly
- internal secrets and runtime details are not exposed

## Week 2 Acceptance Criteria

- Shared migrations pass in both staging databases.
- Contract validation passes Kidults and Artfund fixtures.
- Five source adapters per vertical produce raw evidence.
- Rights gate blocks ineligible data.
- Canonical entity creation and alias resolution work.
- One research index per vertical calculates deterministically.
- Read-only portal APIs return evidence-linked data.
- Product Quality Score baseline is generated.
- Rollback and cleanup instructions are documented.

## Promotion Rule

No Week 2 component enters Kidults production merely because it works in staging. Production promotion requires the Day 14 Data Gate and a verified rollback path.