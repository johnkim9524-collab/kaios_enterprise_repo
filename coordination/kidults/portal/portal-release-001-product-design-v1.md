# KIDULTS Intelligence Portal — Portal Release-001 Product Design v1

## Product role
KIDULTS Intelligence Portal is the governed intelligence consumption product for collectors, analysts and institutional users. It consumes only governed Projection outputs and never infers truth directly from raw/provider data.

## Product identity
- Product: KIDULTS Intelligence Portal
- Release: Portal Release-001
- Legacy functional lineage: V502
- Legacy experience lineage: V662/V663/V664
- Partner/corporate site: separate product (Partner Site Release-001)
- Production/G5: HOLD
- Live approved Projection: NONE until genuine Track-B-approved Projection exists

## Design principles
1. Intelligence before decoration.
2. Evidence visible, not buried.
3. Unknown/stale/blocked states are first-class UI states.
4. Premium editorial language, institutional information density.
5. Projection-first; no raw/provider bypass.
6. Same truth on desktop/mobile, different density only.
7. No legacy version numbers in customer-facing product identity.
8. No lime/neon accent; deep forest, warm ivory, stone, restrained signal colors only.

## Canonical information architecture
### 1. Home / Intelligence Overview
- Global intelligence brief
- Projection status strip
- 8 Core Verticals
- verified signal highlights
- Kidult 100 status/snapshot
- research highlights
- evidence health

### 2. Vertical Intelligence
Each vertical exposes:
- market state
- observed transaction activity
- liquidity / sell-through where verified
- demand / scarcity where verified
- category momentum
- geography/venue coverage
- evidence coverage
- current limitations

### 3. Object Intelligence
- identity
- canonical aliases
- market observations
- evidence timeline
- comparables
- confidence / limitations
- source-owner independence
- freshness / as-of
- rights-safe attribution

### 4. Market Signals
- governed signal cards
- trend/momentum
- market maturity
- venue depth/diversity
- transaction activity
- geographic diffusion
- no signal shown as verified unless Projection state permits

### 5. Kidult 100
Two modes only:
- LIVE_APPROVED ranking from governed Projection
- EDITORIAL_PREVIEW clearly separated and never numbered as live rank

### 6. Research & Archive
- monthly intelligence
- category briefs
- methodology notes
- immutable archive snapshots
- historical Projection references

### 7. Evidence & Methodology
- evidence coverage
- confidence model
- source-owner independence
- freshness
- methodology version
- evidence-lineage version
- rights/publication status

### 8. Workspace
- search
- compare
- decision workspace
- saved views
- all inputs Projection-bound
- stale/invalid Projection blocked from decision actions

## Global state model
Every intelligence surface must resolve to exactly one state:
- LIVE_APPROVED
- WAITING
- STALE
- INVALID
- RIGHTS_BLOCKED
- NOT_AVAILABLE
- NO_PROJECTION

Rules:
- missing never becomes zero
- stale never silently falls back to older live-looking data
- invalid/rights-blocked cannot enter compare/decision/ranking
- control fixtures render with NON_PROMOTABLE badge and cannot be mistaken for live data

## Visual system
### Brand
- Wordmark: spaced sans-serif KIDULTS
- Editorial display: serif
- Utility/data: neutral sans-serif

### Palette
- Deep Forest: #0A2A20
- Warm Ivory: #F4F2EE
- Soft Ivory: #F0EEE8
- Stone: #D9D7D0
- Ink: #15201C
- Muted text: #65716B
- No lime/neon accent

### Interaction accents
Use semantic, restrained accents only for state communication. No decorative bright accent.

### Layout
Desktop:
- 12-column grid
- max content width 1280–1360
- data cards dense but breathable
- sticky product header + Projection status line

Tablet:
- 8-column grid
- 2-column analytical cards

Mobile 320/375/390/430:
- one-column canonical reading order
- same information/state semantics as desktop
- horizontal tables become stacked fact blocks
- charts become compact summaries before visual detail
- no hidden critical evidence/rights state

## Home screen hierarchy
1. Product header
2. Projection status bar
3. Intelligence Overview hero (no marketing superlative)
4. Today / As-of summary
5. 8 Core Verticals
6. Market Signal matrix
7. Kidult 100 status / preview or approved ranking
8. Evidence Health
9. Research / Archive
10. Methodology / Audit transparency

## Projection status bar
Always visible on analytical surfaces:
- projection_id
- as_of
- state
- freshness
- assessment binding
- rights state
- release state
User-facing detail can be abbreviated, diagnostics retain full identifiers.

## Evidence transparency pattern
Each claim/signal can expose:
- confidence classification
- evidence count/coverage
- source-owner independence
- as-of/freshness
- methodology version
- limitation note
- rights/publication state

## Audit integration
Portal consumes a safe Audit Projection, never raw audit/provider payloads.
Surface only:
- Projection creation/rebuild status
- stale/invalid reason
- rights block reason category
- replay/rollback state
- correlation id for diagnostics
Never surface secrets, credentials or raw provider payloads.

## Legacy removal plan
Retire as product identity:
- data-release=v502
- customer-visible V6 RC labels
- V662/V663/V664 query/version naming in UX
- hard-coded baseline snapshot as product truth
- exact asset marker dependence in release validation

Preserve only as lineage metadata.

Consolidate legacy hotfixes into:
- portal-release-001.css
- portal-release-001.js
- projection-store.js
- state-renderer.js
- audit-view.js
- workspace-runtime.js

## Acceptance before Projection dry-run
Portal Release-001 must pass:
- NO_PROJECTION
- WAITING
- STALE
- INVALID
- RIGHTS_BLOCKED
- NOT_AVAILABLE
- NON_PROMOTABLE fixture
- responsive 320/375/390/430/tablet/desktop
- WCAG 2.2 AA automated baseline
- keyboard/focus/manual acceptance path
- offline/error states
- stale cache rejection
- no raw/provider bypass
- no Track B bypass
- no public/Production/G5 bypass

Only after this product foundation is clean does #884 Projection Dry-Run Plumbing start full-chain execution.
