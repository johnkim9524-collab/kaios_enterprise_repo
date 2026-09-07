# Intelligence Holdings Group Global Provider Strategy v6

**Effective date:** 2026-08-29  
**Status:** Group sourcing baseline / decision framework  
**Scope:** Intelligence Holdings, KIDULTS, Artfund, Capitaltimes, Muchmoney, Humanpool, Autobit, Kompare

## 1. Executive decision

The group must not buy eight independent data stacks. Intelligence Holdings should own a shared provider control plane, while each vertical purchases only the evidence that creates measurable product value. A provider is replaceable infrastructure, not the product. Durable value must accumulate in group-owned identity, entity resolution, provenance, rights controls, evidence fusion, and derived intelligence.

The default posture is therefore:

1. use open authoritative sources before paid feeds;
2. purchase one bounded pilot only where open evidence cannot support the product decision;
3. contract centrally only after two products can reuse the source or the group can prove material cost avoidance;
4. keep vertical rights in explicit schedules rather than assuming a group licence permits every product;
5. add redundancy only when a source becomes revenue-critical.

No dormant vertical receives a paid enterprise feed. No provider is pursued merely to complete a provider list.

## 2. Group source architecture

| Layer | Purpose | Group posture | Examples |
|---|---|---|---|
| Open authority | Legal identity, standards, official facts, macro and reference data | Default foundation; preserve licence and version evidence | GLEIF, GS1, SEC EDGAR, ECB, World Bank, O*NET, ESCO, NHTSA vPIC |
| Shared enterprise utility | Cross-brand identity, compliance, translation, geospatial or reference enrichment | Buy once only when at least two active products reuse it | Entity enrichment, FX, sanctions, address and taxonomy services |
| Vertical authority | Domain-specific transactions, ownership, pricing, authentication or operational facts | Vertical schedule; bounded pilot; explicit display and derivative rights | Auction results, vehicle history, market data, employment data |
| First-party or consented | User, merchant, employer, financial or vehicle data provided under direct authority | Purpose-bound consent, minimisation, deletion and regional controls | Open banking, ATS feeds, merchant feeds, connected vehicle data |
| IH-derived intelligence | Canonical IDs, entity resolution, confidence, provenance graph, indices, scores and models | Group-owned, provider-neutral control plane | Evidence fusion, methodology, rights registry, switching adapters |

Intelligence Holdings owns the canonical identifiers (`ih_entity_id`, `ih_asset_id`, `ih_person_id`), source adapters, entity-resolution methods, evidence ledger, rights/retention registry, confidence logic and cross-vertical graph. Raw provider data remains isolated according to contract; public outputs must be non-reconstructive and expressly permitted.

## 3. Contracting and legal structure

The preferred structure is a group master data licence signed by the actual incorporated contracting entity, with product schedules for KIDULTS, Artfund, Capitaltimes, Muchmoney, Humanpool, Autobit and Kompare. Do not sign as “Intelligence Holdings” until that entity exists, has authority and can perform the agreement. Before formation, use the current legal entity and include assignment or novation rights to the future holding company.

Every provider agreement must address:

- named affiliates, future controlled affiliates and permitted contractors;
- internal use, product display, SaaS, API and model/analytics uses separately;
- territories, languages, users, environments and rate/volume bands;
- raw-data retention, deletion evidence, audit, termination and transition assistance;
- derived aggregates, scores and models that may survive deletion or termination;
- ownership of pre-existing and independently developed group methods;
- source substitution, portability, corrections, service levels and price-step protections;
- privacy roles, consent, international transfer, data-subject rights and security where personal data is involved;
- prohibition on silent onward transfer or cross-product use outside an approved schedule.

Legal review is a hard gate. A commercial discussion or technical API key does not create data rights.

## 4. Unit economics and tipping-point policy

### 4.1 Pre-tipping constraints

- Group-wide discovery/private-pilot budget: **USD 500–2,500 per month**.
- Maximum concurrent paid pilots: **three**.
- Provider cost ceiling: **10% of attributable monthly gross profit**.
- Target payback: **six months or less**.
- Default terms: monthly, cancellable, non-exclusive, usage-capped, no minimum annual prepayment.
- Enterprise contracts require a completed pilot, measured lift and an approved vertical schedule.

### 4.2 Tipping stages

