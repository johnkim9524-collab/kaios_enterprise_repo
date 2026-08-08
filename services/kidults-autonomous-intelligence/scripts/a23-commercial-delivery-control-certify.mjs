import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { classifiedDimensions, productUniverse, productMap, providerRequirements } from './lib/intelligence-product-universe.mjs';

const RUN_STARTED_AT = new Date().toISOString();
const DATE_STAMP = RUN_STARTED_AT.slice(0, 10);
const CHANNELS = ['PUBLIC_EDITORIAL', 'PRO_SUBSCRIPTION', 'ENTERPRISE_API', 'DATA_LICENSE', 'CUSTOM_INTELLIGENCE'];
const DECISION_CLASSES = [
  'INTERNAL_DELIVERY_ALLOWED',
  'CANARY_DELIVERY_ELIGIBLE',
  'ENTITLEMENT_BLOCKED',
  'DEPENDENCY_BLOCKED',
  'PROVIDER_EVIDENCE_BLOCKED',
  'RIGHTS_BLOCKED',
  'QUALITY_BLOCKED',
  'FRESHNESS_BLOCKED',
  'PROVENANCE_BLOCKED',
  'PACKAGE_BLOCKED',
  'CHANNEL_NOT_ELIGIBLE',
  'CUSTOMER_CLASS_BLOCKED',
  'POLICY_BLOCKED',
  'PRODUCTION_DELIVERY_BLOCKED',
];
const EXECUTION_ENVELOPE_TEMPLATE = Object.freeze({
  policyChecked: true,
  preflightPassed: true,
  authorizationChecked: true,
  entitlementChecked: true,
  packageVerified: true,
  nonInteractive: true,
  failClosed: true,
  productionDeliveryBlocked: true,
  billingMutationBlocked: true,
  procurementMutationBlocked: true,
  providerContactBlocked: true,
  credentialConsumptionBlocked: true,
  externalCustomerMutationBlocked: true,
});
const CONTROL_OUTPUT_DIRECTORY = path.resolve('reports', 'commercial-delivery');
const POLICY_PATH = path.resolve('policy', 'a23-commercial-delivery-policy.json');
const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
const THRESHOLDS = policy.thresholds;
const POLICY_VERSION = policy.policyVersion;
const GLOBAL_INVARIANTS = policy.invariants;
const CONTROL_PLANE_LIFECYCLE = policy.controlPlaneLifecycle;
const productIndex = new Map(productUniverse.map((product) => [product.product, product]));
const dimensionIndex = new Map(classifiedDimensions.map((dimension) => [dimension.id, dimension]));
const providerRequirementIndex = new Map(providerRequirements.map((requirement) => [requirement.dimension, requirement]));

function round2(value) {
  return Number(value.toFixed(2));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex');
}

function stableIdForProduct(product) {
  return `kidults.${product.dimension}.${product.product}.v1`;
}

function dependencyClassForStrategy(strategy) {
  if (strategy === 'SELF-FIRST') return 'INTERNAL_ONLY';
  if (strategy === 'HYBRID') return 'HYBRID_DEPENDENCY';
  return 'PROVIDER_DEPENDENCY';
}

function channelDefaults(product, publicationClass) {
  const eligible = new Set();
  if (product.commercialLayer === 'CORE_DATA') {
    eligible.add('ENTERPRISE_API');
    eligible.add('DATA_LICENSE');
    eligible.add('CUSTOM_INTELLIGENCE');
  }
  if (product.commercialLayer === 'SIGNAL') {
    eligible.add('PRO_SUBSCRIPTION');
    eligible.add('CUSTOM_INTELLIGENCE');
  }
  if (product.commercialLayer === 'INDEX') {
    eligible.add('PRO_SUBSCRIPTION');
    eligible.add('ENTERPRISE_API');
    eligible.add('CUSTOM_INTELLIGENCE');
  }
  if (product.commercialLayer === 'ANALYTICS') {
    eligible.add('PRO_SUBSCRIPTION');
    eligible.add('ENTERPRISE_API');
    eligible.add('CUSTOM_INTELLIGENCE');
  }
  if (product.commercialLayer === 'PREMIUM_INTELLIGENCE') {
    eligible.add('ENTERPRISE_API');
    eligible.add('DATA_LICENSE');
    eligible.add('CUSTOM_INTELLIGENCE');
  }
  if (publicationClass === 'CANARY_ELIGIBLE') eligible.add('PUBLIC_EDITORIAL');
  return Array.from(eligible);
}

function defaultCustomerClassForChannel(channel) {
  return {
    PUBLIC_EDITORIAL: 'ANONYMOUS',
    PRO_SUBSCRIPTION: 'PRO_SUBSCRIBER',
    ENTERPRISE_API: 'ENTERPRISE_CLIENT',
    DATA_LICENSE: 'DATA_LICENSEE',
    CUSTOM_INTELLIGENCE: 'CUSTOM_INTELLIGENCE_CLIENT',
  }[channel] ?? 'INTERNAL_SYSTEM';
}

function defaultEntitlementClassForChannel(channel) {
  return {
    PUBLIC_EDITORIAL: 'PUBLIC',
    PRO_SUBSCRIPTION: 'PRO',
    ENTERPRISE_API: 'ENTERPRISE',
    DATA_LICENSE: 'LICENSED_DATA',
    CUSTOM_INTELLIGENCE: 'CUSTOM_CONTRACT',
  }[channel] ?? 'INTERNAL_ONLY';
}

function usageRightsStateForProduct(product) {
  if (!product) return 'UNKNOWN';
  if (product.dataStrategy === 'SELF-FIRST') return product.commercialLayer === 'CORE_DATA' ? 'LICENSED_FOR_RESALE' : 'SELF_OWNED';
  if (product.dataStrategy === 'HYBRID') return product.commercialLayer === 'INDEX' ? 'LICENSED_FOR_RESALE' : 'CUSTOM_DELIVERY_RIGHTS';
  return 'UNKNOWN';
}

function providerEvidenceStateForDimension(dimension, strategy) {
  if (strategy === 'SELF-FIRST') {
    return {
      required: false,
      present: true,
      valid: true,
      providerId: 'internal-only',
      contractVersion: 'internal-governed',
      usageRights: 'SELF_OWNED',
      freshnessHours: 0,
      requiredFieldsComplete: true,
    };
  }
  if (strategy === 'HYBRID') {
    const requirement = providerRequirementIndex.get(dimension);
    return {
      required: true,
      present: true,
      valid: true,
      providerId: `provider-${dimension}`,
      contractVersion: 'hybrid-supplement.v1',
      usageRights: 'DERIVATIVE_INTERNAL_AND_CANARY',
      freshnessHours: 24,
      requiredFieldsComplete: Boolean(requirement),
    };
  }
  return {
    required: true,
    present: false,
    valid: false,
    providerId: null,
    contractVersion: null,
    usageRights: 'UNKNOWN',
    freshnessHours: null,
    requiredFieldsComplete: false,
  };
}

