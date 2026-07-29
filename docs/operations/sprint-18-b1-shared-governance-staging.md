# Sprint 18-B1 — Shared Governance Staging Foundation

## Objective

Implement the first executable Week 2 foundation for Kidults and Artfund without modifying Kidults Production or claiming Artfund Production readiness.

## Included

- Shared Source Registry schema
- Shared Rights Registry schema
- Evidence Ledger schema
- Methodology Registry schema
- Confidence Assessment schema
- Commercial eligibility evaluator
- Confidence grade evaluator
- Contract tests for rights, methodology, and confidence gates

## Database Boundary

The migration in `infrastructure/staging/0001_shared_governance_foundation.sql` is staging-only.

It must be applied to a dedicated staging database. It is not authorized for the Kidults Production database.

Recommended staging databases:

- `kidults_staging.db`
- `artfund_staging.db`

The registry tables may exist in both databases during Week 2. A later shared service may centralize them after operational validation.

## Commercial Eligibility Rules

A source is not eligible for commercial portal, index, report, or API use merely because it can be collected.

The evaluator requires:

1. operational source status;
2. approved rights status;
3. explicit permitted-use flags;
4. confidence score of at least 70 for product surfaces;
5. approved or active methodology for indices, reports, and APIs.

Unknown rights block commercial use.

A draft methodology blocks index and report eligibility.

A source may remain eligible for internal staging collection while remaining ineligible for customer-facing use.

## Confidence Grades

| Score | Grade | Product Meaning |
|---:|:---:|---|
| 90–100 | A | high-confidence product use |
| 80–89 | B | normal product use |
| 70–79 | C | qualified product use with visible confidence |
| 50–69 | D | internal or analyst-review use |
| 0–49 | U | unverified; commercial use blocked |

## Required Tests

- approved rights permit eligible portal, index, report, and API use;
- unknown rights block commercial use;
- draft methodology blocks index and report use;
- confidence grading is deterministic;
- invalid confidence scores fail closed;
- SQL migration passes SQLite integrity checks;
- all foreign keys and check constraints reject invalid records.

## Week 2 Next Steps

1. Apply the migration to isolated Kidults and Artfund staging databases.
2. Add repository adapters for all five registries.
3. Add read-only APIs for sources, rights, evidence, methodologies, and confidence.
4. Add Kidults Enterprise and Artfund Institutional portal Trust Surface components.
5. Add rights-restricted, unknown-confidence, partial-source, empty, loading, and error states.
6. Run desktop and mobile luxury quality certification.

## Promotion Constraints

Production promotion is prohibited until a separate gate confirms:

- migration backup and rollback;
- rights classification coverage;
- evidence traceability;
- deterministic methodology behavior;
- security and RBAC;
- mobile parity;
- Product Quality Score >= 90;
- Data Trust Score >= 90;
- Luxury Brand Fit >= 95.
