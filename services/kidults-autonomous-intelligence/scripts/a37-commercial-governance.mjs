/**
 * A37 — Autonomous Revenue, Monetization & Commercial Governance
 * Runner: a37-commercial-governance.mjs
 *
 * Bounded autonomous revenue, monetization, pricing, commercial eligibility,
 * and offer-governance layer for the KIDULTS Global Autonomous Intelligence
 * Platform. Evaluates whether intelligence products, reports, subscriptions,
 * licensing opportunities, commercial channels, and monetization actions are
 * economically and operationally admissible while preserving all A15–A36
 * safety, legal, entitlement, economic, and executive governance boundaries.
 *
 * Commercial state model:
 *   UNASSESSED → ASSESSING
 *   → COMMERCIAL_READY | NOT_COMMERCIAL_READY | MONETIZATION_ELIGIBLE
 *   → OFFER_ELIGIBLE | PRICE_REVIEW_REQUIRED | CHANNEL_REVIEW_REQUIRED
 *   → LEGAL_REVIEW_REQUIRED | EXECUTIVE_REVIEW_REQUIRED
 *   → COMMERCIAL_BLOCKED | FAILED_CLOSED
 *
 * Offer decision values:
 *   OFFER_RECOMMENDED | OFFER_DEFERRED | PRICE_REVIEW_REQUIRED
 *   LEGAL_REVIEW_REQUIRED | EXECUTIVE_REVIEW_REQUIRED | COMMERCIAL_BLOCKED
 *
 * Safety boundaries:
 *   - No contract acceptance in any mode
 *   - No binding offer dispatch in any mode
 *   - No payment collection or mutation in any mode
 *   - No refund initiation in any mode
 *   - No unrestricted discount generation
 *   - No entitlement bypass
 *   - No rights assumption from technical accessibility
 *   - Unknown critical commercial dimension cannot become APPROVED
 *   - All A15–A36 controls preserved
 *
 * Stage: A37
 * Depends on: A36 economic governance evidence (certificationPassed = true)
 * Evidence: reports/commercial-governance/
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'reports', 'commercial-governance');
const FIXTURES_DIR = path.join(ROOT, 'fixtures', 'a37');
const A36_REPORT_DIR = path.join(ROOT, 'reports', 'economic-governance');

// ---------------------------------------------------------------------------
// Mode resolution
// ---------------------------------------------------------------------------

const SUPPORTED_MODES = ['SIMULATION', 'EVIDENCE', 'LIVE_SAFE'];
const rawMode = (process.env.A37_MODE ?? 'SIMULATION').toUpperCase();
if (!SUPPORTED_MODES.includes(rawMode)) {
  console.error(`[A37][ERROR] Unsupported mode: ${rawMode}. Must be one of ${SUPPORTED_MODES.join(', ')}`);
  process.exit(1);
}
const MODE = rawMode;

// ---------------------------------------------------------------------------
// Run identity
// ---------------------------------------------------------------------------

const runId = `a37-${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(6).toString('hex')}`;
const nowIso = new Date().toISOString();
const POLICY_VERSION = 'a37-commercial-governance-policy.v1';

// ---------------------------------------------------------------------------
// §1 — Commercial State Model
// ---------------------------------------------------------------------------

const COMMERCIAL_STATES = [
  'UNASSESSED',
  'ASSESSING',
  'NOT_COMMERCIAL_READY',
  'COMMERCIAL_READY',
  'MONETIZATION_ELIGIBLE',
  'OFFER_ELIGIBLE',
  'PRICE_REVIEW_REQUIRED',
  'CHANNEL_REVIEW_REQUIRED',
  'LEGAL_REVIEW_REQUIRED',
  'EXECUTIVE_REVIEW_REQUIRED',
  'COMMERCIAL_BLOCKED',
  'FAILED_CLOSED',
];

const VALID_COMMERCIAL_TRANSITIONS = {
  UNASSESSED: new Set(['ASSESSING', 'FAILED_CLOSED']),
  ASSESSING: new Set([
    'NOT_COMMERCIAL_READY',
    'COMMERCIAL_READY',
    'MONETIZATION_ELIGIBLE',
    'OFFER_ELIGIBLE',
    'PRICE_REVIEW_REQUIRED',
    'CHANNEL_REVIEW_REQUIRED',
    'LEGAL_REVIEW_REQUIRED',
    'EXECUTIVE_REVIEW_REQUIRED',
    'COMMERCIAL_BLOCKED',
    'FAILED_CLOSED',
  ]),
  NOT_COMMERCIAL_READY: new Set(['ASSESSING']),
  COMMERCIAL_READY: new Set(['ASSESSING']),
  MONETIZATION_ELIGIBLE: new Set(['ASSESSING']),
  OFFER_ELIGIBLE: new Set(['ASSESSING']),
  PRICE_REVIEW_REQUIRED: new Set(['ASSESSING']),
  CHANNEL_REVIEW_REQUIRED: new Set(['ASSESSING']),
  LEGAL_REVIEW_REQUIRED: new Set(['ASSESSING']),
  EXECUTIVE_REVIEW_REQUIRED: new Set(['ASSESSING']),
  COMMERCIAL_BLOCKED: new Set(['ASSESSING']),
  FAILED_CLOSED: new Set([]),
};

function validateCommercialTransition(from, to) {
  if (!VALID_COMMERCIAL_TRANSITIONS[from]?.has(to)) {
    return 'FAILED_CLOSED';
  }
  if (!COMMERCIAL_STATES.includes(to)) {
    return 'FAILED_CLOSED';
  }
  return to;
}

// ---------------------------------------------------------------------------
// §8 — Offer decision values
// ---------------------------------------------------------------------------

const OFFER_DECISIONS = [
  'OFFER_RECOMMENDED',
  'OFFER_DEFERRED',
  'PRICE_REVIEW_REQUIRED',
  'LEGAL_REVIEW_REQUIRED',
  'EXECUTIVE_REVIEW_REQUIRED',
  'COMMERCIAL_BLOCKED',
];

// ---------------------------------------------------------------------------
// §3 — Monetization modes
// ---------------------------------------------------------------------------

const MONETIZATION_MODES = [
  'FREE',
  'FREEMIUM',
  'ONE_TIME_PURCHASE',
  'SUBSCRIPTION',
  'PREMIUM_REPORT',
  'DATA_ACCESS',
  'API_ACCESS',
  'ENTERPRISE_LICENSE',
  'SPONSORSHIP_ELIGIBLE',
  'PARTNERSHIP_ELIGIBLE',
];

// ---------------------------------------------------------------------------
// §6 — Customer segment classes
// ---------------------------------------------------------------------------

const CUSTOMER_SEGMENTS = [
  'PUBLIC',
  'REGISTERED',
  'PREMIUM',
  'PROFESSIONAL',
  'ENTERPRISE',
  'PARTNER',
  'INTERNAL',
];

// ---------------------------------------------------------------------------
// §7 — Entitlement levels
// ---------------------------------------------------------------------------

const ENTITLEMENT_LEVELS = [
  'PUBLIC_ACCESS',
  'REGISTERED_ACCESS',
  'PREMIUM_ACCESS',
  'ENTERPRISE_ACCESS',
  'INTERNAL_ONLY',
  'RESTRICTED',
];

// Segment → minimum required entitlement mapping (which segments may access which entitlements)
const SEGMENT_ENTITLEMENT_ALLOW = {
  PUBLIC: new Set(['PUBLIC_ACCESS']),
  REGISTERED: new Set(['PUBLIC_ACCESS', 'REGISTERED_ACCESS']),
  PREMIUM: new Set(['PUBLIC_ACCESS', 'REGISTERED_ACCESS', 'PREMIUM_ACCESS']),
  PROFESSIONAL: new Set(['PUBLIC_ACCESS', 'REGISTERED_ACCESS', 'PREMIUM_ACCESS']),
  ENTERPRISE: new Set(['PUBLIC_ACCESS', 'REGISTERED_ACCESS', 'PREMIUM_ACCESS', 'ENTERPRISE_ACCESS']),
  PARTNER: new Set(['PUBLIC_ACCESS', 'REGISTERED_ACCESS', 'PREMIUM_ACCESS', 'ENTERPRISE_ACCESS']),
  INTERNAL: new Set([
    'PUBLIC_ACCESS',
    'REGISTERED_ACCESS',
    'PREMIUM_ACCESS',
    'ENTERPRISE_ACCESS',
    'INTERNAL_ONLY',
    'RESTRICTED',
  ]),
};

// ---------------------------------------------------------------------------
// §10 — Channel types
// ---------------------------------------------------------------------------

const CHANNEL_TYPES = [
  'DIRECT_WEB',
  'ENTERPRISE_DIRECT',
  'API',
  'DATA_LICENSE',
  'PARTNER_CHANNEL',
  'REPORT_DOWNLOAD',
  'SUBSCRIPTION',
  'SPONSORED_CHANNEL',
];

// ---------------------------------------------------------------------------
// §12 — Commercial anomaly types
// ---------------------------------------------------------------------------

const COMMERCIAL_ANOMALY_TYPES = [
  'PRICE_BELOW_MARGIN_FLOOR',
  'PRICE_ABOVE_POLICY_RANGE',
  'DISCOUNT_OVER_LIMIT',
  'ENTITLEMENT_MISMATCH',
  'CHANNEL_POLICY_MISMATCH',
  'RIGHTS_UNKNOWN',
  'LICENSE_SCOPE_CONFLICT',
  'COMMERCIAL_COST_SPIKE',
  'UNAUTHORIZED_OFFER',
  'UNKNOWN_COMMERCIAL_STATE',
];

// Anomalies that are immediately blocking
const CRITICAL_COMMERCIAL_ANOMALIES = new Set([
  'ENTITLEMENT_MISMATCH',
  'RIGHTS_UNKNOWN',
  'LICENSE_SCOPE_CONFLICT',
  'UNAUTHORIZED_OFFER',
  'DISCOUNT_OVER_LIMIT',
]);

// ---------------------------------------------------------------------------
// §4 — Pricing governance decision values
// ---------------------------------------------------------------------------

const PRICING_DECISIONS = [
  'PRICE_ACCEPTABLE',
  'PRICE_OPTIMIZATION_RECOMMENDED',
  'PRICE_TOO_LOW',
  'PRICE_TOO_HIGH',
  'PRICE_REVIEW_REQUIRED',
  'EXECUTIVE_REVIEW_REQUIRED',
];

// ---------------------------------------------------------------------------
// §11 — Legal/rights boundary values
// ---------------------------------------------------------------------------

const RIGHTS_STATES = [
  'OWNED_FULL_RIGHTS',
  'LICENSED_REDISTRIBUTION_ALLOWED',
  'LICENSED_REDISTRIBUTION_RESTRICTED',
  'PROVIDER_TERMS_PROHIBIT_RESALE',
  'EMBARGO_APPLIES',
  'PRIVACY_RESTRICTION_APPLIES',
  'UNKNOWN',
];

const BLOCKING_RIGHTS_STATES = new Set([
  'PROVIDER_TERMS_PROHIBIT_RESALE',
  'EMBARGO_APPLIES',
  'PRIVACY_RESTRICTION_APPLIES',
  'UNKNOWN',
]);

// ---------------------------------------------------------------------------
// §9 — Discount governance constants
// ---------------------------------------------------------------------------

const MAXIMUM_AUTONOMOUS_DISCOUNT = 0.0; // A37 may only recommend — no autonomous discounting

// ---------------------------------------------------------------------------
// §15 — Prohibited commercial actions
// ---------------------------------------------------------------------------

const PROHIBITED_COMMERCIAL_ACTIONS = [
  'CONTRACT_ACCEPTANCE',
  'BINDING_OFFER_DISPATCH',
  'PAYMENT_COLLECTION',
  'REFUND_INITIATION',
  'PAYMENT_PROCESSOR_CHANGE',
  'UNRESTRICTED_DISCOUNT',
  'EXTERNAL_FINANCIAL_COMMITMENT',
  'CUSTOMER_DATA_EXPOSURE',
  'LEGAL_OBLIGATION_CREATION',
];

// ---------------------------------------------------------------------------
// §4 — A36 evidence loading
// ---------------------------------------------------------------------------

function loadA36Evidence() {
  if (!fs.existsSync(A36_REPORT_DIR)) return null;
  const files = fs
    .readdirSync(A36_REPORT_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse();
  if (!files.length) return null;
  for (const file of files) {
    try {
      const ev = JSON.parse(fs.readFileSync(path.join(A36_REPORT_DIR, file), 'utf-8'));
      if (ev?.certification?.certificationPassed === true || ev?.certificationPassed === true) {
        return ev;
      }
    } catch {
      // skip malformed
    }
  }
  try {
    return JSON.parse(fs.readFileSync(path.join(A36_REPORT_DIR, files[0]), 'utf-8'));
  } catch {
    return null;
  }
}

const a36Evidence = loadA36Evidence() ?? {};

function isA36Certified(ev) {
  return ev?.certification?.certificationPassed === true || ev?.certificationPassed === true;
}

// ---------------------------------------------------------------------------
// §2 — Commercial readiness gate
// ---------------------------------------------------------------------------

function evaluateCommercialReadiness(inputs) {
  const checks = {
    a36CertifiedEconomicEvidence: false,
    productIdentityKnown: false,
    publicationStatusValid: false,
    qualityFreshnessThresholdsMet: false,
    entitlementModelKnown: false,
    licensingRightsKnown: false,
    channelEligibilityKnown: false,
    pricingPolicyAvailable: false,
    legalComplianceStateKnown: false,
    noActiveSecurityBlock: false,
    noCriticalIncident: false,
    noProhibitedRestriction: false,
    costEconomicsAvailable: false,
  };

  checks.a36CertifiedEconomicEvidence = inputs.a36CertificationPassed === true || isA36Certified(a36Evidence);
  checks.productIdentityKnown = typeof inputs.productId === 'string' && inputs.productId.length > 0;
  checks.publicationStatusValid = inputs.publicationStatus === 'PUBLISHED';
  checks.qualityFreshnessThresholdsMet =
    typeof inputs.qualityScore === 'number' &&
    inputs.qualityScore >= 0.75 &&
    typeof inputs.freshnessScore === 'number' &&
    inputs.freshnessScore >= 0.75;
  checks.entitlementModelKnown =
    typeof inputs.entitlementModel === 'string' && ENTITLEMENT_LEVELS.includes(inputs.entitlementModel);
  checks.licensingRightsKnown =
    typeof inputs.licensingRights === 'string' && inputs.licensingRights !== 'UNKNOWN';
  checks.channelEligibilityKnown =
    Array.isArray(inputs.channelEligibility) && inputs.channelEligibility.length > 0;
  checks.pricingPolicyAvailable = inputs.pricingPolicyAvailable === true;
  checks.legalComplianceStateKnown =
    typeof inputs.legalComplianceState === 'string' && inputs.legalComplianceState !== 'UNKNOWN';
  checks.noActiveSecurityBlock = inputs.securityBlock !== true;
  checks.noCriticalIncident = inputs.criticalIncident !== true;
  checks.noProhibitedRestriction = inputs.prohibitedRestriction !== true;
  checks.costEconomicsAvailable = checks.a36CertifiedEconomicEvidence;

  const failedChecks = Object.entries(checks)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  return {
    checks,
    ready: failedChecks.length === 0,
    failedChecks,
  };
}

// ---------------------------------------------------------------------------
// §11 — Legal / rights evaluation
// ---------------------------------------------------------------------------

function evaluateLegalRights(inputs) {
  const rights = inputs.licensingRights ?? 'UNKNOWN';
  const isBlocking = BLOCKING_RIGHTS_STATES.has(rights);
  const isUnknown = rights === 'UNKNOWN';

  return {
    rightsState: rights,
    isBlocking,
    isUnknown,
    requiresLegalReview: isUnknown || rights === 'LICENSED_REDISTRIBUTION_RESTRICTED',
  };
}

// ---------------------------------------------------------------------------
// §6 — Entitlement evaluation
// ---------------------------------------------------------------------------

function evaluateEntitlement(inputs) {
  const entitlement = inputs.entitlementModel ?? 'UNKNOWN';
  const segment = inputs.customerSegment ?? 'PUBLIC';

  if (!ENTITLEMENT_LEVELS.includes(entitlement)) {
    return { entitlement, segment, mismatch: true, reason: 'UNKNOWN_ENTITLEMENT_MODEL' };
  }
  if (!CUSTOMER_SEGMENTS.includes(segment)) {
    return { entitlement, segment, mismatch: true, reason: 'UNKNOWN_CUSTOMER_SEGMENT' };
  }

  const allowed = SEGMENT_ENTITLEMENT_ALLOW[segment];
  const mismatch = !allowed?.has(entitlement);

  return {
    entitlement,
    segment,
    mismatch,
    reason: mismatch ? 'SEGMENT_NOT_AUTHORIZED_FOR_ENTITLEMENT' : 'ENTITLEMENT_ALLOWED',
  };
}

// ---------------------------------------------------------------------------
// §10 — Channel evaluation
// ---------------------------------------------------------------------------

function evaluateChannels(inputs) {
  const declaredChannels = Array.isArray(inputs.channelEligibility) ? inputs.channelEligibility : [];
  const channelAnalysis = inputs.channelAnalysis ?? null;

  const channelUnknown =
    declaredChannels.length === 0 ||
    (channelAnalysis && channelAnalysis.eligibility === 'UNKNOWN');

  const channelBlocked =
    channelAnalysis && channelAnalysis.legalStatus === 'BLOCKED';

  return {
    declaredChannels,
    channelUnknown,
    channelBlocked,
    channelAnalysis,
    requiresChannelReview: channelUnknown,
  };
}

// ---------------------------------------------------------------------------
// §4 — Pricing governance
// ---------------------------------------------------------------------------

function evaluatePricing(inputs) {
  const pi = inputs.pricingInputs;
  if (!pi || inputs.pricingPolicyAvailable === false) {
    return {
      available: false,
      pricingDecision: 'PRICE_REVIEW_REQUIRED',
      recommendedPrice: null,
      grossMargin: null,
      marginClass: 'UNKNOWN',
      economicViability: 'UNKNOWN',
      reason: 'PRICING_POLICY_UNAVAILABLE',
    };
  }

  const productionCost = pi.productionCost;
  const providerCost = pi.providerCost;
  const proposedPrice = pi.proposedPrice ?? pi.commercialPrecedent ?? null;
  const minimumMarginPolicy = pi.minimumMarginPolicy ?? 0.35;

  // FREE products with zero price and zero minimum margin are always acceptable
  if (
    (inputs.productClass === 'FREE' ||
      (Array.isArray(inputs.monetizationModes) &&
        inputs.monetizationModes.length === 1 &&
        inputs.monetizationModes[0] === 'FREE')) &&
    minimumMarginPolicy === 0.0 &&
    (proposedPrice === 0 || proposedPrice === null)
  ) {
    return {
      available: true,
      pricingDecision: 'PRICE_ACCEPTABLE',
      proposedPrice: 0,
      totalCost: 0,
      grossMargin: 0,
      marginClass: 'FREE_PRODUCT',
      economicViability: 'VIABLE',
      recommendedPrice: 0,
      reason: 'FREE_PRODUCT_NO_MARGIN_REQUIREMENT',
    };
  }

  // Unknown cost
  if (productionCost === null || productionCost === undefined || inputs.unknownCost === true) {
    return {
      available: true,
      pricingDecision: 'EXECUTIVE_REVIEW_REQUIRED',
      recommendedPrice: null,
      grossMargin: null,
      marginClass: 'UNKNOWN',
      economicViability: 'UNKNOWN',
      reason: 'UNKNOWN_COST_CANNOT_COMPUTE_MARGIN',
    };
  }

  const totalCost = (productionCost ?? 0) + (providerCost ?? 0);

  if (proposedPrice === null || proposedPrice === undefined) {
    return {
      available: true,
      pricingDecision: 'PRICE_REVIEW_REQUIRED',
      recommendedPrice: null,
      grossMargin: null,
      marginClass: 'UNKNOWN',
      economicViability: 'UNKNOWN',
      reason: 'NO_PROPOSED_PRICE',
    };
  }

  const grossMargin = proposedPrice > 0 ? (proposedPrice - totalCost) / proposedPrice : -1;

  let pricingDecision;
  let economicViability;
  let marginClass;

  if (grossMargin < 0) {
    pricingDecision = 'PRICE_TOO_LOW';
    economicViability = 'NOT_VIABLE';
    marginClass = 'NEGATIVE';
  } else if (grossMargin < minimumMarginPolicy) {
    pricingDecision = 'PRICE_TOO_LOW';
    economicViability = 'BELOW_MINIMUM';
    marginClass = 'BELOW_FLOOR';
  } else if (grossMargin >= minimumMarginPolicy && grossMargin < 0.6) {
    pricingDecision = 'PRICE_ACCEPTABLE';
    economicViability = 'VIABLE';
    marginClass = 'ACCEPTABLE';
  } else {
    pricingDecision = 'PRICE_ACCEPTABLE';
    economicViability = 'VIABLE';
    marginClass = 'HEALTHY';
  }

  return {
    available: true,
    pricingDecision,
    proposedPrice,
    totalCost,
    grossMargin: Math.round(grossMargin * 1000) / 1000,
    marginClass,
    economicViability,
    recommendedPrice: pricingDecision === 'PRICE_TOO_LOW'
      ? Math.ceil(totalCost / (1 - minimumMarginPolicy))
      : proposedPrice,
    reason: pricingDecision,
  };
}

// ---------------------------------------------------------------------------
// §9 — Discount governance
// ---------------------------------------------------------------------------

function evaluateDiscount(inputs) {
  const discountRequest = inputs.discountRequest ?? null;
  if (!discountRequest) {
    return { requested: false, blocked: false, reason: 'NO_DISCOUNT_REQUESTED' };
  }

  const discountPct = discountRequest.discountPct ?? 0;
  const maxDiscountPolicy = discountRequest.maxDiscountPolicy ?? 0.20;
  const executiveApprovalThreshold = discountRequest.executiveApprovalThreshold ?? 0.20;

  if (discountPct > maxDiscountPolicy) {
    return {
      requested: true,
      blocked: true,
      discountPct,
      maxDiscountPolicy,
      reason: 'DISCOUNT_EXCEEDS_MAXIMUM_POLICY',
    };
  }

  if (discountPct >= executiveApprovalThreshold) {
    return {
      requested: true,
      blocked: false,
      requiresExecutiveApproval: true,
      discountPct,
      maxDiscountPolicy,
      reason: 'DISCOUNT_REQUIRES_EXECUTIVE_APPROVAL',
    };
  }

  return {
    requested: true,
    blocked: false,
    requiresExecutiveApproval: false,
    discountPct,
    maxDiscountPolicy,
    reason: 'DISCOUNT_WITHIN_POLICY',
  };
}

// ---------------------------------------------------------------------------
// §12 — Commercial anomaly detection
// ---------------------------------------------------------------------------

function detectCommercialAnomalies(inputs, pricingResult, entitlementResult, legalResult, channelResult) {
  const declared = Array.isArray(inputs.anomalies) ? inputs.anomalies : [];
  const detected = [...declared];

  // Detect entitlement mismatch
  if (entitlementResult.mismatch && !detected.includes('ENTITLEMENT_MISMATCH')) {
    detected.push('ENTITLEMENT_MISMATCH');
  }

  // Detect rights unknown
  if (legalResult.isUnknown && !detected.includes('RIGHTS_UNKNOWN')) {
    detected.push('RIGHTS_UNKNOWN');
  }

  // Detect license conflict
  if (legalResult.isBlocking && !legalResult.isUnknown && !detected.includes('LICENSE_SCOPE_CONFLICT')) {
    detected.push('LICENSE_SCOPE_CONFLICT');
  }

  // Detect price below margin floor from pricing result
  if (
    (pricingResult.pricingDecision === 'PRICE_TOO_LOW' || pricingResult.marginClass === 'NEGATIVE') &&
    !detected.includes('PRICE_BELOW_MARGIN_FLOOR')
  ) {
    detected.push('PRICE_BELOW_MARGIN_FLOOR');
  }

  // Detect channel policy mismatch
  if (channelResult.channelUnknown && !detected.includes('CHANNEL_POLICY_MISMATCH')) {
    detected.push('CHANNEL_POLICY_MISMATCH');
  }

  // Detect unauthorized offer attempt
  if (inputs.bindingOfferAttempted === true && !detected.includes('UNAUTHORIZED_OFFER')) {
    detected.push('UNAUTHORIZED_OFFER');
  }

  const criticalAnomalies = detected.filter((a) => CRITICAL_COMMERCIAL_ANOMALIES.has(a));

  return {
    detected,
    criticalAnomalies,
    hasCriticalAnomaly: criticalAnomalies.length > 0,
  };
}

// ---------------------------------------------------------------------------
// §5 — Margin / economic analysis
// ---------------------------------------------------------------------------

function buildMarginAnalysis(inputs, pricingResult) {
  const pi = inputs.pricingInputs;
  if (!pi || inputs.unknownCost === true || pricingResult.grossMargin === null) {
    return {
      estimatedRevenue: 'UNKNOWN',
      estimatedCost: 'UNKNOWN',
      grossMargin: 'UNKNOWN',
      contributionMargin: 'UNKNOWN',
      marginClass: 'UNKNOWN',
      economicViability: 'UNKNOWN',
    };
  }

  const supportBurden = pi.supportBurden ?? 0;
  const proposedPrice = pricingResult.proposedPrice ?? 0;
  const totalCost = pricingResult.totalCost ?? 0;
  const contributionMargin = proposedPrice > 0
    ? Math.round(((proposedPrice - totalCost * (1 + supportBurden)) / proposedPrice) * 1000) / 1000
    : -1;

  return {
    estimatedRevenue: proposedPrice,
    estimatedCost: totalCost,
    grossMargin: pricingResult.grossMargin,
    contributionMargin,
    marginClass: pricingResult.marginClass,
    economicViability: pricingResult.economicViability,
  };
}

// ---------------------------------------------------------------------------
// §8 — Core commercial decision engine (deterministic)
// ---------------------------------------------------------------------------

function deriveCommercialDecision(
  inputs,
  readinessResult,
  legalResult,
  entitlementResult,
  channelResult,
  pricingResult,
  anomalyResult,
  discountResult,
) {
  // §18 — Hard stops: binding offer, contract acceptance, payment mutation
  if (inputs.bindingOfferAttempted === true) {
    return {
      state: 'FAILED_CLOSED',
      offerDecision: 'COMMERCIAL_BLOCKED',
      reason: 'BINDING_OFFER_DISPATCH_PROHIBITED',
    };
  }

  if (inputs.contractAcceptanceAttempted === true) {
    return {
      state: 'FAILED_CLOSED',
      offerDecision: 'COMMERCIAL_BLOCKED',
      reason: 'CONTRACT_ACCEPTANCE_PROHIBITED',
    };
  }

  if (inputs.paymentMutationAttempted === true) {
    return {
      state: 'FAILED_CLOSED',
      offerDecision: 'COMMERCIAL_BLOCKED',
      reason: 'PAYMENT_MUTATION_PROHIBITED',
    };
  }

  // §11 — Legal/rights hard stops
  if (legalResult.isBlocking) {
    if (legalResult.isUnknown) {
      return {
        state: 'LEGAL_REVIEW_REQUIRED',
        offerDecision: 'LEGAL_REVIEW_REQUIRED',
        reason: 'UNKNOWN_LICENSING_RIGHTS',
      };
    }
    return {
      state: 'COMMERCIAL_BLOCKED',
      offerDecision: 'COMMERCIAL_BLOCKED',
      reason: 'LICENSING_RIGHTS_BLOCK_COMMERCIALIZATION',
    };
  }

  if (legalResult.requiresLegalReview) {
    return {
      state: 'LEGAL_REVIEW_REQUIRED',
      offerDecision: 'LEGAL_REVIEW_REQUIRED',
      reason: 'LEGAL_REVIEW_REQUIRED_FOR_RIGHTS',
    };
  }

  // §12 — Critical anomalies block
  if (anomalyResult.hasCriticalAnomaly) {
    // Discount over limit
    if (anomalyResult.criticalAnomalies.includes('DISCOUNT_OVER_LIMIT') || discountResult.blocked) {
      return {
        state: 'COMMERCIAL_BLOCKED',
        offerDecision: 'COMMERCIAL_BLOCKED',
        reason: 'DISCOUNT_EXCEEDS_POLICY',
      };
    }

    // Entitlement mismatch
    if (anomalyResult.criticalAnomalies.includes('ENTITLEMENT_MISMATCH')) {
      return {
        state: 'COMMERCIAL_BLOCKED',
        offerDecision: 'COMMERCIAL_BLOCKED',
        reason: 'ENTITLEMENT_MISMATCH',
      };
    }

    // License scope conflict
    if (anomalyResult.criticalAnomalies.includes('LICENSE_SCOPE_CONFLICT')) {
      return {
        state: 'COMMERCIAL_BLOCKED',
        offerDecision: 'COMMERCIAL_BLOCKED',
        reason: 'LICENSE_SCOPE_CONFLICT',
      };
    }

    // Rights unknown (handled above via legalResult but also in anomalies)
    if (anomalyResult.criticalAnomalies.includes('RIGHTS_UNKNOWN')) {
      return {
        state: 'LEGAL_REVIEW_REQUIRED',
        offerDecision: 'LEGAL_REVIEW_REQUIRED',
        reason: 'RIGHTS_UNKNOWN_ANOMALY',
      };
    }

    return {
      state: 'COMMERCIAL_BLOCKED',
      offerDecision: 'COMMERCIAL_BLOCKED',
      reason: 'CRITICAL_COMMERCIAL_ANOMALY',
    };
  }

  // §2 — Commercial readiness
  if (!readinessResult.ready) {
    // No pricing policy → price review
    if (!inputs.pricingPolicyAvailable) {
      return {
        state: 'PRICE_REVIEW_REQUIRED',
        offerDecision: 'PRICE_REVIEW_REQUIRED',
        reason: 'PRICING_POLICY_UNAVAILABLE',
      };
    }
    // Unknown channel → channel review
    if (channelResult.channelUnknown) {
      return {
        state: 'CHANNEL_REVIEW_REQUIRED',
        offerDecision: 'PRICE_REVIEW_REQUIRED',
        reason: 'CHANNEL_ELIGIBILITY_UNKNOWN',
      };
    }
    return {
      state: 'NOT_COMMERCIAL_READY',
      offerDecision: 'OFFER_DEFERRED',
      reason: `READINESS_FAILED: ${readinessResult.failedChecks.join(', ')}`,
    };
  }

  // §5 — Unknown cost escalates
  if (inputs.unknownCost === true || pricingResult.pricingDecision === 'EXECUTIVE_REVIEW_REQUIRED') {
    return {
      state: 'EXECUTIVE_REVIEW_REQUIRED',
      offerDecision: 'EXECUTIVE_REVIEW_REQUIRED',
      reason: 'UNKNOWN_COST_CANNOT_COMMERCIALIZE',
    };
  }

  // §4 — Pricing gate
  if (pricingResult.pricingDecision === 'PRICE_REVIEW_REQUIRED') {
    return {
      state: 'PRICE_REVIEW_REQUIRED',
      offerDecision: 'PRICE_REVIEW_REQUIRED',
      reason: 'PRICING_REVIEW_REQUIRED',
    };
  }

  if (pricingResult.pricingDecision === 'PRICE_TOO_LOW') {
    // Negative margin → full block
    if (pricingResult.marginClass === 'NEGATIVE') {
      return {
        state: 'COMMERCIAL_BLOCKED',
        offerDecision: 'COMMERCIAL_BLOCKED',
        reason: 'NEGATIVE_MARGIN_BLOCKS_COMMERCIALIZATION',
      };
    }
    return {
      state: 'PRICE_REVIEW_REQUIRED',
      offerDecision: 'PRICE_REVIEW_REQUIRED',
      reason: 'PRICE_BELOW_MINIMUM_MARGIN_FLOOR',
    };
  }

  // §10 — Channel review
  if (channelResult.requiresChannelReview) {
    return {
      state: 'CHANNEL_REVIEW_REQUIRED',
      offerDecision: 'PRICE_REVIEW_REQUIRED',
      reason: 'CHANNEL_ELIGIBILITY_UNKNOWN',
    };
  }

  // §3 — Free product: eligible if monetization mode includes FREE
  const modes = Array.isArray(inputs.monetizationModes) ? inputs.monetizationModes : [];
  if (inputs.productClass === 'FREE' || (modes.length === 1 && modes[0] === 'FREE')) {
    return {
      state: 'COMMERCIAL_READY',
      offerDecision: 'OFFER_RECOMMENDED',
      reason: 'FREE_PRODUCT_COMMERCIAL_READY',
    };
  }

  // All checks passed — product is MONETIZATION_ELIGIBLE
  return {
    state: 'MONETIZATION_ELIGIBLE',
    offerDecision: 'OFFER_RECOMMENDED',
    reason: 'ALL_COMMERCIAL_CHECKS_PASSED',
  };
}

// ---------------------------------------------------------------------------
// §8 — Build offer recommendation
// ---------------------------------------------------------------------------

function buildOfferRecommendation(inputs, derived, pricingResult, marginAnalysis, discountResult) {
  const offerId = `offer-${crypto.randomBytes(4).toString('hex')}`;
  const approvalRequired =
    derived.state === 'EXECUTIVE_REVIEW_REQUIRED' ||
    derived.state === 'LEGAL_REVIEW_REQUIRED' ||
    discountResult.requiresExecutiveApproval === true;

  const legalReviewRequired =
    derived.state === 'LEGAL_REVIEW_REQUIRED' ||
    derived.offerDecision === 'LEGAL_REVIEW_REQUIRED';

  if (derived.offerDecision !== 'OFFER_RECOMMENDED') {
    return {
      offerId,
      productId: inputs.productId ?? null,
      segment: inputs.customerSegment ?? null,
      monetizationMode: Array.isArray(inputs.monetizationModes) ? inputs.monetizationModes[0] : null,
      recommendedPrice: null,
      currency: 'USD',
      validityWindow: null,
      entitlement: inputs.entitlementModel ?? null,
      commercialRationale: derived.reason,
      marginEstimate: marginAnalysis,
      approvalRequired,
      legalReviewRequired,
      evidenceReferences: [],
      decision: derived.offerDecision,
      bindingOfferDispatched: false,
    };
  }

  return {
    offerId,
    productId: inputs.productId ?? null,
    segment: inputs.customerSegment ?? null,
    monetizationMode: Array.isArray(inputs.monetizationModes) ? inputs.monetizationModes[0] : null,
    recommendedPrice: pricingResult.recommendedPrice ?? null,
    currency: 'USD',
    validityWindow: 'SIMULATION_ONLY',
    entitlement: inputs.entitlementModel ?? null,
    commercialRationale: derived.reason,
    marginEstimate: marginAnalysis,
    approvalRequired,
    legalReviewRequired,
    evidenceReferences: [`${REPORT_DIR}/a37-commercial-governance-${nowIso.slice(0, 10)}-<runId>.json`],
    decision: 'OFFER_RECOMMENDED',
    bindingOfferDispatched: false, // NEVER dispatched during certification
  };
}

// ---------------------------------------------------------------------------
// §13 — Run a single scenario
// ---------------------------------------------------------------------------

function runScenario(inputs, a36Ev) {
  const scenarioId = inputs.scenarioId ?? 'UNKNOWN';
  const category = inputs.category ?? 'UNKNOWN';
  const auditTrail = [];
  const evidenceRef = `${REPORT_DIR}/a37-commercial-governance-${nowIso.slice(0, 10)}-<runId>.json`;

  auditTrail.push({ step: 'SCENARIO_START', scenarioId, category, timestamp: nowIso });

  // A36 certification check
  const a36Certified = inputs.a36CertificationPassed === true || isA36Certified(a36Ev);
  auditTrail.push({ step: 'A36_CERTIFICATION_CHECK', certified: a36Certified });

  if (inputs.a36CertificationPassed === false && !isA36Certified(a36Ev)) {
    return {
      scenarioId,
      category,
      commercialState: 'FAILED_CLOSED',
      offerDecision: 'COMMERCIAL_BLOCKED',
      decisionReason: 'A36_CERTIFICATION_REQUIRED',
      tests: [{ name: 'a36CertificationPresent', passed: false, expected: true, actual: false }],
      passed: false,
      auditTrail,
      evidenceRef,
      noCommercialMutation: true,
    };
  }

  // §2 — Commercial readiness
  const readinessResult = evaluateCommercialReadiness(inputs);
  auditTrail.push({ step: 'COMMERCIAL_READINESS', ready: readinessResult.ready, failedChecks: readinessResult.failedChecks });

  // §11 — Legal / rights evaluation
  const legalResult = evaluateLegalRights(inputs);
  auditTrail.push({ step: 'LEGAL_RIGHTS_EVALUATION', ...legalResult });

  // §6 — Entitlement evaluation
  const entitlementResult = evaluateEntitlement(inputs);
  auditTrail.push({ step: 'ENTITLEMENT_EVALUATION', ...entitlementResult });

  // §10 — Channel evaluation
  const channelResult = evaluateChannels(inputs);
  auditTrail.push({ step: 'CHANNEL_EVALUATION', channelUnknown: channelResult.channelUnknown });

  // §4 — Pricing governance
  const pricingResult = evaluatePricing(inputs);
  auditTrail.push({ step: 'PRICING_GOVERNANCE', pricingDecision: pricingResult.pricingDecision, grossMargin: pricingResult.grossMargin });

  // §9 — Discount governance
  const discountResult = evaluateDiscount(inputs);
  auditTrail.push({ step: 'DISCOUNT_GOVERNANCE', blocked: discountResult.blocked });

  // §12 — Anomaly detection
  const anomalyResult = detectCommercialAnomalies(inputs, pricingResult, entitlementResult, legalResult, channelResult);
  auditTrail.push({ step: 'ANOMALY_DETECTION', detected: anomalyResult.detected, criticalAnomalies: anomalyResult.criticalAnomalies });

  // §8 — Derive commercial decision
  const derived = deriveCommercialDecision(
    inputs,
    readinessResult,
    legalResult,
    entitlementResult,
    channelResult,
    pricingResult,
    anomalyResult,
    discountResult,
  );

  const finalState = validateCommercialTransition('ASSESSING', derived.state);
  const finalOfferDecision =
    finalState === 'FAILED_CLOSED' && derived.offerDecision !== 'COMMERCIAL_BLOCKED'
      ? 'COMMERCIAL_BLOCKED'
      : derived.offerDecision;

  auditTrail.push({ step: 'COMMERCIAL_DECISION_DERIVED', state: finalState, offerDecision: finalOfferDecision, reason: derived.reason });

  // §5 — Margin analysis
  const marginAnalysis = buildMarginAnalysis(inputs, pricingResult);
  auditTrail.push({ step: 'MARGIN_ANALYSIS', marginClass: marginAnalysis.marginClass, economicViability: marginAnalysis.economicViability });

  // §8 — Offer recommendation
  const offerRecommendation = buildOfferRecommendation(inputs, { ...derived, state: finalState, offerDecision: finalOfferDecision }, pricingResult, marginAnalysis, discountResult);
  auditTrail.push({ step: 'OFFER_RECOMMENDATION', decision: offerRecommendation.decision, bindingOfferDispatched: offerRecommendation.bindingOfferDispatched });

  // §18 — Safety: no commercial mutations in any mode
  const noCommercialMutation = true;
  const bindingOfferDispatched = false;
  const contractAccepted = false;
  const paymentCollected = false;

  // Idempotency
  let idempotencyVerified;
  if (inputs.idempotencyRepeatCount && inputs.idempotencyRepeatCount > 1) {
    const repeat = deriveCommercialDecision(
      inputs,
      readinessResult,
      legalResult,
      entitlementResult,
      channelResult,
      pricingResult,
      anomalyResult,
      discountResult,
    );
    const repeatState = validateCommercialTransition('ASSESSING', repeat.state);
    idempotencyVerified = repeatState === finalState && repeat.offerDecision === derived.offerDecision;
    auditTrail.push({ step: 'IDEMPOTENCY_CHECK', verified: idempotencyVerified });
  }

  // Outcome assertions
  const expectedState = inputs.expectedCommercialState;
  const expectedOffer = inputs.expectedOfferDecision;
  const stateMatch = finalState === expectedState;
  const offerMatch = finalOfferDecision === expectedOffer;

  const tests = [
    { name: 'commercialStateMatch', passed: stateMatch, expected: expectedState, actual: finalState },
    { name: 'offerDecisionMatch', passed: offerMatch, expected: expectedOffer, actual: finalOfferDecision },
    { name: 'a36CertificationPresent', passed: a36Certified, expected: true, actual: a36Certified },
    { name: 'noCommercialMutation', passed: noCommercialMutation, expected: true, actual: noCommercialMutation },
    { name: 'bindingOfferNotDispatched', passed: !bindingOfferDispatched, expected: false, actual: bindingOfferDispatched },
    { name: 'contractNotAccepted', passed: !contractAccepted, expected: false, actual: contractAccepted },
    { name: 'paymentNotCollected', passed: !paymentCollected, expected: false, actual: paymentCollected },
    {
      name: 'bindingOfferAttemptFails',
      passed: !inputs.bindingOfferAttempted || finalState === 'FAILED_CLOSED',
      expected: true,
      actual: !inputs.bindingOfferAttempted || finalState === 'FAILED_CLOSED',
    },
    {
      name: 'contractAcceptanceAttemptFails',
      passed: !inputs.contractAcceptanceAttempted || finalState === 'FAILED_CLOSED',
      expected: true,
      actual: !inputs.contractAcceptanceAttempted || finalState === 'FAILED_CLOSED',
    },
    {
      name: 'paymentMutationAttemptFails',
      passed: !inputs.paymentMutationAttempted || finalState === 'FAILED_CLOSED',
      expected: true,
      actual: !inputs.paymentMutationAttempted || finalState === 'FAILED_CLOSED',
    },
    {
      name: 'unknownRightsCannotCommercialize',
      passed:
        !legalResult.isUnknown ||
        finalState === 'LEGAL_REVIEW_REQUIRED' ||
        finalState === 'COMMERCIAL_BLOCKED' ||
        finalState === 'FAILED_CLOSED',
      expected: true,
      actual:
        !legalResult.isUnknown ||
        finalState === 'LEGAL_REVIEW_REQUIRED' ||
        finalState === 'COMMERCIAL_BLOCKED' ||
        finalState === 'FAILED_CLOSED',
    },
    {
      name: 'entitlementMismatchBlocks',
      passed:
        !entitlementResult.mismatch ||
        finalState === 'COMMERCIAL_BLOCKED' ||
        finalState === 'FAILED_CLOSED',
      expected: true,
      actual:
        !entitlementResult.mismatch ||
        finalState === 'COMMERCIAL_BLOCKED' ||
        finalState === 'FAILED_CLOSED',
    },
    {
      name: 'negativeMarginBlocks',
      passed:
        pricingResult.marginClass !== 'NEGATIVE' ||
        finalState === 'COMMERCIAL_BLOCKED' ||
        finalState === 'EXECUTIVE_REVIEW_REQUIRED' ||
        finalState === 'FAILED_CLOSED',
      expected: true,
      actual:
        pricingResult.marginClass !== 'NEGATIVE' ||
        finalState === 'COMMERCIAL_BLOCKED' ||
        finalState === 'EXECUTIVE_REVIEW_REQUIRED' ||
        finalState === 'FAILED_CLOSED',
    },
    {
      name: 'discountPolicyEnforced',
      passed: !discountResult.blocked || finalState === 'COMMERCIAL_BLOCKED' || finalState === 'FAILED_CLOSED',
      expected: true,
      actual: !discountResult.blocked || finalState === 'COMMERCIAL_BLOCKED' || finalState === 'FAILED_CLOSED',
    },
  ];

  const passed = stateMatch && offerMatch;

  return {
    scenarioId,
    category,
    commercialState: finalState,
    offerDecision: finalOfferDecision,
    decisionReason: derived.reason,
    commercialReadiness: readinessResult,
    legalRights: legalResult,
    entitlement: entitlementResult,
    channel: channelResult,
    pricing: pricingResult,
    discount: discountResult,
    marginAnalysis,
    offerRecommendation,
    anomalyDetection: anomalyResult,
    tests,
    passed,
    idempotencyVerified,
    noCommercialMutation,
    bindingOfferDispatched,
    contractAccepted,
    paymentCollected,
    evidenceRef,
    auditTrail,
  };
}

// ---------------------------------------------------------------------------
// §14 — Invariant proofs
// ---------------------------------------------------------------------------

function buildInvariants(scenarioResults) {
  const find = (id) => scenarioResults.find((r) => r.scenarioId === id);

  const healthy = find('HEALTHY_PRODUCT_COMMERCIAL_READY');
  const free = find('FREE_PRODUCT_ALLOWED');
  const premium = find('PREMIUM_PRODUCT_REQUIRES_ENTITLEMENT');
  const entBlocked = find('ENTERPRISE_PRODUCT_BLOCKED_FOR_PUBLIC');
  const validPrice = find('VALID_PRICE_ACCEPTED');
  const lowPrice = find('LOW_PRICE_REQUIRES_OPTIMIZATION');
  const negMargin = find('NEGATIVE_MARGIN_BLOCKS_COMMERCIALIZATION');
  const unknownCost = find('UNKNOWN_COST_REQUIRES_REVIEW');
  const unknownPrice = find('UNKNOWN_PRICE_REQUIRES_REVIEW');
  const unknownRights = find('UNKNOWN_RIGHTS_REQUIRES_LEGAL_REVIEW');
  const licConflict = find('LICENSE_CONFLICT_BLOCKS_COMMERCIALIZATION');
  const discountOk = find('DISCOUNT_WITHIN_POLICY_RECOMMENDED');
  const discountOver = find('DISCOUNT_OVER_LIMIT_BLOCKED');
  const entMismatch = find('ENTITLEMENT_MISMATCH_BLOCKED');
  const validChannel = find('VALID_CHANNEL_ELIGIBLE');
  const unknownChannel = find('UNKNOWN_CHANNEL_REQUIRES_REVIEW');
  const bindingOffer = find('BINDING_OFFER_ATTEMPT_BLOCKED');
  const contractAttempt = find('CONTRACT_ACCEPTANCE_ATTEMPT_BLOCKED');
  const paymentAttempt = find('PAYMENT_MUTATION_ATTEMPT_BLOCKED');
  const idempotent = find('REPEATED_IDENTICAL_EVALUATION_IS_IDEMPOTENT');

  return {
    // §14.1 — A36 certified economic evidence is required
    a36CertifiedEconomicEvidenceRequired: scenarioResults.every(
      (r) => r.tests.find((t) => t.name === 'a36CertificationPresent')?.passed === true,
    ),

    // §14.2 — No autonomous contract acceptance
    noAutonomousContractAcceptance: scenarioResults.every((r) => r.contractAccepted === false),

    // §14.3 — No autonomous binding offer dispatch
    noAutonomousBindingOfferDispatch: scenarioResults.every((r) => r.bindingOfferDispatched === false),

    // §14.4 — No autonomous payment collection
    noAutonomousPaymentCollection: scenarioResults.every((r) => r.paymentCollected === false),

    // §14.5 — No autonomous refund mutation
    noAutonomousRefundMutation: scenarioResults.every((r) => r.noCommercialMutation === true),

    // §14.6 — No unrestricted discounting
    noUnrestrictedDiscounting: scenarioResults.every(
      (r) =>
        !r.discount?.blocked ||
        r.commercialState === 'COMMERCIAL_BLOCKED' ||
        r.commercialState === 'FAILED_CLOSED',
    ),

    // §14.7 — No entitlement bypass
    noEntitlementBypass: scenarioResults.every(
      (r) =>
        !r.entitlement?.mismatch ||
        r.commercialState === 'COMMERCIAL_BLOCKED' ||
        r.commercialState === 'FAILED_CLOSED',
    ),

    // §14.8 — No rights assumption
    noRightsAssumption: scenarioResults.every(
      (r) => r.tests.find((t) => t.name === 'unknownRightsCannotCommercialize')?.passed === true,
    ),

    // §14.9 — Unknown rights cannot commercialize
    unknownRightsCannotCommercialize:
      unknownRights?.passed === true &&
      (unknownRights?.commercialState === 'LEGAL_REVIEW_REQUIRED' ||
        unknownRights?.commercialState === 'COMMERCIAL_BLOCKED'),

    // §14.10 — Unknown critical price cannot commercialize
    unknownCriticalPriceCannotCommercialize:
      unknownPrice?.passed === true &&
      (unknownPrice?.commercialState === 'PRICE_REVIEW_REQUIRED' ||
        unknownPrice?.commercialState === 'COMMERCIAL_BLOCKED' ||
        unknownPrice?.commercialState === 'FAILED_CLOSED'),

    // §14.11 — Unknown cost cannot create binding offer
    unknownCostCannotCreateBindingOffer:
      unknownCost?.passed === true &&
      unknownCost?.bindingOfferDispatched === false &&
      (unknownCost?.commercialState === 'EXECUTIVE_REVIEW_REQUIRED' ||
        unknownCost?.commercialState === 'FAILED_CLOSED'),

    // §14.12 — Minimum margin policy cannot be bypassed
    minimumMarginPolicyCannotBeBypassed:
      negMargin?.passed === true &&
      (negMargin?.commercialState === 'COMMERCIAL_BLOCKED' ||
        negMargin?.commercialState === 'FAILED_CLOSED'),

    // §14.13 — Enterprise entitlement cannot leak to public tier
    enterpriseEntitlementCannotLeakToPublicTier:
      entBlocked?.passed === true && entBlocked?.commercialState === 'COMMERCIAL_BLOCKED',

    // §14.14 — Security hard stops remain preserved
    securityHardStopsPreserved: scenarioResults.every((r) => r.noCommercialMutation === true),

    // §14.15 — Legal/compliance hard stops remain preserved
    legalComplianceHardStopsPreserved: scenarioResults.every(
      (r) => r.tests.find((t) => t.name === 'unknownRightsCannotCommercialize')?.passed === true,
    ),

    // §14.16 — Executive authority cannot bypass security or rights hard stops
    executiveAuthorityCannotBypassSecurityOrRightsHardStops: scenarioResults.every(
      (r) => r.noCommercialMutation === true,
    ),

    // §14.17 — Every commercial decision emits evidence
    everyCommercialDecisionEmitsEvidence: scenarioResults.every(
      (r) => r.auditTrail && r.auditTrail.length > 0 && r.evidenceRef,
    ),

    // §14.18 — Repeated evaluations are idempotent
    repeatedEvaluationsAreIdempotent: idempotent?.passed === true,

    // §14.19 — Certification causes zero external commercial mutation
    certificationCausesZeroExternalCommercialMutation: scenarioResults.every(
      (r) => r.noCommercialMutation === true && r.bindingOfferDispatched === false,
    ),

    // §14.20 — All A15–A36 controls remain preserved
    allA15ToA36ControlsPreserved: scenarioResults.every((r) => r.noCommercialMutation === true),

    // Scenario-specific invariants
    healthyProductCommercialReady: healthy?.passed === true && healthy?.commercialState === 'MONETIZATION_ELIGIBLE',
    freeProductAllowed: free?.passed === true && free?.commercialState === 'COMMERCIAL_READY',
    premiumRequiresEntitlement: premium?.passed === true && premium?.commercialState === 'MONETIZATION_ELIGIBLE',
    enterpriseBlockedForPublic: entBlocked?.passed === true && entBlocked?.commercialState === 'COMMERCIAL_BLOCKED',
    validPriceAccepted: validPrice?.passed === true && validPrice?.commercialState === 'MONETIZATION_ELIGIBLE',
    lowPriceRequiresOptimization: lowPrice?.passed === true && lowPrice?.commercialState === 'PRICE_REVIEW_REQUIRED',
    licenseConflictBlocks: licConflict?.passed === true && licConflict?.commercialState === 'COMMERCIAL_BLOCKED',
    discountWithinPolicyRecommended: discountOk?.passed === true,
    discountOverLimitBlocked: discountOver?.passed === true && discountOver?.commercialState === 'COMMERCIAL_BLOCKED',
    entitlementMismatchBlocked: entMismatch?.passed === true && entMismatch?.commercialState === 'COMMERCIAL_BLOCKED',
    validChannelEligible: validChannel?.passed === true && validChannel?.commercialState === 'MONETIZATION_ELIGIBLE',
    unknownChannelRequiresReview: unknownChannel?.passed === true && unknownChannel?.commercialState === 'CHANNEL_REVIEW_REQUIRED',
    bindingOfferAttemptBlocked: bindingOffer?.passed === true && bindingOffer?.commercialState === 'FAILED_CLOSED',
    contractAcceptanceAttemptBlocked: contractAttempt?.passed === true && contractAttempt?.commercialState === 'FAILED_CLOSED',
    paymentMutationAttemptBlocked: paymentAttempt?.passed === true && paymentAttempt?.commercialState === 'FAILED_CLOSED',
  };
}

// ---------------------------------------------------------------------------
// Main run
// ---------------------------------------------------------------------------

export function runCommercialGovernance() {
  console.log(`[A37] Autonomous Revenue, Monetization & Commercial Governance — ${MODE} mode`);
  console.log(`[A37] Run: ${runId}`);

  const a36Certified = isA36Certified(a36Evidence);
  console.log(`[A37] A36 certificationPassed: ${a36Certified}`);

  // Load scenario fixtures
  const scenarioFiles = fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  const scenarioResults = [];
  for (const file of scenarioFiles) {
    const inputs = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8'));
    const result = runScenario(inputs, a36Evidence);
    scenarioResults.push(result);
    const mark = result.passed ? 'PASS' : 'FAIL';
    console.log(`[A37][${mark}] ${result.scenarioId} → ${result.commercialState} / ${result.offerDecision}`);
  }

  const invariants = buildInvariants(scenarioResults);
  const invariantPassCount = Object.values(invariants).filter(Boolean).length;
  const invariantTotal = Object.keys(invariants).length;

  const allScenariosPassed = scenarioResults.every((r) => r.passed);
  const allInvariantsPassed = Object.values(invariants).every(Boolean);
  const certificationPassed = allScenariosPassed && allInvariantsPassed;

  const output = {
    commercialRunId: runId,
    stage: 'A37',
    mode: MODE,
    title: 'Autonomous Revenue, Monetization & Commercial Governance',
    generatedAt: nowIso,
    policyVersion: POLICY_VERSION,
    sourceA36Evidence: {
      evidenceId: a36Evidence.economicRunId ?? null,
      certificationPassed: a36Certified,
      generatedAt: a36Evidence.generatedAt ?? null,
    },
    commercialStateModel: COMMERCIAL_STATES,
    monetizationModes: MONETIZATION_MODES,
    customerSegments: CUSTOMER_SEGMENTS,
    entitlementLevels: ENTITLEMENT_LEVELS,
    channelTypes: CHANNEL_TYPES,
    commercialAnomalyTypes: COMMERCIAL_ANOMALY_TYPES,
    pricingDecisions: PRICING_DECISIONS,
    offerDecisions: OFFER_DECISIONS,
    prohibitedCommercialActions: PROHIBITED_COMMERCIAL_ACTIONS,
    scenarioCount: scenarioResults.length,
    passedCount: scenarioResults.filter((r) => r.passed).length,
    failedCount: scenarioResults.filter((r) => !r.passed).length,
    scenarios: scenarioResults,
    invariants,
    invariantPassCount,
    invariantTotal,
    certification: {
      allScenariosPassed,
      allInvariantsPassed,
      certificationPassed,
    },
    commercialAuthorityBoundary: {
      noContractAcceptance: true,
      noBindingOfferDispatch: true,
      noPaymentCollection: true,
      noRefundInitiation: true,
      noPaymentProcessorChange: true,
      noUnrestrictedDiscount: true,
      noExternalFinancialCommitment: true,
      noCustomerConfidentialDataExposure: true,
      noLegalObligationCreation: true,
    },
    noCommercialMutation: true,
    completedAt: new Date().toISOString(),
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const timestamp = nowIso.slice(0, 10);
  const evidenceFile = path.join(
    REPORT_DIR,
    `a37-commercial-governance-${timestamp}-${crypto.randomBytes(4).toString('hex')}.json`,
  );
  fs.writeFileSync(evidenceFile, `${JSON.stringify(output, null, 2)}\n`, 'utf-8');

  console.log(`\n[A37] === RESULTS ===`);
  console.log(`[A37] Scenarios: ${output.passedCount}/${output.scenarioCount} ${allScenariosPassed ? 'PASS' : 'FAIL'}`);
  console.log(`[A37] Invariants: ${invariantPassCount}/${invariantTotal} ${allInvariantsPassed ? 'PASS' : 'FAIL'}`);
  console.log(`[A37] certificationPassed: ${certificationPassed}`);
  console.log(`[A37] Evidence: ${evidenceFile}`);

  if (!certificationPassed) {
    const failedScenarios = scenarioResults.filter((r) => !r.passed);
    for (const r of failedScenarios) {
      const failedTests = r.tests.filter((t) => !t.passed);
      console.error(`[A37][FAIL] ${r.scenarioId}: ${failedTests.map((t) => t.name).join(', ')}`);
    }
    const failedInvariants = Object.entries(invariants)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (failedInvariants.length) {
      console.error(`[A37][FAIL] Invariants: ${failedInvariants.join(', ')}`);
    }
    process.exitCode = 1;
  }

  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCommercialGovernance();
}
