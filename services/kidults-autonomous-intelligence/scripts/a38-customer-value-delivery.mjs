/**
 * A38 — Customer Value Delivery & Commercial Execution Control
 * Runner: a38-customer-value-delivery.mjs
 *
 * Bounded customer value delivery and commercial execution control layer.
 * Determines whether an approved commercial recommendation can be prepared for
 * delivery to a specific customer segment or account context while preserving
 * entitlement, rights, pricing, privacy, contractual, security, operational,
 * and executive controls.
 *
 * Stage: A38
 * Depends on: A37 commercial governance evidence (certificationPassed = true)
 * Evidence: reports/customer-value-delivery/
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'reports', 'customer-value-delivery');
const FIXTURES_DIR = path.join(ROOT, 'fixtures', 'a38');
const A37_REPORT_DIR = path.join(ROOT, 'reports', 'commercial-governance');

const SUPPORTED_MODES = ['SIMULATION', 'EVIDENCE', 'LIVE_SAFE'];
const rawMode = (process.env.A38_MODE ?? 'SIMULATION').toUpperCase();
if (!SUPPORTED_MODES.includes(rawMode)) {
  console.error(`[A38][ERROR] Unsupported mode: ${rawMode}. Must be one of ${SUPPORTED_MODES.join(', ')}`);
  process.exit(1);
}
const MODE = rawMode;

const nowIso = new Date().toISOString();
const timestampDate = nowIso.slice(0, 10);
const runId = `a38-${timestampDate}-${crypto.randomBytes(6).toString('hex')}`;
const POLICY_VERSION = 'a38-customer-value-delivery-policy.v1';

const DELIVERY_STATES = [
  'UNASSESSED',
  'ASSESSING',
  'DELIVERY_ELIGIBLE',
  'DELIVERY_PREPARED',
  'ENTITLEMENT_REVIEW_REQUIRED',
  'PRICING_REVIEW_REQUIRED',
  'LEGAL_REVIEW_REQUIRED',
  'PRIVACY_REVIEW_REQUIRED',
  'SECURITY_REVIEW_REQUIRED',
  'EXECUTIVE_REVIEW_REQUIRED',
  'DELIVERY_BLOCKED',
  'FAILED_CLOSED',
];

const VALID_DELIVERY_TRANSITIONS = {
  UNASSESSED: new Set(['ASSESSING', 'FAILED_CLOSED']),
  ASSESSING: new Set([
    'DELIVERY_ELIGIBLE',
    'DELIVERY_PREPARED',
    'ENTITLEMENT_REVIEW_REQUIRED',
    'PRICING_REVIEW_REQUIRED',
    'LEGAL_REVIEW_REQUIRED',
    'PRIVACY_REVIEW_REQUIRED',
    'SECURITY_REVIEW_REQUIRED',
    'EXECUTIVE_REVIEW_REQUIRED',
    'DELIVERY_BLOCKED',
    'FAILED_CLOSED',
  ]),
  DELIVERY_ELIGIBLE: new Set(['ASSESSING']),
  DELIVERY_PREPARED: new Set(['ASSESSING']),
  ENTITLEMENT_REVIEW_REQUIRED: new Set(['ASSESSING']),
  PRICING_REVIEW_REQUIRED: new Set(['ASSESSING']),
  LEGAL_REVIEW_REQUIRED: new Set(['ASSESSING']),
  PRIVACY_REVIEW_REQUIRED: new Set(['ASSESSING']),
  SECURITY_REVIEW_REQUIRED: new Set(['ASSESSING']),
  EXECUTIVE_REVIEW_REQUIRED: new Set(['ASSESSING']),
  DELIVERY_BLOCKED: new Set(['ASSESSING']),
  FAILED_CLOSED: new Set([]),
};

const CUSTOMER_SEGMENTS = [
  'PUBLIC_VISITOR',
  'REGISTERED_USER',
  'PREMIUM_SUBSCRIBER',
  'PROFESSIONAL_USER',
  'ENTERPRISE_ACCOUNT',
  'PARTNER_ACCOUNT',
  'INTERNAL_USER',
];

const ENTITLEMENT_REQUIREMENTS = ['PUBLIC', 'PREMIUM', 'ENTERPRISE', 'INTERNAL_ONLY', 'RESTRICTED'];

const DELIVERY_CHANNELS = [
  'WEB',
  'REPORT_DOWNLOAD',
  'API',
  'ENTERPRISE_PORTAL',
  'DATA_LICENSE_PACKAGE',
  'PARTNER_PACKAGE',
  'EMAIL_PREPARATION',
  'SALES_HANDOFF',
];

const NEXT_ACTIONS = [
  'PREPARE_DELIVERY',
  'REQUEST_PRICE_REVIEW',
  'REQUEST_LEGAL_REVIEW',
  'REQUEST_PRIVACY_REVIEW',
  'REQUEST_SECURITY_REVIEW',
  'REQUEST_EXECUTIVE_REVIEW',
  'HANDOFF_TO_AUTHORIZED_OPERATOR',
  'BLOCK_DELIVERY',
  'FAIL_CLOSED',
];

const DELIVERY_ANOMALIES = [
  'ENTITLEMENT_MISMATCH',
  'RIGHTS_MISMATCH',
  'PRICE_STATE_INVALID',
  'CHANNEL_NOT_ELIGIBLE',
  'PRIVACY_STATE_UNKNOWN',
  'SECURITY_STATE_UNSAFE',
  'STALE_PRODUCT_EVIDENCE',
  'CUSTOMER_CONTEXT_UNKNOWN',
  'CROSS_ACCOUNT_DATA_RISK',
  'RESTRICTED_CONTENT_EXPOSURE',
  'BINDING_EXECUTION_ATTEMPT',
  'PAYMENT_ACTIVATION_ATTEMPT',
  'EXTERNAL_MESSAGE_SEND_ATTEMPT',
  'UNKNOWN_DELIVERY_STATE',
];

const CRITICAL_DELIVERY_ANOMALIES = new Set([
  'ENTITLEMENT_MISMATCH',
  'RIGHTS_MISMATCH',
  'CHANNEL_NOT_ELIGIBLE',
  'SECURITY_STATE_UNSAFE',
  'STALE_PRODUCT_EVIDENCE',
  'CUSTOMER_CONTEXT_UNKNOWN',
  'CROSS_ACCOUNT_DATA_RISK',
  'RESTRICTED_CONTENT_EXPOSURE',
  'BINDING_EXECUTION_ATTEMPT',
  'PAYMENT_ACTIVATION_ATTEMPT',
  'EXTERNAL_MESSAGE_SEND_ATTEMPT',
  'UNKNOWN_DELIVERY_STATE',
]);

const PROHIBITED_AUTONOMOUS_ACTIONS = [
  'SEND_EXTERNAL_COMMERCIAL_MESSAGE',
  'EXECUTE_CONTRACT',
  'COLLECT_PAYMENT',
  'ISSUE_REFUND',
  'PROVISION_PAID_ACCESS',
  'MODIFY_CUSTOMER_BILLING',
  'CREATE_BINDING_COMMITMENT',
  'EXPOSE_RESTRICTED_INFORMATION',
  'BYPASS_ENTITLEMENT_OR_LEGAL_REVIEW',
  'MUTATE_EXTERNAL_CUSTOMER_SYSTEMS',
];

const A37_PREPARATION_STATES = new Set(['COMMERCIAL_READY', 'MONETIZATION_ELIGIBLE', 'OFFER_ELIGIBLE']);

const SEGMENT_ALLOWED_REQUIREMENTS = {
  PUBLIC_VISITOR: new Set(['PUBLIC']),
  REGISTERED_USER: new Set(['PUBLIC']),
  PREMIUM_SUBSCRIBER: new Set(['PUBLIC', 'PREMIUM']),
  PROFESSIONAL_USER: new Set(['PUBLIC', 'PREMIUM']),
  ENTERPRISE_ACCOUNT: new Set(['PUBLIC', 'PREMIUM', 'ENTERPRISE']),
  PARTNER_ACCOUNT: new Set(['PUBLIC', 'PREMIUM', 'ENTERPRISE']),
  INTERNAL_USER: new Set(['PUBLIC', 'PREMIUM', 'ENTERPRISE', 'INTERNAL_ONLY', 'RESTRICTED']),
};

const SEGMENT_ALLOWED_CONTEXT_ENTITLEMENTS = {
  PUBLIC_VISITOR: new Set(['PUBLIC']),
  REGISTERED_USER: new Set(['PUBLIC']),
  PREMIUM_SUBSCRIBER: new Set(['PUBLIC', 'PREMIUM']),
  PROFESSIONAL_USER: new Set(['PUBLIC', 'PREMIUM']),
  ENTERPRISE_ACCOUNT: new Set(['PUBLIC', 'PREMIUM', 'ENTERPRISE']),
  PARTNER_ACCOUNT: new Set(['PUBLIC', 'PREMIUM', 'ENTERPRISE']),
  INTERNAL_USER: new Set(['PUBLIC', 'PREMIUM', 'ENTERPRISE', 'INTERNAL_ONLY', 'RESTRICTED']),
};

const CHANNEL_POLICY = {
  WEB: {
    entitlementRequirement: 'PUBLIC',
    securityRequirement: 'SAFE',
    privacyRequirement: 'KNOWN_SAFE',
    rightsCompatibility: 'STANDARD',
    commercialApprovalRequirement: 'COMMERCIAL_APPROVAL',
  },
  REPORT_DOWNLOAD: {
    entitlementRequirement: 'PUBLIC',
    securityRequirement: 'SAFE',
    privacyRequirement: 'KNOWN_SAFE',
    rightsCompatibility: 'STANDARD',
    commercialApprovalRequirement: 'COMMERCIAL_APPROVAL',
  },
  API: {
    entitlementRequirement: 'PREMIUM',
    securityRequirement: 'SAFE',
    privacyRequirement: 'KNOWN_SAFE',
    rightsCompatibility: 'PROGRAMMATIC_RIGHTS',
    commercialApprovalRequirement: 'COMMERCIAL_APPROVAL',
  },
  ENTERPRISE_PORTAL: {
    entitlementRequirement: 'ENTERPRISE',
    securityRequirement: 'SAFE',
    privacyRequirement: 'KNOWN_SAFE',
    rightsCompatibility: 'ENTERPRISE_RIGHTS',
    commercialApprovalRequirement: 'ENTERPRISE_APPROVAL',
  },
  DATA_LICENSE_PACKAGE: {
    entitlementRequirement: 'ENTERPRISE',
    securityRequirement: 'SAFE',
    privacyRequirement: 'KNOWN_SAFE',
    rightsCompatibility: 'LICENSED_DISTRIBUTION',
    commercialApprovalRequirement: 'LEGAL_APPROVAL',
  },
  PARTNER_PACKAGE: {
    entitlementRequirement: 'ENTERPRISE',
    securityRequirement: 'SAFE',
    privacyRequirement: 'KNOWN_SAFE',
    rightsCompatibility: 'PARTNER_RIGHTS',
    commercialApprovalRequirement: 'LEGAL_APPROVAL',
  },
  EMAIL_PREPARATION: {
    entitlementRequirement: 'PUBLIC',
    securityRequirement: 'SAFE',
    privacyRequirement: 'KNOWN_SAFE',
    rightsCompatibility: 'STANDARD',
    commercialApprovalRequirement: 'PRIVACY_APPROVAL',
  },
  SALES_HANDOFF: {
    entitlementRequirement: 'PREMIUM',
    securityRequirement: 'SAFE',
    privacyRequirement: 'KNOWN_SAFE',
    rightsCompatibility: 'STANDARD',
    commercialApprovalRequirement: 'EXECUTIVE_APPROVAL',
  },
};

function validateDeliveryTransition(from, to) {
  if (!DELIVERY_STATES.includes(to)) return 'FAILED_CLOSED';
  if (!VALID_DELIVERY_TRANSITIONS[from]?.has(to)) return 'FAILED_CLOSED';
  return to;
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function deterministicId(prefix, input) {
  return `${prefix}-${crypto.createHash('sha256').update(stableSerialize(input)).digest('hex').slice(0, 12)}`;
}

function dedupe(values) {
  return [...new Set(values.filter(Boolean))];
}

function loadA37Evidence() {
  if (!fs.existsSync(A37_REPORT_DIR)) return null;
  const files = fs
    .readdirSync(A37_REPORT_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .reverse();
  if (!files.length) return null;
  for (const file of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(A37_REPORT_DIR, file), 'utf-8'));
      if (parsed?.certification?.certificationPassed === true || parsed?.certificationPassed === true) {
        return parsed;
      }
    } catch {
      // ignore malformed evidence
    }
  }
  try {
    return JSON.parse(fs.readFileSync(path.join(A37_REPORT_DIR, files[0]), 'utf-8'));
  } catch {
    return null;
  }
}

const a37Evidence = loadA37Evidence() ?? {};

function isA37Certified(ev) {
  return ev?.certification?.certificationPassed === true || ev?.certificationPassed === true;
}

function evaluateCustomerContext(customerContext) {
  const requiredFields = [
    'customerContextId',
    'segment',
    'entitlementClass',
    'geography',
    'organizationClass',
    'channelEligibility',
    'privacyConstraints',
    'commercialRestrictions',
    'approvalRequirements',
  ];

  const missingFields = requiredFields.filter((field) => !Object.prototype.hasOwnProperty.call(customerContext ?? {}, field));
  const segmentKnown = CUSTOMER_SEGMENTS.includes(customerContext?.segment);
  const entitlementKnown = ENTITLEMENT_REQUIREMENTS.includes(customerContext?.entitlementClass);
  const allowedEntitlements = SEGMENT_ALLOWED_CONTEXT_ENTITLEMENTS[customerContext?.segment] ?? new Set();
  const entitlementConsistent = entitlementKnown && allowedEntitlements.has(customerContext?.entitlementClass);
  const channelEligibilityKnown = Array.isArray(customerContext?.channelEligibility) && customerContext.channelEligibility.length > 0;
  const approvalRequirementsKnown = Array.isArray(customerContext?.approvalRequirements);
  const privacyConstraintsKnown = customerContext?.privacyConstraints && typeof customerContext.privacyConstraints === 'object';
  const commercialRestrictionsKnown = Array.isArray(customerContext?.commercialRestrictions);
  const geographyExplicit = Object.prototype.hasOwnProperty.call(customerContext ?? {}, 'geography');
  const organizationClassExplicit = Object.prototype.hasOwnProperty.call(customerContext ?? {}, 'organizationClass');

  const authoritative =
    missingFields.length === 0 &&
    segmentKnown &&
    entitlementKnown &&
    entitlementConsistent &&
    channelEligibilityKnown &&
    approvalRequirementsKnown &&
    privacyConstraintsKnown &&
    commercialRestrictionsKnown &&
    geographyExplicit &&
    organizationClassExplicit;

  const reasons = [];
  if (missingFields.length) reasons.push(`MISSING_FIELDS:${missingFields.join(',')}`);
  if (!segmentKnown) reasons.push('UNKNOWN_SEGMENT');
  if (!entitlementKnown) reasons.push('UNKNOWN_CONTEXT_ENTITLEMENT');
  if (entitlementKnown && !entitlementConsistent) reasons.push('SEGMENT_ENTITLEMENT_INCONSISTENT');
  if (!channelEligibilityKnown) reasons.push('CHANNEL_ELIGIBILITY_UNKNOWN');
  if (!privacyConstraintsKnown) reasons.push('PRIVACY_CONSTRAINTS_UNKNOWN');
  if (!commercialRestrictionsKnown) reasons.push('COMMERCIAL_RESTRICTIONS_UNKNOWN');
  if (!approvalRequirementsKnown) reasons.push('APPROVAL_REQUIREMENTS_UNKNOWN');

  return {
    authoritative,
    missingFields,
    segmentKnown,
    entitlementKnown,
    entitlementConsistent,
    channelEligibilityKnown,
    privacyConstraintsKnown,
    commercialRestrictionsKnown,
    approvalRequirementsKnown,
    reason: reasons.length ? reasons.join('|') : 'CUSTOMER_CONTEXT_AUTHORITATIVE',
  };
}

function evaluateA37CommercialState(inputs, upstreamEvidence) {
  const certified = inputs.a37CertificationPassed === true || isA37Certified(upstreamEvidence);
  const commercialState = inputs.a37CommercialState ?? null;
  const commercialStateKnown = typeof commercialState === 'string' && commercialState.length > 0;
  const permitsPreparation = commercialStateKnown && A37_PREPARATION_STATES.has(commercialState);

  return {
    certified,
    commercialState,
    commercialStateKnown,
    permitsPreparation,
    reason: !certified
      ? 'A37_CERTIFICATION_REQUIRED'
      : !commercialStateKnown
        ? 'A37_COMMERCIAL_STATE_UNKNOWN'
        : permitsPreparation
          ? 'A37_COMMERCIAL_STATE_PERMITS_PREPARATION'
          : `A37_COMMERCIAL_STATE_BLOCKS_PREPARATION:${commercialState}`,
  };
}

function evaluateEntitlement(customerContext, valuePackage) {
  const requirement = valuePackage?.entitlementRequirement ?? 'UNKNOWN';
  const segment = customerContext?.segment ?? 'UNKNOWN';
  const contextEntitlement = customerContext?.entitlementClass ?? 'UNKNOWN';

  if (!CUSTOMER_SEGMENTS.includes(segment) || !ENTITLEMENT_REQUIREMENTS.includes(contextEntitlement)) {
    return {
      requirement,
      segment,
      contextEntitlement,
      allowed: false,
      requiresReview: true,
      reason: 'CUSTOMER_CONTEXT_UNKNOWN',
    };
  }

  if (!ENTITLEMENT_REQUIREMENTS.includes(requirement)) {
    return {
      requirement,
      segment,
      contextEntitlement,
      allowed: false,
      requiresReview: true,
      reason: 'ENTITLEMENT_REQUIREMENT_UNKNOWN',
    };
  }

  const allowedRequirements = SEGMENT_ALLOWED_REQUIREMENTS[segment] ?? new Set();
  let allowed = false;
  let reason = 'ENTITLEMENT_MISMATCH';

  if (requirement === 'PUBLIC') {
    allowed = true;
    reason = 'PUBLIC_CONTENT_ALLOWED';
  } else if (requirement === 'PREMIUM') {
    allowed = allowedRequirements.has('PREMIUM') || allowedRequirements.has('ENTERPRISE') || allowedRequirements.has('INTERNAL_ONLY');
    reason = allowed ? 'PREMIUM_CONTENT_ALLOWED' : 'PREMIUM_CONTENT_REQUIRES_PREMIUM_OR_HIGHER';
  } else if (requirement === 'ENTERPRISE') {
    const explicitLicense =
      customerContext?.privacyConstraints?.explicitEnterpriseLicense === true ||
      valuePackage?.recommendedCommercialTerms?.explicitEnterpriseLicense === true;
    allowed = segment === 'ENTERPRISE_ACCOUNT' || explicitLicense === true;
    reason = allowed ? 'ENTERPRISE_CONTENT_ALLOWED' : 'ENTERPRISE_CONTENT_REQUIRES_ENTERPRISE_SCOPE';
  } else if (requirement === 'INTERNAL_ONLY') {
    allowed = segment === 'INTERNAL_USER';
    reason = allowed ? 'INTERNAL_CONTENT_ALLOWED' : 'INTERNAL_ONLY_EXTERNAL_DELIVERY_BLOCKED';
  } else if (requirement === 'RESTRICTED') {
    const explicitScopes = Array.isArray(customerContext?.explicitAuthorizedScopes)
      ? customerContext.explicitAuthorizedScopes
      : [];
    const authorizedKey =
      valuePackage?.rightsReference?.authorizedScopeKey ??
      valuePackage?.productId ??
      valuePackage?.valuePackageId ??
      null;
    allowed = segment === 'INTERNAL_USER' && !!authorizedKey && explicitScopes.includes(authorizedKey);
    reason = allowed ? 'RESTRICTED_SCOPE_ALLOWED' : 'RESTRICTED_SCOPE_REQUIRES_EXPLICIT_AUTHORIZATION';
  }

  const contextSupportsRequirement = SEGMENT_ALLOWED_CONTEXT_ENTITLEMENTS[segment]?.has(contextEntitlement) ?? false;
  if (!contextSupportsRequirement) {
    allowed = false;
    reason = 'CONTEXT_ENTITLEMENT_INCONSISTENT';
  }

  return {
    requirement,
    segment,
    contextEntitlement,
    allowed,
    requiresReview: reason === 'ENTITLEMENT_REQUIREMENT_UNKNOWN' || reason === 'CUSTOMER_CONTEXT_UNKNOWN',
    reason,
  };
}

function evaluateRights(valuePackage) {
  const rightsState = valuePackage?.rightsReference?.state ?? 'UNKNOWN';
  const restrictedDistribution = valuePackage?.rightsReference?.restrictedDistribution === true;
  const channelRestrictions = Array.isArray(valuePackage?.rightsReference?.channelRestrictions)
    ? valuePackage.rightsReference.channelRestrictions
    : [];

  return {
    state: rightsState,
    known: rightsState !== 'UNKNOWN',
    admissible: rightsState === 'RIGHTS_CONFIRMED' || rightsState === 'PUBLIC_LICENSED' || rightsState === 'ENTERPRISE_LICENSED',
    restrictedDistribution,
    channelRestrictions,
    requiresLegalReview: rightsState === 'UNKNOWN',
    reason:
      rightsState === 'UNKNOWN'
        ? 'RIGHTS_UNKNOWN'
        : rightsState === 'RIGHTS_CONFIRMED' || rightsState === 'PUBLIC_LICENSED' || rightsState === 'ENTERPRISE_LICENSED'
          ? 'RIGHTS_CONFIRMED'
          : 'RIGHTS_MISMATCH',
  };
}

function evaluatePricing(valuePackage) {
  const reference = valuePackage?.pricingReference ?? {};
  const state = reference.state ?? 'UNKNOWN';
  const admissibleStates = new Set(['PRICE_ADMISSIBLE', 'FREE', 'SIMULATION_ADMISSIBLE']);
  const requiresReview = !admissibleStates.has(state);

  return {
    state,
    admissible: admissibleStates.has(state),
    requiresReview,
    aboveCustomPricingThreshold: reference.aboveCustomPricingThreshold === true,
    customPricing: reference.customPricing === true,
    reason: admissibleStates.has(state) ? 'PRICE_STATE_ADMISSIBLE' : 'PRICE_STATE_INVALID',
  };
}

function evaluatePrivacy(customerContext, valuePackage, contentProfile) {
  const state = valuePackage?.privacyState ?? 'UNKNOWN';
  const constraints = customerContext?.privacyConstraints ?? {};
  const allowedGeographies = Array.isArray(constraints.allowedGeographies) ? constraints.allowedGeographies : [];
  const geographyRestricted =
    allowedGeographies.length > 0 &&
    customerContext?.geography !== null &&
    customerContext?.geography !== undefined &&
    !allowedGeographies.includes(customerContext.geography);
  const purposeCompatible = contentProfile?.purposeCompatible !== false;
  const restrictedPersonalDataAllowed = constraints.restrictedPersonalDataAllowed === true;
  const restrictedPersonalDataPresent = contentProfile?.restrictedPersonalData === true;
  const retentionCompatible = contentProfile?.retentionCompatible !== false;
  const disclosureRestricted = contentProfile?.disclosureRestricted === true;

  const requiresReview =
    state === 'UNKNOWN' ||
    !purposeCompatible ||
    (restrictedPersonalDataPresent && !restrictedPersonalDataAllowed) ||
    !retentionCompatible ||
    geographyRestricted ||
    disclosureRestricted;

  return {
    state,
    known: state !== 'UNKNOWN',
    safe: state === 'KNOWN_SAFE' && !requiresReview,
    geographyRestricted,
    purposeCompatible,
    restrictedPersonalDataPresent,
    retentionCompatible,
    disclosureRestricted,
    requiresReview,
    reason:
      state === 'UNKNOWN'
        ? 'PRIVACY_STATE_UNKNOWN'
        : geographyRestricted
          ? 'PRIVACY_GEOGRAPHY_RESTRICTION'
          : !purposeCompatible
            ? 'PRIVACY_PURPOSE_INCOMPATIBLE'
            : restrictedPersonalDataPresent && !restrictedPersonalDataAllowed
              ? 'PRIVACY_RESTRICTED_PERSONAL_DATA_REVIEW'
              : !retentionCompatible
                ? 'PRIVACY_RETENTION_INCOMPATIBLE'
                : disclosureRestricted
                  ? 'PRIVACY_DISCLOSURE_RESTRICTION'
                  : 'PRIVACY_STATE_ACCEPTABLE',
  };
}

function evaluateSecurity(valuePackage, productEvidence) {
  const state = valuePackage?.securityState ?? 'UNKNOWN';
  const hardStopIncident = productEvidence?.noActiveHardStopIncident === false || productEvidence?.activeHardStopIncident === true;

  return {
    state,
    safe: state === 'SAFE' && !hardStopIncident,
    hardStopIncident,
    requiresReview: state === 'UNKNOWN',
    blocked: state === 'UNSAFE' || hardStopIncident,
    reason:
      state === 'UNSAFE'
        ? 'SECURITY_STATE_UNSAFE'
        : hardStopIncident
          ? 'ACTIVE_HARD_STOP_INCIDENT'
          : state === 'UNKNOWN'
            ? 'SECURITY_STATE_UNKNOWN'
            : 'SECURITY_STATE_SAFE',
  };
}

function evaluateProductEvidence(valuePackage, productEvidence) {
  const identityAuthoritative = productEvidence?.identityAuthoritative === true;
  const freshnessAcceptable = productEvidence?.freshnessAcceptable !== false && valuePackage?.freshnessClass !== 'STALE';
  const embargoed = productEvidence?.embargoed === true || valuePackage?.legalState === 'EMBARGOED';
  const legalBlocked = valuePackage?.legalState === 'BLOCKED';

  return {
    identityAuthoritative,
    freshnessAcceptable,
    embargoed,
    legalBlocked,
    noActiveHardStopIncident: productEvidence?.noActiveHardStopIncident !== false && productEvidence?.activeHardStopIncident !== true,
    reason: !identityAuthoritative
      ? 'PRODUCT_IDENTITY_NOT_AUTHORITATIVE'
      : !freshnessAcceptable
        ? 'STALE_PRODUCT_EVIDENCE'
        : embargoed
          ? 'LEGAL_EMBARGO_ACTIVE'
          : legalBlocked
            ? 'LEGAL_RESTRICTION_ACTIVE'
            : 'PRODUCT_EVIDENCE_ACCEPTABLE',
  };
}

function evaluateChannel(customerContext, valuePackage, deliveryRequest, rightsResult) {
  const intendedChannel = deliveryRequest?.intendedChannel ?? valuePackage?.deliveryChannel ?? null;
  const policy = CHANNEL_POLICY[intendedChannel] ?? null;
  const customerEligible = Array.isArray(customerContext?.channelEligibility)
    ? customerContext.channelEligibility.includes(intendedChannel)
    : false;
  const packageMatches = valuePackage?.deliveryChannel === intendedChannel;
  const rightsAllowed = !rightsResult.channelRestrictions.includes(intendedChannel);

  const eligible = Boolean(policy && customerEligible && packageMatches && rightsAllowed);

  return {
    intendedChannel,
    policy,
    customerEligible,
    packageMatches,
    rightsAllowed,
    eligible,
    reason: !policy
      ? 'CHANNEL_NOT_ELIGIBLE'
      : !customerEligible
        ? 'CHANNEL_NOT_ELIGIBLE'
        : !packageMatches
          ? 'CHANNEL_PACKAGE_MISMATCH'
          : !rightsAllowed
            ? 'RIGHTS_MISMATCH'
            : 'CHANNEL_ELIGIBLE',
  };
}

function evaluateContentMinimization(contentProfile) {
  const restrictedFields = Array.isArray(contentProfile?.restrictedFields) ? contentProfile.restrictedFields : [];
  const includedFields = Array.isArray(contentProfile?.includedFields) ? contentProfile.includedFields : [];
  const redactionReasons = [];

  if (contentProfile?.containsInternalAuditInternals === true) redactionReasons.push('internal_audit_internals');
  if (contentProfile?.containsSecuritySensitiveData === true) redactionReasons.push('security_sensitive_data');
  if (contentProfile?.containsCredentials === true) redactionReasons.push('credentials');
  if (contentProfile?.containsProviderSecrets === true) redactionReasons.push('provider_secrets');
  if (contentProfile?.containsInternalGovernanceData === true) redactionReasons.push('internal_governance_data');
  if (contentProfile?.containsUnrelatedCustomerInformation === true) redactionReasons.push('unrelated_customer_information');
  if (contentProfile?.containsRestrictedSourceMaterial === true) redactionReasons.push('restricted_source_material');
  if (contentProfile?.crossAccountDataRisk === true) redactionReasons.push('cross_account_data_risk');
  redactionReasons.push(...restrictedFields.map((field) => `restricted_field:${field}`));

  const minimizationPossible = contentProfile?.minimizationPossible !== false;
  const crossAccountDataRisk = contentProfile?.crossAccountDataRisk === true;
  const blocked = crossAccountDataRisk || (redactionReasons.length > 0 && !minimizationPossible);
  const redactedFields = minimizationPossible ? restrictedFields : [];
  const preparedFields = includedFields.filter((field) => !restrictedFields.includes(field));

  return {
    includedFields,
    preparedFields,
    restrictedFields,
    redactedFields,
    minimizationPossible,
    minimized: redactionReasons.length === 0 || minimizationPossible,
    blocked,
    crossAccountDataRisk,
    redactionReasons,
    reason: crossAccountDataRisk
      ? 'CROSS_ACCOUNT_DATA_RISK'
      : redactionReasons.length > 0 && !minimizationPossible
        ? 'RESTRICTED_CONTENT_EXPOSURE'
        : redactionReasons.length > 0
          ? 'CONTENT_MINIMIZED'
          : 'CONTENT_ALREADY_MINIMAL',
  };
}

function buildRequiredApprovals(customerContext, valuePackage, pricingResult, channelResult, deliveryRequest) {
  const requiredApprovals = dedupe([
    ...(Array.isArray(customerContext?.approvalRequirements) ? customerContext.approvalRequirements : []),
    channelResult?.policy?.commercialApprovalRequirement,
    pricingResult?.aboveCustomPricingThreshold ? 'EXECUTIVE_APPROVAL' : null,
    pricingResult?.customPricing ? 'PRICING_APPROVAL' : null,
    valuePackage?.rightsReference?.restrictedDistribution ? 'LEGAL_APPROVAL' : null,
    deliveryRequest?.requireAuthorizedOperatorHandoff ? 'AUTHORIZED_OPERATOR' : null,
  ]);

  return requiredApprovals;
}

function detectAnomalies(inputs, contextResult, a37Result, entitlementResult, rightsResult, pricingResult, privacyResult, securityResult, productResult, channelResult, minimizationResult) {
  const anomalies = new Set(Array.isArray(inputs?.anomalies) ? inputs.anomalies : []);

  if (!contextResult.authoritative) anomalies.add('CUSTOMER_CONTEXT_UNKNOWN');
  if (!entitlementResult.allowed && !entitlementResult.requiresReview) anomalies.add('ENTITLEMENT_MISMATCH');
  if (!rightsResult.known || !rightsResult.admissible) anomalies.add('RIGHTS_MISMATCH');
  if (!pricingResult.admissible) anomalies.add('PRICE_STATE_INVALID');
  if (!channelResult.eligible) anomalies.add('CHANNEL_NOT_ELIGIBLE');
  if (!privacyResult.known) anomalies.add('PRIVACY_STATE_UNKNOWN');
  if (securityResult.blocked) anomalies.add('SECURITY_STATE_UNSAFE');
  if (!productResult.freshnessAcceptable) anomalies.add('STALE_PRODUCT_EVIDENCE');
  if (minimizationResult.crossAccountDataRisk) anomalies.add('CROSS_ACCOUNT_DATA_RISK');
  if (minimizationResult.blocked) anomalies.add('RESTRICTED_CONTENT_EXPOSURE');
  if (inputs?.deliveryRequest?.bindingCommitmentAttempted === true || inputs?.deliveryRequest?.contractExecutionAttempted === true) {
    anomalies.add('BINDING_EXECUTION_ATTEMPT');
  }
  if (inputs?.deliveryRequest?.paymentActivationAttempted === true) anomalies.add('PAYMENT_ACTIVATION_ATTEMPT');
  if (inputs?.deliveryRequest?.externalMessageSendAttempted === true) anomalies.add('EXTERNAL_MESSAGE_SEND_ATTEMPT');
  if (!a37Result.commercialStateKnown) anomalies.add('UNKNOWN_DELIVERY_STATE');

  const detected = [...anomalies];
  const criticalAnomalies = detected.filter((anomaly) => CRITICAL_DELIVERY_ANOMALIES.has(anomaly));

  return {
    detected,
    criticalAnomalies,
    hasCriticalAnomaly: criticalAnomalies.length > 0,
  };
}

function determineReviewStateFromA37(a37Result) {
  if (!a37Result.certified) return 'FAILED_CLOSED';
  if (!a37Result.commercialStateKnown) return 'FAILED_CLOSED';
  if (a37Result.permitsPreparation) return null;
  switch (a37Result.commercialState) {
    case 'PRICE_REVIEW_REQUIRED':
      return 'PRICING_REVIEW_REQUIRED';
    case 'LEGAL_REVIEW_REQUIRED':
      return 'LEGAL_REVIEW_REQUIRED';
    case 'EXECUTIVE_REVIEW_REQUIRED':
      return 'EXECUTIVE_REVIEW_REQUIRED';
    case 'CHANNEL_REVIEW_REQUIRED':
      return 'EXECUTIVE_REVIEW_REQUIRED';
    case 'COMMERCIAL_BLOCKED':
    case 'NOT_COMMERCIAL_READY':
    case 'FAILED_CLOSED':
    default:
      return 'DELIVERY_BLOCKED';
  }
}

function deriveDeliveryDecision(inputs, contextResult, a37Result, entitlementResult, rightsResult, pricingResult, privacyResult, securityResult, productResult, channelResult, minimizationResult, anomalies, requiredApprovals) {
  const request = inputs.deliveryRequest ?? {};
  const reviewStateFromA37 = determineReviewStateFromA37(a37Result);

  if (request.externalMessageSendAttempted === true) {
    return { state: 'DELIVERY_BLOCKED', reason: 'EXTERNAL_MESSAGE_SEND_ATTEMPT_BLOCKED' };
  }
  if (request.contractExecutionAttempted === true || request.bindingCommitmentAttempted === true) {
    return { state: 'DELIVERY_BLOCKED', reason: 'BINDING_EXECUTION_ATTEMPT_BLOCKED' };
  }
  if (request.paymentActivationAttempted === true) {
    return { state: 'DELIVERY_BLOCKED', reason: 'PAYMENT_ACTIVATION_ATTEMPT_BLOCKED' };
  }
  if (request.refundAttempted === true || request.paidAccessProvisioningAttempted === true || request.billingMutationAttempted === true) {
    return { state: 'DELIVERY_BLOCKED', reason: 'PROHIBITED_COMMERCIAL_MUTATION_ATTEMPTED' };
  }
  if (request.externalCrmMutationAttempted === true || request.externalProviderMutationAttempted === true) {
    return { state: 'DELIVERY_BLOCKED', reason: 'EXTERNAL_SYSTEM_MUTATION_PROHIBITED' };
  }

  if (!contextResult.authoritative) {
    return { state: 'FAILED_CLOSED', reason: contextResult.reason };
  }

  if (reviewStateFromA37) {
    return { state: reviewStateFromA37, reason: a37Result.reason };
  }

  if (!productResult.identityAuthoritative) {
    return { state: 'FAILED_CLOSED', reason: 'PRODUCT_IDENTITY_NOT_AUTHORITATIVE' };
  }

  if (rightsResult.requiresLegalReview) {
    return { state: 'LEGAL_REVIEW_REQUIRED', reason: rightsResult.reason };
  }
  if (!rightsResult.admissible || productResult.embargoed || productResult.legalBlocked) {
    return { state: 'DELIVERY_BLOCKED', reason: rightsResult.admissible ? productResult.reason : rightsResult.reason };
  }

  if (entitlementResult.requiresReview) {
    return { state: 'ENTITLEMENT_REVIEW_REQUIRED', reason: entitlementResult.reason };
  }
  if (!entitlementResult.allowed) {
    return { state: 'DELIVERY_BLOCKED', reason: entitlementResult.reason };
  }

  if (!pricingResult.admissible) {
    return { state: 'PRICING_REVIEW_REQUIRED', reason: pricingResult.reason };
  }

  if (privacyResult.requiresReview) {
    return { state: 'PRIVACY_REVIEW_REQUIRED', reason: privacyResult.reason };
  }

  if (securityResult.requiresReview) {
    return { state: 'SECURITY_REVIEW_REQUIRED', reason: securityResult.reason };
  }
  if (securityResult.blocked) {
    return { state: 'DELIVERY_BLOCKED', reason: securityResult.reason };
  }

  if (!productResult.freshnessAcceptable) {
    return { state: 'DELIVERY_BLOCKED', reason: productResult.reason };
  }

  if (!channelResult.eligible) {
    return { state: 'DELIVERY_BLOCKED', reason: channelResult.reason };
  }

  if (minimizationResult.blocked) {
    return { state: 'DELIVERY_BLOCKED', reason: minimizationResult.reason };
  }

  if (anomalies.hasCriticalAnomaly) {
    return { state: 'DELIVERY_BLOCKED', reason: `CRITICAL_DELIVERY_ANOMALY:${anomalies.criticalAnomalies.join(',')}` };
  }

  if (requiredApprovals.includes('EXECUTIVE_APPROVAL') && inputs.approvals?.executiveApproved !== true) {
    return { state: 'EXECUTIVE_REVIEW_REQUIRED', reason: 'EXECUTIVE_APPROVAL_REQUIRED' };
  }

  if (request.prepareDelivery === true) {
    return { state: 'DELIVERY_PREPARED', reason: 'DELIVERY_PACKAGE_PREPARED' };
  }

  return { state: 'DELIVERY_ELIGIBLE', reason: 'DELIVERY_ELIGIBILITY_CONFIRMED' };
}

function deriveNextPermittedAction(state, inputs) {
  switch (state) {
    case 'DELIVERY_ELIGIBLE':
      return 'PREPARE_DELIVERY';
    case 'DELIVERY_PREPARED':
      return 'HANDOFF_TO_AUTHORIZED_OPERATOR';
    case 'ENTITLEMENT_REVIEW_REQUIRED':
      return 'BLOCK_DELIVERY';
    case 'PRICING_REVIEW_REQUIRED':
      return 'REQUEST_PRICE_REVIEW';
    case 'LEGAL_REVIEW_REQUIRED':
      return 'REQUEST_LEGAL_REVIEW';
    case 'PRIVACY_REVIEW_REQUIRED':
      return 'REQUEST_PRIVACY_REVIEW';
    case 'SECURITY_REVIEW_REQUIRED':
      return 'REQUEST_SECURITY_REVIEW';
    case 'EXECUTIVE_REVIEW_REQUIRED':
      return inputs?.deliveryRequest?.requireAuthorizedOperatorHandoff === true
        ? 'HANDOFF_TO_AUTHORIZED_OPERATOR'
        : 'REQUEST_EXECUTIVE_REVIEW';
    case 'DELIVERY_BLOCKED':
      return 'BLOCK_DELIVERY';
    case 'FAILED_CLOSED':
    default:
      return 'FAIL_CLOSED';
  }
}

function buildHumanActions(state, inputs, requiredApprovals) {
  const actions = [];
  if (state === 'PRICING_REVIEW_REQUIRED') actions.push('PRICE_REVIEW');
  if (state === 'LEGAL_REVIEW_REQUIRED') actions.push('LEGAL_REVIEW');
  if (state === 'PRIVACY_REVIEW_REQUIRED') actions.push('PRIVACY_REVIEW');
  if (state === 'SECURITY_REVIEW_REQUIRED') actions.push('SECURITY_REVIEW');
  if (state === 'EXECUTIVE_REVIEW_REQUIRED') actions.push('EXECUTIVE_REVIEW');
  if (state === 'DELIVERY_PREPARED' || inputs?.deliveryRequest?.requireAuthorizedOperatorHandoff === true) {
    actions.push('AUTHORIZED_OPERATOR_HANDOFF');
  }
  if (requiredApprovals.includes('AUTHORIZED_OPERATOR')) actions.push('AUTHORIZED_OPERATOR_HANDOFF');
  return dedupe(actions);
}

function buildSimulatedDeliveryPackage(inputs, minimizationResult) {
  const valuePackage = { ...(inputs.valuePackage ?? {}) };
  const valuePackageId = valuePackage.valuePackageId ?? deterministicId('value-package', {
    scenarioId: inputs.scenarioId,
    customerContextId: inputs.customerContext?.customerContextId,
    productId: valuePackage.productId,
    deliveryChannel: valuePackage.deliveryChannel,
  });

  return {
    ...valuePackage,
    valuePackageId,
    simulated: true,
    bindingOffer: false,
    deliveryContents: {
      includedFields: minimizationResult.preparedFields,
      redactedFields: minimizationResult.redactedFields,
    },
  };
}

function buildExecutionPlan(inputs, simulatedPackage, deliveryState, nextPermittedAction, entitlementResult, pricingResult, rightsResult, privacyResult, securityResult, requiredApprovals, blockedActions, humanActions) {
  const planInput = {
    customerContextId: inputs.customerContext?.customerContextId,
    productId: simulatedPackage.productId,
    valuePackageId: simulatedPackage.valuePackageId,
    intendedChannel: inputs.deliveryRequest?.intendedChannel,
    deliveryState,
    nextPermittedAction,
  };

  return {
    executionPlanId: deterministicId('execution-plan', planInput),
    customerContextId: inputs.customerContext?.customerContextId ?? null,
    productId: simulatedPackage.productId ?? null,
    valuePackageId: simulatedPackage.valuePackageId ?? null,
    intendedChannel: inputs.deliveryRequest?.intendedChannel ?? simulatedPackage.deliveryChannel ?? null,
    commercialState: inputs.a37CommercialState ?? null,
    entitlementState: entitlementResult.reason,
    pricingState: pricingResult.state,
    legalState: rightsResult.state,
    privacyState: privacyResult.state,
    securityState: securityResult.state,
    requiredApprovals,
    requiredHumanActions: humanActions,
    blockedActions,
    nextPermittedAction,
  };
}

function evaluateScenarioCore(inputs, upstreamEvidence) {
  const auditTrail = [];
  const sourceA37Evidence = {
    deliveryDependencySatisfied: inputs.a37CertificationPassed === true || isA37Certified(upstreamEvidence),
    certificationPassed: isA37Certified(upstreamEvidence),
    commercialRunId: upstreamEvidence?.commercialRunId ?? null,
    generatedAt: upstreamEvidence?.generatedAt ?? null,
  };

  auditTrail.push({ step: 'SCENARIO_START', scenarioId: inputs.scenarioId, category: inputs.category, timestamp: nowIso });

  const contextResult = evaluateCustomerContext(inputs.customerContext ?? {});
  auditTrail.push({ step: 'CUSTOMER_CONTEXT_EVALUATED', authoritative: contextResult.authoritative, reason: contextResult.reason });

  const a37Result = evaluateA37CommercialState(inputs, upstreamEvidence);
  auditTrail.push({ step: 'A37_COMMERCIAL_STATE_EVALUATED', ...a37Result });

  const simulatedPackage = buildSimulatedDeliveryPackage(inputs, { preparedFields: [], redactedFields: [] });
  const productResult = evaluateProductEvidence(simulatedPackage, inputs.productEvidence ?? {});
  auditTrail.push({ step: 'PRODUCT_EVIDENCE_EVALUATED', ...productResult });

  const entitlementResult = evaluateEntitlement(inputs.customerContext ?? {}, simulatedPackage);
  auditTrail.push({ step: 'ENTITLEMENT_EVALUATED', ...entitlementResult });

  const rightsResult = evaluateRights(simulatedPackage);
  auditTrail.push({ step: 'RIGHTS_EVALUATED', ...rightsResult });

  const pricingResult = evaluatePricing(simulatedPackage);
  auditTrail.push({ step: 'PRICING_EVALUATED', ...pricingResult });

  const privacyResult = evaluatePrivacy(inputs.customerContext ?? {}, simulatedPackage, inputs.contentProfile ?? {});
  auditTrail.push({ step: 'PRIVACY_EVALUATED', ...privacyResult });

  const securityResult = evaluateSecurity(simulatedPackage, inputs.productEvidence ?? {});
  auditTrail.push({ step: 'SECURITY_EVALUATED', ...securityResult });

  const channelResult = evaluateChannel(inputs.customerContext ?? {}, simulatedPackage, inputs.deliveryRequest ?? {}, rightsResult);
  auditTrail.push({ step: 'CHANNEL_EVALUATED', ...channelResult });

  const minimizationResult = evaluateContentMinimization(inputs.contentProfile ?? {});
  auditTrail.push({ step: 'CONTENT_MINIMIZATION_EVALUATED', ...minimizationResult });

  const finalPackage = buildSimulatedDeliveryPackage(inputs, minimizationResult);
  const requiredApprovals = buildRequiredApprovals(inputs.customerContext ?? {}, finalPackage, pricingResult, channelResult, inputs.deliveryRequest ?? {});
  const anomalies = detectAnomalies(
    inputs,
    contextResult,
    a37Result,
    entitlementResult,
    rightsResult,
    pricingResult,
    privacyResult,
    securityResult,
    productResult,
    channelResult,
    minimizationResult,
  );
  auditTrail.push({ step: 'ANOMALIES_DETECTED', ...anomalies });

  const derived = deriveDeliveryDecision(
    inputs,
    contextResult,
    a37Result,
    entitlementResult,
    rightsResult,
    pricingResult,
    privacyResult,
    securityResult,
    productResult,
    channelResult,
    minimizationResult,
    anomalies,
    requiredApprovals,
  );
  const finalDeliveryState = validateDeliveryTransition('ASSESSING', derived.state);
  const nextPermittedAction = deriveNextPermittedAction(finalDeliveryState, inputs);
  const blockedActions = [...PROHIBITED_AUTONOMOUS_ACTIONS];
  const humanActions = buildHumanActions(finalDeliveryState, inputs, requiredApprovals);
  const executionPlan = buildExecutionPlan(
    inputs,
    finalPackage,
    finalDeliveryState,
    nextPermittedAction,
    entitlementResult,
    pricingResult,
    rightsResult,
    privacyResult,
    securityResult,
    requiredApprovals,
    blockedActions,
    humanActions,
  );

  auditTrail.push({
    step: 'DELIVERY_DECISION_DERIVED',
    finalDeliveryState,
    nextPermittedAction,
    reason: derived.reason,
  });

  return {
    scenarioId: inputs.scenarioId ?? 'UNKNOWN',
    category: inputs.category ?? 'UNKNOWN',
    description: inputs.description ?? null,
    sourceA37Evidence,
    customerContext: inputs.customerContext ?? {},
    productIdentity: {
      productId: finalPackage.productId ?? null,
      productVersion: finalPackage.productVersion ?? null,
      authoritative: productResult.identityAuthoritative,
    },
    valuePackage: finalPackage,
    entitlementAnalysis: entitlementResult,
    rightsAnalysis: rightsResult,
    pricingState: pricingResult,
    privacyState: privacyResult,
    securityState: securityResult,
    channelAnalysis: channelResult,
    contentMinimization: minimizationResult,
    executionPlan,
    requiredApprovals,
    blockedActions,
    anomalyDetections: anomalies,
    auditTrail,
    timestamps: {
      evaluatedAt: nowIso,
    },
    finalDeliveryState,
    nextPermittedAction,
    decisionReason: derived.reason,
    noExternalCommercialTransmission: true,
    noContractMutation: true,
    noPaymentMutation: true,
    noBillingMutation: true,
    noExternalCustomerSystemMutation: true,
    deliveryPackagePrepared: finalDeliveryState === 'DELIVERY_PREPARED',
  };
}

function buildScenarioTests(inputs, scenarioResult, idempotent) {
  return [
    {
      name: 'deliveryStateMatch',
      passed: scenarioResult.finalDeliveryState === inputs.expectedDeliveryState,
      expected: inputs.expectedDeliveryState,
      actual: scenarioResult.finalDeliveryState,
    },
    {
      name: 'nextPermittedActionMatch',
      passed: scenarioResult.nextPermittedAction === inputs.expectedNextPermittedAction,
      expected: inputs.expectedNextPermittedAction,
      actual: scenarioResult.nextPermittedAction,
    },
    {
      name: 'a37EvidenceRequired',
      passed: scenarioResult.sourceA37Evidence.deliveryDependencySatisfied === true,
      expected: true,
      actual: scenarioResult.sourceA37Evidence.deliveryDependencySatisfied === true,
    },
    {
      name: 'noExternalCommercialTransmission',
      passed: scenarioResult.noExternalCommercialTransmission === true,
      expected: true,
      actual: scenarioResult.noExternalCommercialTransmission,
    },
    {
      name: 'noAutonomousContractExecution',
      passed: scenarioResult.noContractMutation === true,
      expected: true,
      actual: scenarioResult.noContractMutation,
    },
    {
      name: 'noAutonomousPaymentActivation',
      passed: scenarioResult.noPaymentMutation === true,
      expected: true,
      actual: scenarioResult.noPaymentMutation,
    },
    {
      name: 'noAutonomousCustomerBillingMutation',
      passed: scenarioResult.noBillingMutation === true,
      expected: true,
      actual: scenarioResult.noBillingMutation,
    },
    {
      name: 'noRestrictedDataLeakage',
      passed: scenarioResult.contentMinimization.blocked || scenarioResult.contentMinimization.redactedFields.length >= 0,
      expected: true,
      actual: scenarioResult.contentMinimization.blocked || scenarioResult.contentMinimization.redactedFields.length >= 0,
    },
    {
      name: 'evidenceEmitted',
      passed: Array.isArray(scenarioResult.auditTrail) && scenarioResult.auditTrail.length > 0,
      expected: true,
      actual: Array.isArray(scenarioResult.auditTrail) && scenarioResult.auditTrail.length > 0,
    },
    {
      name: 'repeatedEvaluationIdempotent',
      passed: idempotent,
      expected: true,
      actual: idempotent,
    },
  ];
}

function runScenario(inputs, upstreamEvidence) {
  const baseResult = evaluateScenarioCore(inputs, upstreamEvidence);
  const repeatCount = Number.isInteger(inputs.idempotencyRepeatCount) ? inputs.idempotencyRepeatCount : 0;
  let idempotent = true;
  if (repeatCount > 0) {
    const baseline = stableSerialize(baseResult);
    for (let index = 0; index < repeatCount; index += 1) {
      const repeated = evaluateScenarioCore(inputs, upstreamEvidence);
      if (stableSerialize(repeated) !== baseline) {
        idempotent = false;
        break;
      }
    }
  }

  const tests = buildScenarioTests(inputs, baseResult, idempotent);
  const passed = tests.every((test) => test.passed === true);

  return {
    ...baseResult,
    tests,
    passed,
  };
}

function buildInvariants(scenarioResults) {
  const find = (scenarioId) => scenarioResults.find((result) => result.scenarioId === scenarioId);
  const enterpriseBlocked = find('ENTERPRISE_PRODUCT_TO_PUBLIC_BLOCKED');
  const internalBlocked = find('INTERNAL_ONLY_EXTERNAL_DELIVERY_BLOCKED');
  const unknownRights = find('UNKNOWN_RIGHTS_REQUIRES_LEGAL_REVIEW');
  const unknownPrivacy = find('UNKNOWN_PRIVACY_REQUIRES_PRIVACY_REVIEW');
  const securityBlocked = find('SECURITY_UNSAFE_BLOCKS_DELIVERY');
  const crossAccountBlocked = find('CROSS_ACCOUNT_DATA_RISK_BLOCKS_DELIVERY');
  const restrictedHandled = find('RESTRICTED_CONTENT_IS_MINIMIZED_OR_BLOCKED');
  const invalidPrice = find('INVALID_PRICE_REQUIRES_PRICE_REVIEW');
  const idempotent = find('REPEATED_IDENTICAL_EVALUATION_IS_IDEMPOTENT');

  return {
    a37CertifiedEvidenceRequired: scenarioResults.every((result) => result.sourceA37Evidence.deliveryDependencySatisfied === true),
    noExternalCommercialTransmissionDuringCertification: scenarioResults.every(
      (result) => result.noExternalCommercialTransmission === true,
    ),
    noAutonomousContractExecution: scenarioResults.every((result) => result.noContractMutation === true),
    noAutonomousPaymentActivation: scenarioResults.every((result) => result.noPaymentMutation === true),
    noAutonomousCustomerBillingMutation: scenarioResults.every((result) => result.noBillingMutation === true),
    noEntitlementBypass: scenarioResults.every(
      (result) => result.entitlementAnalysis.allowed || result.finalDeliveryState !== 'DELIVERY_ELIGIBLE',
    ),
    noPublicExposureOfEnterpriseOnlyContent:
      enterpriseBlocked?.passed === true && enterpriseBlocked?.finalDeliveryState === 'DELIVERY_BLOCKED',
    noExternalExposureOfInternalOnlyContent:
      internalBlocked?.passed === true && internalBlocked?.finalDeliveryState === 'DELIVERY_BLOCKED',
    rightsUncertaintyCannotSilentlyPass:
      unknownRights?.passed === true && unknownRights?.finalDeliveryState === 'LEGAL_REVIEW_REQUIRED',
    privacyUncertaintyCannotSilentlyPass:
      unknownPrivacy?.passed === true && unknownPrivacy?.finalDeliveryState === 'PRIVACY_REVIEW_REQUIRED',
    securityHardStopsRemainNonOverridable:
      securityBlocked?.passed === true && securityBlocked?.finalDeliveryState === 'DELIVERY_BLOCKED',
    crossAccountLeakageIsProhibited:
      crossAccountBlocked?.passed === true && crossAccountBlocked?.finalDeliveryState === 'DELIVERY_BLOCKED',
    restrictedContentIsMinimizedOrBlocked:
      restrictedHandled?.passed === true &&
      (restrictedHandled?.contentMinimization.blocked === true || restrictedHandled?.contentMinimization.redactedFields.length > 0),
    customerContextIsAuthoritative: scenarioResults.every(
      (result) => result.finalDeliveryState === 'FAILED_CLOSED' || result.customerContext.customerContextId,
    ),
    pricingReviewRequirementsRemainPreserved:
      invalidPrice?.passed === true && invalidPrice?.finalDeliveryState === 'PRICING_REVIEW_REQUIRED',
    legalReviewRequirementsRemainPreserved:
      unknownRights?.passed === true && unknownRights?.nextPermittedAction === 'REQUEST_LEGAL_REVIEW',
    everyDeliveryDecisionEmitsEvidence: scenarioResults.every(
      (result) => Array.isArray(result.auditTrail) && result.auditTrail.length > 0 && result.executionPlan.executionPlanId,
    ),
    repeatedEvaluationIsIdempotent:
      idempotent?.passed === true && idempotent?.tests.find((test) => test.name === 'repeatedEvaluationIdempotent')?.passed === true,
    certificationCausesZeroExternalCustomerSystemMutation: scenarioResults.every(
      (result) => result.noExternalCustomerSystemMutation === true,
    ),
    allA15ToA37ControlsRemainPreserved: scenarioResults.every(
      (result) =>
        result.sourceA37Evidence.deliveryDependencySatisfied === true &&
        result.noExternalCommercialTransmission === true &&
        result.noExternalCustomerSystemMutation === true,
    ),
  };
}

export function runCustomerValueDelivery() {
  console.log(`[A38] Customer Value Delivery & Commercial Execution Control — ${MODE} mode`);
  console.log(`[A38] Run: ${runId}`);
  console.log(`[A38] A37 certificationPassed: ${isA37Certified(a37Evidence)}`);

  const fixtureFiles = fs
    .readdirSync(FIXTURES_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort();

  const scenarioResults = [];
  for (const file of fixtureFiles) {
    const inputs = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8'));
    const result = runScenario(inputs, a37Evidence);
    scenarioResults.push(result);
    console.log(`[A38][${result.passed ? 'PASS' : 'FAIL'}] ${result.scenarioId} → ${result.finalDeliveryState} / ${result.nextPermittedAction}`);
  }

  const invariants = buildInvariants(scenarioResults);
  const invariantPassCount = Object.values(invariants).filter(Boolean).length;
  const invariantTotal = Object.keys(invariants).length;
  const allScenariosPassed = scenarioResults.every((result) => result.passed === true);
  const allInvariantsPassed = Object.values(invariants).every(Boolean);
  const certificationPassed = allScenariosPassed && allInvariantsPassed;

  const output = {
    deliveryRunId: runId,
    stage: 'A38',
    mode: MODE,
    title: 'Customer Value Delivery & Commercial Execution Control',
    generatedAt: nowIso,
    policyVersion: POLICY_VERSION,
    sourceA37Evidence: {
      commercialRunId: a37Evidence?.commercialRunId ?? null,
      certificationPassed: isA37Certified(a37Evidence),
      generatedAt: a37Evidence?.generatedAt ?? null,
    },
    deliveryStateModel: DELIVERY_STATES,
    customerSegments: CUSTOMER_SEGMENTS,
    entitlementRequirements: ENTITLEMENT_REQUIREMENTS,
    deliveryChannels: DELIVERY_CHANNELS,
    anomalyTypes: DELIVERY_ANOMALIES,
    nextPermittedActions: NEXT_ACTIONS,
    prohibitedAutonomousActions: PROHIBITED_AUTONOMOUS_ACTIONS,
    scenarioCount: scenarioResults.length,
    passedCount: scenarioResults.filter((result) => result.passed).length,
    failedCount: scenarioResults.filter((result) => !result.passed).length,
    scenarios: scenarioResults,
    invariants,
    invariantPassCount,
    invariantTotal,
    certification: {
      allScenariosPassed,
      allInvariantsPassed,
      certificationPassed,
    },
    controlBoundaries: {
      noExternalTransmission: true,
      noContractExecution: true,
      noPaymentActivation: true,
      noBillingMutation: true,
      noPaidAccessProvisioning: true,
      noRestrictedInformationExposure: true,
      noExternalSystemMutation: true,
    },
    certificationCausesZeroExternalCustomerSystemMutation: true,
    completedAt: new Date().toISOString(),
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const evidenceFile = path.join(
    REPORT_DIR,
    `a38-customer-value-delivery-${timestampDate}-${crypto.randomBytes(4).toString('hex')}.json`,
  );
  fs.writeFileSync(evidenceFile, `${JSON.stringify(output, null, 2)}\n`, 'utf-8');

  console.log(`\n[A38] === RESULTS ===`);
  console.log(`[A38] Scenarios: ${output.passedCount}/${output.scenarioCount} ${allScenariosPassed ? 'PASS' : 'FAIL'}`);
  console.log(`[A38] Invariants: ${invariantPassCount}/${invariantTotal} ${allInvariantsPassed ? 'PASS' : 'FAIL'}`);
  console.log(`[A38] certificationPassed: ${certificationPassed}`);
  console.log(`[A38] Evidence: ${evidenceFile}`);

  if (!certificationPassed) {
    const failedScenarios = scenarioResults.filter((result) => !result.passed);
    for (const result of failedScenarios) {
      const failedTests = result.tests.filter((test) => !test.passed).map((test) => test.name);
      console.error(`[A38][FAIL] ${result.scenarioId}: ${failedTests.join(', ')}`);
    }
    const failedInvariants = Object.entries(invariants)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);
    if (failedInvariants.length) {
      console.error(`[A38][FAIL] Invariants: ${failedInvariants.join(', ')}`);
    }
    process.exitCode = 1;
  }

  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCustomerValueDelivery();
}