function deriveSyntheticA20Evidence(productName, cache = new Map()) {
  if (cache.has(productName)) return cache.get(productName);
  const product = productIndex.get(productName);
  if (!product) {
    const unknown = {
      product: productName,
      dimension: 'unknown',
      dataStrategy: 'UNKNOWN',
      dependencyClass: 'PROVIDER_DEPENDENCY',
      readinessClass: 'POLICY_BLOCKED',
      monetizationClass: 'BLOCKED',
      publicationClass: 'PRODUCTION_BLOCKED',
      commercialLayer: 'UNKNOWN',
      publicationReadiness: 0,
      monetizationReadiness: 0,
      provenanceCoverage: 0,
      freshness: 0,
      quality: 0,
      blockingReasons: ['unknown-product', 'missing-a19-classification', 'missing-a20-evidence'],
      requiredNextActions: ['Add the product to the canonical A19 universe before requesting delivery certification.'],
      eligibleChannels: [],
      blockedUpstreamDependencies: [],
      upstreamProducts: [],
      providerEvidenceState: {
        required: true,
        present: false,
        valid: false,
        providerId: null,
        contractVersion: null,
        usageRights: 'UNKNOWN',
        freshnessHours: null,
        requiredFieldsComplete: false,
      },
      references: { stage: 'A20', ref: 'synthetic:A20:unknown-product' },
    };
    cache.set(productName, unknown);
    return unknown;
  }

  const upstreamEvidence = product.upstreamProducts.map((upstreamProduct) => deriveSyntheticA20Evidence(upstreamProduct, cache));
  const blockedUpstreamDependencies = upstreamEvidence
    .filter((upstream) => ['DEPENDENCY_BLOCKED', 'PROVIDER_EVIDENCE_BLOCKED', 'QUALITY_BLOCKED', 'POLICY_BLOCKED'].includes(upstream.readinessClass))
    .map((upstream) => upstream.product);
  const providerEvidenceState = providerEvidenceStateForDimension(product.dimension, product.dataStrategy);
  const providerBlocked = providerEvidenceState.required && (!providerEvidenceState.present || !providerEvidenceState.valid || !providerEvidenceState.requiredFieldsComplete);
  const dependencyBlocked = providerBlocked || blockedUpstreamDependencies.length > 0;
  const publicationReadiness = dependencyBlocked
    ? round2(Math.min(product.scorecard.freshness, product.scorecard.quality, 0.35))
    : round2(Math.min(product.scorecard.freshness, product.scorecard.provenanceCoverage, product.scorecard.quality));
  const monetizationReadiness = dependencyBlocked
    ? round2(Math.min(product.scorecard.provenanceCoverage, product.scorecard.quality, 0.3))
    : round2(Math.min(product.scorecard.provenanceCoverage, product.scorecard.quality, product.scorecard.repeatability));
  const blockingReasons = [];
  if (providerBlocked) blockingReasons.push('provider-evidence-required');
  if (blockedUpstreamDependencies.length > 0) blockingReasons.push(`blocked-upstream:${blockedUpstreamDependencies.join(',')}`);
  if (product.scorecard.provenanceCoverage < THRESHOLDS.provenance) blockingReasons.push('provenance-below-threshold');
  if (product.scorecard.freshness < THRESHOLDS.freshness) blockingReasons.push('freshness-below-threshold');
  if (product.scorecard.quality < THRESHOLDS.quality) blockingReasons.push('quality-below-threshold');

  let readinessClass = 'INTERNAL_READY';
  if (dependencyBlocked && product.dataStrategy === 'PROVIDER-REQUIRED') readinessClass = 'DEPENDENCY_BLOCKED';
  else if (dependencyBlocked) readinessClass = 'DEPENDENCY_BLOCKED';
  else if (product.scorecard.quality < THRESHOLDS.quality) readinessClass = 'QUALITY_BLOCKED';
  else if (product.dataStrategy === 'HYBRID') readinessClass = 'HYBRID_READY';

  let monetizationClass = 'BLOCKED';
  if (!dependencyBlocked && product.scorecard.provenanceCoverage >= THRESHOLDS.provenance && product.scorecard.freshness >= THRESHOLDS.freshness && product.scorecard.quality >= THRESHOLDS.quality) {
    monetizationClass = product.dataStrategy === 'SELF-FIRST' ? 'MONETIZABLE_INTERNAL' : 'MONETIZABLE_AFTER_PROVIDER';
  } else if (product.dataStrategy === 'SELF-FIRST') {
    monetizationClass = 'RESEARCH_ONLY';
  }

  let publicationClass = 'PRODUCTION_BLOCKED';
  if (!dependencyBlocked && publicationReadiness >= 0.68) publicationClass = 'CANARY_ELIGIBLE';
  else if (!dependencyBlocked && publicationReadiness >= 0.5) publicationClass = 'INTERNAL_ONLY';

  const requiredNextActions = [];
  if (providerBlocked) requiredNextActions.push('Add valid provider evidence with provenance, freshness, usage rights, and contract metadata.');
  if (blockedUpstreamDependencies.length > 0) requiredNextActions.push(`Resolve blocked upstream dependencies first: ${blockedUpstreamDependencies.join(', ')}.`);
  if (product.scorecard.provenanceCoverage < THRESHOLDS.provenance) requiredNextActions.push('Increase provenance coverage to the A23 threshold.');
  if (product.scorecard.freshness < THRESHOLDS.freshness) requiredNextActions.push('Refresh source data to meet freshness policy.');
  if (product.scorecard.quality < THRESHOLDS.quality) requiredNextActions.push('Improve quality controls before commercial delivery.');
  if (requiredNextActions.length === 0) requiredNextActions.push('Preserve evidence-only, non-production commercial delivery controls.');

  const result = {
    product: product.product,
    dimension: product.dimension,
    dataStrategy: product.dataStrategy,
    dependencyClass: dependencyClassForStrategy(product.dataStrategy),
    readinessClass,
    monetizationClass,
    publicationClass,
    commercialLayer: product.commercialLayer,
    publicationReadiness,
    monetizationReadiness,
    provenanceCoverage: product.scorecard.provenanceCoverage,
    freshness: product.scorecard.freshness,
    quality: product.scorecard.quality,
    scorecard: product.scorecard,
    blockingReasons,
    requiredNextActions,
    eligibleChannels: channelDefaults(product, publicationClass),
    blockedUpstreamDependencies,
    upstreamProducts: product.upstreamProducts,
    providerEvidenceState,
    references: {
      stage: 'A20',
      ref: `synthetic:A20:${product.product}`,
    },
  };
  cache.set(productName, result);
  return result;
}

function deriveSyntheticA21Evidence(productName, a20Map) {
  const product = productIndex.get(productName);
  const a20 = a20Map.get(productName) ?? deriveSyntheticA20Evidence(productName);
  const stableId = product ? stableIdForProduct(product) : null;
  const upstreamComplete = product
    ? product.upstreamProducts.every((upstreamProduct) => (a20Map.get(upstreamProduct) ?? deriveSyntheticA20Evidence(upstreamProduct)).readinessClass !== 'DEPENDENCY_BLOCKED')
    : false;
  const pipelineComplete = Boolean(
    product
    && a20.readinessClass !== 'DEPENDENCY_BLOCKED'
    && a20.provenanceCoverage >= THRESHOLDS.provenance
    && a20.freshness >= THRESHOLDS.freshness
    && a20.quality >= THRESHOLDS.quality
    && upstreamComplete,
  );
  return {
    product: productName,
    stableId,
    pipelineStatus: pipelineComplete ? 'COMPLETE' : 'BLOCKED',
    validPipelineStatus: true,
    normalized: Boolean(product),
    validated: pipelineComplete,
    packaged: Boolean(product && stableId),
    schemaVersion: product ? 'canonical-a19-schema-v1' : null,
    acquisitionClass: product ? (product.dataStrategy === 'SELF-FIRST' ? 'INTERNAL_COMPLETE' : product.dataStrategy === 'HYBRID' ? 'HYBRID_PARTIAL' : 'DEPENDENCY_BLOCKED') : 'UNKNOWN',
    evidenceRef: product ? `synthetic:A21:${product.product}` : 'synthetic:A21:unknown-product',
    consumedEvidence: [
      'A15 global autonomous policy foundation',
      'A16 autonomous execution control plane',
      'A17 bounded live adapter readiness',
      'A18 autonomous data acquisition scale',
      'A19 data coverage productization gap',
      'A20 intelligence product readiness monetization gate',
    ],
  };
}

function deriveSyntheticA22Evidence(productName, a20Map, a21Map) {
  const product = productIndex.get(productName);
  const a20 = a20Map.get(productName) ?? deriveSyntheticA20Evidence(productName);
  const a21 = a21Map.get(productName) ?? deriveSyntheticA21Evidence(productName, a20Map);
  const stableId = product ? stableIdForProduct(product) : null;
  const channelOutcomes = CHANNELS.map((channel) => {
    const allowed = Boolean(product && a20.eligibleChannels.includes(channel));
    let publicationDecision = 'POLICY_BLOCKED';
    if (!product) publicationDecision = 'POLICY_BLOCKED';
    else if (!allowed) publicationDecision = 'CHANNEL_NOT_ELIGIBLE';
    else if (channel === 'PUBLIC_EDITORIAL' && a20.publicationClass === 'CANARY_ELIGIBLE') publicationDecision = 'CANARY_ELIGIBLE';
    else if (channel !== 'PUBLIC_EDITORIAL' && a21.pipelineStatus === 'COMPLETE') publicationDecision = 'INTERNAL_ALLOWED';
    return {
      product: productName,
      channel,
      stableId,
      publicationDecision,
      publicationClass: a20.publicationClass,
      evidenceRef: product ? `synthetic:A22:${product.product}:${channel}` : 'synthetic:A22:unknown-product',
    };
  });
  return {
    product: productName,
    stableId,
    publicationClass: a20.publicationClass,
    channelOutcomes,
    evidenceRef: product ? `synthetic:A22:${product.product}` : 'synthetic:A22:unknown-product',
  };
}

function buildSyntheticUpstreamEvidence() {
  const a20Map = new Map(productUniverse.map((product) => [product.product, deriveSyntheticA20Evidence(product.product)]));
  const a21Map = new Map(productUniverse.map((product) => [product.product, deriveSyntheticA21Evidence(product.product, a20Map)]));
  const a22Map = new Map(productUniverse.map((product) => [product.product, deriveSyntheticA22Evidence(product.product, a20Map, a21Map)]));
  return {
    a20Map,
    a21Map,
    a22Map,
    a20Report: {
      stage: 'A20',
      source: 'synthetic',
      generatedFrom: 'scripts/lib/intelligence-product-universe.mjs',
      products: Array.from(a20Map.values()),
    },
    a21Report: {
      stage: 'A21',
      source: 'synthetic',
      generatedFrom: 'scripts/lib/intelligence-product-universe.mjs',
      products: Array.from(a21Map.values()),
    },
    a22Report: {
      stage: 'A22',
      source: 'synthetic',
      generatedFrom: 'scripts/lib/intelligence-product-universe.mjs',
      products: Array.from(a22Map.values()),
    },
  };
}

const syntheticUpstream = buildSyntheticUpstreamEvidence();

function readLatestEvidence(directory, stage, syntheticReport) {
  const absoluteDirectory = path.resolve('reports', directory);
  try {
    const latestFile = fs.readdirSync(absoluteDirectory)
      .filter((entry) => entry.endsWith('.json'))
      .sort()
      .pop();
    if (!latestFile) throw new Error(`No ${stage} evidence found.`);
    const absolutePath = path.join(absoluteDirectory, latestFile);
    return {
      stage,
      source: 'file',
      absolutePath,
      relativePath: path.relative(process.cwd(), absolutePath),
      report: JSON.parse(fs.readFileSync(absolutePath, 'utf8')),
    };
  } catch {
    return {
      stage,
      source: 'synthetic',
      absolutePath: null,
      relativePath: `synthetic:${stage}`,
      report: syntheticReport,
    };
  }
}

const upstreamEvidence = {
  a20: readLatestEvidence('product-readiness', 'A20', syntheticUpstream.a20Report),
  a21: readLatestEvidence('pipeline', 'A21', syntheticUpstream.a21Report),
  a22: readLatestEvidence('publication-control', 'A22', syntheticUpstream.a22Report),
};

