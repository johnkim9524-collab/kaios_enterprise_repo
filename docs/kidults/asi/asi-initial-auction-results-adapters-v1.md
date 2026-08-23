# KIDULTS ASI Initial Auction Results Adapters v1

**Owner:** KPMO  
**Priority:** P0  
**Direction:** Autonomous → Global → Irreplaceable Value → Transparent

## Purpose

The strict adapter SDK and family contracts are generic. This wave implements the first six source-specific current-SOLD field mappings for the highest-priority auction-result profiles already registered in the ASI backlog.

## Six source-specific mappings

```text
Bonhams Cars Results
Barrett-Jackson Results
Bonhams Watches Results
Christie's Watches Results
Sotheby's Watches Results
Broad Arrow Results
```

The mappings cover 96 priority source assignments across automobiles/mobility and watches/jewelry.

## Mapping contract

Each adapter maps profile-specific aliases for:

- terminal result status;
- realized price;
- currency;
- event date;
- source record or lot ID;
- object title and identity.

The mapped event then passes through the shared strict SDK, which enforces:

- exact terminal `SOLD` state;
- positive realized price;
- explicit valid currency;
- coherent event and observation times;
- source record and object identity;
- source owner and factual origin;
- collect, store and derive rights envelope;
- deterministic duplicate grain;
- provider-direct truth/projection prohibition.

## Fail-closed semantics

```text
Estimate ≠ Realized price
Price range ≠ Realized price
Listing ≠ Sold
Bid / Ask / Offer / Reserve ≠ Sold
Ambiguous currency ≠ Valid transaction
```

An ambiguous dollar symbol without an explicit source currency is rejected. Estimate text and ranges are rejected.

## Fixture certification

Every profile-specific mapping executes a deterministic positive fixture twice. The resulting strict event remains:

```text
fixture_only = true
empirical = false
promotable = false
```

Mapping implemented ≠ Live extraction verified.  
Fixture certification ≠ Evidence Admission.

## Live extraction readiness

Each mapping emits the exact remaining actions:

1. observe the official source schema through bounded safe transport;
2. bind exact source URL patterns;
3. evidence field-purpose rights;
4. verify terminal status and realized-price semantics;
5. verify source owner and factual origin;
6. run a non-promotable live extraction canary.

No target-host egress is authorized by this mapping wave.

## Automatic execution

The workflow activates on:

- relevant protected-main push;
- every hour at minute 48;
- successful `KIDULTS ASI Claim-Suitable Adapter SDK v1` completion.

Manual dispatch remains recovery or explicit replay only.

The workflow builds twice, proves deterministic replay, validates all six mappings and fixtures, rejects estimate-as-realized, ambiguous currency, live-extraction overclaim, fixture promotion, false Evidence Admission and manual-only activation, then emits a KPMO receipt and 90-day artifact.

## Outputs

```text
source-specific-adapter-registry-v1.json
source-specific-adapter-fixture-certification-v1.json
adapter-assignment-coverage-v1.json
live-extraction-readiness-v1.json
initial-auction-adapter-manifest-v1.json
```

## Truth boundary

Six source-specific mappings are implemented and fixture-certified. Live extraction, rights PASS and empirical admission remain unverified. No Evidence Admission, Market Event or Snapshot Candidate is created.
