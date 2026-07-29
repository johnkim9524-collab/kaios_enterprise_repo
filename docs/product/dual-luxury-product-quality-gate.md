# Dual Luxury Product Quality Gate

## Objective

Ensure every Kidults and Artfund customer experience is premium, commercially useful, evidence-based, and consistent across desktop and mobile.

## Fixed Quality Targets

- Product Quality Score: 90 or higher
- Data Trust Score: 90 or higher
- Luxury Brand Fit: 95 or higher
- Institutional Readiness: 85 or higher
- Evidence Traceability: 95% or higher
- Production rights classification: 100%

## Gate Dimensions

### 1. Luxury Brand Fit — 25 points

- distinctive visual identity
- editorial hierarchy
- disciplined typography
- premium spacing and proportion
- restrained motion
- intentional imagery
- no generic SaaS appearance
- consistent desktop and mobile experience

### 2. Decision Value — 20 points

Every module must answer a customer decision question.

Examples:

- What changed?
- Why did it change?
- Is the change durable?
- What should be acquired, held, sold, launched, avoided, or investigated?
- What is the confidence and supporting evidence?

### 3. Data Trust — 20 points

- freshness displayed
- source coverage displayed
- confidence displayed
- methodology displayed
- evidence accessible
- rights status enforced
- correction and restatement supported

### 4. Product Completeness — 15 points

- live or approved staging data
- loading state
- empty state
- degraded state
- error state
- export or share path
- archive path
- accessibility baseline

### 5. Performance and Mobile — 10 points

- no horizontal overflow
- touch targets at least 44px
- readable compact charts
- responsive cards, filters, search, and chips
- premium skeleton loading
- stable layout during data loading
- acceptable page and API latency

### 6. Commercial Readiness — 10 points

- defined target user
- defined recurring use case
- defined retention reason
- defined free, premium, or enterprise boundary
- export, report, alert, API, or workflow value
- support and service expectation defined

## Portal-Specific Gates

### Kidults Enterprise

Required:

- executive overview
- market intelligence
- brand intelligence
- category intelligence
- Kidult 100 and sub-indices
- report library
- CSV or PDF export
- evidence and methodology surface

### Kidults Collector

Required:

- collection or import shell
- watchlist
- price intelligence
- fair-value range
- liquidity grade
- alerts
- monthly personal review

### Artfund Institutional

Required:

- global market overview
- artist intelligence
- auction intelligence
- provenance strength
- index suite
- report library
- evidence and methodology surface
- export or API path

### Artfund Investor or Collector

Required:

- portfolio or watchlist
- artist signals
- auction calendar
- valuation confidence
- liquidity and provenance risk
- personalized review

## Release Classification

### Preview

Visual or methodological exploration. May use limited approved data. Must not imply production completeness.

### Alpha

Core workflow exists for controlled users. Data quality and functionality may be incomplete but must be labeled.

### Beta

Repeated use is possible, methodology is versioned, evidence is available, and major error states are handled.

### General Availability

Operational SLA, security, support, stable methodology, billing, and external trust evidence are in place.

## Automatic Release Blockers

- unexplained score
- missing methodology version
- rights status unknown for displayed premium data
- broken evidence link
- horizontal overflow on supported mobile viewport
- empty screen without explanation
- failed or stale data shown as current
- critical accessibility defect
- secret or internal runtime detail exposed
- index level that cannot be reproduced

## Review Record

Every release candidate records:

- product name and version
- portal and user segment
- reviewer or automated gate
- score by dimension
- blockers
- approved exceptions
- mobile evidence
- release classification
- approval timestamp

## Acceptance Criteria

- All customer portals use the same quality scorecard.
- Desktop and mobile are reviewed together.
- No premium product ships below the target threshold without explicit executive exception.
- Every released module has a decision question and recurring use case.
- Evidence and methodology are visible without leaving the customer workflow.