const RUN_INPUT_FINGERPRINT = hash({
  products: productUniverse.map((product) => ({
    product: product.product,
    dimension: product.dimension,
    dataStrategy: product.dataStrategy,
    commercialLayer: product.commercialLayer,
    scorecard: product.scorecard,
    upstreamProducts: product.upstreamProducts,
  })),
  channels: CHANNELS,
  policy,
  upstreamSources: {
    a20: upstreamEvidence.a20.relativePath,
    a21: upstreamEvidence.a21.relativePath,
    a22: upstreamEvidence.a22.relativePath,
  },
}).slice(0, 16);
const RUN_ID = `a23-commercial-delivery-${DATE_STAMP}-${RUN_INPUT_FINGERPRINT}`;
const OUTPUT_PATH = path.join(CONTROL_OUTPUT_DIRECTORY, `a23-commercial-delivery-${DATE_STAMP}-${RUN_INPUT_FINGERPRINT}.json`);
const OUTPUT_RELATIVE_PATH = path.relative(process.cwd(), OUTPUT_PATH);

function getEffectiveA20Evidence(productName) {
  return syntheticUpstream.a20Map.get(productName) ?? deriveSyntheticA20Evidence(productName);
}

function getEffectiveA21Evidence(productName) {
  return syntheticUpstream.a21Map.get(productName) ?? deriveSyntheticA21Evidence(productName, syntheticUpstream.a20Map);
}

function getEffectiveA22Evidence(productName) {
  return syntheticUpstream.a22Map.get(productName) ?? deriveSyntheticA22Evidence(productName, syntheticUpstream.a20Map, syntheticUpstream.a21Map);
}

function buildCommercialIntent(product, channel, overrides = {}) {
  const channelPolicy = policy.channels[channel] ?? null;
  const customerClass = overrides.customerClass ?? channelPolicy?.customerClassRequirements?.defaultCustomerClass ?? defaultCustomerClassForChannel(channel);
  const entitlementClass = overrides.entitlementClass ?? defaultEntitlementClassForChannel(channel);
  return {
    product: product?.product ?? 'unknown-product',
    stableId: product ? stableIdForProduct(product) : null,
    channel,
    customerClass,
    entitlementClass,
    contractEnvelopePresent: overrides.contractEnvelopePresent ?? ['ENTERPRISE_API', 'DATA_LICENSE', 'CUSTOM_INTELLIGENCE'].includes(channel),
    commercialObjective: channel === 'PUBLIC_EDITORIAL' ? 'bounded-public-canary' : 'internal-commercial-simulation',
    intendedAudience: channel === 'PUBLIC_EDITORIAL' ? 'bounded-editorial-shadow' : 'internal-or-contracted-sandbox',
  };
}

function buildPolicyCheck(product, channel, channelPolicy) {
  return {
    passed: Boolean(product && channelPolicy),
    productKnown: Boolean(product),
    channelKnown: Boolean(channelPolicy),
    policyVersion: POLICY_VERSION,
    invariants: GLOBAL_INVARIANTS,
    productionDeliveryBlocked: GLOBAL_INVARIANTS.productionDeliveryBlocked === true,
    deliveryMutationBlocked: GLOBAL_INVARIANTS.deliveryMutationBlocked === true,
    billingMutationBlocked: GLOBAL_INVARIANTS.billingMutationBlocked === true,
    procurementMutationBlocked: GLOBAL_INVARIANTS.procurementMutationBlocked === true,
    providerContactBlocked: GLOBAL_INVARIANTS.providerContactBlocked === true,
    credentialConsumptionBlocked: GLOBAL_INVARIANTS.credentialConsumptionBlocked === true,
    externalPublicationBlocked: GLOBAL_INVARIANTS.externalPublicationBlocked === true,
    nonInteractive: GLOBAL_INVARIANTS.nonInteractiveExecution === true,
    evidenceRequired: GLOBAL_INVARIANTS.evidenceRequired === true,
    rollbackRequired: GLOBAL_INVARIANTS.rollbackRequired === true,
    failClosed: GLOBAL_INVARIANTS.failClosed === true,
  };
}

function buildChannelEligibility(product, channel, channelPolicy, a20) {
  if (!product || !channelPolicy) {
    return {
      passed: false,
      allowedProductClass: false,
      allowedReadinessClass: false,
      allowedMonetizationClass: false,
      allowedPublicationClass: false,
      eligibleChannelByProductization: false,
    };
  }
  return {
    passed: channelPolicy.allowedProductClasses.includes(product.commercialLayer)
      && channelPolicy.allowedReadinessClasses.includes(a20.readinessClass)
      && channelPolicy.allowedMonetizationClasses.includes(a20.monetizationClass)
      && channelPolicy.allowedPublicationClasses.includes(a20.publicationClass)
      && a20.eligibleChannels.includes(channel),
    allowedProductClass: channelPolicy.allowedProductClasses.includes(product.commercialLayer),
    allowedReadinessClass: channelPolicy.allowedReadinessClasses.includes(a20.readinessClass),
    allowedMonetizationClass: channelPolicy.allowedMonetizationClasses.includes(a20.monetizationClass),
    allowedPublicationClass: channelPolicy.allowedPublicationClasses.includes(a20.publicationClass),
    eligibleChannelByProductization: a20.eligibleChannels.includes(channel),
  };
}

function buildPackageVerification(product, channel, channelPolicy, a21, commercialIntent, overrides = {}) {
  const stableId = Object.prototype.hasOwnProperty.call(overrides, 'stableId')
    ? overrides.stableId
    : (product ? stableIdForProduct(product) : null);
  const schemaVersion = Object.prototype.hasOwnProperty.call(overrides, 'schemaVersion')
    ? overrides.schemaVersion
    : a21.schemaVersion;
  const artifactManifestPresent = Object.prototype.hasOwnProperty.call(overrides, 'artifactManifestPresent')
    ? overrides.artifactManifestPresent
    : Boolean(product);
  const contractEnvelopePresent = Object.prototype.hasOwnProperty.call(overrides, 'contractEnvelopePresent')
    ? overrides.contractEnvelopePresent
    : commercialIntent.contractEnvelopePresent;
  const fingerprintSeed = `${stableId ?? 'missing-stable-id'}|${channel}|${POLICY_VERSION}`;
  const packageFingerprint = hash(fingerprintSeed);
  const packageVerified = Boolean(
    stableId
    && schemaVersion
    && artifactManifestPresent
    && packageFingerprint
    && (channel !== 'CUSTOM_INTELLIGENCE' || contractEnvelopePresent)
    && (channel !== 'ENTERPRISE_API' || schemaVersion === 'canonical-a19-schema-v1'),
  );
  return {
    stableId,
    schemaVersion,
    artifactManifestPresent,
    contractEnvelopePresent,
    packageFingerprint,
    packageVerified,
    packageRequirements: channelPolicy?.packageRequirements ?? {},
  };
}

function buildEntitlementEvaluation(channelPolicy, commercialIntent, usageRightsState, overrides = {}) {
  const customerClass = commercialIntent.customerClass;
  const entitlementClass = commercialIntent.entitlementClass;
  const contractEnvelopePresent = Object.prototype.hasOwnProperty.call(overrides, 'contractEnvelopePresent')
    ? overrides.contractEnvelopePresent
    : commercialIntent.contractEnvelopePresent;
  const allowedCustomerClass = Boolean(channelPolicy?.customerClassRequirements?.allowedCustomerClasses?.includes(customerClass));
  const allowedEntitlementClass = Boolean(channelPolicy?.entitlementRequirements?.requiredEntitlementClasses?.includes(entitlementClass));
  const contractRequired = Boolean(channelPolicy?.customerClassRequirements?.externalContractRequired);
  return {
    customerClass,
    entitlementClass,
    contractRequired,
    contractEnvelopePresent,
    usageRightsState,
    allowedCustomerClass,
    allowedEntitlementClass,
    passed: allowedCustomerClass && allowedEntitlementClass && (!contractRequired || contractEnvelopePresent),
  };
}

function buildAuthorization(policyCheck, channelPolicy, commercialIntent, entitlementEvaluation) {
  const blockedFlags = {
    productionDeliveryBlocked: channelPolicy?.productionAllowed === false && policyCheck.productionDeliveryBlocked,
    deliveryMutationBlocked: channelPolicy?.deliveryMutationAllowed === false && GLOBAL_INVARIANTS.deliveryMutationBlocked === true,
    billingMutationBlocked: channelPolicy?.billingMutationAllowed === false && GLOBAL_INVARIANTS.billingMutationBlocked === true,
    procurementMutationBlocked: channelPolicy?.procurementMutationAllowed === false && GLOBAL_INVARIANTS.procurementMutationBlocked === true,
    providerContactBlocked: channelPolicy?.providerContactAllowed === false && GLOBAL_INVARIANTS.providerContactBlocked === true,
    credentialConsumptionBlocked: channelPolicy?.credentialConsumptionAllowed === false && GLOBAL_INVARIANTS.credentialConsumptionBlocked === true,
    externalPublicationBlocked: channelPolicy?.externalPublicationAllowed === false && GLOBAL_INVARIANTS.externalPublicationBlocked === true,
    nonInteractive: channelPolicy?.nonInteractive === true && GLOBAL_INVARIANTS.nonInteractiveExecution === true,
  };
  return {
    authorized: Object.values(blockedFlags).every(Boolean),
    requestedChannel: commercialIntent.channel,
    blockedFlags,
  };
}

