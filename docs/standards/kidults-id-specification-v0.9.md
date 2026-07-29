# Kidults ID Specification v0.9

## Objective

Create stable, globally unique, non-semantic identifiers for canonical collectibles intelligence assets.

## Identifier Pattern

`KID-{TYPE}-{ULID}`

Examples:

- `KID-BRAND-01JABC...`
- `KID-PRODUCT-01JABC...`
- `KID-EDITION-01JABC...`
- `KID-ITEM-01JABC...`
- `KID-OBS-01JABC...`
- `KID-SIGNAL-01JABC...`
- `KID-INDEX-01JABC...`

## Type Codes

- CATEGORY
- BRAND
- FRANCHISE
- CHARACTER
- CREATOR
- LINE
- PRODUCT
- EDITION
- VARIANT
- ITEM
- CERT
- TXN
- OBS
- SIGNAL
- SCORE
- INDEX
- REPORT
- SOURCE
- EVIDENCE
- METHOD

## Rules

1. IDs are immutable.
2. IDs never encode mutable business meaning.
3. Deleted or merged IDs are never reused.
4. Aliases resolve to one canonical ID.
5. Merged records preserve redirect history.
6. External identifiers are stored as mappings, not replacements.
7. Public exposure is allowed only for approved entity types.

## Resolution Contract

Every public ID resolution response must include:

- kidults_id
- entity_type
- canonical_name
- status
- canonical_url
- merged_into_id when applicable
- updated_at
- confidence_grade

## Merge Policy

When duplicates are merged:

- one canonical survivor is selected
- losing IDs remain resolvable
- all observations and evidence are reassigned
- merge reason and reviewer are recorded
- index and report restatement impact is evaluated

## Split Policy

When one entity is split into multiple entities:

- new IDs are issued
- the original ID is retired
- evidence and observations are redistributed
- affected methodologies and reports are flagged

## External Mapping

Supported mappings may include:

- manufacturer SKU
- UPC or EAN
- marketplace listing ID
- auction lot ID
- certification number
- Wikidata or other public authority ID

## Public Standard Position

Kidults ID is intended to become the reference identifier layer for collectibles intelligence, interoperability, citation, and enterprise data exchange.

## Acceptance Criteria

- deterministic validation of ID syntax
- immutable persistence
- alias and redirect support
- merge and split audit trail
- API resolution contract
- no personally identifiable ownership data in public records
