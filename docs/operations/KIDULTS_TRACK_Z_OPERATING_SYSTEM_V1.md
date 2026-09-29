# KIDULTS Track Z Operating System v1

## Outcome

Track Z is the mandatory external-provider and data-rights control lane for Intelligence Holdings and KIDULTS. It turns provider research, public-source observations, written replies and commercial proposals into one auditable decision flow:

`Track Z review → KPMO integrated report → Founder decision`

Track Z may prepare analysis and a bounded recommendation. It cannot send an external message, accept terms, spend money, activate credentials, acquire external data, activate a provider, or promote Production/Public/G5 without the separate exact authority required for that action.

## Scope

Every new provider, provider product, inbound reply, terms or licence change, API/feed offer, pilot, credential request, acquisition request, activation, renewal or material data change opens or updates an exact Track Z case. A case is bound to provider, product/surface, purpose, environment and evidence generation. Evidence from another purpose, product or snapshot cannot widen it.

## Review sequence

1. Resolve provider, operator, ultimate parent, aliases, product/surface, purpose and environment.
2. Check the provider registry and communication evidence before any draft; duplicate outreach and automatic follow-up are prohibited.
3. Separate facts, provider claims, inference and recommendation.
4. Resolve purpose-specific rights for access, collection, storage, normalization, entity resolution, derivation, model use, display, redistribution, retention, deletion, post-termination survival, portability and correction feeds.
5. Verify identifiers, terminal/SOLD semantics, price and fee composition, currency, exact time, correction/rescission path, coverage, quota, latency, SLA and schema-change notice.
6. Test owned-core protection, lock-in, provider-off continuity and replacement paths.
7. Resolve price, minimums, overages, renewal, cancellation, exit cost, ROI and group reuse.
8. Assign `WAIT`, `HOLD`, `NO_GO`, `INTERNALIZE_FIRST`, or `PASS_FOR_BOUNDED_PILOT_REVIEW`.
9. Route an evidence-complete packet to KPMO for whole-value-chain and cross-track review.
10. Route protected actions to Founder decision. A Track Z or KPMO receipt never grants that authority.

## Decision meaning

| State | Meaning |
|---|---|
| `WAIT` | Closed without an authorized reopen, or a written response is pending. No duplicate outreach. |
| `HOLD` | A material right, evidence, schema, SLA, economics, removal or authority gate is incomplete or stale. |
| `NO_GO` | The required use is prohibited, provider-owned dependency captures the KIDULTS core, or a terminal written rejection applies. |
| `INTERNALIZE_FIRST` | Provider removal would require product rewrite; build the owned abstraction or capability first. |
| `PASS_FOR_BOUNDED_PILOT_REVIEW` | All analytical gates pass. This is still a recommendation, not contact, contract, spend, credential, acquisition, activation or release authority. |

## Queues and backpressure

- `WAITING_WRITTEN_RESPONSE`: maximum 12; review aging every 7 days without automatic follow-up.
- `INTERNAL_DILIGENCE`: maximum 6; complete missing rights, schema, economics and removal evidence.
- `KPMO_INTEGRATION`: maximum 3; validate whole-value-chain effects and authority boundaries.
- `FOUNDER_DECISION`: maximum 3; present exact bounded choices and protected actions.
- `TERMINAL_ARCHIVE`: reopen only after a material written change and a new evidence generation.

Queue overflow is evidence of backpressure; it does not create authority or allow bypass. Each provider is evaluated independently so one provider failure cannot erase other case outcomes.

A malformed provider case is isolated as `VERIFIED_HOLD_CASE_ERRORS`; healthy cases are still evaluated, but no protected action is authorized. A WIP overflow is `VERIFIED_HOLD_BACKPRESSURE`. Evidence dated after the observation time is held as out-of-order and cannot overwrite the current generation.

## Execution

Run the current canonical provider state through the control cycle:

```bash
node scripts/kidults/track-z/run-track-z-control-cycle-v1.mjs \
  --output /tmp/kidults-track-z-control-cycle-v1.json
```

Run regression and negative tests:

```bash
node --test tests/kidults/track-z/track-z-control-cycle-v1.test.mjs
node scripts/kidults/internalization/validate-internalization-foundation-v1.mjs
```

The dedicated workflow runs for relevant pull requests, protected-main changes, every six hours, and manual recovery. It has read-only repository permission and uploads a 90-day receipt. It performs no provider contact or external mutation.

## Rollback

Rollback is one Track Z policy/case generation or the implementing commit. Existing provider evidence and communication history remain immutable references. Rollback cannot revive an expired right, authorize a resend, widen a claim, or create Production truth.

## Protected boundary

External communication, contract/EULA, spend, credentials/accounts, external-data acquisition, provider activation, Production, Public and G5 remain `HOLD` until separately authorized. Written email is the only admissible negotiation channel; material verbal terms are non-admissible.
