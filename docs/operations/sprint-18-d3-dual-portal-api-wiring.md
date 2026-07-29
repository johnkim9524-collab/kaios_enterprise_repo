# Sprint 18-D3 Dual Portal API Wiring Runbook

## Purpose

Wire the Kidults Enterprise and Artfund Institutional staging portals to authenticated, governed score and index repositories.

## Implementation Sequence

1. Apply shared governance, score, and index staging migrations.
2. Seed only approved fixture methodology, rights, evidence, score, and index records.
3. Start the read-only portal API service.
4. Verify Viewer, Operator, and Admin authentication paths.
5. Run the Kidults and Artfund smoke matrices.
6. Verify Trust Surface parity between API and portal view models.
7. Verify 320 px mobile semantic parity.
8. Generate export manifests only for eligible Operator or Admin requests.

## Required Gates

- rights approved;
- methodology approved or active;
- confidence at least 70;
- evidence count at least 1;
- freshness not expired;
- Artfund provenance not disputed.

## Failure Handling

- authentication failure returns unauthorized;
- missing governed records return empty or partial;
- restricted rights return rights-restricted state;
- disputed Artfund provenance returns provenance-disputed state;
- repository failure returns retryable service error;
- one vertical failure must not disable the other vertical.

## Promotion Restrictions

- no write API;
- no destructive Production migration;
- no public release of illustrative staging values;
- Kidults Production remains unchanged;
- Artfund Production readiness is not claimed;
- Production promotion requires a separate certification.

## Completion Evidence

- package tests pass;
- TypeScript checks pass;
- authenticated smoke tests pass;
- Trust Surface values are present;
- export manifests contain methodology and evidence metadata;
- desktop and mobile states match.
