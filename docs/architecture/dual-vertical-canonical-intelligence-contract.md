# Dual-Vertical Canonical Intelligence Contract

## Fixed Objective

Define one shared intelligence-asset contract for Kidults and Artfund while preserving independent domain taxonomies, methodologies, portals, and product identities.

## Shared Canonical Flow

`Source -> Source Record -> Evidence -> Canonical Entity -> Observation -> Signal -> Score -> Index -> Narrative -> Publication -> Archive`

Every customer-facing fact must resolve to one canonical home and one evidence trail.

## Shared Core Entities

### Source

Required fields:

- `source_id`
- `vertical`
- `source_name`
- `source_type`
- `canonical_url`
- `jurisdiction`
- `language`
- `owner`
- `tier`
- `reliability_score`
- `rights_status`
- `active_status`
- `reviewed_at`

### Source Record

An immutable capture of raw source material.

Required fields:

- `source_record_id`
- `source_id`
- `retrieved_at`
- `published_at`
- `content_hash`
- `content_type`
- `storage_location`
- `collection_method`
- `http_status`
- `parser_version`
- `retention_class`

### Evidence

A normalized, citable unit supporting one or more facts.

Required fields:

- `evidence_id`
- `source_record_id`
- `evidence_type`
- `claim_scope`
- `extracted_value`
- `unit`
- `currency`
- `effective_at`
- `confidence_grade`
- `review_status`

### Canonical Entity

Required fields:

- `entity_id`
- `vertical`
- `entity_type`
- `canonical_name`
- `canonical_slug`
- `status`
- `primary_market`
- `created_at`
- `updated_at`
- `confidence_grade`

### Entity Alias

Required fields:

- `alias_id`
- `entity_id`
- `alias_value`
- `alias_type`
- `language`
- `source_id`
- `confidence_grade`

### Observation

A time-bound measurable fact.

Required fields:

- `observation_id`
- `entity_id`
- `metric_type`
- `metric_value`
- `unit`
- `currency`
- `observed_at`
- `effective_at`
- `evidence_id`
- `normalization_version`
- `confidence_grade`

### Signal

A derived event or pattern.

Required fields:

- `signal_id`
- `entity_id`
- `signal_type`
- `direction`
- `magnitude`
- `detected_at`
- `window`
- `source_coverage`
- `methodology_version`
- `confidence_grade`

### Score

Required fields:

- `score_id`
- `entity_id`
- `score_type`
- `score_value`
- `score_scale`
- `calculated_at`
- `methodology_id`
- `methodology_version`
- `input_snapshot_hash`
- `confidence_grade`

### Index

Required fields:

- `index_id`
- `vertical`
- `index_name`
- `index_code`
- `index_level`
- `calculated_at`
- `effective_at`
- `methodology_id`
- `methodology_version`
- `constituent_snapshot_hash`
- `publication_status`

### Publication

Required fields:

- `publication_id`
- `vertical`
- `publication_type`
- `title`
- `version`
- `generated_at`
- `published_at`
- `evidence_coverage`
- `quality_gate_status`
- `archive_location`

## Vertical Domain Boundaries

### Kidults Domain Pack

`Brand -> Franchise -> Character -> Product Line -> Product -> Edition -> Variant -> Transaction -> Observation -> Signal`

The shared core must not contain Kidults-specific category rules, collectible-condition rules, edition logic, or Kidult 100 methodology.

### Artfund Domain Pack

`Artist -> Artwork -> Edition -> Provenance Event -> Exhibition -> Auction Lot -> Transaction -> Observation -> Signal`

The shared core must not contain artwork attribution rules, provenance interpretation, auction-premium treatment, artist classification, or Artfund index methodology.

## One Fact, One Home

1. Raw captures live in the Source Record store.
2. Citable normalized facts live in Evidence.
3. Current identity lives in Canonical Entity.
4. Time-series facts live in Observation.
5. Derived intelligence lives in Signal, Score, and Index.
6. Portal, API, PDF, and archive outputs must not become independent fact stores.
7. Any correction must update the canonical record and create a restatement entry.

## Traceability Rule

Every score, index point, report statement, chart, and portal metric must resolve through:

`Publication -> Methodology Version -> Input Snapshot -> Observation -> Evidence -> Source Record -> Source`

## Versioning Rule

- Raw Source Records are immutable.
- Evidence corrections create a new version and preserve superseded values.
- Methodology changes require a new semantic version.
- Index restatements require an explicit reason and affected date range.
- Portal labels must expose `updated_at`, `confidence_grade`, and `methodology_version` where relevant.

## Acceptance Criteria

- Shared core contains no vertical-specific methodology.
- Both verticals can implement their domain pack without schema forks in shared entities.
- Every customer-facing metric can be traced to evidence.
- All derived values are reproducible from a versioned input snapshot.
- Desktop, mobile, API, PDF, and archive consume the same canonical facts.