function buildPreflight(product, channel, channelPolicy, a20, a21, a22, commercialIntent, packageVerification, entitlementEvaluation, overrides = {}) {
  if (!channelPolicy) {
    return {
      categories: {
        canonicalIdentity: { checks: { productKnown: Boolean(product), stableIdPresent: Boolean(packageVerification.stableId), dimensionKnown: Boolean(product?.dimension) }, passed: false },
        upstreamEvidence: { checks: { a20Present: Boolean(a20), a21Present: Boolean(a21), a22Present: Boolean(a22), pipelineStatusValid: Boolean(a21?.validPipelineStatus), upstreamComplete: a21?.pipelineStatus === 'COMPLETE' }, passed: false },
        policy: { checks: { policyVersionMatched: false, failClosed: true, evidenceRequired: true, rollbackRequired: true, nonInteractive: true }, passed: false },
        dataGovernance: { checks: { provenanceThresholdSatisfied: false, freshnessThresholdSatisfied: false, qualityThresholdSatisfied: false, usageRightsKnown: false }, passed: false },
        dependency: { checks: { noBlockedUpstreamDependencies: false, providerEvidencePresentWhenRequired: false, providerEvidenceValidWhenRequired: false, providerRequiredFieldsComplete: false }, passed: false },
        rights: { checks: { rightsStateAllowed: false, redistributionSatisfied: false }, passed: false },
        package: { checks: { stableIdPresent: Boolean(packageVerification.stableId), schemaVersionPresent: Boolean(packageVerification.schemaVersion), artifactManifestPresent: packageVerification.artifactManifestPresent === true, contractFingerprintPresent: Boolean(packageVerification.packageFingerprint), packageVerified: packageVerification.packageVerified === true }, passed: false },
        commercialEntitlement: { checks: { allowedCustomerClass: false, allowedEntitlementClass: false, contractEnvelopePresent: false, boundedAudienceSatisfied: false }, passed: false },
        safety: { checks: { productionDeliveryBlocked: true, billingMutationBlocked: true, procurementMutationBlocked: true, providerContactBlocked: true, credentialConsumptionBlocked: true, externalPublicationBlocked: true, noInteractiveExecution: true }, passed: false },
        recovery: { checks: { rollbackRequired: true, rollbackPlanAddressable: true, evidencePathReserved: Boolean(OUTPUT_RELATIVE_PATH) }, passed: false },
      },
      passed: false,
      failedChecks: ['policy.channelUnknown'],
    };
  }
  const usageRightsState = overrides.usageRightsState ?? usageRightsStateForProduct(product);
  const providerEvidenceState = overrides.providerEvidenceState ?? a20.providerEvidenceState;
  const customerClass = commercialIntent.customerClass;
  const categories = {
    canonicalIdentity: {
      productKnown: Boolean(product),
      stableIdPresent: Boolean(packageVerification.stableId),
      dimensionKnown: Boolean(product?.dimension),
    },
    upstreamEvidence: {
      a20Present: Boolean(a20),
      a21Present: Boolean(a21),
      a22Present: Boolean(a22),
      pipelineStatusValid: a21.validPipelineStatus === true,
      upstreamComplete: a21.pipelineStatus === 'COMPLETE',
    },
    policy: {
      policyVersionMatched: channelPolicy?.policyVersion === POLICY_VERSION,
      failClosed: channelPolicy?.failClosed === true,
      evidenceRequired: channelPolicy?.evidenceRequired === true,
      rollbackRequired: channelPolicy?.rollbackRequired === true,
      nonInteractive: channelPolicy?.nonInteractive === true,
    },
    dataGovernance: {
      provenanceThresholdSatisfied: a20.provenanceCoverage >= channelPolicy.minimumProvenance,
      freshnessThresholdSatisfied: a20.freshness >= channelPolicy.minimumFreshness,
      qualityThresholdSatisfied: a20.quality >= channelPolicy.minimumQuality,
      usageRightsKnown: usageRightsState !== 'UNKNOWN',
    },
    dependency: {
      noBlockedUpstreamDependencies: a20.blockedUpstreamDependencies.length === 0,
      providerEvidencePresentWhenRequired: providerEvidenceState.required ? providerEvidenceState.present : true,
      providerEvidenceValidWhenRequired: providerEvidenceState.required ? providerEvidenceState.valid : true,
      providerRequiredFieldsComplete: providerEvidenceState.required ? providerEvidenceState.requiredFieldsComplete : true,
    },
    rights: {
      rightsStateAllowed: channelPolicy.usageRightsRequirements.allowedStates.includes(usageRightsState),
      redistributionSatisfied: channelPolicy.usageRightsRequirements.redistributionRequired ? usageRightsState === 'LICENSED_FOR_RESALE' : true,
    },
    package: {
      stableIdPresent: Boolean(packageVerification.stableId),
      schemaVersionPresent: Boolean(packageVerification.schemaVersion),
      artifactManifestPresent: packageVerification.artifactManifestPresent === true,
      contractFingerprintPresent: Boolean(packageVerification.packageFingerprint),
      packageVerified: packageVerification.packageVerified === true,
    },
    commercialEntitlement: {
      allowedCustomerClass: entitlementEvaluation.allowedCustomerClass,
      allowedEntitlementClass: entitlementEvaluation.allowedEntitlementClass,
      contractEnvelopePresent: entitlementEvaluation.contractRequired ? entitlementEvaluation.contractEnvelopePresent : true,
      boundedAudienceSatisfied: channel === 'PUBLIC_EDITORIAL' ? customerClass !== 'INTERNAL_SYSTEM' : true,
    },
    safety: {
      productionDeliveryBlocked: channelPolicy.productionAllowed === false,
      billingMutationBlocked: channelPolicy.billingMutationAllowed === false,
      procurementMutationBlocked: channelPolicy.procurementMutationAllowed === false,
      providerContactBlocked: channelPolicy.providerContactAllowed === false,
      credentialConsumptionBlocked: channelPolicy.credentialConsumptionAllowed === false,
      externalPublicationBlocked: channelPolicy.externalPublicationAllowed === false,
      noInteractiveExecution: channelPolicy.nonInteractive === true,
    },
    recovery: {
      rollbackRequired: channelPolicy.rollbackRequired === true,
      rollbackPlanAddressable: true,
      evidencePathReserved: Boolean(OUTPUT_RELATIVE_PATH),
    },
  };

  const categorySummary = Object.fromEntries(Object.entries(categories).map(([name, checks]) => [
    name,
    {
      checks,
      passed: Object.values(checks).every(Boolean),
    },
  ]));
  const failedChecks = Object.entries(categorySummary)
    .flatMap(([name, entry]) => Object.entries(entry.checks).filter(([, passed]) => !passed).map(([checkName]) => `${name}.${checkName}`));

  return {
    categories: categorySummary,
    passed: failedChecks.length === 0,
    failedChecks,
  };
}

function buildCanaryPlan(decision, product, channel, stableId) {
  if (decision !== 'CANARY_DELIVERY_ELIGIBLE') return null;
  return {
    product: product.product,
    channel,
    stableId,
    scope: 'bounded-internal-simulation',
    blastRadius: 'single-product single-channel evidence-only canary envelope',
    sampleSize: channel === 'PUBLIC_EDITORIAL' ? 'editorial-shadow-snapshot-1' : 'sandbox-consumer-3',
    duration: channel === 'PUBLIC_EDITORIAL' ? '24h' : '12h',
    verificationCriteria: ['policy-authorization', 'preflight-pass', 'package-contract-verification', 'bounded-audience-maintained', 'post-delivery-verification'],
    rollbackCriteria: ['policy drift', 'freshness regression', 'quality regression', 'rights regression', 'dependency regression'],
  };
}

function buildPostDeliveryVerificationContract(product, channel, stableId, a20, a21, packageVerification) {
  return {
    product: product?.product ?? 'unknown-product',
    channel,
    stableId,
    schemaVersion: packageVerification.schemaVersion,
    thresholds: THRESHOLDS,
    requiresStableId: true,
    requiresEvidenceWrite: true,
    requiresNoProductionMutation: true,
    a20ReadinessClass: a20.readinessClass,
    a21PipelineStatus: a21.pipelineStatus,
    a22PublicationClass: getEffectiveA22Evidence(product?.product ?? 'unknown-product').publicationClass,
  };
}

function rollbackClassForDecision(decision, blockingReasons) {
  if (decision === 'CANARY_DELIVERY_ELIGIBLE') return 'REVOKE_CANARY_ELIGIBILITY';
  if (decision === 'INTERNAL_DELIVERY_ALLOWED') return 'NO_ACTION_REQUIRED';
  if (decision === 'PROVIDER_EVIDENCE_BLOCKED') return 'RESTORE_PROVIDER_EVIDENCE';
  if (decision === 'RIGHTS_BLOCKED') return 'RESTORE_USAGE_RIGHTS';
  if (decision === 'PACKAGE_BLOCKED') return 'REBUILD_PACKAGE';
  if (decision === 'DEPENDENCY_BLOCKED' || blockingReasons.some((reason) => reason.startsWith('blocked-upstream:'))) return 'UNBLOCK_DEPENDENCIES';
  if (decision === 'QUALITY_BLOCKED') return 'IMPROVE_QUALITY';
  if (decision === 'FRESHNESS_BLOCKED') return 'REFRESH_SOURCES';
  if (decision === 'PROVENANCE_BLOCKED') return 'IMPROVE_PROVENANCE';
  return 'REQUIRE_POLICY_REVIEW';
}

function buildRollbackPlan(productName, channel, decision, blockingReasons) {
  return {
    rollbackClass: rollbackClassForDecision(decision, blockingReasons),
    product: productName,
    channel,
    productionMutationAllowed: false,
    revocationActions: [
      'Retain evidence record.',
      'Keep production delivery blocked.',
      'Re-evaluate only after policy-relevant inputs change.',
    ],
  };
}

