# KIDULTS ASI Sourcing Direction v2

**Authority:** KPMO  
**Status:** MANDATORY / FAIL-CLOSED  
**Machine contract:** `coordination/kidults/source-intelligence/asi-sourcing-direction-contract-v2.json`

## 1. Sourcing direction

KIDULTS sourcing is directed by exactly four platform principles, in this binding order:

1. **Autonomous**
2. **Global**
3. **Irreplaceable Value**
4. **Transparent**

These are not four marketing adjectives and are not optional scoring factors. They determine what the ASI should source, how it should select sources, how it should execute, what value must remain inside KIDULTS, and what evidence must accompany every decision.

## 2. Mission

> Continuously source lawful global evidence opportunities that reduce decision-relevant uncertainty, strengthen KIDULTS-owned intelligence assets, and preserve complete decision traceability.

The objective is not to maximize websites, providers, records, or crawling volume. The objective is to produce more reliable and more valuable intelligence for customer and executive decisions.

## 3. What each direction means for sourcing

### 3.1 Autonomous

ASI must generate source demand from live intelligence gaps, execute bounded reversible work through registered automation, adapt to provider health, rights, freshness, cost, and coverage, and automatically retry, replay, replace, or retire sources.

Human intervention is reserved for protected gates such as Production/G5, irreversible legal or security changes, external spend, contracts, and expanded credentials.

A ready internal sourcing runner that waits silently for a manual button is not fully autonomous.

### 3.2 Global

Every lawful public or authorized website, API, feed, archive, catalog, marketplace, authority, institution, dataset, and context source may be a candidate when relevant.

A static whitelist, familiar provider set, or numeric site count is not the global universe. Global coverage is measured empirically across Scope, region, language, evidence class, source role, price tier, venue type, and time.

A global claim is not eligible merely because the architecture is global.

### 3.3 Irreplaceable Value

External data may be licensed, public, replaceable, or unavailable later. Therefore the durable moat must accumulate inside KIDULTS as:

- source identity and factual-origin graphs;
- canonical entity, evidence, and market-event graphs;
- semantic fingerprints and normalization methods;
- provider-switching and replacement layers;
- confidence, calibration, and contradiction handling;
- derived intelligence, decision feedback, and evidence economics.

No single provider may become a mandatory bottleneck. External raw data itself is not claimed as KIDULTS-owned value.

### 3.4 Transparent

Every material source decision requires a reproducible receipt showing source identity, owner and factual origin, discovery method, selection reason, evidence class and role, rights by purpose, access and cost state, freshness and time semantics, provenance, claim ceiling, confidence, transformations, dependencies, provider health, replacement rationale, and evidence references.

Unknowns and blockers must remain visible. Listing is not Sold. Attention is not Demand. Historical is not Current. Missing is not Zero.

## 4. Canonical sourcing cycle

```text
Decision demand
    ↓
Intelligence question
    ↓
Claim and unknown registry
    ↓
Evidence requirement
    ↓
Global gap map
    ↓
Global source-universe generation
    ↓
Four-axis screening
    ↓
Rights / semantics / technical preflight
    ↓
Expected intelligence gain per total cost
    ↓
Governed discovery or collection
    ↓
Gate 1 — source safety
    ↓
Gate 2 — independent reverification
    ↓
Gate 3 — purpose-specific admission
    ↓
Canonical graph binding
    ↓
Unknown reduction and KIDULTS-owned value measurement
    ↓
Feedback, reprioritization, replacement, or retirement
```

The flow is **not** Provider → Collection → Metric. Source selection begins with decision-relevant evidence demand, while bounded exploration remains available for unexpected global opportunities.

## 5. Selection model

Every candidate receives a visible four-axis vector:

```yaml
autonomous:
global:
irreplaceable_value:
transparent:
```

Each axis uses a 1–5 scale. A source must satisfy the minimum floor on every axis before ordinary prioritization. One strong dimension cannot hide a failure in another.

After the hard floors and rights/semantic gates pass, the tie-breaker is:

```text
Expected decision-relevant unknown reduction
────────────────────────────────────────────
Total acquisition, operating, dependency, and risk cost
```

The priority score is advisory. It cannot create collection rights, admission, evidence sufficiency, or a customer claim.

## 6. Hard boundaries

```text
Discovery ≠ Collection
Collection ≠ Admission
Admission ≠ Claim
Source count ≠ Coverage
Provider count ≠ Global
Listing ≠ Sold
Attention ≠ Demand
Scarcity ≠ Liquidity
Historical ≠ Current
Synthetic capacity ≠ Empirical completion
```

Unknown or conflicting rights block collection, derivation, display, and redistribution until resolved.

## 7. Required outputs

Each active sourcing cycle must produce, directly or through governed companion artifacts:

- Global Gap Map
- Source Demand Queue
- Four-Axis Source Scorecard
- Rights / Access / Cost Matrix
- Source Selection Receipt
- Source Health and Replacement Plan
- Coverage / Bias / Concentration Report
- Unknown Reduction Report
- KIDULTS-Owned Value Gain Report

## 8. Success metrics

Success is reported by principle.

| Direction | Primary evidence |
|---|---|
| Autonomous | automatic-trigger coverage, manual-intervention rate, recovery rate, reprioritization latency |
| Global | empirical coverage, marginal coverage gain, unrepresented surfaces, factual-origin diversity |
| Irreplaceable Value | canonical identities, graph relationships, provider switchability, source-removal resilience, derived intelligence gain |
| Transparent | receipt completeness, rights/provenance coverage, claim-ceiling coverage, reproducible selection rate, unknown disclosure |

No aggregate percentage may replace these underlying measurements.

## 9. Completion rule

ASI sourcing alignment can be `COMPLETE_VERIFIED` only when all four directions are evidenced. A missing direction is `UNKNOWN`, not implicitly satisfied.

Public release, Production, and G5 remain HOLD unless separately approved.
