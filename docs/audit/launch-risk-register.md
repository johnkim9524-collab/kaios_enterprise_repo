# Launch Risk Register

## Priority Definitions

- P0: Security, data integrity, production outage, or launch impossibility
- P1: Launch quality, performance, mobile, data, or conversion deficiency
- P2: Maintainability and long-term optimization

## Current Risks

| ID | Priority | Risk | Evidence | Required Action |
|---|---|---|---|---|
| LR-001 | P0 Watch | Production stability observation incomplete | Stability baseline still observing | Continue automated 30-day gate |
| LR-002 | P1 | Market-facing launch gates not fully evidenced | Inventory proves components, not finished product | Perform staging portal audit |
| LR-003 | P1 | Kidult 100 real-data readiness unverified | Index packages exist but output not audited | Validate data, methodology and UI |
| LR-004 | P1 | Monthly Intelligence publishability unverified | Report engine exists | Generate and review one full report |
| LR-005 | P1 | Mobile and performance status unknown | No current benchmark artifacts | Run 320px, Lighthouse and API tests |
| LR-006 | P1 | Conversion flow not proven | Portal contracts exist | Validate newsletter, waitlist and inquiry |
| LR-007 | P1 | Runtime package usage not traced | 22 package directories and 159 runtime candidates | Build import and dependency graph |
| LR-008 | P1 | Staging and beta duplication risk | Kidults and Artfund each have staging and beta apps | Define one canonical app per vertical |
| LR-009 | P2 | Duplicate filenames may confuse review | index.html, index.ts, index.test.ts, package.json repeated | Evaluate by full path |
| LR-010 | P2 | systemd definitions are external to repository | Repository deployment count is zero | Keep installer and runbook canonical |

## Current Decision

Current decision: **CONDITIONAL NO-GO**

Reason:

- No confirmed P0 failure has been identified.
- Market-facing launch evidence remains incomplete.
- Runtime imports and canonical ownership are not yet proven.

## Immediate Priorities

1. Validate Kidults Portal.
2. Validate Kidult 100 real data.
3. Generate one Monthly Intelligence report.
4. Validate Methodology and Archive.
5. Validate conversion paths.
6. Trace actual runtime imports.
7. Run mobile, performance and accessibility tests.
