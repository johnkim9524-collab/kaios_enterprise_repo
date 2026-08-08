# A23 — Autonomous Commercial Delivery & Channel Control

## Purpose

A23 builds the governed commercial delivery and channel-control layer for the KIDULTS Global Autonomous Intelligence Platform. It produces a deterministic, auditable, fail-closed commercial delivery eligibility decision for every canonical intelligence product across every canonical delivery channel.

**A23 determines governed commercial delivery eligibility. It does not itself execute real production publication, billing, provider procurement, credential provisioning, contractual commitment, or unrestricted external mutation.**

---

## Relationship to A15–A22

| Stage | Role | A23 Consumption |
|-------|------|-----------------|
| A15 | Global Autonomous Policy Foundation | Policy invariants enforced |
| A16 | Autonomous Execution Control Plane | Non-interactive, fail-closed execution model |
| A17 | Bounded Live Adapter Readiness | Provider dependency boundary |
| A18 | Autonomous Data Acquisition Scale | Data coverage inputs |
| A19 | Data Coverage & Productization Gap Matrix | Canonical product/dimension/strategy classification |
| A20 | Intelligence Product Readiness & Monetization Gate | Readiness, monetization, publication class per product |
| A21 | Autonomous Intelligence Product Pipeline | Pipeline status, stable IDs, schema version |
| A22 | Autonomous Productization & Publication Control Plane | Publication decisions per product/channel |

A23 consumes evidence from A20, A21, and A22 without re-implementing or bypassing them.

---

## Commercial Delivery Control Model

A23 evaluates 18 canonical intelligence products across 5 canonical delivery channels:

### Canonical Channels

| Channel | Description |
|---------|-------------|
| `PUBLIC_EDITORIAL` | Externally visible editorial content; most restrictive gate |
| `PRO_SUBSCRIPTION` | Paid subscription tier; requires monetization and entitlement boundary |
| `ENTERPRISE_API` | API delivery; requires stable identity, schema, repeatability |
| `DATA_LICENSE` | Data licensing; requires usage-rights evidence and stable contract |
| `CUSTOM_INTELLIGENCE` | Bespoke delivery; bounded scope, human-review flag where required |

### Delivery Eligibility Values

| Value | Meaning |
|-------|---------|
| `ELIGIBLE` | Product meets all gates for this channel |
| `CONDITIONALLY_ELIGIBLE` | HYBRID product; eligible within current data-strategy bounds |
| `BLOCKED` | Generic block |
| `DEPENDENCY_BLOCKED` | Upstream or provider dependency unresolved |
| `POLICY_BLOCKED` | Policy gate (provenance, freshness, quality, entitlement, etc.) failed |

### Delivery Class Values

| Value | Assigned When |
|-------|---------------|
| `INTERNAL_ONLY` | Blocked or dependency-blocked |
| `EDITORIAL_READY` | Eligible for PUBLIC_EDITORIAL |
| `SUBSCRIPTION_READY` | Eligible for PRO_SUBSCRIPTION |
| `API_READY` | Eligible for ENTERPRISE_API |
| `LICENSE_READY` | Eligible for DATA_LICENSE |
| `CUSTOM_READY` | Eligible for CUSTOM_INTELLIGENCE |

---

## Channel Decision Model

### PUBLIC_EDITORIAL
- Only SELF-FIRST products with provenance ≥ 0.80, freshness ≥ 0.70, quality ≥ 0.75
- No provider dependency, no unresolved upstream dependency
- No direct credential or billing requirement
- Non-interactive; fail-closed

### PRO_SUBSCRIPTION
- Requires monetization readiness (A20 monetizationClass ≠ BLOCKED)
- Requires entitlement boundary (emitted in evidence)
- Allows SELF-FIRST and HYBRID strategies
- Must not perform billing mutation

### ENTERPRISE_API
- Requires stable product identity (A21 stableId) and stable schema (A21 schemaVersion)
- Requires provenance, freshness, quality, repeatability thresholds
- Authentication/authorization contract defined only — no credential provisioning
- Allows SELF-FIRST and HYBRID strategies

### DATA_LICENSE
- Requires provenance evidence and usage-rights evidence (SELF_OWNED)
- Requires stable data contract (A21 stableId)
- No licensing, billing, or contract transactions
- Only SELF-FIRST products

### CUSTOM_INTELLIGENCE
- Requires bounded delivery scope
- Requires dependency completeness
- Emits human-review requirement flag for non-SELF-FIRST products
- No auto-commit of irreversible commercial obligations
- Allows SELF-FIRST and HYBRID strategies

---

## Fail-Closed Behavior

A23 is deterministic and fail-closed by design:

