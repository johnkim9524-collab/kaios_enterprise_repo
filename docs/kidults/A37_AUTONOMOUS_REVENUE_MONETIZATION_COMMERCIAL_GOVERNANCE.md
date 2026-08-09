# A37 — Autonomous Revenue, Monetization & Commercial Governance

## Objective

A37 implements a bounded autonomous revenue, monetization, pricing, commercial eligibility, and offer-governance layer for the KIDULTS Global Autonomous Intelligence Platform. It evaluates whether intelligence products, reports, subscriptions, licensing opportunities, commercial channels, and monetization actions are economically and operationally admissible while preserving all A15–A36 safety, legal, entitlement, economic, and executive governance boundaries.

A37 **MAY** recommend commercial actions.

A37 **MUST NOT** autonomously:
- Enter contracts or accept binding legal terms
- Collect payment or initiate refunds
- Change payment processors
- Create unrestricted discounts
- Make external financial commitments
- Send binding commercial offers
- Expose customer confidential data
- Create legal obligations

**Depends on:** A36 economic governance evidence (`certificationPassed: true`)

---

## Commercial State Model

| State | Description |
|---|---|
| `UNASSESSED` | Initial state; evaluation not yet begun |
| `ASSESSING` | Active evaluation in progress |
| `NOT_COMMERCIAL_READY` | One or more readiness checks failed |
| `COMMERCIAL_READY` | All readiness checks pass (e.g., free product) |
| `MONETIZATION_ELIGIBLE` | Product is eligible for monetized commercial offer |
| `OFFER_ELIGIBLE` | Offer structure confirmed eligible |
| `PRICE_REVIEW_REQUIRED` | Pricing policy unavailable or price below margin floor |
| `CHANNEL_REVIEW_REQUIRED` | Channel compliance unknown or unconfirmed |
| `LEGAL_REVIEW_REQUIRED` | Licensing rights unknown or restricted |
| `EXECUTIVE_REVIEW_REQUIRED` | Unknown cost or escalated condition |
| `COMMERCIAL_BLOCKED` | Entitlement mismatch, license conflict, negative margin, or discount violation |
| `FAILED_CLOSED` | Binding offer, contract acceptance, or payment mutation attempted; or unsupported state |

Unknown or unsupported state resolves to `FAILED_CLOSED`.

---

## Monetization Modes

| Mode | Description |
|---|---|
| `FREE` | No charge; open access |
| `FREEMIUM` | Base free with paid upgrade path |
| `ONE_TIME_PURCHASE` | Single transaction purchase |
| `SUBSCRIPTION` | Recurring access model |
| `PREMIUM_REPORT` | One-time or subscription premium intelligence report |
| `DATA_ACCESS` | Licensed access to raw or processed data |
| `API_ACCESS` | Programmatic API-based access |
| `ENTERPRISE_LICENSE` | Volume or site license for enterprise customers |
| `SPONSORSHIP_ELIGIBLE` | Sponsorship-funded distribution model |
| `PARTNERSHIP_ELIGIBLE` | Co-distribution via commercial partner |

Each product must have an explicit eligible monetization set. Not all products support all modes.

---

## Pricing Governance

### Pricing Inputs

| Input | Description |
|---|---|
| `productClass` | Classification of the intelligence product |
| `customerSegment` | Target customer tier |
| `valueTier` | Perceived value classification |
| `freshness` | Data freshness score (0–1) |
| `exclusivity` | Exclusivity of the intelligence (0–1) |
| `dataCoverage` | Coverage breadth score (0–1) |
| `productionCost` | Direct production cost (currency units) |
| `providerCost` | Provider/data licensing cost (currency units) |
| `supportBurden` | Support cost as fraction of revenue |
| `commercialPrecedent` | Historical or benchmark price |
| `minimumMarginPolicy` | Minimum required gross margin fraction (default 0.35) |
| `proposedPrice` | Proposed sale price |
| `strategicValue` | Strategic value classification |
| `channelConstraints` | Channel-specific pricing restrictions |

### Pricing Decision Values

| Decision | Condition |
|---|---|
| `PRICE_ACCEPTABLE` | `grossMargin ≥ minimumMarginPolicy` |
| `PRICE_OPTIMIZATION_RECOMMENDED` | Margin acceptable but improvement possible |
| `PRICE_TOO_LOW` | `grossMargin < minimumMarginPolicy` (positive) |
| `PRICE_TOO_HIGH` | Price exceeds policy ceiling |
| `PRICE_REVIEW_REQUIRED` | No pricing policy available |
| `EXECUTIVE_REVIEW_REQUIRED` | Cost unknown or anomalous escalation |