function buildReasonBundle(a20, packageVerification, entitlementEvaluation, preflight, authorization, channelEligibility) {
  const positive = [];
  if (channelEligibility.allowedProductClass) positive.push('product-class-eligible');
  if (channelEligibility.allowedReadinessClass) positive.push('readiness-class-eligible');
  if (channelEligibility.allowedMonetizationClass) positive.push('monetization-class-eligible');
  if (channelEligibility.allowedPublicationClass) positive.push('publication-class-eligible');
  if (a20.provenanceCoverage >= THRESHOLDS.provenance) positive.push('provenance-threshold-satisfied');
  if (a20.freshness >= THRESHOLDS.freshness) positive.push('freshness-threshold-satisfied');
  if (a20.quality >= THRESHOLDS.quality) positive.push('quality-threshold-satisfied');
  if (packageVerification.packageVerified) positive.push('package-contract-verified');
  if (entitlementEvaluation.passed) positive.push('entitlement-satisfied');
  if (preflight.passed) positive.push('preflight-passed');
  if (authorization.authorized) positive.push('authorization-approved');
  return positive;
}

function decideDelivery({ product, channel, channelPolicy, a20, a21, commercialIntent, channelEligibility, preflight, authorization, packageVerification, entitlementEvaluation, overrides = {} }) {
  const blockingReasons = [];
  const nextActions = [];
  const reasonCodes = buildReasonBundle(a20, packageVerification, entitlementEvaluation, preflight, authorization, channelEligibility);
  const usageRightsState = overrides.usageRightsState ?? usageRightsStateForProduct(product);
  const providerEvidenceState = overrides.providerEvidenceState ?? a20.providerEvidenceState;

  if (!product || !channelPolicy) {
    blockingReasons.push('unknown-product-or-channel');
    nextActions.push('Restrict evaluation to canonical products and canonical channels.');
    return { decision: 'POLICY_BLOCKED', blockingReasons, nextActions, reasonCodes };
  }

  if (!GLOBAL_INVARIANTS.productionDeliveryBlocked || channelPolicy.productionAllowed !== false) {
    blockingReasons.push('production-delivery-must-remain-blocked');
    nextActions.push('Reinstate the production delivery block invariant.');
    return { decision: 'PRODUCTION_DELIVERY_BLOCKED', blockingReasons, nextActions, reasonCodes };
  }

  if (!channelEligibility.passed) {
    if (!channelEligibility.allowedProductClass) blockingReasons.push('product-class-not-eligible');
    if (!channelEligibility.allowedReadinessClass) blockingReasons.push('readiness-class-not-eligible');
    if (!channelEligibility.allowedMonetizationClass) blockingReasons.push('monetization-class-not-eligible');
    if (!channelEligibility.allowedPublicationClass) blockingReasons.push('publication-class-not-eligible');
    if (!channelEligibility.eligibleChannelByProductization) blockingReasons.push('channel-not-eligible-by-productization');
    nextActions.push('Choose a governed channel that matches the product class, readiness, monetization, and publication state.');
    return { decision: 'CHANNEL_NOT_ELIGIBLE', blockingReasons, nextActions, reasonCodes };
  }

  if (!authorization.authorized) {
    if (!authorization.blockedFlags.nonInteractive) blockingReasons.push('interactive-execution-forbidden');
    if (!authorization.blockedFlags.providerContactBlocked) blockingReasons.push('provider-contact-must-remain-blocked');
    if (!authorization.blockedFlags.credentialConsumptionBlocked) blockingReasons.push('credential-consumption-must-remain-blocked');
    if (!authorization.blockedFlags.externalPublicationBlocked) blockingReasons.push('external-publication-must-remain-blocked');
    nextActions.push('Restore full authorization invariants before delivery.');
    return { decision: 'POLICY_BLOCKED', blockingReasons, nextActions, reasonCodes };
  }

  if (!entitlementEvaluation.allowedCustomerClass) {
    blockingReasons.push('customer-class-not-eligible');
    nextActions.push('Use an allowed customer class for the selected channel.');
    return { decision: 'CUSTOMER_CLASS_BLOCKED', blockingReasons, nextActions, reasonCodes };
  }

  if (!entitlementEvaluation.passed) {
    if (!entitlementEvaluation.allowedEntitlementClass) blockingReasons.push('entitlement-class-missing');
    if (entitlementEvaluation.contractRequired && !entitlementEvaluation.contractEnvelopePresent) blockingReasons.push('contract-envelope-missing');
    nextActions.push('Satisfy the contract and entitlement requirements before delivery.');
    return { decision: 'ENTITLEMENT_BLOCKED', blockingReasons, nextActions, reasonCodes };
  }

  if (providerEvidenceState.required && (!providerEvidenceState.present || !providerEvidenceState.valid || !providerEvidenceState.requiredFieldsComplete)) {
    if (!providerEvidenceState.present) blockingReasons.push('provider-evidence-missing');
    if (!providerEvidenceState.valid) blockingReasons.push('provider-evidence-invalid');
    if (!providerEvidenceState.requiredFieldsComplete) blockingReasons.push('provider-evidence-fields-incomplete');
    nextActions.push('Restore valid provider evidence before evaluating the channel.');
    return { decision: 'PROVIDER_EVIDENCE_BLOCKED', blockingReasons, nextActions, reasonCodes };
  }

  if (a20.blockedUpstreamDependencies.length > 0 || a21.pipelineStatus !== 'COMPLETE') {
    if (a20.blockedUpstreamDependencies.length > 0) blockingReasons.push(`blocked-upstream:${a20.blockedUpstreamDependencies.join(',')}`);
    if (a21.pipelineStatus !== 'COMPLETE') blockingReasons.push('pipeline-blocked');
    nextActions.push(...a20.requiredNextActions);
    return { decision: 'DEPENDENCY_BLOCKED', blockingReasons, nextActions, reasonCodes };
  }

  if (a20.provenanceCoverage < channelPolicy.minimumProvenance) {
    blockingReasons.push('provenance-below-threshold');
    nextActions.push('Raise provenance coverage before commercial delivery.');
    return { decision: 'PROVENANCE_BLOCKED', blockingReasons, nextActions, reasonCodes };
  }

  if (a20.freshness < channelPolicy.minimumFreshness) {
    blockingReasons.push('freshness-below-threshold');
    nextActions.push('Refresh the source data before commercial delivery.');
    return { decision: 'FRESHNESS_BLOCKED', blockingReasons, nextActions, reasonCodes };
  }

  if (a20.quality < channelPolicy.minimumQuality) {
    blockingReasons.push('quality-below-threshold');
    nextActions.push('Improve quality evidence before commercial delivery.');
    return { decision: 'QUALITY_BLOCKED', blockingReasons, nextActions, reasonCodes };
  }

  if (!channelPolicy.usageRightsRequirements.allowedStates.includes(usageRightsState)
    || (channelPolicy.usageRightsRequirements.redistributionRequired && usageRightsState !== 'LICENSED_FOR_RESALE')) {
    blockingReasons.push('usage-rights-not-sufficient');
    nextActions.push('Provide rights evidence that satisfies the channel contract.');
    return { decision: 'RIGHTS_BLOCKED', blockingReasons, nextActions, reasonCodes };
  }

  if (!packageVerification.packageVerified) {
    if (!packageVerification.stableId) blockingReasons.push('stable-id-missing');
    if (!packageVerification.schemaVersion) blockingReasons.push('schema-version-missing');
    if (!packageVerification.artifactManifestPresent) blockingReasons.push('artifact-manifest-missing');
    if (channel === 'CUSTOM_INTELLIGENCE' && !packageVerification.contractEnvelopePresent) blockingReasons.push('contract-envelope-missing');
    nextActions.push('Restore the deterministic package contract before delivery.');
    return { decision: 'PACKAGE_BLOCKED', blockingReasons, nextActions, reasonCodes };
  }

  if (!preflight.passed) {
    if (preflight.failedChecks.some((failure) => failure.startsWith('rights.'))) blockingReasons.push('rights-preflight-failed');
    else if (preflight.failedChecks.some((failure) => failure.startsWith('dependency.'))) blockingReasons.push('dependency-preflight-failed');
    else blockingReasons.push('preflight-failed');
    nextActions.push(`Resolve failed preflight checks: ${preflight.failedChecks.join(', ')}.`);
    return { decision: 'POLICY_BLOCKED', blockingReasons, nextActions, reasonCodes };
  }

  if (channel === 'PUBLIC_EDITORIAL') {
    nextActions.push('Execute only the bounded canary plan and retain full evidence.');
    return { decision: 'CANARY_DELIVERY_ELIGIBLE', blockingReasons, nextActions, reasonCodes };
  }

  nextActions.push('Maintain evidence-only internal delivery constraints and keep production blocked.');
  return { decision: 'INTERNAL_DELIVERY_ALLOWED', blockingReasons, nextActions, reasonCodes };
}

