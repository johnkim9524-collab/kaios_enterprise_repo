# Shared Premium Component Contract v0.9

## Objective

Define reusable portal components that preserve a consistent premium intelligence experience across Kidults and Artfund without flattening the brands into one visual identity.

## Component Families

### 1. Global Navigation

Required variants:

- Public
- Authenticated individual
- Enterprise or institutional organization
- Internal KAIOS Operations

Requirements:

- Current vertical and user role are explicit.
- Primary navigation remains one line on supported desktop widths.
- Mobile navigation uses a single accessible menu surface.
- No customer portal exposes internal operations controls.

### 2. Intelligence Header

Fields:

- kicker
- title
- executive_summary
- updated_at
- coverage
- confidence
- methodology_version
- actions

### 3. Index Hero

Fields:

- index_name
- index_level
- period_change
- historical_series
- confidence_grade
- calculation_status
- methodology_link
- constituent_link

States:

- operational
- preliminary
- restated
- delayed
- degraded
- unavailable

### 4. Intelligence Metric Card

Fields:

- label
- value
- delta
- interpretation
- evidence_count
- confidence
- freshness

A metric card without interpretation is insufficient for premium release.

### 5. Evidence Drawer

Must display:

- source identity
- source tier
- observation time
- evidence reference
- confidence
- rights status
- methodology use
- correction or dispute status

### 6. Entity Intelligence Card

Kidults variants:

- Brand
- Franchise
- Character
- Product
- Edition

Artfund variants:

- Artist
- Artwork
- Edition
- Auction Lot
- Institution

Shared fields:

- canonical_id
- primary_name
- classification
- image or visual placeholder
- headline score
- confidence
- key signals
- evidence link

### 7. Report Card

Fields:

- edition
- title
- executive abstract
- publication time
- evidence coverage
- methodology version
- download and view actions

### 8. Alert Card

Fields:

- severity
- entity
- change
- why_it_matters
- observed_at
- confidence
- recommended_action

### 9. Premium Data Table

Requirements:

- Sticky context on desktop where useful.
- Mobile transforms into cards or a controlled horizontal detail region.
- Sorting, filtering, and export state are explicit.
- Data source and freshness remain accessible.

### 10. Empty and Degraded States

Every component must support:

- loading
- no data yet
- insufficient evidence
- source delayed
- partial result
- unauthorized
- failed calculation
- methodology unavailable
- rights restricted

## Component Quality Rules

- Touch target >= 44px.
- No accidental horizontal page overflow.
- Chart labels remain readable at 320px viewport width.
- Tooltips cannot be the only method of accessing critical information.
- Skeleton loaders must reflect the final layout.
- Premium motion must stop when reduced motion is enabled.

## Contract Boundary

Shared components define structure, semantics, states, accessibility, and behavior. Vertical themes control typography pairing, palette, image treatment, editorial voice, and selected visual density.
