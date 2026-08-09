# KIDULTS Historical Intelligence Graph Baseline

Status: architecture/methodology baseline. Population with authoritative longitudinal data remains a Data GA dependency.

## Goal

Create a compounding intelligence asset where persistent entity identity, evidence, transactions, comparables, signals and methodology versions remain linkable across providers and time.

## Core nodes

- Entity: collectible, model, edition, brand, franchise, creator, category, market, provider.
- Observation: price, listing, sale, scarcity, availability, search/attention, sentiment, canon/cultural signal.
- Event: transaction, release, auction, collaboration, discontinuation, market shock.
- Intelligence output: valuation, momentum, liquidity, scarcity, sentiment, canon, risk, rank and confidence.
- Evidence: source, timestamp, rights class, provenance chain, quality state.
- Methodology: model/version, feature definitions, thresholds and reproducibility fingerprint.

## Required edges

`SAME_ENTITY_AS`, `OBSERVED_BY`, `EVIDENCED_BY`, `TRANSACTED_AT`, `COMPARABLE_TO`, `BELONGS_TO_CATEGORY`, `BELONGS_TO_BRAND`, `BELONGS_TO_FRANCHISE`, `DERIVED_FROM`, `SUPERSEDES`, `VALIDATED_BY`, `CONTRADICTS`, `RANKED_IN`, `METHOD_VERSION`.

## Persistent identity

Internal canonical IDs must survive provider substitution. Provider IDs are aliases, never the primary identity. Merge/split decisions require evidence and must be auditable/reversible.

## Longitudinal intelligence

The graph must support transaction/comparable history, scarcity/liquidity/cultural momentum/canon/risk signals, category rotation, market regimes and rank/valuation movement explanations.

## Confidence and provenance

Every critical intelligence output must carry evidence references, methodology version and confidence. Conflicting sources remain represented; resolution must not delete contradictory evidence.

## Compounding advantage metrics

Measure historical coverage depth, percentage of entities with persistent identity, longitudinal observation density, comparable-chain depth, signal stability, reproducibility, unique derived features and retained derived intelligence after provider changes.

## Methodology reproducibility

All published intelligence should identify methodology version, input evidence window, deterministic feature definitions where possible, threshold/policy version and output fingerprint sufficient for later reproduction.

## Data GA limitation

This document defines the moat architecture; it does not certify authoritative historical data, live provider rights or actual compounding advantage.