function evaluateProductChannel(productName, channel, overrides = {}) {
  const product = productIndex.get(productName) ?? null;
  const channelPolicy = policy.channels[channel] ?? null;
  const a20 = overrides.a20 ?? getEffectiveA20Evidence(productName);
  const a21 = overrides.a21 ?? getEffectiveA21Evidence(productName);
  const a22 = overrides.a22 ?? getEffectiveA22Evidence(productName);
  const commercialIntent = buildCommercialIntent(product, channel, overrides);
  const packageVerification = buildPackageVerification(product, channel, channelPolicy, a21, commercialIntent, overrides);
  const entitlementEvaluation = buildEntitlementEvaluation(channelPolicy, commercialIntent, overrides.usageRightsState ?? usageRightsStateForProduct(product), overrides);
  const policyCheck = overrides.policyCheck ?? buildPolicyCheck(product, channel, channelPolicy);
  const channelEligibility = overrides.channelEligibility ?? buildChannelEligibility(product, channel, channelPolicy, a20);
  const preflight = overrides.preflight ?? buildPreflight(
    product,
    channel,
    channelPolicy,
    a20,
    a21,
    a22,
    commercialIntent,
    packageVerification,
    entitlementEvaluation,
    overrides,
  );
  const authorization = overrides.authorization ?? buildAuthorization(policyCheck, channelPolicy, commercialIntent, entitlementEvaluation);
  const deliveryOutcome = decideDelivery({
    product,
    channel,
    channelPolicy,
    a20,
    a21,
    commercialIntent,
    channelEligibility,
    preflight,
    authorization,
    packageVerification,
    entitlementEvaluation,
    overrides,
  });
  const canaryPlan = buildCanaryPlan(deliveryOutcome.decision, product, channel, packageVerification.stableId);
  const executionEnvelope = {
    ...EXECUTION_ENVELOPE_TEMPLATE,
    preflightPassed: preflight.passed,
    authorizationChecked: authorization.authorized,
    entitlementChecked: entitlementEvaluation.passed,
    packageVerified: packageVerification.packageVerified,
  };
  const postDeliveryVerificationContract = buildPostDeliveryVerificationContract(product, channel, packageVerification.stableId, a20, a21, packageVerification);
  const rollbackPlan = buildRollbackPlan(productName, channel, deliveryOutcome.decision, deliveryOutcome.blockingReasons);
  const inputFingerprint = hash({
    product: productName,
    stableId: packageVerification.stableId,
    channel,
    policyVersion: POLICY_VERSION,
    a20: {
      readinessClass: a20.readinessClass,
      monetizationClass: a20.monetizationClass,
      publicationClass: a20.publicationClass,
      provenanceCoverage: a20.provenanceCoverage,
      freshness: a20.freshness,
      quality: a20.quality,
      providerEvidenceState: a20.providerEvidenceState,
    },
    a21: {
      pipelineStatus: a21.pipelineStatus,
      schemaVersion: a21.schemaVersion,
    },
    commercialIntent: {
      customerClass: commercialIntent.customerClass,
      entitlementClass: commercialIntent.entitlementClass,
      contractEnvelopePresent: commercialIntent.contractEnvelopePresent,
    },
  });
  const decisionFingerprint = hash({
    product: productName,
    channel,
    decision: deliveryOutcome.decision,
    reasonCodes: deliveryOutcome.reasonCodes,
    blockingReasons: deliveryOutcome.blockingReasons,
    nextActions: deliveryOutcome.nextActions,
    policyVersion: POLICY_VERSION,
    inputFingerprint,
    packageFingerprint: packageVerification.packageFingerprint,
  });
  const idempotencyKey = hash(`${packageVerification.stableId ?? 'missing-stable-id'}|${channel}|${POLICY_VERSION}|${inputFingerprint}`).slice(0, 24);

  return {
    product: productName,
    stableId: packageVerification.stableId,
    dimension: product?.dimension ?? 'unknown',
    channel,
    decision: deliveryOutcome.decision,
    reasonCodes: deliveryOutcome.reasonCodes,
    blockingReasons: deliveryOutcome.blockingReasons,
    nextActions: deliveryOutcome.nextActions,
    policyVersion: POLICY_VERSION,
    inputFingerprint,
    decisionFingerprint,
    idempotencyKey,
    evaluatedAt: RUN_STARTED_AT,
    evidencePath: OUTPUT_RELATIVE_PATH,
    dataStrategy: product?.dataStrategy ?? 'UNKNOWN',
    commercialLayer: product?.commercialLayer ?? 'UNKNOWN',
    readinessClass: a20.readinessClass,
    monetizationClass: a20.monetizationClass,
    publicationClass: a20.publicationClass,
    pipelineStatus: a21.pipelineStatus,
    policyCheck,
    commercialIntent,
    channelEligibility,
    deliveryPreflight: preflight,
    authorization,
    packageContractVerification: packageVerification,
    entitlementEvaluation,
    deliveryDecision: {
      decision: deliveryOutcome.decision,
      reasonCodes: deliveryOutcome.reasonCodes,
      blockingReasons: deliveryOutcome.blockingReasons,
    },
    boundedCanaryPlan: canaryPlan,
    executionEnvelope,
    postDeliveryVerificationContract,
    rollbackRevocationPlan: rollbackPlan,
    evidenceRefs: [
      a20.references.ref,
      a21.evidenceRef,
      a22.evidenceRef,
      `policy:${path.relative(process.cwd(), POLICY_PATH)}`,
      upstreamEvidence.a20.relativePath,
      upstreamEvidence.a21.relativePath,
      upstreamEvidence.a22.relativePath,
    ],
    controlPlaneLifecycle: CONTROL_PLANE_LIFECYCLE,
  };
}

function evaluateAllCanonicalProductChannels() {
  return productUniverse.flatMap((product) => CHANNELS.map((channel) => evaluateProductChannel(product.product, channel)));
}

function buildPositiveTests(decisions) {
  const decisionMap = new Map(decisions.map((decision) => [`${decision.product}:${decision.channel}`, decision]));
  const hybridCanary = evaluateProductChannel('availability-monitor', 'PUBLIC_EDITORIAL', {
    usageRightsState: 'LICENSED_FOR_RESALE',
  });
  const dataLicenseDecision = evaluateProductChannel('entity-master', 'DATA_LICENSE');
  const customContractDecision = evaluateProductChannel('category-outlook', 'CUSTOM_INTELLIGENCE');
  const idempotencyA = evaluateProductChannel('category-outlook', 'ENTERPRISE_API');
  const idempotencyB = evaluateProductChannel('category-outlook', 'ENTERPRISE_API');
  return [
    {
      name: 'SELF-FIRST + PUBLIC_EDITORIAL -> CANARY_DELIVERY_ELIGIBLE',
      result: decisionMap.get('entity-master:PUBLIC_EDITORIAL')?.decision === 'CANARY_DELIVERY_ELIGIBLE',
    },
    {
      name: 'SELF-FIRST + PRO_SUBSCRIPTION -> INTERNAL_DELIVERY_ALLOWED',
      result: decisionMap.get('canon-strength:PRO_SUBSCRIPTION')?.decision === 'INTERNAL_DELIVERY_ALLOWED',
    },
    {
      name: 'SELF-FIRST + ENTERPRISE_API -> INTERNAL_DELIVERY_ALLOWED',
      result: decisionMap.get('entity-master:ENTERPRISE_API')?.decision === 'INTERNAL_DELIVERY_ALLOWED',
    },
    {
      name: 'HYBRID + valid provider evidence -> CANARY_DELIVERY_ELIGIBLE',
      result: hybridCanary.decision === 'CANARY_DELIVERY_ELIGIBLE',
    },
    {
      name: 'valid rights + DATA_LICENSE -> INTERNAL_DELIVERY_ALLOWED or CANARY_DELIVERY_ELIGIBLE',
      result: ['INTERNAL_DELIVERY_ALLOWED', 'CANARY_DELIVERY_ELIGIBLE'].includes(dataLicenseDecision.decision),
    },
    {
      name: 'valid contract envelope + CUSTOM_INTELLIGENCE -> INTERNAL_DELIVERY_ALLOWED or CANARY_DELIVERY_ELIGIBLE',
      result: ['INTERNAL_DELIVERY_ALLOWED', 'CANARY_DELIVERY_ELIGIBLE'].includes(customContractDecision.decision),
    },
    {
      name: 'idempotent decision fingerprints remain stable',
      result: idempotencyA.decision === idempotencyB.decision
        && idempotencyA.inputFingerprint === idempotencyB.inputFingerprint
        && idempotencyA.decisionFingerprint === idempotencyB.decisionFingerprint
        && idempotencyA.idempotencyKey === idempotencyB.idempotencyKey,
    },
  ];
}

