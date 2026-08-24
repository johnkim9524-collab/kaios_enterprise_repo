# KIDULTS ASI State Department Camera Evidence v1

## Outcome

This lane admits one exact-projection-bound **Auction Result Reference** for a camera lot observed on the official U.S. Department of State Online Auction service. It is a bounded public-facts fallback, not one of the registered Top 16 market sources. `EXACT_PROJECTION_REFERENCE_VALIDATOR_ACTIVE` does not mean that a generalized live adapter or an immutable raw-source capture is active.

The source page reported one Doha auction lot referencing Nikon D5600 and Nikon D90 cameras, a closure timestamp, `Sold for`, 101 bids, and a terminal display amount of QAR 2,110. The event quantity is one lot; the separately recorded camera count is two. KIDULTS stores only a normalized factual projection. Raw HTML, photos, graphics, bidder identity, account data, payment data and bid history are excluded.

## Exact result

| Output | Count |
|---|---:|
| Bounded primary-source fact projections validated | 1 |
| Exact-projection reference validators active | 1 |
| Generalized fallback live adapters activated | 0 |
| Auction Result Reference Evidence admitted | 1 |
| Market Event references created | 1 |
| Generic market events admitted | 0 |
| Verified Sold Event | 0 |
| Confirmed hammer or all-in realized price | 0 |
| Current price | 0 |
| Liquidity / time-to-sale | 0 |
| Top 16 adapters activated | 0 |
| Top 16 Evidence admitted | 0 |
| Signal eligible / Index eligible | 0 / 0 |
| Immutable raw-source snapshot verified | 0 |
| Source-updated timestamp verified | 0 |
| Snapshot Candidate / Track B input | 0 / 0 |

The explicit claim ceiling is **Verified Sold Event = 0**.

## Semantic boundary

The official page displays both `Sold for` and a field labelled `Current price`. The amount is therefore preserved as a terminal **BID** display in an `AUCTION_RESULT_REFERENCE`. It is not promoted to a confirmed hammer price, settled transaction, all-in realized price, current price, representative collector-market value or liquidity measure.

This lot is crosswalked to current scope `cameras_lenses`, legacy scope `scope-cameras-lenses`, and domain `technology_cameras`. Qatar and `AUCTION_RESULT_REFERENCE` are outside the current 192-mission region/evidence-class grain, so `current_192_mission_id = null`; the reference does not close any current Top-16 mission. One government-surplus lot does not establish collectible status, comparable-market fit, regional or global representativeness, valuation, demand or liquidity.

The historical 2024 event was observed in 2026. No source update timestamp is claimed and freshness is `NOT_VERIFIED`. The schema-required lineage `raw_digest` carries the normalized projection digest only; the ledger labels it `NORMALIZED_SOURCE_PROJECTION_DIGEST_NOT_RAW_SOURCE_PAYLOAD`. The shared generic market router rejects `AUCTION_RESULT_REFERENCE`, revalidates inner events even when a wrapper falsely says `admitted: true`, and regression checks prove that this reference contributes zero generic events and zero signals.

## Rights and provenance

The field-purpose policy preflight allows collection, bounded storage and internal transformation of the normalized factual fields based on official State Department public-domain information notices. It does not assert a legal conclusion or substitute independent legal review. The exact allowlisted notices and observation references are checked, and the scheduled workflow fails closed after `review_due_at`. Display, redistribution, sale and all protected release gates remain HOLD.

Source owner and factual origin are both bound to the U.S. Department of State through the official `online-auction.state.gov` host. The deterministic input is the normalized fact projection digest, not an immutable raw source payload and not republished raw HTML.

## Automatic verification

The workflow executes on pull requests, protected-main changes, a four-hour schedule, upstream workflow completion and manual recovery dispatch. It runs TypeScript checks, deterministic adapter replay, twenty-three fail-closed adapter mutations, double-build comparison, JSON Schema validation, reference-only admission validation, false-promotion mutations, protected-gate assertions and JSON Schema plus AI-governance status-receipt checks. Exact input field sets, capture agent, official-lot identity, displayed claim facts, observation time and the bounded rights-review interval are independently enforced even if a projection digest and contract digest are changed together.

## Remaining blocker

The first collector-market `VERIFIED_SOLD_EVENT` still requires explicit hammer or all-in realized semantics from a rights-cleared source. Alternatively, one of the current Top 16 sources must pass purpose-specific rights, immutable live schema, owner/origin, semantic and activation gates.

**Public / Production / G5 = HOLD.**
