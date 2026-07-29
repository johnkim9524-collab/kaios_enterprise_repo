# Artfund Portal Information Architecture v0.9

## Objective

Define a premium, institutional-grade portal system for Artfund while preserving strict separation between public authority, institutional workflows, private investor use, and internal KAIOS operations.

## Portal System

### 1. Public Intelligence

Primary purpose: establish Artfund as the public reference authority for art investment intelligence.

Required sections:

- Global Art Market Overview
- Artfund Global Art Market Index
- Artist Momentum
- Auction Liquidity
- Provenance Strength
- Reports
- Methodology
- Archive Preview

### 2. Institutional Portal

Primary users:

- family offices
- asset managers
- private banks
- auction houses
- galleries
- insurers
- appraisers
- research and advisory firms

Required sections:

- Executive Overview
- Market Intelligence
- Artist Intelligence
- Auction Intelligence
- Provenance Intelligence
- Segment and Regional Analytics
- Indices and Benchmarks
- Report Library
- Data Export
- API Access
- Saved Views and Watchlists

### 3. Investor and Collector Portal

Primary purpose: support high-value acquisition, portfolio, auction, and risk decisions.

Required sections:

- Portfolio Overview
- Artist Watchlist
- Artwork and Edition Watchlist
- Auction Calendar
- Fair Value Range
- Liquidity Grade
- Provenance Risk
- Alerts
- Monthly Private Review

### 4. KAIOS Operations Portal

Internal only:

- Source Health
- Rights Status
- Collection Runtime
- Entity Resolution Queue
- Quality and Anomaly Incidents
- Index Runs
- Report Publishing
- Backup and Recovery
- Stability and Cost
- Release and Rollback

## Decision Workflows

### Institutional

Market condition → segment allocation → artist comparison → artwork evidence → auction/liquidity review → benchmark/export → committee report.

### Investor and Collector

Portfolio exposure → watchlist signal → artwork evidence → fair-value and liquidity range → provenance risk → auction timing → action or alert.

## Trust Surface

Every intelligence page must expose:

- updated timestamp
- source coverage
- confidence grade
- methodology version
- evidence trail
- rights status
- correction history where applicable

## Luxury Portal Premium Requirements

- museum-grade whitespace and composition
- ivory, charcoal, deep navy, and restrained metallic accents
- artwork-safe image ratios and rights-aware image handling
- editorial hierarchy before dashboard density
- restrained motion under 250 milliseconds
- premium skeleton, empty, degraded, and error states
- no generic SaaS visual language
- no unexplained score or decorative chart

## Responsive Requirements

Desktop and mobile ship together.

- no horizontal overflow
- minimum 44px touch targets
- single-column mobile editorial flow
- compact but readable charts
- evidence and methodology reachable without precision tapping
- preserved artwork aspect ratio
- accessible contrast and keyboard navigation

## Product Gate

A portal section is not complete unless it has:

- live or certified staging data
- loading, empty, degraded, and error states
- evidence and methodology links
- desktop and mobile validation
- analytics event contract
- export or action workflow where commercially relevant
