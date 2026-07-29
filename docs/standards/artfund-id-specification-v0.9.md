# Artfund ID Specification v0.9

## Objective

Create stable, globally usable identifiers for art investment intelligence records without embedding mutable business meaning.

## Identifier Families

- `AF-ARTIST-<ULID>`
- `AF-ARTWORK-<ULID>`
- `AF-EDITION-<ULID>`
- `AF-OBJECT-<ULID>`
- `AF-PROV-<ULID>`
- `AF-EXHIBITION-<ULID>`
- `AF-AUCTION-<ULID>`
- `AF-LOT-<ULID>`
- `AF-TX-<ULID>`
- `AF-OBS-<ULID>`
- `AF-SIGNAL-<ULID>`
- `AF-SCORE-<ULID>`
- `AF-INDEX-<ULID>`
- `AF-PUB-<ULID>`

## Rules

1. IDs are immutable after creation.
2. IDs never encode artist name, nationality, price, date, category, or status.
3. Human-readable slugs are aliases and may change.
4. All merges and splits preserve a permanent audit trail.
5. External identifiers are stored as crosswalks, not replacements.
6. Deleted records become tombstones when referenced by history, methodology, evidence, or publications.

## Artist Identity

An Artist ID is created only after minimum identity evidence exists:

- canonical display name
- at least one source
- distinguishing attribute such as birth year, nationality, institution, or catalog reference
- confidence grade

Aliases include transliterations, legal names, pseudonyms, studio names, and historic spellings.

## Artwork Identity

Artwork identity matching considers:

- title and title variants
- artist
- creation date or range
- medium
- dimensions
- catalog raisonné number
- edition context
- image fingerprint where rights permit
- provenance and exhibition history

## Merge Contract

A merge record must contain:

- surviving ID
- deprecated ID
- reason
- evidence
- confidence
- approver or autonomous rule version
- timestamp
- reversibility status

## Split Contract

A split is required when one canonical record is proven to represent multiple independent entities. All dependent observations are reassigned with an audit trail.

## External Crosswalks

Supported crosswalk namespaces may include:

- VIAF
- ULAN
- ISNI
- Wikidata
- museum collection IDs
- auction-house artist and lot IDs
- catalog raisonné references

Rights and redistribution restrictions remain attached to each crosswalk source.

## Public Use

Public Artfund IDs may be displayed and referenced. Internal observation, evidence, security, and workflow identifiers remain non-public unless explicitly approved.
