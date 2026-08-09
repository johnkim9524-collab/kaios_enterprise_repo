# KIDULT 100 Intelligence-Value Data Policy

## Principle
KIDULTS does not collect data because it exists. It collects only data that can compound into proprietary, decision-grade intelligence.

Every collected field must answer at least one of these questions:
1. What is this object, exactly?
2. How scarce is it?
3. How liquid is it?
4. What is it worth now, and how is that changing?
5. How strong is collector demand?
6. How culturally/canonically important is it?
7. What risk could impair value or marketability?
8. What changed, why did it change, and with what confidence?

A field that does not contribute to one of these questions is excluded from the default collection plan.

## The seven intelligence primitives

### 1. Identity / Canonical Entity
Purpose: prevent fragmented or duplicated histories across sources.
Collect:
- canonical object/model name
- manufacturer / creator / franchise / brand
- model / SKU / reference / catalog number
- edition / variant / production year
- material / dimensions only when identity-relevant
- source-specific IDs
- canonical entity ID and cross-source mappings

Derived intelligence:
- persistent entity graph
- duplicate resolution
- historical continuity
- variant-level comparability

### 2. Scarcity / Supply
Purpose: determine how difficult an object is to acquire and whether scarcity is strengthening.
Collect:
- edition size / production run when authoritative
- discontinued / retired / active-production state
- visible market supply count
- auction frequency
- dealer/listing count where permitted
- restock / delist / sell-out state changes
- surviving-condition or grade distribution when available

Derived intelligence:
- scarcity score
- supply compression / expansion
- structural vs temporary scarcity
- category scarcity regime

### 3. Transactions / Price / Comparable
Purpose: establish real value and valuation confidence.
Collect only when legally available:
- sold price, not merely asking price
- sale date
- currency
- venue/source
- condition / grade
- edition / variant
- fees inclusion status where known
- estimate / hammer / realized distinction
- comparable identity and distance

Derived intelligence:
- normalized comparable set
- median/trimmed price
- price trend
- volatility
- valuation confidence
- premium/discount to peers

### 4. Liquidity / Market Depth
Purpose: distinguish expensive objects from genuinely tradeable assets.
Collect:
- transaction frequency
- days-to-sale when available
- listing-to-sale conversion where available
- bid depth / bidder count when legally/publicly available
- spread between asking and realized price where comparable
- number of active venues
- repeat-sale interval

Derived intelligence:
- liquidity score
- depth score
- exit-risk estimate
- stale-market detection

### 5. Demand / Attention
Purpose: capture demand before it fully appears in price.
Collect only from sources whose terms permit it:
- search interest indexes
- watchlist/favorite counts
- auction view/bid counts
- community discussion volume
- social/cultural mention velocity
- wishlist or ownership signals where public/authorized

Derived intelligence:
- collector demand momentum
- attention-to-price divergence
- early demand acceleration
- hype vs durable demand

### 6. Canon / Cultural Strength
Purpose: capture long-duration value drivers that market-price feeds miss.
Collect:
- museum/institution collection presence
- major exhibition inclusion
- archival/catalog inclusion
- creator/brand milestone relevance
- franchise durability
- design awards / cultural recognition
- major editorial/academic references

Derived intelligence:
- canon strength
- institutional validation
- cultural persistence
- long-duration relevance score

### 7. Risk / Authenticity / Marketability
Purpose: prevent high price from being confused with high-quality value.
Collect:
- authenticity/provenance evidence
- condition risk
- counterfeit incidence signals where reliable
- legal/rights restrictions
- serviceability/parts availability for mechanical objects
- market concentration
- venue/provider dependence
- price anomaly / manipulation indicators

Derived intelligence:
- confidence score
- authenticity/provenance score
- concentration risk
- liquidity risk
- manipulation/anomaly flags

## What KIDULTS should NOT collect by default
- generic descriptions that do not affect identity, demand, value, scarcity, liquidity, canon, or risk
- full-text page copies
- decorative image metadata without analytical use
- broad web/social content merely because it mentions an object
- redundant fields already deterministically derivable from canonical data
- personal data not necessary for the intelligence product
- data with unclear rights merely because it is technically accessible

## Source hierarchy

### Tier A — Authoritative identity / provenance
Manufacturer, creator, museum, official catalog, standards registry, public authority.
Use for identity, dates, references, edition facts, institutional presence.

### Tier B — Transaction / market evidence
Auction houses, exchanges, marketplaces, dealer networks, public sold archives, licensed feeds.
Use for price, transaction, liquidity, supply.

### Tier C — Independent verification
Second market source, museum/registry, alternative auction venue, historical archive.
Use to validate identity, transactions and anomalies.

### Tier D — Demand / cultural signal
Search-trend, community, editorial, social or attention sources whose terms permit analysis.
Use only as signals, never as sole factual authority.

## Collection gate
A new source or field enters autonomous collection only if it passes all five gates:
1. VALUE: produces or materially improves at least one proprietary intelligence output.
2. RIGHTS: permitted collection/processing/retention path is known.
3. PROVENANCE: source, timestamp and payload fingerprint can be retained.
4. COMPARABILITY: can be normalized to a persistent canonical entity or market event.
5. ECONOMICS: expected intelligence value exceeds collection/processing/maintenance cost.

Fail any gate -> DO_NOT_COLLECT or HUMAN_REVIEW.

## Kidult 100 minimum evidence envelope per constituent
For an object to be eligible for full Kidult 100 scoring, target evidence is:
- canonical identity: required
- authoritative provenance: required
- scarcity evidence: required
- at least one market/transaction or defensible comparable evidence path: required for valuation publication
- liquidity evidence: required for liquidity score; otherwise score remains unavailable
- demand or attention evidence: desirable
- canon/cultural evidence: desirable
- risk/confidence evidence: required

No single missing optional dimension is fabricated. Missing data lowers confidence or suppresses the affected score.

## Moat rule
The moat is not the raw record. The moat is the longitudinal graph created from repeated observations:
`entity -> source observations -> transactions -> supply states -> demand states -> canon events -> risk events -> normalized signals -> historical scores -> index decisions`.

KIDULTS therefore prioritizes repeated, timestamped observations of high-value fields over broad one-time crawling.

## Operating objective
Collect the smallest defensible dataset capable of producing the highest-value, most reproducible intelligence.
