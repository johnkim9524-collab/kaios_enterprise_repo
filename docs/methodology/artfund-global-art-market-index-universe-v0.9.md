# Artfund Global Art Market Index Universe v0.9

## Objective

Define a transparent research-index framework for measuring global art investment markets while preserving provenance, rights, price comparability, and reproducibility.

## Initial Index Family

1. Artfund Global Art Market Index
2. Artfund Artist Momentum Index
3. Artfund Auction Liquidity Index
4. Artfund Provenance Strength Index
5. Artfund Blue-Chip Contemporary Index

## Eligible Market Records

An observation may enter an index only when it has:

- canonical artist and artwork or lot identity
- transaction or offer timestamp
- venue and market type
- price and currency
- price basis: hammer, premium-inclusive, estimate, or private-sale report
- rights status allowing analytical use
- evidence reference
- confidence grade C or better for research indices
- no unresolved material dispute

## Price Hierarchy

1. verified premium-inclusive public transaction
2. verified hammer price with documented premium policy
3. verified private-sale transaction where permitted
4. accepted bid or reported transaction with reduced confidence
5. estimate and asking price for non-price indices only

Price bases may not be mixed without explicit normalization.

## Currency and Inflation

- daily reference FX rate
- source currency retained
- normalized USD value stored separately
- optional real-value series with published inflation source
- no silent restatement

## Exclusions

- withdrawn lots
- unsold lots for price-return calculations
- disputed authenticity
- materially incomplete price basis
- duplicate transaction records
- non-arm's-length transactions where identified
- prohibited commercial-use data
- extreme outliers not resolved by methodology

## Global Art Market Index Outline

The initial index is a research benchmark using repeatable segment-level aggregation rather than pretending that heterogeneous artworks are directly fungible.

Components may include:

- median normalized price movement
- transaction value
- lot count
- sell-through rate
- geographic breadth
- segment diversification
- confidence-weighted coverage

## Artist Momentum Outline

Candidate inputs:

- price trend
- transaction frequency
- sell-through
- estimate performance
- exhibition quality
- institutional collection events
- media and research velocity
- liquidity
- source and confidence coverage

## Auction Liquidity Outline

Candidate inputs:

- offered lot count
- sold lot count
- sell-through rate
- bid or estimate depth where available
- transaction frequency
- median time between market appearances
- price dispersion
- venue breadth

## Provenance Strength Outline

Candidate inputs:

- documentary continuity
- institutional exhibition history
- publication and catalogue references
- ownership gaps
- dispute status
- authentication quality
- source independence

## Rebalance and Publication

- research calculation: daily where data permits
- official publication: weekly initially
- constituent review: quarterly
- methodology review: semi-annually
- emergency corrections: evidence-based and logged

## Weighting Principles

- no single artist dominates the global benchmark
- segment and region concentration caps are mandatory
- liquidity and confidence influence weights
- data abundance does not automatically equal market importance
- all caps and formulas must be versioned before public beta

## Backtest Requirements

Before public beta:

- minimum 36 months where source rights and quality permit
- survivorship-bias review
- currency and price-basis consistency review
- outlier sensitivity analysis
- concentration analysis
- reproducibility test from frozen inputs

## Disclosure

Artfund indices begin as research indices and are not investable financial products. Every published value must expose methodology version, effective date, coverage, confidence, and restatement history.