A37 **may** recommend a price. A37 **must not** publish a binding external price change.

---

## Margin Governance

A37 consumes A36 cost/economic evidence to calculate:

| Signal | Description |
|---|---|
| `estimatedRevenue` | Proposed sale price |
| `estimatedCost` | Sum of production and provider cost |
| `grossMargin` | `(revenue - cost) / revenue` |
| `contributionMargin` | Gross margin adjusted for support burden |
| `marginClass` | `NEGATIVE` / `BELOW_FLOOR` / `ACCEPTABLE` / `HEALTHY` / `FREE_PRODUCT` |
| `economicViability` | `NOT_VIABLE` / `BELOW_MINIMUM` / `VIABLE` / `UNKNOWN` |

Unknown authoritative cost or price input remains `UNKNOWN`. Negative economics result in `COMMERCIAL_BLOCKED`.

---

## Customer Segment Model

| Segment | Description |
|---|---|
| `PUBLIC` | Unauthenticated public access |
| `REGISTERED` | Authenticated registered user |
| `PREMIUM` | Paid premium subscriber |
| `PROFESSIONAL` | Professional plan subscriber |
| `ENTERPRISE` | Enterprise account |
| `PARTNER` | Authorized commercial partner |
| `INTERNAL` | Internal KIDULTS staff |

Commercial eligibility respects entitlement boundaries. No privilege escalation. No enterprise-only data may be exposed to public/basic tiers.

---

## Entitlement Governance

| Level | Accessible To |
|---|---|
| `PUBLIC_ACCESS` | PUBLIC and above |
| `REGISTERED_ACCESS` | REGISTERED and above |
| `PREMIUM_ACCESS` | PREMIUM, PROFESSIONAL, ENTERPRISE, PARTNER, INTERNAL |
| `ENTERPRISE_ACCESS` | ENTERPRISE, PARTNER, INTERNAL |
| `INTERNAL_ONLY` | INTERNAL only |
| `RESTRICTED` | INTERNAL only |

Unknown entitlement → `COMMERCIAL_BLOCKED`. Entitlement mismatch → `COMMERCIAL_BLOCKED`.

---

## Offer Governance

### Offer Model Fields

| Field | Description |
|---|---|
| `offerId` | Unique offer identifier (generated) |
| `productId` | Product being offered |
| `segment` | Target customer segment |
| `monetizationMode` | Primary monetization mode |
| `recommendedPrice` | Recommended sale price (simulation only) |
| `currency` | ISO 4217 currency code |
| `validityWindow` | `SIMULATION_ONLY` during certification |
| `entitlement` | Entitlement level required |
| `commercialRationale` | Decision reason |
| `marginEstimate` | Full margin analysis |
| `approvalRequired` | Whether human approval is required |
| `legalReviewRequired` | Whether legal review is required |
| `evidenceReferences` | Links to evidence files |
| `bindingOfferDispatched` | Always `false` — never dispatched |

### Offer Decision Values

| Decision | Condition |
|---|---|
| `OFFER_RECOMMENDED` | All checks pass |
| `OFFER_DEFERRED` | Not commercially ready |
| `PRICE_REVIEW_REQUIRED` | Pricing issues |
| `LEGAL_REVIEW_REQUIRED` | Rights/compliance issues |
| `EXECUTIVE_REVIEW_REQUIRED` | Unknown cost or escalation |
| `COMMERCIAL_BLOCKED` | Hard stops triggered |

No binding offer is dispatched during certification or in any mode.

---

## Discount Governance

Discount recommendations must:
- Respect `maxDiscountPolicy` ceiling
- Respect `executiveApprovalThreshold`
- Preserve minimum margin
- Preserve entitlement and channel rules
- Not use prohibited characteristics
- Not bypass executive approval threshold

Discounts exceeding `maxDiscountPolicy` → `COMMERCIAL_BLOCKED`. Autonomous discount generation is prohibited (`MAXIMUM_AUTONOMOUS_DISCOUNT = 0.0`).

---

## Channel Governance

Supported channels:

| Channel | Description |
|---|---|
| `DIRECT_WEB` | Web storefront |
| `ENTERPRISE_DIRECT` | Direct enterprise sales |
| `API` | API marketplace or direct integration |
| `DATA_LICENSE` | Data licensing portal |
| `PARTNER_CHANNEL` | Co-distribution via partners |
| `REPORT_DOWNLOAD` | Report download marketplace |
| `SUBSCRIPTION` | Subscription platform |
| `SPONSORED_CHANNEL` | Sponsor-funded distribution |

