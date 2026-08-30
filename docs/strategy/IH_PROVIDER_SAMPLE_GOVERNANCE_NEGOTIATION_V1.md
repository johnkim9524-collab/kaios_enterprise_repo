# Intelligence Holdings Provider Sample-Governance Negotiation Strategy v1

**Effective after protected-main merge**  
**Owners:** TRACK Z / KPMO  
**External communication:** HOLD unless separately approved  
**Production / Public / G5:** HOLD

## Executive decision

Provider negotiations must use staged evidence bands rather than a universal fixed sample requirement. A sample target is an internal acceptance-evidence threshold, not a purchase commitment, a provider warranty, or release authority.

The default sequence is:

```text
Rights and schema clarification
→ Canary 5
→ Bounded functional pilot 30–120
→ Optional Adapter qualification at 459 zero-failure observations
→ Optional Private reliability at 1,840
→ Platform Beta reliability at 4,603
→ 30 natural runs over at least 7 days
→ SLO, coverage, Track B and Program Owner release gates
```

The higher tiers are not automatically requested from every provider. They are opened only when the preceding stage passes and the provider adds measurable product value.

## What changes in negotiation

| Old behavior to avoid | New governed behavior |
|---|---|
| Ask every provider for exactly 120 records | Ask for a stage-appropriate volume band |
| Treat 120 as a launch minimum | Treat 30–120 as functional pilot evidence only |
| Negotiate enterprise volume before testing | Negotiate cancellable canary/pilot plus priced expansion options |
| Infer rights from API access or membership | Obtain purpose-specific written rights |
| Count duplicates, retries or parse drops as volume | Contract and measure unique conforming records; failures remain failures |
| Allow one provider to imply market authority | Qualify its Adapter only; platform claims require independent coverage |
| Buy a large dataset to satisfy a statistic | Accumulate only the evidence required by the requested claim and measured value |

## Negotiation ladder

### 1. Discovery and rights — no commercial commitment

Ask for exact fields, identifiers, provenance, correction semantics, retention, deletion, derived-output rights, territory/product scope, rate limits, sandbox and staged pricing. Do not request credentials, sign terms, or imply spend authority before the corresponding gates.

### 2. Canary — five records

Purpose: prove live authentication, schema and data-boundary behavior. Seek free or minimal-cost access. All five records must pass rights, schema and critical-defect census. Canary success authorizes no public use, reliability claim or enterprise purchase.

### 3. Bounded functional pilot — 30 to 120 records

Purpose: prove private end-to-end operation through ingestion, normalization, evidence, deletion, ledger, Track B and projection. The provider-specific PSA 120 plan remains valid here. It does not prove statistical reliability.

Commercial posture:

- monthly and cancellable;
- non-exclusive;
- usage capped;
- no annual prepayment;
- no automatic conversion to production;
- explicit stop, correction and deletion criteria.

### 4. Adapter qualification option — up to 459 zero-failure observations

Purpose: support a 99% one-sided exact upper-bound claim that operational defect rate is no greater than 1%, assuming zero observed failures. Negotiate this as an expansion option, not an initial minimum. Invalid, duplicate, nonconforming or provider-caused replacement records should not be double charged.

### 5. Higher reliability options

Private E2E reliability uses 1,840 zero-failure observations at a 0.25% major-defect tolerance. Beta reliability uses 4,603 at a 0.1% major-defect tolerance. These are platform evidence tiers and normally require multiple independent ultimate source owners. They are not single-provider procurement minima.

Exact nonzero-failure decisions use the pre-registered one-sided exact Clopper–Pearson upper bound; Track B independently recomputes the result.

## Rights negotiation schedule

Every provider answer must distinguish:

1. query or collect;
2. private temporary storage;
3. normalization and entity resolution;
4. internal human QA;
5. internal model calibration where relevant;
6. non-reconstructive derived analytics;
7. retention duration and deletion evidence;
8. corrections and audit;
9. territory, language, product and affiliate scope;
10. raw public display;
11. raw redistribution;
12. post-termination derived-output survival.

Unknown, expired, revoked or mismatched rights remain HOLD for every affected record. A majority of lawful records cannot cure an unlawful minority.

## Quality and remedies to negotiate

Seek contractual or written operational terms for:

- stable record IDs and versioned schemas;
- advance schema-change notice;
- corrections, reversals and revocation events;
- duplicate, invalid and nonconforming-record credits;
- replacement or rerun without double charge;
- critical-defect suspension and termination rights;
- export, transition and source-switching support;
- no silent reduction of fields, quota or rights.

KIDULTS treats rights, provenance, canonical identity, terminal-SOLD truth and raw-data exposure as critical defects with zero tolerance. Parse drops, timeouts and unexplained null substitution are failures. Retries and republications are not independent successes.

## Pricing strategy

Request separate pricing or capacity for:

| Band | Negotiation meaning |
|---|---|
| 1–5 | Canary |
| 6–120 | Bounded private functional pilot |
| 121–459 | Adapter qualification option |
| 460–1,840 | Optional private reliability capacity |
| 1,841–4,603+ | Optional platform-scale capacity |

Higher bands are option and capacity information only. Do not accept take-or-pay, high minimums, forced exclusivity or annual prepayment before the provider passes the relevant stage and demonstrates measurable value.

## Content and disclosure strategy

First contact should disclose the named use case, private non-production status, initial stage, initial volume band, rights questions, retention/deletion posture and request for schema, quota and pricing. It should not lead with all internal statistical thresholds.

Exact 459/1,840/4,603 targets may be disclosed when needed to negotiate capacity, acceptance criteria, credits or pricing. They must always be described as conditional evidence options, not promised volume.

Provider-facing and public content must not state:

- that 120 is a launch minimum;
- that 120/120 proves reliability;
- that a schema probe means product connection;
- that a single provider represents the market;
- that credentials or membership create reuse rights;
- that KIDULTS has approved spend, contract, Production, Public or G5 without receipts.

## Provider-class application

### PSA and grading providers

Use the sequence `1 → 5 → 30–120 → optional 459`. Certification or report identifiers must be lawfully known; guessing and enumeration remain prohibited. Population/census data requires exact field or method, as-of semantics and written reuse rights. PSA 120 is a bounded private functional pilot only.

### Current-SOLD providers

Require terminal sale state, time, realised price, currency, price type, premium/tax semantics, unsold/withdrawn/failed distinctions, venue/lot/object identifiers and correction/reversal behavior. A single provider may qualify its own Adapter at the appropriate tier but cannot alone establish platform market representativeness.

## Decision authority

TRACK Z prepares the internal brief, selects the negotiation stage, and negotiates rights, fields, price bands, remedies and exit terms. KPMO verifies exact-head policy, duplicate communication, claim language and external gates. Provider Engineering defines the schema and acceptance tests. Track B independently validates effective sample size, confidence bounds, coverage and claim ceiling.

Program Owner approval remains required for external communication where gated, spend, contract, credentials, Production, Public and G5.

## Current execution state

PSA and HobbyKorea follow-up content remains draft-only and must not be sent until a new explicit communication approval is recorded. The policy and templates are internal preparation, not external authority.
