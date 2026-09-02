# TRACK Z Money-to-Usable-Data Gate v1

**Authority:** Program Owner / KPMO

**Status:** MANDATORY / FAIL-CLOSED

**Effective date:** 2026-09-02

**Scope:** every external data provider, subscription, membership, API, feed, export, trial, pilot and commercial data licence evaluated for Intelligence Holdings or its brands.

## 1. Governing decision

Paying a provider without a proven path to the data required by the approved product use case is a Track Z failure. Product names, API documentation, sales statements, consumer subscriptions and credential issuance are not evidence that KIDULTS can obtain and lawfully use the required data.

The PSA bounded Cert Verification evaluation is the control incident: paid access existed, but lawful known-cert input provenance was not closed before payment, so usable evaluation data could not be obtained as intended. The incident does not expand PSA rights or authorize additional spend. It establishes the group-wide prevention rule below.

## 2. Mandatory evidence chain

Every provider decision must record all six links:

| Link | Evidence required before payment |
|---|---|
| `PAYMENT` | Exact fee, billing trigger, auto-conversion, renewal, cancellation deadline, refund position and total bounded exposure |
| `ACCESS` | Exact licensed product, endpoint/export path, credential prerequisites, rate/volume limits and activation owner |
| `INPUT` | Lawful, non-enumerated source of every lookup key or seed identifier, including who supplies it and its provenance record |
| `DATA` | Schema-matching sample or provider-supplied sample payload proving required record-level fields, semantics, coverage and corrections |
| `RIGHTS` | Written field-by-purpose permission for collection, storage, retention, normalization, matching, human QA, derived artifacts, display, attribution, deletion and termination |
| `PRODUCT` | Named product decision, measurable success/stop criteria, end-to-end adapter path and evidence that the data supports the intended claim |

If any link is missing, ambiguous, provider-claimed but unverified, or dependent on post-payment discovery, the only permitted state is `NO_PAY_HOLD`.

## 3. Required order

```text
written product and rights review
  -> schema-matching sample
  -> lawful input-source closure
  -> one-record end-to-end proof
  -> five-record canary
  -> 30-120-record bounded pilot
  -> spend approval
  -> contract and credential activation
```

A provider that prohibits a live pre-contract canary may satisfy the pre-payment technical step only with a schema-matching provider sample and an internally validated dry-run adapter. That exception does not waive `INPUT`, `RIGHTS`, `PAYMENT` or `PRODUCT` evidence.

## 4. Prohibited shortcuts

- Paying because an API or membership exists without proving the required data path.
- Treating consumer membership pricing as an API or data licence.
- Paying while lawful lookup identifiers or source provenance remain unavailable.
- Starting a paid or auto-converting trial before cancellation control and lawful test inputs are ready.
- Accepting annual prepayment before a successful bounded pilot.
- Deferring material schema, field semantics, rights or exit terms until after payment.
- Treating an HTTP success, token issuance or one schema probe as usable-data validation.
- Accepting raw data when KIDULTS lacks the required internal-processing, retention or derived-output rights.
- Allowing a provider identifier to replace an IH-owned canonical identifier.

## 5. Provider decision record

Before requesting spend authority, Track Z must publish an evidence-bound record containing:

- provider, licensed product and brand/vertical;
- exact required fields and claim classes;
- the six-link chain with evidence references and observation dates;
- sample digest and adapter/dry-run result;
- lawful input-source owner and provenance receipt;
- price, maximum exposure, billing/renewal/cancellation controls;
- rights, retention, deletion, derived-output and termination result;
- success, stop, rollback and provider-replacement criteria;
- decision: `NO_PAY_HOLD`, `READY_FOR_SPEND_REVIEW`, `BOUNDED_ACTIVE`, `REPLACE`, or `DROP`.

Only the Program Owner may approve spend, contract execution, expanded credentials, Public, Production or G5. `READY_FOR_SPEND_REVIEW` is not spend approval.

## 6. Standing application

- **PSA:** no additional spend; close lawful known-cert provenance inside the previously approved bounded private scope.
- **CLASSIC.COM:** no payment before Sales History + Taxonomy samples and a complete Schedule pass this gate.
- **GemRate:** do not start the one-week auto-converting trial until lawful inputs, cancellation control and the full evidence chain are ready.
- **CGC/CCG:** do not pay a dealer membership until actual fields, storage/derived rights, references and end-to-end access are evidenced.
- **All others:** default `NO_PAY_HOLD` until the complete chain passes.

## 7. Reporting

Every Track Z report must show `PAYMENT -> ACCESS -> INPUT -> DATA -> RIGHTS -> PRODUCT` for each provider. Unknown is not pass. Provider claims must be distinguished from independently verified evidence, and material changes must be truth-synced before a completion claim.