Unknown channel compliance → `CHANNEL_REVIEW_REQUIRED`. Unknown channel → anomaly `CHANNEL_POLICY_MISMATCH`.

---

## Legal / Rights Boundary

Commercialization must not proceed when:
- Ownership is unknown (`UNKNOWN`)
- Provider terms prohibit resale (`PROVIDER_TERMS_PROHIBIT_RESALE`)
- Embargo applies (`EMBARGO_APPLIES`)
- Privacy restriction applies (`PRIVACY_RESTRICTION_APPLIES`)
- Redistribution right is restricted (requires legal review)

A37 never infers rights from technical accessibility. Unknown rights → `LEGAL_REVIEW_REQUIRED` or `COMMERCIAL_BLOCKED`.

---

## Commercial Anomaly Detection

| Anomaly | Description |
|---|---|
| `PRICE_BELOW_MARGIN_FLOOR` | Proposed price yields margin below minimum policy |
| `PRICE_ABOVE_POLICY_RANGE` | Proposed price exceeds policy ceiling |
| `DISCOUNT_OVER_LIMIT` | Discount request exceeds maximum policy |
| `ENTITLEMENT_MISMATCH` | Product entitlement incompatible with customer segment |
| `CHANNEL_POLICY_MISMATCH` | Channel compliance unknown or violated |
| `RIGHTS_UNKNOWN` | Licensing rights not established |
| `LICENSE_SCOPE_CONFLICT` | License terms prohibit intended use |
| `COMMERCIAL_COST_SPIKE` | Unexpected cost spike detected |
| `UNAUTHORIZED_OFFER` | Binding offer dispatch attempted |
| `UNKNOWN_COMMERCIAL_STATE` | Commercial state cannot be determined |

Critical anomalies (`ENTITLEMENT_MISMATCH`, `RIGHTS_UNKNOWN`, `LICENSE_SCOPE_CONFLICT`, `UNAUTHORIZED_OFFER`, `DISCOUNT_OVER_LIMIT`) immediately block commercialization.

---

## Scenarios (20/20 PASS)

| Scenario | Expected State | Expected Offer Decision |
|---|---|---|
| `HEALTHY_PRODUCT_COMMERCIAL_READY` | `MONETIZATION_ELIGIBLE` | `OFFER_RECOMMENDED` |
| `FREE_PRODUCT_ALLOWED` | `COMMERCIAL_READY` | `OFFER_RECOMMENDED` |
| `PREMIUM_PRODUCT_REQUIRES_ENTITLEMENT` | `MONETIZATION_ELIGIBLE` | `OFFER_RECOMMENDED` |
| `ENTERPRISE_PRODUCT_BLOCKED_FOR_PUBLIC` | `COMMERCIAL_BLOCKED` | `COMMERCIAL_BLOCKED` |
| `VALID_PRICE_ACCEPTED` | `MONETIZATION_ELIGIBLE` | `OFFER_RECOMMENDED` |
| `LOW_PRICE_REQUIRES_OPTIMIZATION` | `PRICE_REVIEW_REQUIRED` | `PRICE_REVIEW_REQUIRED` |
| `NEGATIVE_MARGIN_BLOCKS_COMMERCIALIZATION` | `COMMERCIAL_BLOCKED` | `COMMERCIAL_BLOCKED` |
| `UNKNOWN_COST_REQUIRES_REVIEW` | `EXECUTIVE_REVIEW_REQUIRED` | `EXECUTIVE_REVIEW_REQUIRED` |
| `UNKNOWN_PRICE_REQUIRES_REVIEW` | `PRICE_REVIEW_REQUIRED` | `PRICE_REVIEW_REQUIRED` |
| `UNKNOWN_RIGHTS_REQUIRES_LEGAL_REVIEW` | `LEGAL_REVIEW_REQUIRED` | `LEGAL_REVIEW_REQUIRED` |
| `LICENSE_CONFLICT_BLOCKS_COMMERCIALIZATION` | `COMMERCIAL_BLOCKED` | `COMMERCIAL_BLOCKED` |
| `DISCOUNT_WITHIN_POLICY_RECOMMENDED` | `MONETIZATION_ELIGIBLE` | `OFFER_RECOMMENDED` |
| `DISCOUNT_OVER_LIMIT_BLOCKED` | `COMMERCIAL_BLOCKED` | `COMMERCIAL_BLOCKED` |
| `ENTITLEMENT_MISMATCH_BLOCKED` | `COMMERCIAL_BLOCKED` | `COMMERCIAL_BLOCKED` |
| `VALID_CHANNEL_ELIGIBLE` | `MONETIZATION_ELIGIBLE` | `OFFER_RECOMMENDED` |
| `UNKNOWN_CHANNEL_REQUIRES_REVIEW` | `CHANNEL_REVIEW_REQUIRED` | `PRICE_REVIEW_REQUIRED` |
| `BINDING_OFFER_ATTEMPT_BLOCKED` | `FAILED_CLOSED` | `COMMERCIAL_BLOCKED` |
| `CONTRACT_ACCEPTANCE_ATTEMPT_BLOCKED` | `FAILED_CLOSED` | `COMMERCIAL_BLOCKED` |
| `PAYMENT_MUTATION_ATTEMPT_BLOCKED` | `FAILED_CLOSED` | `COMMERCIAL_BLOCKED` |
| `REPEATED_IDENTICAL_EVALUATION_IS_IDEMPOTENT` | `MONETIZATION_ELIGIBLE` | `OFFER_RECOMMENDED` |