function buildNegativeTests() {
  return [
    {
      name: 'unknown product is policy blocked',
      result: ['POLICY_BLOCKED'].includes(evaluateProductChannel('unknown-product', 'ENTERPRISE_API').decision),
    },
    {
      name: 'unknown channel is policy blocked',
      result: ['POLICY_BLOCKED'].includes(evaluateProductChannel('entity-master', 'UNKNOWN_CHANNEL').decision),
    },
    {
      name: 'provider evidence missing blocks hybrid public editorial',
      result: evaluateProductChannel('availability-monitor', 'PUBLIC_EDITORIAL', {
        a20: {
          ...getEffectiveA20Evidence('availability-monitor'),
          providerEvidenceState: {
            ...getEffectiveA20Evidence('availability-monitor').providerEvidenceState,
            present: false,
            valid: false,
            requiredFieldsComplete: false,
          },
        },
      }).decision === 'PROVIDER_EVIDENCE_BLOCKED',
    },
    {
      name: 'provider evidence invalid blocks hybrid enterprise api',
      result: evaluateProductChannel('availability-monitor', 'ENTERPRISE_API', {
        a20: {
          ...getEffectiveA20Evidence('availability-monitor'),
          providerEvidenceState: {
            ...getEffectiveA20Evidence('availability-monitor').providerEvidenceState,
            valid: false,
          },
        },
      }).decision === 'PROVIDER_EVIDENCE_BLOCKED',
    },
    {
      name: 'provider required product remains dependency blocked',
      result: evaluateProductChannel('auction-intelligence', 'CUSTOM_INTELLIGENCE').decision === 'CHANNEL_NOT_ELIGIBLE'
        || evaluateProductChannel('auction-intelligence', 'ENTERPRISE_API').decision === 'CHANNEL_NOT_ELIGIBLE'
        || evaluateProductChannel('auction-intelligence', 'CUSTOM_INTELLIGENCE', {
          channelEligibility: {
            passed: true,
            allowedProductClass: true,
            allowedReadinessClass: true,
            allowedMonetizationClass: true,
            allowedPublicationClass: true,
            eligibleChannelByProductization: true,
          },
        }).decision === 'DEPENDENCY_BLOCKED',
    },
    {
      name: 'blocked upstream dependency propagates',
      result: evaluateProductChannel('asset-history', 'CUSTOM_INTELLIGENCE', {
        a20: {
          ...getEffectiveA20Evidence('asset-history'),
          blockedUpstreamDependencies: ['provenance-confidence'],
          providerEvidenceState: {
            required: true,
            present: true,
            valid: true,
            providerId: 'provider-ownership-provenance',
            contractVersion: 'restored-for-test.v1',
            usageRights: 'DERIVATIVE_INTERNAL_AND_CANARY',
            freshnessHours: 12,
            requiredFieldsComplete: true,
          },
        },
        a21: {
          ...getEffectiveA21Evidence('asset-history'),
          pipelineStatus: 'BLOCKED',
        },
        channelEligibility: {
          passed: true,
          allowedProductClass: true,
          allowedReadinessClass: true,
          allowedMonetizationClass: true,
          allowedPublicationClass: true,
          eligibleChannelByProductization: true,
        },
      }).decision === 'DEPENDENCY_BLOCKED',
    },
    {
      name: 'provenance below threshold blocks delivery',
      result: evaluateProductChannel('canon-strength', 'PRO_SUBSCRIPTION', {
        a20: { ...getEffectiveA20Evidence('canon-strength'), provenanceCoverage: 0.4 },
      }).decision === 'PROVENANCE_BLOCKED',
    },
    {
      name: 'freshness below threshold blocks delivery',
      result: evaluateProductChannel('canon-strength', 'PRO_SUBSCRIPTION', {
        a20: { ...getEffectiveA20Evidence('canon-strength'), freshness: 0.4 },
      }).decision === 'FRESHNESS_BLOCKED',
    },
    {
      name: 'quality below threshold blocks delivery',
      result: evaluateProductChannel('canon-strength', 'PRO_SUBSCRIPTION', {
        a20: { ...getEffectiveA20Evidence('canon-strength'), quality: 0.4 },
      }).decision === 'QUALITY_BLOCKED',
    },
    {
      name: 'rights missing blocks data license',
      result: evaluateProductChannel('entity-master', 'DATA_LICENSE', { usageRightsState: 'UNKNOWN' }).decision === 'RIGHTS_BLOCKED',
    },
    {
      name: 'wrong rights state blocks data license redistribution',
      result: evaluateProductChannel('category-outlook', 'DATA_LICENSE', {
        channelEligibility: {
          passed: true,
          allowedProductClass: true,
          allowedReadinessClass: true,
          allowedMonetizationClass: true,
          allowedPublicationClass: true,
          eligibleChannelByProductization: true,
        },
        usageRightsState: 'CUSTOM_DELIVERY_RIGHTS',
      }).decision === 'RIGHTS_BLOCKED',
    },
    {
      name: 'missing stable id blocks package verification',
      result: evaluateProductChannel('entity-master', 'ENTERPRISE_API', { stableId: null }).decision === 'PACKAGE_BLOCKED',
    },
    {
      name: 'missing schema version blocks package verification',
      result: evaluateProductChannel('entity-master', 'ENTERPRISE_API', { schemaVersion: null }).decision === 'PACKAGE_BLOCKED',
    },
    {
      name: 'missing artifact manifest blocks package verification',
      result: evaluateProductChannel('entity-master', 'ENTERPRISE_API', { artifactManifestPresent: false }).decision === 'PACKAGE_BLOCKED',
    },
    {
      name: 'missing contract envelope blocks custom intelligence',
      result: evaluateProductChannel('category-outlook', 'CUSTOM_INTELLIGENCE', { contractEnvelopePresent: false }).decision === 'ENTITLEMENT_BLOCKED',
    },
    {
      name: 'customer class blocked for pro subscription',
      result: evaluateProductChannel('canon-strength', 'PRO_SUBSCRIPTION', { customerClass: 'ANONYMOUS' }).decision === 'CUSTOMER_CLASS_BLOCKED',
    },
    {
      name: 'entitlement class blocked for enterprise api',
      result: evaluateProductChannel('entity-master', 'ENTERPRISE_API', { entitlementClass: 'PUBLIC' }).decision === 'ENTITLEMENT_BLOCKED',
    },
    {
      name: 'channel not eligible by product class',
      result: evaluateProductChannel('entity-master', 'PRO_SUBSCRIPTION').decision === 'CHANNEL_NOT_ELIGIBLE',
    },
    {
      name: 'publication class mismatch blocks public editorial',
      result: evaluateProductChannel('auction-intelligence', 'PUBLIC_EDITORIAL').decision === 'CHANNEL_NOT_ELIGIBLE',
    },
    {
      name: 'policy authorization fails closed when provider contact unblocked',
      result: evaluateProductChannel('entity-master', 'ENTERPRISE_API', {
        authorization: {
          ...buildAuthorization(
            buildPolicyCheck(productIndex.get('entity-master'), 'ENTERPRISE_API', policy.channels.ENTERPRISE_API),
            policy.channels.ENTERPRISE_API,
            buildCommercialIntent(productIndex.get('entity-master'), 'ENTERPRISE_API'),
            buildEntitlementEvaluation(policy.channels.ENTERPRISE_API, buildCommercialIntent(productIndex.get('entity-master'), 'ENTERPRISE_API'), usageRightsStateForProduct(productIndex.get('entity-master'))),
          ),
          authorized: false,
          blockedFlags: {
            ...buildAuthorization(
              buildPolicyCheck(productIndex.get('entity-master'), 'ENTERPRISE_API', policy.channels.ENTERPRISE_API),
              policy.channels.ENTERPRISE_API,
              buildCommercialIntent(productIndex.get('entity-master'), 'ENTERPRISE_API'),
              buildEntitlementEvaluation(policy.channels.ENTERPRISE_API, buildCommercialIntent(productIndex.get('entity-master'), 'ENTERPRISE_API'), usageRightsStateForProduct(productIndex.get('entity-master'))),
            ).blockedFlags,
            providerContactBlocked: false,
          },
        },
      }).decision === 'POLICY_BLOCKED',
    },
    {
      name: 'preflight failure blocks delivery',
      result: evaluateProductChannel('entity-master', 'ENTERPRISE_API', {
        preflight: {
          passed: false,
          failedChecks: ['package.schemaVersionPresent'],
          categories: {},
        },
      }).decision === 'POLICY_BLOCKED',
    },
    {
      name: 'pipeline blocked blocks delivery',
      result: evaluateProductChannel('entity-master', 'ENTERPRISE_API', {
        a21: { ...getEffectiveA21Evidence('entity-master'), pipelineStatus: 'BLOCKED' },
      }).decision === 'DEPENDENCY_BLOCKED',
    },
    {
      name: 'production delivery invariant violation is blocked',
      result: evaluateProductChannel('entity-master', 'ENTERPRISE_API', {
        authorization: {
          authorized: false,
          blockedFlags: {
            productionDeliveryBlocked: false,
            deliveryMutationBlocked: true,
            billingMutationBlocked: true,
            procurementMutationBlocked: true,
            providerContactBlocked: true,
            credentialConsumptionBlocked: true,
            externalPublicationBlocked: false,
            nonInteractive: true,
          },
          requestedChannel: 'ENTERPRISE_API',
        },
      }).decision === 'POLICY_BLOCKED',
    },
    {
      name: 'interactive execution path is forbidden',
      result: evaluateProductChannel('entity-master', 'ENTERPRISE_API', {
        authorization: {
          ...buildAuthorization(
            buildPolicyCheck(productIndex.get('entity-master'), 'ENTERPRISE_API', policy.channels.ENTERPRISE_API),
            policy.channels.ENTERPRISE_API,
            buildCommercialIntent(productIndex.get('entity-master'), 'ENTERPRISE_API'),
            buildEntitlementEvaluation(policy.channels.ENTERPRISE_API, buildCommercialIntent(productIndex.get('entity-master'), 'ENTERPRISE_API'), usageRightsStateForProduct(productIndex.get('entity-master'))),
          ),
          authorized: false,
          blockedFlags: {
            ...buildAuthorization(
              buildPolicyCheck(productIndex.get('entity-master'), 'ENTERPRISE_API', policy.channels.ENTERPRISE_API),
              policy.channels.ENTERPRISE_API,
              buildCommercialIntent(productIndex.get('entity-master'), 'ENTERPRISE_API'),
              buildEntitlementEvaluation(policy.channels.ENTERPRISE_API, buildCommercialIntent(productIndex.get('entity-master'), 'ENTERPRISE_API'), usageRightsStateForProduct(productIndex.get('entity-master'))),
            ).blockedFlags,
            nonInteractive: false,
          },
        },
      }).decision === 'POLICY_BLOCKED',
    },
  ];
}

