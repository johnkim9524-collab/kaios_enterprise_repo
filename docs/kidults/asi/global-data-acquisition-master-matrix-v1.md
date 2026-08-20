# KIDULTS Global Data Acquisition Master Matrix v1

## Objective

Create one canonical collection-control model answering, for every collectible category and region: **what evidence is required, through which sourcing channel, under what rights/admission/runtime state, with what freshness/redundancy requirement, and what should ASI acquire next?**

## Canonical axes

1. Category: 32 Collection Scopes from the canonical scope registry.
2. Geography: 8 canonical ASI macroregions.
3. Sourcing Channel: 7 provider/transport archetypes.
4. Evidence Class: 8 Global Source Mesh evidence classes.

The base operational cube is **32 × 8 × 7 = 1,792 acquisition cells**. Because each sourcing channel is eligible for a bounded subset of evidence classes, the deterministic expanded evidence-demand layer is **4,352 Category × Region × Channel × Evidence rows**.

## Seven sourcing channels

- OFFICIAL_AUTHORITY
- OPEN_STRUCTURED_DATA
- OFFICIAL_ARCHIVE
- LICENSED_TRANSACTION_OR_MARKET_FEED
- PUBLIC_OR_LICENSED_LISTING_FEED
- REGIONAL_INSTITUTION_EVENT_VENUE
- CONTEXT_SIGNAL

A sourcing channel is not an evidence class. For example, an OFFICIAL_AUTHORITY can support identity, scarcity/population or regional context, while a LICENSED_TRANSACTION_OR_MARKET_FEED may support sold, listing or exposure/liquidity evidence. This separation prevents provider type from being mistaken for claim truth.

## Row state model

Every evidence-demand row carries selection, rights, admission, runtime, evidence, claim, freshness, redundancy, coverage-debt and priority states. Structural generation always defaults operational truth fail-closed:

- rights = UNASSESSED
- admission = NOT_ADMITTED
- runtime = NOT_CONNECTED
- evidence = GAP
- claim = NOT_VERIFIED
- coverage debt = OPEN

Operational overlays may promote those fields only from purpose-specific rights evidence, runtime registry evidence and immutable empirical evidence artifacts.

## Priority model

Priority is a structural acquisition priority, not market weight:

`2 × decision utility + evidence strength + rights clarity + autonomy − dependency risk`

Raw record count has weight 0. Bootstrap regional shares are never market-share estimates.

## Core truth boundaries

- Source discovery is not rights admission.
- Rights admission is not runtime connection.
- Runtime connection is not evidence verification.
- Listing is not sold.
- Historical is not current.
- Scarcity is not liquidity.
- Attention is not demand.
- Missing is not zero.
- Provider home country is not observation region.
- Collection share is not analytical weight.
- No provider is global truth.
- No global claim without cell-level rights, provenance, redundancy and geography gates.

## ASI operating use

The matrix becomes the source-of-truth input for:

1. Coverage & Bias Engine — compute Category × Region × Evidence coverage debt.
2. Source Discovery Engine — discover only rows whose coverage debt is open.
3. Rights & Admission Gate — promote only purpose-specific lawful rows.
4. Acquisition Planner — select highest-value lawful acquisition rows, not highest raw record volume.
5. Independence & Redundancy Engine — enforce source-owner minima by cell.
6. Freshness & Stability Engine — age evidence by source-native cadence.
7. Runtime — connect only ADMITTED rows.
8. Market/Index engines — consume only VERIFIED_BOUNDED evidence rows and never infer missing values.

## Release boundary

This v1 establishes the machine-enforced acquisition-control structure only. It does not create new source rights, empirical evidence, market-factor verification, public release, Production authority or G5 approval.
