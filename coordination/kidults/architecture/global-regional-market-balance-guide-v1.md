# KIDULTS Global Regional Market Balance Guide v1

Status: PROPOSED CANONICAL ASI GUIDE  
Parent: #643 / #549 / #488 / #480  
Production/Public: HOLD

## 1. Purpose
KIDULTS must measure the global collectibles market rather than the easiest-to-access market. U.S. data abundance, English-language discoverability, large marketplace APIs and mature auction infrastructure create a structural risk: collection volume can silently become analytical truth. This guide prevents that failure mode.

The operating principle is:

**Collect broadly according to regional information need; analyze according to evidence-backed market representativeness. Never substitute collection volume for market weight.**

The machine-readable authority is `coordination/kidults/source-intelligence/asi-global-regional-market-balance-policy-v1.json`.

## 2. Geography becomes an active control dimension
Every market-facing ASI cell is defined as:

`CATEGORY_SCOPE × MACROREGION × EVIDENCE_CLASS × SOURCE_ROLE`

Every admitted source/event must retain at least macroregion, country, local venue/market, language, currency, source role, evidence class, rights state, provenance, freshness and source-owner identity.

A source that cannot support the required geographic semantics does not become global evidence simply because it has high volume.

## 3. Two different weights are mandatory
### Collection Share
Controls how much acquisition capacity ASI allocates to a region. It is designed to close evidence gaps, maintain regional floors and prevent source-rich regions from monopolizing the queue.

### Analytical Weight
Controls how much a region contributes to a cross-region metric, signal or index. It is based on evidence-backed market scale, maturity, activity, evidence quality, freshness and source independence.

`COLLECTION_SHARE != ANALYTICAL_WEIGHT`

A region may receive a high collection share because its evidence is weak or under-covered, while still receiving a lower analytical weight until the evidence matures. Conversely, a mature market may have strong analytical importance but require less incremental collection once coverage is healthy.

## 4. Regional taxonomy
The first policy uses eight operating macroregions: North America, Europe, Japan, Korea, Greater China, Southeast Asia, Oceania and LATAM/MEA. Country-level controls remain active inside each macroregion.

The initial percentages in the machine policy are **structural bootstrap targets only**. They are not claims about actual regional market share. Their job is to stop the initial system from collapsing into U.S.-dominant acquisition before evidence-backed regional market-scale estimates exist.

## 5. Dynamic collection allocation
The Acquisition Planner calculates regional priority from six evidence-backed factors:

- market scale;
- market maturity;
- observed transaction activity;
- signal lead value;
- evidence quality;
- strategic coverage gap.

The resulting score is blended with the structural bootstrap target, then constrained by portfolio floors and concentration caps. Raw record count is never a factor.

The planner rebalances monthly or when a material source/market change occurs. Source loss, rights changes, schema failure, regional activity shifts and new high-value local authorities may trigger earlier rebalancing.

## 6. Coverage debt
ASI must treat under-representation as an explicit debt rather than silently accepting it.

`Regional Coverage Debt = max(0, target collection share - rights-admitted effective collection share)`

High coverage debt increases discovery and acquisition priority. It does not increase analytical weight by itself.

Coverage debt must be tracked by category, region, evidence class and source role. Example: Japan may have good catalog-reference coverage but poor SOLD_TRANSACTION coverage; those are different debts.

## 7. Anti-concentration controls
The policy enforces default ceilings unless an explicitly governed exception exists:

- no macroregion above 35% of acquisition without an exception;
- no single country above 30% without an exception;
- no single source owner above 50% within a region without an exception;
- global analytical contribution from one macroregion is capped at 45%;
- global analytical contribution from one country is capped at 35%.

Exceptions require a recorded reason, evidence that concentration reflects genuine market structure or a temporary gap-closure operation, and a review/expiry date.

## 8. Bias dashboard required from ASI
The Coverage and Bias Engine must publish internal evidence for:

- regional collection share;
- regional analytical weight;
- regional coverage debt;
- regional and country HHI;
- source-owner HHI by region;
- language coverage;
- currency coverage;
- local venue diversity;
- time-zone observation coverage;
- source-removal sensitivity by region.

A large record count with poor owner/venue/geography diversity is not high-quality coverage.

## 9. Global Claim Gate
A signal is not allowed to use `GLOBAL` semantics merely because it combines several countries.

At minimum a global claim requires five macroregions, three mature/specialist regions, two growth/emerging regions, at least 75% evidence-backed weighted market coverage, three independent source owners, complete rights/provenance, and no unresolved critical regional-bias finding. Price claims additionally require at least three currencies/local-market representations and cross-region comparability controls.

If the gate fails, the output must be `NOT_VERIFIED_GLOBAL` or explicitly regional/multi-region. The Portal, EOS and reports must not upgrade wording downstream.

## 10. Price and transaction comparability
FX conversion is necessary but insufficient. Cross-region price analysis must preserve or normalize, where evidence exists:

- transaction date/time;
- local currency and FX timestamp;
- taxes and buyer/seller fees;
- shipping/import effects when material;
- condition/grade;
- edition/variant;
- venue type;
- transaction versus listing semantics.

Missing comparability dimensions lower confidence or block the claim. Missing never becomes zero.

## 11. Category-specific regional behavior
One platform-wide regional weight is not enough. Watches, sneakers, trading cards, cars, toys, design objects and music media can have materially different regional structures.

ASI therefore maintains category × region factor scorecards. A region can be highly important for one category and secondary for another. Category-specific overrides are allowed only when evidence-backed and versioned.

## 12. ASI engine responsibilities
- `SOURCE_DISCOVERY_ENGINE`: prioritize local sources that reduce regional coverage debt.
- `SOURCE_CLASSIFICATION_ENGINE`: bind region/country/language/currency/owner/source role.
- `UTILITY_AND_VALUE_SCORING_ENGINE`: score incremental regional information value, not volume.
- `COVERAGE_AND_BIAS_ENGINE`: calculate allocation, analytical weight, debt and concentration.
- `INDEPENDENCE_AND_REDUNDANCY_ENGINE`: measure source-owner and venue concentration within each region.
- `FRESHNESS_AND_STABILITY_ENGINE`: model region-specific lags and continuity.
- `COST_AND_ROI_ENGINE`: optimize cost per incremental representative signal, not cost per record.
- `ACQUISITION_PLANNER`: generate rights-aware dynamic quotas under floors/caps.
- `SOURCE_POOL_EVOLUTION_ENGINE`: replace or promote sources based on regional gap reduction.
- downstream Market Graph and Index engines: preserve geographic context and refuse global weighting until the claim gate passes.

## 13. Execution order
1. Tag the existing source universe with the required geographic dimensions.
2. Build category × macroregion factor scorecards with `UNKNOWN`, never synthetic zero, where evidence is absent.
3. Compute bootstrap collection quotas and coverage debt.
4. Prioritize high-value regional gaps, especially SOLD_TRANSACTION and local-market signals.
5. Measure source-owner/venue/language/currency concentration.
6. Rebalance as evidence-backed market-scale estimates improve.
7. Apply the Global Claim Gate before any cross-region market signal or index is promoted.

## 14. Non-negotiable boundaries
This policy does not assert current regional collectibles-market shares, authorize new provider contracts, relax rights review, authorize public publication, or authorize Production/G5. It is a governance and execution contract for globally representative ASI behavior.
