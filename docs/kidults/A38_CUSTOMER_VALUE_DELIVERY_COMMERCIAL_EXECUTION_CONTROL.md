# A38 — Customer Value Delivery & Commercial Execution Control

## Objective

A38 implements a bounded customer value delivery and commercial execution control layer for KIDULTS. It determines whether an approved A37 commercial recommendation may be prepared for delivery to a specific customer segment or account context while preserving entitlement, rights, pricing, privacy, legal, security, operational, and executive boundaries.

A38 may prepare simulated delivery packages and execution plans.

A38 does **not** autonomously:
- Send external commercial messages
- Execute contracts
- Collect payment or issue refunds
- Provision paid access
- Modify customer billing
- Create binding commitments
- Expose restricted information
- Bypass entitlement, privacy, legal, security, or executive review
- Mutate external customer, CRM, or provider systems during certification

**Depends on:** A37 commercial governance evidence (`certificationPassed: true`)

---

## Delivery State Model

| State | Description |
|---|---|
| `UNASSESSED` | Initial state before evaluation |
| `ASSESSING` | Delivery controls are being evaluated |
| `DELIVERY_ELIGIBLE` | Delivery preparation is allowed |
| `DELIVERY_PREPARED` | A simulated package and execution plan were prepared |
| `ENTITLEMENT_REVIEW_REQUIRED` | Context or entitlement evidence is insufficient |
| `PRICING_REVIEW_REQUIRED` | Pricing state is invalid or incomplete |
| `LEGAL_REVIEW_REQUIRED` | Rights or legal evidence requires review |
| `PRIVACY_REVIEW_REQUIRED` | Privacy evidence is unknown or incomplete |
| `SECURITY_REVIEW_REQUIRED` | Security evidence is unknown |
| `EXECUTIVE_REVIEW_REQUIRED` | Escalated approval is required before preparation |
| `DELIVERY_BLOCKED` | Hard-stop controls prohibit delivery preparation |
| `FAILED_CLOSED` | Unknown critical state or authoritative context failure |

Unknown critical state resolves to `FAILED_CLOSED`.

---

## Customer Context Model

Supported customer segments:
- `PUBLIC_VISITOR`
- `REGISTERED_USER`
- `PREMIUM_SUBSCRIBER`
- `PROFESSIONAL_USER`
- `ENTERPRISE_ACCOUNT`
- `PARTNER_ACCOUNT`
- `INTERNAL_USER`

Each customer context fixture explicitly includes:
- `customerContextId`
- `segment`
- `entitlementClass`
- `geography`
- `organizationClass`
- `channelEligibility`
- `privacyConstraints`
- `commercialRestrictions`
- `approvalRequirements`

Sensitive customer attributes are never inferred.

---

## Value Package Model

A38 evaluates a non-binding value package that may contain:
- `productId`
- `productVersion`
- `intelligenceAssetIds`
- `valueTier`
- `freshnessClass`
- `exclusivityClass`
- `entitlementRequirement`
- `deliveryChannel`
- `recommendedCommercialTerms`
- `pricingReference`
- `rightsReference`
- `legalState`
- `privacyState`
- `securityState`
- `validityWindow`
- `evidenceReferences`

During certification, A38 produces simulated packages only.

---

## Delivery Eligibility Rules

Delivery preparation is allowed only when:
- Certified A37 evidence is present
- The A37 commercial state permits delivery preparation
- Product identity is authoritative
- Rights are known and admissible
- Entitlement matches the customer context
- Pricing is admissible
- The intended channel is eligible
- Product freshness is acceptable
- Privacy state is known and compatible
- Security state is safe
- No active hard-stop incident is present
- No embargo or blocking legal restriction applies
- Required approval state is preserved for preparation

Unknown critical evidence never becomes `DELIVERY_ELIGIBLE`.

---

## Entitlement Mapping

A38 enforces deterministic entitlement rules:
- `PUBLIC` content -> public contexts allowed
- `PREMIUM` content -> premium or higher
- `ENTERPRISE` content -> enterprise only unless explicitly licensed
- `INTERNAL_ONLY` content -> external delivery blocked
- `RESTRICTED` content -> explicit authorized scope only

No automatic privilege escalation occurs.

---

## Content Minimization

A38 prepares only information required for delivery. The minimization layer excludes or redacts:
- Internal audit internals
- Security-sensitive data
- Credentials
- Provider secrets
- Internal-only governance data
- Unrelated customer information
- Restricted source material

Restricted content is deterministically minimized or delivery is blocked.

---

## Channel Governance

Simulated channels:
- `WEB`
- `REPORT_DOWNLOAD`
- `API`
- `ENTERPRISE_PORTAL`
- `DATA_LICENSE_PACKAGE`
- `PARTNER_PACKAGE`
- `EMAIL_PREPARATION`
- `SALES_HANDOFF`

Each channel defines eligibility, entitlement requirement, security requirement, privacy requirement, rights compatibility, and commercial approval requirement.

Certification never transmits externally.

---

## Commercial Execution Plan

A38 emits a bounded execution plan with:
- `executionPlanId`
- `customerContextId`
- `productId`
- `valuePackageId`
- `intendedChannel`
- `commercialState`
- `entitlementState`
- `pricingState`
- `legalState`
- `privacyState`
- `securityState`
- `requiredApprovals`
- `requiredHumanActions`
- `blockedActions`
- `nextPermittedAction`