| Stage | Evidence threshold | Commercial action |
|---|---|---|
| 0 — Discovery | Product value unproven | Open/official sources and sample evaluation only |
| 1 — Bounded pilot | Testable product hypothesis and lawful sample | One monthly/capped pilot; explicit success and stop criteria |
| 2 — Product evidence | Attributable gross profit is at least 10× monthly provider cost for two consecutive months | Negotiate volume tier and operational SLA; retain exit path |
| 3 — Group reuse | Two or more revenue products can lawfully reuse the source, or centralisation saves at least 25% of duplicate cost | Consider group master licence plus vertical schedules |
| 4 — Critical dependency | Provider supports at least 20% of revenue or a release-critical capability | Add fallback source, quarterly exit test, continuity and price protections |

Growth does not justify premature enterprise spend. It changes the optimum only when reuse, revenue concentration or operational criticality crosses a measured threshold.

## 5. Brand-specific sourcing strategy

### 5.1 Intelligence Holdings — group control plane

**Acquire:** authoritative entity/reference sources, group rights management, shared provenance and compliance utilities. Start with GLEIF, GS1 and official macro/FX data; evaluate commercial entity enrichment only when multiple products need the same match layer.

**Build:** canonical identity, relationship graph, rights registry, lineage, deletion orchestration, provider scorecards and source-switching adapters.

**Avoid:** buying a “universal” feed before two revenue products prove reuse, or allowing a provider identifier to become the group’s primary key.

### 5.2 KIDULTS — collectibles intelligence

**Priority evidence:** collectible identity, authentication, provenance, completed transactions and realised prices.

**Sourcing posture:** keep PSA Premium as a bounded authentication/reference source; PSA Enterprise is a current-ROI `DROP`, not a permanent ban, and reopens only at the Stage 2/3 threshold. GemRate is conditional enrichment and is not a SOLD source. eBay Marketplace Insights remains `CLOSED` unless eBay offers an authorised licensed path. ALT and FNDATA are competitor/reference intelligence, not ingestion providers. Continue lawful pilots or RFIs for category-specific SOLD evidence such as CLASSIC.COM, ARTDAI/Artnet and direct auction feeds.

**Build:** KIDULTS canonical collectible IDs, evidence fusion, confidence scoring, source neutrality and non-reconstructive public outputs.

### 5.3 Artfund — art, auction and provenance intelligence

**Priority evidence:** artist/work identity, auction result, estimate, currency/date semantics, provenance, condition and loss/theft risk.

**Sourcing posture:** run one same-sample comparison across ARTDAI, Artnet and a benchmark such as Artprice; pay for at most one pilot. Supplement with direct auction-house or licensed marketplace feeds and an appropriate loss-register/provenance source. Reuse art-auction adapters with KIDULTS where rights permit.

**Contract requirement:** distinguish hammer price, buyer’s premium, taxes, withdrawn/unsold lots, corrections and public-display rights. Reserve use by Artfund and any approved KIDULTS art vertical in separate schedules.

### 5.4 Capitaltimes — capital markets intelligence

**Priority evidence:** issuer/entity identity, filings, official macro, exchange reference/price data and licensed news.

**Sourcing posture:** begin with SEC EDGAR, GLEIF, issuer/exchange data, World Bank, ECB and FRED. At Stage 2, select one primary enterprise data vendor—such as LSEG, FactSet or S&P Global—against an identical instrument/use-case matrix. Add Nasdaq or other exchange feeds only for uncovered instruments or licensing needs. Terminal access never implies redistribution rights.

**Build:** security master overlays, issuer linkage, event lineage, derived analytics and reproducible methodology.

### 5.5 Muchmoney — consented financial intelligence

**Priority evidence:** consented account, transaction, affordability and cash-flow signals.

**Sourcing posture:** choose by launch region, not vendor prestige: Plaid for North America; Tink, TrueLayer or Yapily for relevant European/UK coverage; Yodlee only where its multi-region reach materially reduces fragmentation. Do not sign all aggregators. Use a coverage bake-off with the intended banks, consent flows, refresh rate, error taxonomy and unit economics.

**Hard gates:** confirm regulated role, lawful basis, consent UX, purpose limitation, retention, deletion, dispute handling and cross-border transfer before production ingestion.

### 5.6 Humanpool — labour and skills intelligence

**Priority evidence:** occupation/skill taxonomy, jobs, employers, compensation and workforce signals.