---

## Invariants (35/35 PASS)

| # | Invariant |
|---|---|
| 1 | A36 certified economic evidence is required |
| 2 | No autonomous contract acceptance |
| 3 | No autonomous binding offer dispatch |
| 4 | No autonomous payment collection |
| 5 | No autonomous refund mutation |
| 6 | No unrestricted discounting |
| 7 | No entitlement bypass |
| 8 | No rights assumption |
| 9 | Unknown rights cannot commercialize |
| 10 | Unknown critical price cannot commercialize |
| 11 | Unknown cost cannot create binding offer |
| 12 | Minimum margin policy cannot be bypassed |
| 13 | Enterprise entitlement cannot leak to public tier |
| 14 | Security hard stops remain preserved |
| 15 | Legal/compliance hard stops remain preserved |
| 16 | Executive authority cannot bypass security or rights hard stops |
| 17 | Every commercial decision emits evidence |
| 18 | Repeated evaluations are idempotent |
| 19 | Certification causes zero external commercial mutation |
| 20 | All A15–A36 controls remain preserved |
| 21–35 | Scenario-specific invariants (one per scenario) |

---

## Evidence Location

Evidence files are written to:

```
services/kidults-autonomous-intelligence/reports/commercial-governance/
```

Filename pattern:
```
a37-commercial-governance-<YYYY-MM-DD>-<hex>.json
```

Each evidence record includes:
- `commercialRunId` — unique run identifier
- `sourceA36Evidence` — A36 certification reference
- Product identity, monetization eligibility, pricing inputs
- Margin analysis, customer segment, entitlement
- Channel analysis, rights/legal state, discount analysis
- Offer recommendation, rejected commercial actions
- Approval requirements, anomaly detections
- Invariant results, timestamps, audit trail
- Final commercial state

---

## CI Workflow

Workflow: `.github/workflows/kidults-a37-commercial-governance.yml`

Triggers: push to A37 paths, `workflow_dispatch`

Steps:
1. Checkout
2. Setup Node 20
3. Install dependencies
4. Verify A37 package scripts present
5. Typecheck
6. `npm run a37:gate` (SIMULATION)
7. `npm run a37:certify` (SIMULATION)
8. Upstream chain: A36 → A35 → A34 → A33 → A32 certify
9. Upload A37 evidence artifact (90-day retention)

---

## A15–A36 Controls Preserved

- All A15 autonomous policy foundations remain in force
- All A16 execution control plane boundaries remain enforced
- All A17–A23 data, product, and commercial delivery controls preserved
- All A24–A27 production, recovery, and operational governance preserved
- All A28–A31 executive control tower and gateway controls preserved
- All A32 production reality gate controls preserved
- All A33 deployment governance controls preserved
- All A34 production assurance controls preserved
- All A35 capacity governance controls preserved
- All A36 economic governance controls preserved

No revenue optimization may weaken any upstream safety, security, legal, entitlement, or economic control.

---

## Safety Confirmation

Certification **performs zero external commercial or financial mutation**:

- `noContractAcceptance: true`
- `noBindingOfferDispatch: true`
- `noPaymentCollection: true`
- `noRefundInitiation: true`
- `noPaymentProcessorChange: true`
- `noUnrestrictedDiscount: true`
- `noExternalFinancialCommitment: true`
- `noCustomerConfidentialDataExposure: true`
- `noLegalObligationCreation: true`
- `noCommercialMutation: true`