Allowed next actions are:
- `PREPARE_DELIVERY`
- `REQUEST_PRICE_REVIEW`
- `REQUEST_LEGAL_REVIEW`
- `REQUEST_PRIVACY_REVIEW`
- `REQUEST_SECURITY_REVIEW`
- `REQUEST_EXECUTIVE_REVIEW`
- `HANDOFF_TO_AUTHORIZED_OPERATOR`
- `BLOCK_DELIVERY`
- `FAIL_CLOSED`

---

## Approval Boundaries

A38 may determine that an authorized operator can proceed, but A38 itself never performs binding external action. Human or external approval boundaries remain explicit for:
- Enterprise contract execution
- Custom pricing above threshold
- Rights uncertainty
- Privacy exceptions
- Restricted distribution
- Binding offers
- Payment activation
- Customer-specific legal terms

---

## Privacy Controls

A38 checks:
- Data minimization
- Purpose compatibility
- Restricted personal data handling
- Customer isolation
- Cross-account leakage
- Geography restrictions when authoritative evidence provides them
- Retention compatibility
- Disclosure restrictions

Unknown critical privacy evidence routes to `PRIVACY_REVIEW_REQUIRED` or `FAILED_CLOSED`.

---

## Anomaly Detection

Detected anomaly classes:
- `ENTITLEMENT_MISMATCH`
- `RIGHTS_MISMATCH`
- `PRICE_STATE_INVALID`
- `CHANNEL_NOT_ELIGIBLE`
- `PRIVACY_STATE_UNKNOWN`
- `SECURITY_STATE_UNSAFE`
- `STALE_PRODUCT_EVIDENCE`
- `CUSTOMER_CONTEXT_UNKNOWN`
- `CROSS_ACCOUNT_DATA_RISK`
- `RESTRICTED_CONTENT_EXPOSURE`
- `BINDING_EXECUTION_ATTEMPT`
- `UNKNOWN_DELIVERY_STATE`

Critical anomalies block delivery or fail closed.

---

## Scenarios

A38 certifies 20 deterministic scenarios:
1. `PUBLIC_PRODUCT_TO_PUBLIC_ALLOWED`
2. `PREMIUM_PRODUCT_TO_PREMIUM_ALLOWED`
3. `PREMIUM_PRODUCT_TO_PUBLIC_BLOCKED`
4. `ENTERPRISE_PRODUCT_TO_ENTERPRISE_ALLOWED`
5. `ENTERPRISE_PRODUCT_TO_PUBLIC_BLOCKED`
6. `INTERNAL_ONLY_EXTERNAL_DELIVERY_BLOCKED`
7. `VALID_WEB_DELIVERY_PREPARED`
8. `VALID_ENTERPRISE_PORTAL_DELIVERY_PREPARED`
9. `UNKNOWN_RIGHTS_REQUIRES_LEGAL_REVIEW`
10. `INVALID_PRICE_REQUIRES_PRICE_REVIEW`
11. `UNKNOWN_PRIVACY_REQUIRES_PRIVACY_REVIEW`
12. `SECURITY_UNSAFE_BLOCKS_DELIVERY`
13. `STALE_PRODUCT_EVIDENCE_BLOCKS_DELIVERY`
14. `CROSS_ACCOUNT_DATA_RISK_BLOCKS_DELIVERY`
15. `RESTRICTED_CONTENT_IS_MINIMIZED_OR_BLOCKED`
16. `BINDING_OFFER_EXECUTION_ATTEMPT_BLOCKED`
17. `PAYMENT_ACTIVATION_ATTEMPT_BLOCKED`
18. `EXTERNAL_MESSAGE_SEND_ATTEMPT_BLOCKED`
19. `AUTHORIZED_OPERATOR_HANDOFF_ALLOWED`
20. `REPEATED_IDENTICAL_EVALUATION_IS_IDEMPOTENT`

Invariant count: **20**.

---

## Evidence

Evidence is written under:

`services/kidults-autonomous-intelligence/reports/customer-value-delivery/`

Filename pattern:

`a38-customer-value-delivery-<YYYY-MM-DD>-<hex>.json`

Each evidence file includes the source A37 evidence, customer context, product identity, value package, entitlement analysis, rights analysis, pricing state, privacy state, security state, channel analysis, content minimization decision, execution plan, approvals, blocked actions, anomaly detections, invariant results, timestamps, audit trail, and final delivery state.

---

## Package Scripts

- `npm run a38:gate`
- `npm run a38:certify`
- `npm run a38:finalize`

`a38:finalize` follows the established `stage-finalize.ps1 -Stage A38` pattern.

---

## CI Workflow

Workflow:

`.github/workflows/kidults-a38-customer-value-delivery.yml`

The workflow verifies A38 package scripts, runs typecheck, refreshes upstream A37 certification, runs `a38:gate`, runs `a38:certify`, and uploads A38 evidence.

---

## Safety Preservation

A38 preserves all A15-A37 controls. Certification performs zero external customer or commercial mutation, never creates binding commitments, never activates payment, never mutates billing, never provisions paid access, and never transmits external commercial messages.