**Sourcing posture:** use O*NET, ESCO and national classifications as the open semantic foundation. Evaluate Lightcast or an equivalent commercial source only when a paid product needs superior job-posting/skills coverage. Prefer direct ATS, employer and authorised job-board feeds. Do not scrape professional profiles or infer sensitive traits without a lawful, documented use.

**Build:** multilingual skill graph, occupation crosswalk, employer identity and explainable match methodology.

### 5.7 Autobit — vehicle and mobility intelligence

**Priority evidence:** VIN/specification, ownership/history, listings, transactions, valuations, repair and residual value.

**Sourcing posture:** use NHTSA vPIC as a U.S. reference seed; compare JATO and S&P Global Mobility on coverage, update latency and rights. Share CLASSIC.COM or similar collector-vehicle evidence with KIDULTS under explicit schedules. Use approved regional history providers, including the NMVTIS ecosystem in the U.S.; connected-vehicle data requires explicit user authority and manufacturer/aggregator rights.

**Build:** global vehicle identity, trim/option normalization, event lineage and regional source adapters.

### 5.8 Kompare — product and offer comparison

**Priority evidence:** product identity, offer price, shipping, taxes, stock, warranty, merchant and timestamp.

**Sourcing posture:** anchor identity in GS1/manufacturer data; use authorised merchant feeds and affiliate networks such as Awin, Impact or CJ where terms support the intended display. Do not use uncontrolled retailer scraping as the production foundation. Regulated comparisons—finance, insurance or automotive—must use the corresponding vertical schedule and disclosures.

**Build:** SKU/GTIN resolution, comparable-offer model, total-cost semantics, freshness/confidence and merchant-quality scoring.

## 6. Cross-vertical reuse map

| Shared capability | Primary owner | Reusing brands | Constraint |
|---|---|---|---|
| Entity and affiliate identity | Intelligence Holdings | All | Provider licence cannot become the canonical key |
| Asset/product identity | Intelligence Holdings + vertical owner | KIDULTS, Artfund, Autobit, Kompare | Domain-specific confidence and rights remain separate |
| Auction/SOLD event model | KIDULTS / Artfund | KIDULTS, Artfund, Autobit | Price semantics and display rights must be source-specific |
| Macro, FX and geography | Intelligence Holdings | All | Prefer official sources; record observation time/version |
| Consent and privacy orchestration | Intelligence Holdings / Muchmoney | Muchmoney, Humanpool, Autobit | Purpose and regional roles differ by product |
| Merchant/offer feeds | Kompare | KIDULTS, Autobit, Muchmoney where lawful | Affiliate rights do not automatically permit analytics resale |
| Rights, TTL and deletion registry | Intelligence Holdings | All | Mandatory before raw provider data enters production |

## 7. Provider scorecard and hard gates

The mandatory pre-payment control is defined in `docs/strategy/TRACK_Z_MONEY_TO_USABLE_DATA_GATE_V1.md` and `coordination/kidults/governance/track-z-money-to-usable-data-gate-v1.json`. Every provider must prove the complete `PAYMENT -> ACCESS -> INPUT -> DATA -> RIGHTS -> PRODUCT` chain before a payment, paid trial, auto-converting trial, contract or credential activation is submitted for approval. Any missing or unknown link is `NO_PAY_HOLD`; `READY_FOR_SPEND_REVIEW` does not grant spend authority.

Rights compatibility is pass/fail. Only providers that pass proceed to weighted scoring.

| Dimension | Weight | Required evidence |
|---|---:|---|
| Revenue/product fit | 25 | Named feature, customer decision and measurable lift |
| Uniqueness | 20 | Coverage or authority unavailable from lawful alternatives |
| Coverage/freshness | 15 | Sample-based country, category and latency results |
| Schema/provenance | 15 | Stable IDs, nullability, corrections, timestamps and lineage |
| Economics | 10 | Full landed cost, payback, price steps and termination cost |
| Replaceability | 10 | Export, adapters, alternative source and transition plan |
| Security/SLA/support | 5 | Security evidence, uptime, incident and support commitments |

Reject or pause when rights are ambiguous; raw data cannot be deleted; derived-data survival is prohibited without economic justification; required public/SaaS use is excluded; an annual commitment precedes a successful pilot; the provider is a direct competitor with unacceptable leakage risk; or identity/lineage cannot be audited.

## 8. 90-day execution plan

### Days 0–30 — stop leakage