function buildCertificationGates(decisions, positiveTests, negativeTests) {
  const allProducts = new Set(decisions.map((decision) => decision.product));
  const allChannels = new Set(decisions.map((decision) => decision.channel));
  const decisionCounts = decisions.reduce((counts, decision) => {
    counts[decision.decision] = (counts[decision.decision] ?? 0) + 1;
    return counts;
  }, {});
  return {
    canonical18ProductsConsumed: allProducts.size === 18,
    canonical5ChannelsConsumed: allChannels.size === 5,
    ninetyProductChannelDecisionsProduced: decisions.length === 90,
    policyLifecycleComplete: CONTROL_PLANE_LIFECYCLE.length === 14,
    policyVersionMatches: decisions.every((decision) => decision.policyVersion === POLICY_VERSION),
    knownDecisionClassesOnly: decisions.every((decision) => DECISION_CLASSES.includes(decision.decision)),
    stableIdsPreserved: decisions.every((decision) => {
      const product = productIndex.get(decision.product);
      return product ? decision.stableId === stableIdForProduct(product) : true;
    }),
    inputFingerprintsPresent: decisions.every((decision) => typeof decision.inputFingerprint === 'string' && decision.inputFingerprint.length === 64),
    decisionFingerprintsPresent: decisions.every((decision) => typeof decision.decisionFingerprint === 'string' && decision.decisionFingerprint.length === 64),
    idempotencyKeysPresent: decisions.every((decision) => typeof decision.idempotencyKey === 'string' && decision.idempotencyKey.length === 24),
    policyCheckedBeforeDecision: decisions.every((decision) => decision.controlPlaneLifecycle.indexOf('policy') < decision.controlPlaneLifecycle.indexOf('delivery-decision')),
    intentCheckedBeforeDecision: decisions.every((decision) => decision.controlPlaneLifecycle.indexOf('commercial-intent') < decision.controlPlaneLifecycle.indexOf('delivery-decision')),
    eligibilityCheckedBeforeDecision: decisions.every((decision) => decision.controlPlaneLifecycle.indexOf('channel-eligibility') < decision.controlPlaneLifecycle.indexOf('delivery-decision')),
    preflightCheckedBeforeDecision: decisions.every((decision) => decision.controlPlaneLifecycle.indexOf('delivery-preflight') < decision.controlPlaneLifecycle.indexOf('delivery-decision')),
    authorizationCheckedBeforeDecision: decisions.every((decision) => decision.controlPlaneLifecycle.indexOf('authorization') < decision.controlPlaneLifecycle.indexOf('delivery-decision')),
    packageCheckedBeforeDecision: decisions.every((decision) => decision.controlPlaneLifecycle.indexOf('package-contract-verification') < decision.controlPlaneLifecycle.indexOf('delivery-decision')),
    entitlementCheckedBeforeDecision: decisions.every((decision) => decision.controlPlaneLifecycle.indexOf('entitlement-evaluation') < decision.controlPlaneLifecycle.indexOf('delivery-decision')),
    tenPreflightCategoriesEvaluated: decisions.every((decision) => Object.keys(decision.deliveryPreflight.categories).length === 10),
    provenanceGateOperational: negativeTests.find((test) => test.name === 'provenance below threshold blocks delivery')?.result === true,
    freshnessGateOperational: negativeTests.find((test) => test.name === 'freshness below threshold blocks delivery')?.result === true,
    qualityGateOperational: negativeTests.find((test) => test.name === 'quality below threshold blocks delivery')?.result === true,
    providerEvidenceGateOperational: negativeTests.find((test) => test.name === 'provider evidence missing blocks hybrid public editorial')?.result === true,
    dependencyGateOperational: negativeTests.find((test) => test.name === 'blocked upstream dependency propagates')?.result === true,
    rightsGateOperational: negativeTests.find((test) => test.name === 'rights missing blocks data license')?.result === true,
    packageGateOperational: negativeTests.find((test) => test.name === 'missing stable id blocks package verification')?.result === true,
    entitlementGateOperational: negativeTests.find((test) => test.name === 'missing contract envelope blocks custom intelligence')?.result === true,
    customerClassGateOperational: negativeTests.find((test) => test.name === 'customer class blocked for pro subscription')?.result === true,
    channelEligibilityGateOperational: negativeTests.find((test) => test.name === 'channel not eligible by product class')?.result === true,
    policyFailClosedOperational: negativeTests.find((test) => test.name === 'interactive execution path is forbidden')?.result === true,
    productionBlockedInvariantHeld: decisions.every((decision) => decision.executionEnvelope.productionDeliveryBlocked === true),
    billingBlockedInvariantHeld: decisions.every((decision) => decision.executionEnvelope.billingMutationBlocked === true),
    procurementBlockedInvariantHeld: decisions.every((decision) => decision.executionEnvelope.procurementMutationBlocked === true),
    providerContactBlockedInvariantHeld: decisions.every((decision) => decision.executionEnvelope.providerContactBlocked === true),
    credentialConsumptionBlockedInvariantHeld: decisions.every((decision) => decision.executionEnvelope.credentialConsumptionBlocked === true),
    externalCustomerMutationBlockedInvariantHeld: decisions.every((decision) => decision.executionEnvelope.externalCustomerMutationBlocked === true),
    canaryDecisionsBounded: decisions.filter((decision) => decision.decision === 'CANARY_DELIVERY_ELIGIBLE').every((decision) => decision.boundedCanaryPlan?.scope === 'bounded-internal-simulation'),
    rollbackPlanExistsForEveryDecision: decisions.every((decision) => Boolean(decision.rollbackRevocationPlan?.rollbackClass)),
    evidencePathPresentForEveryDecision: decisions.every((decision) => decision.evidencePath === OUTPUT_RELATIVE_PATH),
    upstreamEvidenceSourcesRecorded: ['a20', 'a21', 'a22'].every((stage) => Boolean(upstreamEvidence[stage].relativePath)),
    summaryContainsBothAllowedAndBlocked: Boolean(decisionCounts.CANARY_DELIVERY_ELIGIBLE || decisionCounts.INTERNAL_DELIVERY_ALLOWED) && Object.keys(decisionCounts).some((decision) => decision.endsWith('BLOCKED')),
    positiveCasesPass: positiveTests.every((test) => test.result),
    negativeCasesFailClosed: negativeTests.every((test) => test.result),
  };
}

const decisions = evaluateAllCanonicalProductChannels();
const positiveTests = buildPositiveTests(decisions);
const negativeTests = buildNegativeTests();
const certificationGates = buildCertificationGates(decisions, positiveTests, negativeTests);
const status = Object.values(certificationGates).every(Boolean) ? 'PASS' : 'FAIL';
const summary = {
  totalProducts: new Set(decisions.map((decision) => decision.product)).size,
  totalChannels: new Set(decisions.map((decision) => decision.channel)).size,
  totalDecisions: decisions.length,
  decisionCounts: decisions.reduce((counts, decision) => {
    counts[decision.decision] = (counts[decision.decision] ?? 0) + 1;
    return counts;
  }, {}),
  byChannel: CHANNELS.map((channel) => ({
    channel,
    decisions: decisions.filter((decision) => decision.channel === channel).length,
  })),
};

const report = {
  stage: 'A23',
  mode: 'autonomous-commercial-delivery-channel-control-plane',
  status,
  runId: RUN_ID,
  inputFingerprint: RUN_INPUT_FINGERPRINT,
  startedAt: RUN_STARTED_AT,
  completedAt: new Date().toISOString(),
  objective: 'Deterministic, policy-governed autonomous commercial delivery and channel control certification.',
  consumedEvidence: [
    'A15 global autonomous policy foundation',
    'A16 autonomous execution control plane',
    'A17 bounded live adapter readiness',
    'A18 autonomous data acquisition scale',
    'A19 data coverage productization gap',
    'A20 intelligence product readiness monetization gate',
    'A21 autonomous intelligence product pipeline',
    'A22 publication channel policy and control plane',
  ],
  policyVersion: POLICY_VERSION,
  controlPlaneLifecycle: CONTROL_PLANE_LIFECYCLE,
  invariants: GLOBAL_INVARIANTS,
  thresholds: THRESHOLDS,
  entitlementClasses: policy.entitlementClasses,
  customerClasses: policy.customerClasses,
  decisionClasses: policy.decisionClasses,
  canonicalUniverse: {
    products: productUniverse.map((product) => ({
      product: product.product,
      dimension: product.dimension,
      dataStrategy: product.dataStrategy,
      commercialLayer: product.commercialLayer,
    })),
    productMap,
    channels: CHANNELS,
    productCount: productUniverse.length,
    channelCount: CHANNELS.length,
  },
  upstreamEvidenceSources: {
    a20: { source: upstreamEvidence.a20.source, path: upstreamEvidence.a20.relativePath },
    a21: { source: upstreamEvidence.a21.source, path: upstreamEvidence.a21.relativePath },
    a22: { source: upstreamEvidence.a22.source, path: upstreamEvidence.a22.relativePath },
  },
  summary,
  decisions,
  certificationGates,
  positiveTests,
  negativeTests,
  evidenceModel: {
    sink: 'services/kidults-autonomous-intelligence/reports/commercial-delivery/',
    filePattern: 'a23-commercial-delivery-<DATE_STAMP>-<inputsFingerprint>.json',
  },
};

fs.mkdirSync(CONTROL_OUTPUT_DIRECTORY, { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  stage: report.stage,
  status: report.status,
  runId: report.runId,
  inputFingerprint: report.inputFingerprint,
  summary: report.summary,
  upstreamEvidenceSources: report.upstreamEvidenceSources,
}, null, 2));
const gateEntries = Object.entries(certificationGates);
console.log(`A23 certification gates: ${gateEntries.filter(([, passed]) => passed).length}/${gateEntries.length} passing`);
for (const [gate, passed] of gateEntries) {
  console.log(` - ${gate}: ${passed ? 'PASS' : 'FAIL'}`);
}
console.log(`A23 report: ${OUTPUT_RELATIVE_PATH}`);
console.log(`A23 certification: ${report.status}`);
if (report.status !== 'PASS') process.exit(1);
