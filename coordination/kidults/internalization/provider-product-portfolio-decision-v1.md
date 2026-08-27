# Track Z Provider Product Portfolio Decision v1

- **Status:** VALIDATED / INTERNAL CONTROL ACTIVE
- **Authority:** Track Z -> KPMO -> Founder
- **Source decisions:** `e73a723f`, `fee5a7db`
- **External execution:** HOLD
- **Production / G5:** HOLD / EXPLICIT APPROVAL REQUIRED

## Decision

Provider-level `HOLD` remains the non-bypass boundary for access, contract, spend, credentials, data acquisition, adapter admission, and production. Product-level decisions narrow that baseline:

- `CONDITIONAL_HOLD`: the option remains inactive until every evidence gate passes.
- `PENDING_PROVIDER_RESPONSE`: the option remains inactive and non-terminal until an official provider response and the required decision evidence exist.
- `DROP`: a terminal product disposition that is prohibited before an official provider response, a new Track Z decision packet, KPMO review, and Founder approval.
- Product decisions can narrow the provider baseline but can never relax it.

| Priority | Provider / product | Product role | Confirmed economics | Portfolio decision |
| --- | --- | --- | --- | --- |
| 1 | GemRate Developer Tier | Grading, population, and cross-grader enrichment helper | USD 200/month; USD 2,400/year; 7-day trial | CONDITIONAL_HOLD |
| 2 | PSA Premium API | Low-cost certification and grade verification helper | USD 199/year; 100 calls/day | CONDITIONAL_HOLD |
| 2 | PSA Enterprise API | Higher-quota certification helper | USD 3,500/year; 500 calls/day | PENDING_PROVIDER_RESPONSE |
| 3 | Classic.com Licensed Bundle 3 | Primary collector-car Current SOLD candidate | Custom quote; unresolved | CONDITIONAL_HOLD |
| 4 | CGC Dealer Portal API | Unverified certification/grading candidate | Unknown | PENDING_PROVIDER_RESPONSE |
| 5 | ALT/FNDATA | High technical fit; provider rejected KIDULTS as competitor | N/A | DROP — COMPETITOR_CONFLICT |
| 6 | LiveArt Pilot | Potential art-auction data candidate | Unknown | PENDING_PROVIDER_RESPONSE |
| 7 | Hagerty | Unspecified collector-car candidate | Unknown | PENDING_PROVIDER_RESPONSE |

## ALT/FNDATA terminal disposition — 2026-08-26

ALT/FNDATA rejected the bounded evaluation/licensing path because it viewed KIDULTS' ingestion, normalization, calibration, customer-facing derived intelligence and derived-result retention as competitive use. The current state is `NO_GO`; it is excluded from procurement, integration, fallback, redundancy and PoC counts. Public materials may be used only for lawful competitor benchmarking.

The replacement is not another single cross-category backbone. KIDULTS will use a category-specific independent Source Mesh while retaining canonical identity, entity resolution, normalization, derived intelligence, rights/lineage and provider-switch memory inside the Core.

## Current SOLD Transaction Feed conclusion

The count of products that are both complete and immediately purchasable for the KIDULTS `Current SOLD Transaction Feed` is **zero**.

GemRate Developer Tier and PSA Premium API are helper products. Grading certification, population data, cross-grader mapping, price guides, listing ask prices, and model estimates cannot satisfy a realized transaction feed.

Classic.com Licensed Bundle 3 has the highest vertical fit, but it remains inactive until the following are resolved in official evidence:

1. Product proposal, field schema, and sample payload.
2. SOLD/unsold separation and realized-price semantics.
3. Coverage, historical depth, and freshness.
4. Source access, permitted purpose, retention, derivative-output, publication/export, and model-use rights.
5. Termination, deletion, and portability obligations.
6. Quote, total cost, quota, latency, and SLA.
7. KPMO review and Founder approval.

Until those gates pass, the fail-closed output is:

`UNAVAILABLE_NO_RIGHTS_CLEAR_CURRENT_SOLD_FEED`

## Provider-response-first terminal disposition rule

A product cannot become `DROP` or `REJECTED` unless all of the following are present:

1. An immutable official provider response or response-evidence reference.
2. The response resolves enough of product, schema, price, quota, rights, or availability to support a terminal decision.
3. A new Track Z decision packet.
4. KPMO review.
5. Founder approval of the terminal disposition.

No response, an unknown field, silence, an unverified public-product inference, or internal cost analysis alone cannot produce a terminal disposition. Pending cases remain fail-closed and inactive.

## Internal continuation lanes

1. **Classic Bundle 3 diligence gate:** maintain the unresolved schema, cost, and rights checklist without contacting, buying, credentialing, or acquiring data.
2. **New Current SOLD feed discovery:** admit only identifiable official products with evidence sufficient for the full admission contract.
3. **Grader-helper separation:** keep GemRate and PSA outputs outside transaction-feed completeness, Current SOLD KPIs, and market-price claims.
4. **Regression enforcement:** validate all product decisions, zero-feed status, provider-response-first terminal disposition, and non-bypass boundaries in the internalization foundation suite.

## Non-bypass boundaries

External contact, contract, spend, credentials, data acquisition, adapter development, and production remain `HOLD`. G5 requires explicit approval.
