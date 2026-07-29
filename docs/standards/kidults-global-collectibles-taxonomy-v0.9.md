# Kidults Global Collectibles Taxonomy v0.9

## Objective

Define the canonical market language for collectibles intelligence across Kidults public, collector, enterprise, index, report, and API products.

## Canonical Hierarchy

1. Category
2. Subcategory
3. Brand
4. Franchise
5. Character or Subject
6. Product Line
7. Product
8. Edition
9. Variant
10. Item Instance
11. Condition Assessment
12. Certification
13. Transaction
14. Observation
15. Market Signal

## Core Categories

- Designer Toys
- Trading Cards
- Action Figures
- Model Kits
- Construction Sets
- Anime Collectibles
- Comic and Pop Culture Collectibles
- Sports Collectibles
- Vintage Toys
- Art Toys
- Limited Collaboration Products
- Premium Statues and Figures

## Category Contract

Every category record must include:

- canonical_id
- canonical_name
- parent_category_id
- description
- inclusion_rules
- exclusion_rules
- active_from
- retired_at
- methodology_version

## Brand Contract

A brand is the commercial identity responsible for a product, product line, or licensed collectible.

Required fields:

- brand_id
- canonical_name
- aliases
- owner_entity
- headquarters_country
- official_url
- source_evidence_ids
- confidence_grade

## Franchise and Character Contract

Franchise and character entities must be separated from brand ownership. A product may connect to multiple franchises, characters, artists, designers, licensors, or collaborators.

## Product Contract

A product represents a stable commercial collectible definition independent of edition or variant.

Required fields:

- product_id
- brand_id
- product_line_id
- canonical_name
- category_id
- franchise_ids
- character_ids
- creator_ids
- material
- dimensions
- release_status
- source_evidence_ids

## Edition Contract

An edition represents a bounded commercial release of a product.

Required fields:

- edition_id
- product_id
- edition_name
- release_date
- announced_quantity
- verified_quantity
- region
- retail_price
- currency
- exclusive_channel
- numbered
- signed
- edition_evidence_ids

## Variant Contract

A variant captures colorway, finish, packaging, retailer, regional, chase, error, or promotional distinctions without redefining the base product.

## Item Instance Contract

An item instance represents an individual owned or transacted physical collectible.

Required fields:

- item_instance_id
- edition_id
- serial_number
- condition_grade
- certification_id
- provenance_event_ids
- current_owner_visibility

## Observation Types

- asking_price
- completed_sale
- auction_result
- retail_release
- restock
- sell_out
- social_attention
- search_interest
- media_coverage
- community_sentiment
- counterfeit_warning
- licensing_event

## Signal Types

- price_momentum
- liquidity_change
- scarcity_change
- collector_demand
- release_velocity
- resale_premium
- canon_strength
- brand_momentum
- category_rotation
- risk_alert

## One Fact, One Home

Canonical entities and observations live in the canonical intelligence database. Portal pages, reports, index calculations, exports, and APIs must reference canonical records rather than duplicate them.

## Governance

Changes require:

- change request
- impact assessment
- methodology version
- effective date
- migration plan
- restatement decision
- approval record

## v0.9 Exit Criteria

- all current Kidults product categories map to the taxonomy
- every Kidult 100 candidate maps to Product and Edition
- aliases do not create duplicate canonical entities
- category inclusion and exclusion rules are testable
- portal navigation and API resources use the same taxonomy