- adopt this strategy and the machine-readable sourcing contract;
- establish one group provider registry with vertical, status, owner, evidence date, deadline and next action;
- close duplicate outreach and cap active paid pilots at three;
- prepare the group master licence rider and vertical schedule template with counsel;
- separate `CLOSED`, `CURRENT-ROI DROP`, `CONDITIONAL`, `PILOT` and `ACTIVE` states.

### Days 31–60 — three measured lanes

1. **Vehicle/collectibles:** CLASSIC.COM or equivalent for KIDULTS and Autobit.
2. **Art:** same-sample ARTDAI–Artnet comparison, with at most one paid pilot.
3. **Collectible authentication:** PSA lawful sample/runtime validation; GemRate only if it adds measurable lift.

Capitaltimes, Muchmoney, Humanpool and Kompare remain open-source/first-party designs until a launch decision and a named monetised use case exist.

### Days 61–90 — decision and negotiation

Assign every provider one honest state: `GO`, `HOLD`, `REPLACE`, `CURRENT-ROI DROP` or `CLOSED`. Negotiate a group master only when Stage 3 is met. For any Stage 4 source, test the fallback and record recovery time, data loss and commercial exit cost.

## 9. Agent and reporting contract

Every agent working on providers must:

1. pass the repository GitHub-source bootstrap gate;
2. read this exact-HEAD strategy and `coordination/kidults/governance/ih-group-provider-sourcing-contract-v1.json` before analysis or outreach;
3. read the current provider registry and communication evidence; never duplicate outreach or resend a sent email without explicit authority;
4. distinguish verified facts, provider claims, inference and recommendations;
5. preserve legal, spend, credential, production and communication gates;
6. truth-sync material changes to the repository before reporting;
7. report by source layer, brand/vertical and provider, with state, evidence date, owner, deadline, next action, cost exposure and blocker.

## 10. Immediate standing decisions

| Provider/path | Current state | Reopen condition |
|---|---|---|
| eBay Marketplace Insights | `CLOSED` | Written authorised licensing/pilot path with acceptable rights and economics |
| PSA Premium | `BOUNDED` | Continue only inside approved reference/authentication use |
| PSA Enterprise | `CURRENT-ROI DROP` | Stage 2 product economics or Stage 3 group reuse—not “never” |
| GemRate | `CONDITIONAL` | Measured incremental lift beyond owned/public evidence |
| ALT / FNDATA | `COMPETITOR-REFERENCE ONLY` | Formal partnership with acceptable leakage, rights and economics |
| Paid group-wide enterprise feed | `HOLD` | Two revenue products or at least 25% duplicate-cost saving |

## 11. Primary official references

- [GLEIF API](https://www.gleif.org/en/lei-data/gleif-api)
- [Verified by GS1](https://www.gs1.org/services/verified-by-gs1)
- [SEC EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
- [World Bank Indicators API](https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation)
- [ECB Data API](https://data.ecb.europa.eu/help/api/overview)
- [FRED API](https://fred.stlouisfed.org/docs/api/fred/)
- [O*NET Web Services and licence](https://services.onetcenter.org/)
- [ESCO API](https://esco.ec.europa.eu/en/use-esco/use-esco-services-api)
- [NHTSA vPIC](https://www.nhtsa.gov/cars/rules/manufacture/)
- [Approved NMVTIS data providers](https://vehiclehistory.bja.ojp.gov/nmvtis_vehiclehistory)
- [Artnet Price Database](https://www.artnet.com/price-database/)
- [ARTDAI](https://artd.ai/)
- [Artprice](https://www.artprice.com/)
- [LSEG Market Data](https://www.lseg.com/en/data-analytics/market-data)
- [FactSet Marketplace](https://www.factset.com/marketplace/catalog)
- [Nasdaq Data Link](https://www.nasdaq.com/products/data/data-link/api)
- [Lightcast Work Intelligence](https://lightcast.io/solutions/work-intelligence)
- [JATO Volumes](https://www.jato.com/our-solutions/volumes)
- [S&P Global Mobility](https://prod.azure.ihsmarkit.com/mobility/en/products/automotive-market-data-analysis.html)
- [Plaid](https://plaid.com/)
- [Yodlee Open Banking](https://developer.yodlee.com/products/yodlee/open-banking)
- [Awin APIs](https://help.awin.com/docs/comparison-between-shareasale-and-awin-apis)

This document is a sourcing and operating strategy, not jurisdiction-specific legal advice. Counsel must approve entity, affiliate, privacy, financial-regulatory and data-licensing terms before execution.
