# KIDULTS Proof-Product Data Contract v1.0

**Decision:** `KIDULTS-COMPETITIVENESS-V1-20260822`

**Owners:** Track C / KPMO

**Machine contract:** `kidults-proof-product-data-contract-v1.json`

**Projection schema:** `../schemas/kidults-proof-product-projection-v1.schema.json`

**Gate:** Production/Public/G5 **HOLD**

**Current empirical state:** no immutable Candidate/Evidence pair, Track B assessment or live approved Projection

## 1. Decision

KIDULTS Object Passport, KIDULTS Market Projection API and Kidult 100 use one governed Projection envelope and three product-specific payloads. Portal, API, Reports and IH-EOS consume the Projection; they do not read raw provider data or calculate product intelligence.

The contract makes the product useful before approved data exists without inventing a value. A closed field transmits:

`current state → closed reason → opening condition → available action`

It never transmits zero, a synthetic curve, a placeholder rank or a stale/rights-blocked value.

## 2. Common Projection envelope

Every proof product supplies:

| Group | Required meaning |
|---|---|
| Identity | `projection_id`, product type and contract version |
| State | Projection state and display eligibility |
| Scope | Period, geography, venue, currency and Vertical |
| Method | Method version used to form the Projection |
| Lineage | Immutable Snapshot, Evidence Package and Track B Assessment IDs when approved |
| Evidence | Pairing state, source count, independent source-family count and evidence references |
| Rights | Internal analysis, public display and API redistribution rights separately |
| Freshness | Current/stale/unknown state and observation validity interval |
| Confidence | Assessed state, classification, optional calibrated value and method version |
| Rankability | Rankable/not-rankable/pending, independent assessment ID and reasons |
| Disclosure | Known limitations and explicit missing-data treatments |
| Behavior | Compare, Watchlist, Alert, Export, Provenance and Governance action states |
| Audit | Governance record, Projection record and change events |
| Time | Generated and updated timestamps |

Confidence and rankability are independent. High confidence does not make an object eligible for ranking, an index or public display.

## 3. Field state contract

| State | Value allowed | Required disclosure |
|---|---:|---|
| `VERIFIED` | Yes | Evidence reference, rights, freshness, confidence and limitations |
| `INFERRED` | Yes | Evidence reference, inference limitations, rights, freshness and confidence |
| `UNAVAILABLE` | No | Reason, opening conditions and user action |
| `RIGHTS_BLOCKED` | No | Rights reason, opening conditions and permitted action |
| `STALE` | No | Stale reason, refresh condition and permitted action |

The schema rejects a value in `UNAVAILABLE`, `RIGHTS_BLOCKED` or `STALE`. This is the executable form of Evidence Before Metrics and Missing is not zero.

## 4. KIDULTS Object Passport

The Passport requires a `canonical_object_id` and a state-bearing record for every field:

- Identity
- Maker / Model / Variant / Year
- Provenance
- Specification
- Condition
- Market observations
- Comparables
- Liquidity
- Scarcity
- Cultural significance
- Risks
- Evidence
- Rights
- Audit history

The presence of the field does not imply the presence of a value. Before evidence is approved, the exact field remains visible with a closed state, reason, opening condition and action.

## 5. KIDULTS Market Projection API

The market Projection declares chart axes and units before values, and supports the same Period, Currency, Geography, Venue and Vertical filters used by the product.

The two lenses are separate product contracts over one evidence base:

| Collector Lens | Institutional Lens |
|---|---|
| What changed | Universe |
| Why it matters | Coverage |
| Comparable context | Market scale |
| Liquidity | Depth |
| Risk | Turnover |
| Possible action | Concentration |
|  | Exposure |
|  | Confidence |

No lens may create or reinterpret a value. Each section receives its own field state and Evidence/Right/Freshness/Confidence disclosure.

## 6. Kidult 100

The methodology is a product surface even while publication is closed. It requires state-bearing records for:

- Index objective
- Eligible universe
- Inclusion and exclusion rules
- Evidence and liquidity thresholds
- Weighting framework and concentration cap
- Rebalance cycle and event treatment
- Rights requirement
- Method versioning and restatement policy
- Limitations

`index_level` and `constituents` use the same field-state contract. Until Universe, Track B rankability, current rights, approved Projection and publication gates pass, they remain value-free and closed. “Methodology prepared” must never be rendered as “index published.”

## 7. Product action behavior

Every action is `ENABLED`, `DISABLED` or `HIDDEN`.

- Enabled actions require a real destination.
- Disabled and hidden actions require a user-facing reason.
- Every product Projection provides a Governance and Projection audit link.
- Export remains disabled when rights, freshness, assessment, entitlement or Projection state does not permit it.
- Compare, Watchlist and Alert may be enabled only when their destination and required object/scope identity exist.

## 8. Projection-only rendering law

The following are prohibited:

1. Raw provider data flowing directly to Portal or API.
2. Portal-side identity, confidence, rankability, index or market calculation.
3. A value without `VERIFIED` or `INFERRED` state and an evidence reference.
4. Missing values becoming zero.
5. Stale or rights-blocked values being displayed.
6. Generated/editorial imagery becoming market evidence.
7. Approved or public state without immutable Snapshot/Evidence/Assessment lineage.
8. Public display without explicit public-display rights.
9. Kidult 100 values or constituents before its publication gate.

## 9. Current-state rendering

At adoption, the correct product state is `AWAITING_APPROVED_PROJECTION` or a more specific closed state. The contract adds no live value and changes no gate.

The customer-visible sequence is:

1. show the product-specific requirement and current state;
2. explain why it is closed;
3. state what evidence, rights, freshness or assessment opens it;
4. offer only the actions that actually work;
5. provide a Governance destination.

## 10. Acceptance and rollback

Acceptance requires:

- schema validation for all three payloads;
- rejection tests for fabricated, stale, rights-blocked and unbound values;
- Track C consumer mapping with no local analytics;
- exact binding to Track A Candidate/Evidence and Track B Assessment IDs;
- human usability review after a real approved Projection exists.

Rollback removes this contract, schema and consumer binding. It does not mutate provider data, runtime, Production or G5.
