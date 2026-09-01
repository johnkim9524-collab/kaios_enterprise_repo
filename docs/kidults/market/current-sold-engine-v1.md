# KIDULTS Current-SOLD Engine V1

## Decision

`KIDULTS Current-SOLD` is an owned intelligence product. External providers are replaceable evidence/source layers, not the canonical product.

## Canonical flow

`SOURCE -> ACQUISITION_RECEIPT -> RIGHTS_RECEIPT -> OBSERVATION -> CURRENT_SOLD_EVENT -> EVIDENCE -> TRACK_B -> PROJECTION`

The engine admits only a terminal `SOLD` fact that has a stable canonical object identity, source transaction identity, HTTPS source reference, sold timestamp, realized consideration, ISO currency, fee semantics, acquisition provenance digest/receipt and a rights receipt explicitly allowing private Current-SOLD use.

## Transaction semantics

The canonical status vocabulary is `SOLD | PASSED | WITHDRAWN | UNSOLD | ASKING | UNKNOWN`. Only `SOLD` can enter the Current-SOLD ledger. Listing price, estimate, asking price, aggregate sales statistics, marketplace discovery metadata and fixture/synthetic rows are not terminal SOLD evidence.

## Freshness

V1 preserves the existing governed boundary: transactions older than 30 days are historical-only and are rejected from Current-SOLD admission. A stricter 7-day classification can be applied downstream without weakening the admission ceiling.

## Ownership boundary

KIDULTS owns:

- canonical object resolution;
- transaction-state normalization;
- fee-semantics normalization;
- deduplication and conflicting-source detection;
- correction lineage;
- provenance linkage;
- confidence and downstream intelligence derivation.

Providers supply lawful source facts. Replacing a provider does not replace the Current-SOLD product or its canonical identity.

## Fail-closed boundaries

Admission rejects rows when any of the following is true:

- state is not terminal `SOLD`;
- acquisition provenance is missing;
- rights decision is not `ALLOW_PRIVATE_CURRENT_SOLD`;
- HTTPS source identity is absent;
- realized consideration or currency is invalid;
- transaction is outside the current window;
- the same source transaction identity appears with conflicting provenance/content.

No Current-SOLD admission grants Public, Production or G5 authority.

## Execution sequence

1. Smoke: admit one lawful genuine SOLD transaction.
2. Canary: admit five independent genuine transactions.
3. Functional pilot: 30-120; no statistical reliability claim.
4. Adapter reliability: governed tier policy applies.
5. Track B receives only canonical Evidence, never raw provider payloads.

The first objective is therefore not an external finished dataset. It is one genuine lawful transaction successfully passing the owned admission chain.
