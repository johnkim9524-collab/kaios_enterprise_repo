# Dual Portal Quality Scorecard v0.9

## Objective

Provide a repeatable release score for Kidults and Artfund customer-facing portals.

## Mandatory Thresholds

- Product Quality Score >= 90
- Data Trust Score >= 90
- Luxury Brand Fit >= 95
- Mobile Readiness = pass
- Accessibility = pass
- Security and privacy = pass

A failed mandatory category blocks release regardless of total score.

## Product Quality Score — 100 Points

| Category | Weight |
|---|---:|
| Decision value | 20 |
| Information architecture | 12 |
| Data interpretation | 12 |
| Workflow completeness | 10 |
| Error and partial-data handling | 10 |
| Performance | 10 |
| Export and actionability | 8 |
| Accessibility | 8 |
| Mobile completion | 10 |

## Data Trust Score — 100 Points

| Category | Weight |
|---|---:|
| Evidence traceability | 20 |
| Provenance coverage | 15 |
| Source quality | 15 |
| Rights eligibility | 15 |
| Methodology reproducibility | 15 |
| Confidence transparency | 10 |
| Freshness and update status | 5 |
| Correction and restatement controls | 5 |

## Luxury Brand Fit — 100 Points

| Category | Weight |
|---|---:|
| Visual authority | 20 |
| Typography and hierarchy | 15 |
| Whitespace and rhythm | 15 |
| Bespoke intelligence components | 15 |
| Editorial clarity | 10 |
| Premium interaction and motion | 10 |
| Image and chart treatment | 5 |
| Mobile luxury consistency | 10 |

## Vertical-Specific Review

### Kidults

The review must reject:

- toy-store appearance
- generic marketplace density
- excessive neon or gaming aesthetics
- unexplained popularity scores
- portfolio views without liquidity and confidence

### Artfund

The review must reject:

- decorative auction-house imitation
- generic black-and-gold luxury treatment
- artwork imagery used without rights status
- valuation statements without provenance and confidence
- institutional screens without export or evidence workflow

## State Completeness Checklist

Each page and major component is reviewed in:

- normal
- loading
- empty
- insufficient evidence
- partial source failure
- delayed update
- degraded calculation
- unauthorized
- rights restricted
- full error

## Scoring Governance

- Reviewer records evidence for every deduction.
- Scores are stored with page, portal, vertical, build SHA, viewport, reviewer, and date.
- A score expires when material data, methodology, layout, or workflow changes.
- Release certification records the final scorecard artifact.

## Release Decision

- 95-100: Global Standard premium release candidate.
- 90-94: Release candidate with documented minor actions.
- 80-89: Beta only; no premium or institutional claim.
- Below 80: Internal preview only.