- **Unknown products** → `POLICY_BLOCKED` with reason `unknown-product`
- **Unknown channels** → `POLICY_BLOCKED` with reason `unknown-channel`
- **Missing provenance** → `POLICY_BLOCKED`
- **Stale data** → `POLICY_BLOCKED`
- **Quality below threshold** → `POLICY_BLOCKED`
- **PROVIDER-REQUIRED products** → `DEPENDENCY_BLOCKED` on every channel without valid provider evidence
- **Upstream dependency blocked** → `DEPENDENCY_BLOCKED` propagates to all downstream products
- **Any A20/A21/A22 gate blocked** → propagated into A23 decision; bypassing is structurally impossible
- **Incomplete or unknown state** → `POLICY_BLOCKED`

---

## Entitlement Boundary

The `entitlementRequired` field is `true` for `PRO_SUBSCRIPTION` and `ENTERPRISE_API` channels. Evidence describing the entitlement requirement is emitted in `evidenceRefs` for every evaluation. A23 does not itself provision entitlements, create accounts, or perform billing.

---

## Provider Dependency Boundary

PROVIDER-REQUIRED products (those where `dataStrategy === 'PROVIDER-REQUIRED'`) remain `DEPENDENCY_BLOCKED` on every channel unless valid provider evidence is present. A23 does not procure providers, consume provider credentials, or store any provider secrets. This boundary is enforced globally and verified in the certification gates.

---

## Audit / Evidence Model

Every product/channel evaluation produces:

- Four minimum `evidenceRefs` (A20, A21, A22, A23 references)
- `auditRequired: true` on every record
- `rollbackPath` with a `rollbackClass`
- `safetyEnvelope` with all 8 safety invariants explicitly asserted

Reports are written to:

```
services/kidults-autonomous-intelligence/reports/commercial-delivery/a23-commercial-delivery-<timestamp>.json
```

The report includes: `stage`, `mode`, `canonicalProductCount`, `channelCount`, `evaluationCount`, `products`, `channels`, `positiveCases`, `negativeCases`, `gates`, `invariants`, `evidenceCount`, `status`, `completedAt`.

---

## Production Mutation Prohibition

A23 is a **control-plane certification and governed delivery eligibility stage only**. The `safetyEnvelope` on every evaluation record explicitly enforces:

| Invariant | Value |
|-----------|-------|
| `productionPublicationBlocked` | `true` |
| `noProviderProcurement` | `true` |
| `noProviderCredentialConsumptionOrStorage` | `true` |
| `noBillingMutation` | `true` |
| `noExternalPublicationMutation` | `true` |
| `noExternalSystemMutation` | `true` |
| `noIrreversibleCommercialTransaction` | `true` |
| `nonInteractive` | `true` |

Commercial eligibility determined by A23 **does not equal permission to execute production delivery**.

---

## Global Safety Invariants

All 20 global safety invariants are certified:

1. Policy before execution
2. Preflight before mutation
3. Non-interactive by default
4. Fail closed on unknown or incomplete state
5. No unrestricted production publication
6. No provider procurement
7. No provider credential consumption or storage
8. No billing mutation
9. No external publication mutation
10. No external system mutation
11. No irreversible commercial transaction
12. Evidence produced for every evaluated delivery attempt
13. Idempotent evaluation
14. Deterministic output
15. Rollback path represented wherever a future mutation would require one
16. A23 does not bypass A20/A21/A22 decisions
17. PROVIDER-REQUIRED products remain dependency-blocked without valid provider evidence
18. Commercial eligibility does not equal permission to execute production delivery
19. Unknown channels fail closed
20. Unknown products fail closed

---

## Package Scripts

| Script | Command | Effect |
|--------|---------|--------|
| `a23:gate` | `node scripts/a23-commercial-delivery-control.mjs` | Runs delivery evaluation |
| `a23:certify` | `npm run typecheck && npm run a23:gate` | Full certification |
| `a23:finalize` | `npm run a23:certify && node scripts/a23-finalize.mjs` | Certify + finalize |

---

## CI/CD

The `kidults-a23-commercial-delivery-control` workflow:
- Runs on PR changes to `services/kidults-autonomous-intelligence/` or the workflow file
- Checks out, sets up Node 24, installs dependencies
- Runs typecheck and `a23:gate`
- Uploads A23 evidence artifact: `kidults-a23-commercial-delivery-evidence`
- Uses `contents: read` only — no broad permissions
- Performs no production mutation, no provider credential access, no billing, no external publication

---

## Future Handoff to A24

A23 produces a machine-readable commercial delivery eligibility record for every product/channel pair. A24 may consume this record as its authoritative upstream gate for any further commercialization, contracting, or external handoff stage. A24 must not bypass A23 decisions, just as A23 does not bypass A20/A21/A22 decisions.
