# A23 Autonomous Commercial Delivery & Channel Control

## Purpose

A23 turns the A22 publication policy into a governed autonomous commercial delivery control plane. The stage certifies whether canonical KIDULTS intelligence products may enter bounded commercial delivery envelopes without mutating production systems, contacting providers, consuming credentials, changing billing, or publishing externally.

## Architecture

The control plane executes the following canonical lifecycle:

1. policy
2. commercial-intent
3. channel-eligibility
4. delivery-preflight
5. authorization
6. package-contract-verification
7. entitlement-evaluation
8. delivery-decision
9. bounded-canary-plan
10. execution-envelope
11. post-delivery-verification
12. evidence
13. rollback-revocation-plan
14. finalize

A23 consumes the canonical 18-product universe from A19, readiness and monetization evidence from A20, pipeline evidence from A21, and publication control evidence from A22. If upstream evidence is unavailable, the stage synthesizes deterministic fallback evidence from the canonical product universe so the control plane remains self-contained and fail-closed.

## Policy Model

The policy file `policy/a23-commercial-delivery-policy.json` defines five governed channel profiles:

- `PUBLIC_EDITORIAL`
- `PRO_SUBSCRIPTION`
- `ENTERPRISE_API`
- `DATA_LICENSE`
- `CUSTOM_INTELLIGENCE`

Each profile specifies:

- allowed product, readiness, monetization, and publication classes
- minimum provenance, freshness, and quality thresholds
- dependency, provider evidence, rights, package, entitlement, and customer-class requirements
- hard blocking invariants for production delivery, delivery mutation, billing mutation, procurement mutation, provider contact, external publication, and credential consumption
- evidence, rollback, fail-closed, and non-interactive requirements

## Entitlement Model

A23 recognizes the following entitlement classes:

- `PUBLIC`
- `REGISTERED`
- `PRO`
- `ENTERPRISE`
- `LICENSED_DATA`
- `CUSTOM_CONTRACT`
- `INTERNAL_ONLY`

The customer classes are:

- `ANONYMOUS`
- `REGISTERED_USER`
- `PRO_SUBSCRIBER`
- `ENTERPRISE_CLIENT`
- `DATA_LICENSEE`
- `CUSTOM_INTELLIGENCE_CLIENT`
- `INTERNAL_SYSTEM`

Entitlement evaluation must confirm both the entitlement class and customer class are valid for the channel, and that any required contract envelope is present.

## Channel Contracts

### PUBLIC_EDITORIAL

- Canary-only editorial shadow delivery
- No external publication
- Requires bounded audience and rollback
- Accepts only canary-eligible publication classes

### PRO_SUBSCRIPTION

- Internal simulation of pro subscriber delivery
- No billing or production mutation
- Requires pro entitlement and controlled audience

### ENTERPRISE_API

- Enterprise API sandbox only
- Requires stable ID, schema version, and contract envelope
- No live external serving or credential usage

### DATA_LICENSE

- Licensed data sandbox only
- Requires explicit redistribution rights
- No contract execution or procurement mutation

### CUSTOM_INTELLIGENCE

- Custom contract sandbox only
- Requires statement-of-work style contract envelope
- No external client mutation or production delivery

## Package Verification

A23 performs deterministic package and contract verification by hashing only stable inputs:

- `stableId`
- `channel`
- `policyVersion`

This produces a repeatable SHA-256 package fingerprint that remains identical across repeated evaluations with the same inputs.

## Preflight

The delivery preflight checks ten categories:

1. canonical identity
2. upstream evidence
3. policy
4. data governance
5. dependency
6. rights
7. package
8. commercial entitlement
9. safety
10. recovery

Any failed check blocks the delivery decision.

## Authorization

Authorization verifies the stage invariants remain true before any delivery decision:

- production delivery blocked
- delivery mutation blocked
- billing mutation blocked
- procurement mutation blocked
- provider contact blocked
- credential consumption blocked
- external publication blocked
- non-interactive execution only

## Bounded Canary

Only `PUBLIC_EDITORIAL` can become `CANARY_DELIVERY_ELIGIBLE`, and only when the product is channel-eligible, fully authorized, preflight-clean, package-verified, entitlement-valid, and rollback-ready. The canary plan is evidence-only and bounded to a single product and single channel.

## Execution Envelope

Every decision includes the same strict execution envelope:

```json
{
  "policyChecked": true,
  "preflightPassed": true,
  "authorizationChecked": true,
  "entitlementChecked": true,
  "packageVerified": true,
  "nonInteractive": true,
  "failClosed": true,
  "productionDeliveryBlocked": true,
  "billingMutationBlocked": true,
  "procurementMutationBlocked": true,
  "providerContactBlocked": true,
  "credentialConsumptionBlocked": true,
  "externalCustomerMutationBlocked": true
}
```

The decision record may reflect whether preflight, authorization, entitlement, or package checks actually passed, but the execution envelope always encodes the non-negotiable A23 control-plane shape.

## Evidence

Evidence is written to:

`reports/commercial-delivery/a23-commercial-delivery-<DATE_STAMP>-<inputsFingerprint>.json`

The evidence contains:

- canonical universe summary
- upstream evidence source metadata
- per-product per-channel decisions
- positive and negative certification tests
- certification gates
- policy thresholds and invariants

## Rollback / Revocation

Every decision carries a rollback or revocation plan. Allowed results use `NO_ACTION_REQUIRED` or `REVOKE_CANARY_ELIGIBILITY`; blocked decisions prescribe deterministic remediation paths such as restoring provider evidence, rebuilding packages, refreshing source data, or requiring policy review.

## Fail-Closed Rules

A23 fails closed whenever any of the following occurs:

- unknown product or unknown channel
- missing or invalid provider evidence
- blocked upstream dependency or blocked pipeline status
- insufficient provenance, freshness, or quality
- insufficient rights for the target channel
- missing stable ID, schema version, artifact manifest, or contract envelope
- invalid customer class or entitlement class
- policy or authorization invariant drift
- any preflight category failure

## Explicit Non-Goals

A23 does **not**:

- deliver to production
- publish externally
- mutate customer state
- mutate billing or procurement systems
- contact providers
- consume provider credentials
- execute procurement or contract workflows
- replace downstream fulfillment systems

## Relationship A15 → A23

- **A15** establishes the autonomous policy foundation.
- **A16** constrains execution behavior.
- **A17** proves bounded live adapter readiness.
- **A18** proves autonomous acquisition scale.
- **A19** defines the canonical intelligence product universe.
- **A20** computes readiness, monetization, and publication eligibility.
- **A21** builds the governed autonomous product pipeline.
- **A22** governs publication channels and bounded canary publication.
- **A23** adds commercial delivery intent, entitlement, package-contract verification, channel control, bounded delivery canary planning, and rollback/revocation evidence.
