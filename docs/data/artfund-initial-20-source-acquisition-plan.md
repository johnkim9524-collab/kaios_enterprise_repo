# Artfund Initial 20-Source Acquisition Plan

## Objective

Establish the first rights-aware, evidence-linked production source portfolio for Artfund.

## Portfolio Design

Target source mix:

- 5 auction-house or auction-market sources
- 5 museum, archive, or institutional sources
- 4 gallery, fair, or exhibition sources
- 3 artist and artwork authority sources
- 3 art-market news and research sources

The plan defines source classes and promotion rules. It does not authorize collection where terms, licensing, robots policies, or applicable law have not been reviewed.

## Source Classes

### Auction and Market

1. Major global auction catalogue source A
2. Major global auction catalogue source B
3. Major global auction catalogue source C
4. Regional auction catalogue source
5. Public auction-results or market-summary source

### Museum and Institution

6. Global museum collection source A
7. Global museum collection source B
8. Global museum collection source C
9. National museum or public archive source
10. Art-research institution or catalogue source

### Gallery, Fair, and Exhibition

11. Global art fair source A
12. Global art fair source B
13. Gallery exhibition source A
14. Gallery exhibition source B

### Authority and Identity

15. Artist authority or public identity registry
16. Art terminology or controlled-vocabulary source
17. Catalogue raisonné or artist-foundation source where permitted

### News and Research

18. Institutional art-market news source
19. Art-industry research source
20. Regional art-market intelligence source

## Required Source Registry Fields

- source ID
- legal owner
- source type and tier
- jurisdiction
- collection method
- update cadence
- robots and terms review
- collect permission
- store permission
- transform permission
- display permission
- redistribute permission
- commercial-use permission
- attribution requirement
- retention rule
- evidence policy
- confidence baseline
- last review date

## Promotion Stages

### Candidate

Discovered but not approved. No commercial collection.

### Rights Reviewed

Terms and permitted-use classification documented.

### Staging

Adapter, parser, rate limits, provenance, and data quality tested in isolated storage.

### Certified

Minimum requirements:

- successful collection rate at least 90% during staging
- no unresolved rights blocker
- evidence capture complete
- canonical mapping documented
- duplicate behavior measured
- schema drift handling tested
- timeout and retry tested
- no secret or restricted content leakage

### Production

Promotion requires approval by Data, Rights, Security, and Product gates.

## Source Quality Score

Candidate dimensions:

- authority
- freshness
- identity precision
- price precision
- provenance value
- geographic relevance
- historical depth
- stability
- rights clarity
- independence from other sources

## Autonomous Controls

- scheduled health probes
- schema drift detection
- rate-limit adaptation
- exponential retry
- circuit breaker
- quarantine on quality or rights failure
- source-weight recalibration
- incident and recovery log

## Week 2 Target

Implement five staging adapters representing at least three source classes. No source enters Production solely to meet a source-count target.

## Six-Week Target

- 20 rights-classified sources
- 15 or more certified staging sources
- 10 or more production-eligible sources
- provenance coverage at least 95%
- source-success target at least 90% for Release Candidate and 95% after stabilization
