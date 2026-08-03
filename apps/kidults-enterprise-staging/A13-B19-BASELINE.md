# A13-B19 Provider Candidate Population & Outreach

## Objective
Populate the provider acquisition framework with verified real-world candidates for transactions, supply and cultural-demand roles without fabricating unavailable commercial or operational facts.

## Principles
- Use official provider documentation as the primary source.
- Preserve unknown cost, quota, uptime, latency and rights fields as `unknown` until confirmed by the provider.
- Distinguish generally available APIs from alpha, restricted and no-new-access programs.
- Do not mark any provider as pilot-ready without explicit technical, commercial and rights review.
- Production remains untouched and promotion remains blocked.

## Initial Shortlist
### Transactions
- eBay Marketplace Insights: sold-history capability, restricted and not open to new users.
- PriceCharting Prices API: paid current-value data; historic prices and historic sales are not supported.
- TCGplayer API: collectible-card catalog and pricing; no new API access currently granted.

### Supply
- eBay Browse API: active listing search across supported marketplaces.
- TCGplayer API: collectible-card catalog and pricing; access constrained.
- PriceCharting Marketplace API: marketplace offers as a supplementary source.

### Cultural Demand
- Google Trends API alpha: consistently scaled search-interest data with five-year and geographic coverage; limited alpha access.
- YouTube Data API: public quota-governed video and channel signals.
- Reddit Data API: commercial use requires direct approval.
- GDELT DOC API: public news-document signal for supplementary cultural-demand evidence.

## Completion Gates
- At least two candidates per required role.
- Every candidate includes access status, rights status, evidence type and outreach action.
- No unverified numeric service-level or commercial values.
- Machine-readable shortlist and outreach report.
- Production promotion remains blocked.
