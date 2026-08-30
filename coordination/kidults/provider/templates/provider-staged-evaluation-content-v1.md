# KIDULTS Provider Staged-Evaluation Content Template v1

**Status:** Internal draft template / no external send authority  
**Owner:** TRACK Z  
**Control:** KPMO  
**Canonical policy:** `coordination/kidults/governance/provider-evidence-zero-defect-sample-policy-v1.json`  
**Negotiation contract:** `coordination/kidults/provider/provider-sample-governance-negotiation-v1.json`

## 1. Internal brief required before writing

Complete these fields before any provider-facing content is drafted:

| Field | Required content |
|---|---|
| Provider / capability | Exact company, product, endpoint and target vertical |
| Customer decision | The decision the data will improve |
| Current evidence gap | What owned/open evidence cannot supply |
| Requested stage | Discovery, Canary 5, Pilot 30–120, Qualification option to 459, or later option |
| Claim ceiling | What KIDULTS may and may not claim after the stage |
| Rights schedule | Query, temporary store, transform, QA, derivatives, retention, deletion, territory and product scope |
| Required fields | Stable IDs, timestamps, provenance, corrections and capability-specific fields |
| Commercial ceiling | Approved spend, term, quota and cancellation boundary |
| Stop criteria | Rights, schema, quality, economics and dependency walk-away triggers |
| Alternative source | At least one fallback or owned-data path |
| Communication evidence | Prior threads, sent messages and duplicate-outreach check |

No message may be sent when any required field is `UNKNOWN` unless the message itself is a narrowly scoped rights or capability clarification and Program Owner communication authority exists.

## 2. Provider-facing first-contact template

**Subject:** Staged private evaluation of [CAPABILITY] for [PRODUCT / VERTICAL]

Dear [NAME / TEAM],

We are evaluating [PROVIDER PRODUCT / ENDPOINT] for a private, non-production intelligence workflow supporting [NAMED USE CASE]. We would like to determine whether your service can support a staged evaluation without committing either party to production deployment or a long-term volume minimum.

Our proposed initial sequence is:

1. a five-record live canary to confirm authentication, schema and boundary behavior; and
2. if successful, a bounded private functional pilot of approximately [30–120] unique, lawfully usable records.

The pilot quantity is an evaluation band, not a production forecast, purchase minimum or public-release commitment. Any later expansion would be separately evaluated and approved after rights, schema, quality and product-value gates pass.

Please confirm whether the following uses are permitted and under what terms:

- query or collect the identified records;
- store returned fields temporarily in a private encrypted environment;
- normalize, transform and perform entity resolution;
- allow internal reviewers to inspect the records and derived matches;
- retain non-reconstructive derived analytics after raw-data deletion;
- delete raw records within [RETENTION PERIOD] and retain a deletion receipt;
- use the service in [TERRITORY / PRODUCT / AFFILIATE SCOPE].

We are not requesting permission to publicly display or redistribute raw provider data unless that is separately and expressly agreed.

For technical evaluation, please provide or confirm:

- stable record identifiers and schema/version documentation;
- field definitions, nullability, timestamps and correction semantics;
- provenance or source-origin metadata;
- rate limits, retry, pagination and quota behavior;
- sandbox or evaluation access;
- pricing for a small canary, a 30–120 record pilot, and an optional expansion band up to approximately 459 unique records;
- cancellation, correction-credit and schema-change terms.

If the initial evaluation succeeds, we may discuss higher-volume options under a separate approval and commercial process. No exclusivity, annual prepayment or production commitment is implied by this inquiry.

Because English is not my first language and rights and commercial terms require precision, I prefer to continue the discussion in writing by email.

Kind regards,

Yun Goo Kim  
KIDULTS / Intelligence Holdings project

## 3. Rights clarification follow-up

Use this only when the provider has answered generally but not by purpose.

> Thank you for your response. To avoid misunderstanding, could you please answer each item below as `YES`, `NO`, or `CONDITIONAL`, with any applicable limits: private query/collection; temporary encrypted storage; internal transformation/entity resolution; internal human QA; non-reconstructive derived analytics; raw-data retention period; deletion requirement; product/affiliate/territory scope; raw public display; raw redistribution; and post-termination survival of derived outputs. A technical key or membership entitlement will not be treated as permission unless the intended use is covered in writing.

## 4. Pricing and capacity follow-up

Use only after rights and schema are sufficiently clear.

> We would prefer staged, cancellable pricing rather than a fixed enterprise commitment. Please quote separately for: 1–5 canary records/calls; 6–120 bounded-pilot records/calls; 121–459 qualification capacity; and optional higher bands. The higher bands are capacity options only and do not represent committed purchase volumes. Please also confirm overage pricing, quota reset, invalid/duplicate-record credits, correction support, schema-change notice and termination/export terms.

## 5. Capability-specific inserts

### Grading / authentication providers

Add:

- exact certification or report lookup rights;
- prohibition on guessed or enumerated identifiers;
- grade-scale version and correction/reholder semantics;
- population/census field or method, `as of` time and reuse rights;
- whether the provider can supply lawful test identifiers or an approved fixture.

### Current-SOLD providers

Add:

- terminal sold state and sale timestamp;
- realised price, currency and price-type semantics;
- hammer, buyer premium, taxes and fees;
- withdrawn, unsold, failed-sale and post-sale reversal distinctions;
- venue, lot, listing and physical-object identifiers;
- correction and republication behavior.

## 6. Prohibited content

Do not write or imply:

- “120 records are our launch minimum”;
- “120/120 proves reliability”;
- “the provider is connected to production” after a schema probe or pilot;
- a promise to purchase 459, 1,840 or 4,603 records;
- that a single provider proves market representativeness;
- that an API key, membership or technical access automatically grants reuse rights;
- exclusivity, annual prepayment, public display, redistribution or cross-brand use without express approval;
- that KIDULTS has approved spend, a contract, Production, Public or G5 when it has not.

## 7. Internal status language after provider response

| Evidence obtained | Permitted internal state |
|---|---|
| General marketing or verbal statement | `PROVIDER_CLAIM_UNVERIFIED` |
| Written capability answer but incomplete rights | `RIGHTS_CONDITIONAL_OR_HOLD` |
| Written purpose rights and schema, no live run | `READY_FOR_APPROVED_CANARY` |
| Canary 5 passed | `SCHEMA_BOUNDARY_SMOKE_PASS` |
| Pilot 30–120 passed | `BOUNDED_PRIVATE_FUNCTIONAL_PROOF` |
| Exact qualification evidence passed | `SOURCE_PIPELINE_QUALIFIED` |
| Product pipeline receipt passed | `PRODUCT_PIPELINE_ADMITTED_WITH_LIVE_RECEIPT` |

A message being drafted, sent or answered is never equivalent to provider activation, acquisition or product admission.

## 8. Current hold

PSA and HobbyKorea follow-up messages remain `DRAFT_ONLY_NO_SEND` until a new explicit Program Owner communication approval is recorded. This template does not itself authorize external contact.
