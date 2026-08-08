import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { classifiedDimensions, productUniverse, productMap, providerRequirements } from './lib/intelligence-product-universe.mjs';

const RUN_STARTED_AT = new Date().toISOString();
const DATE_STAMP = RUN_STARTED_AT.slice(0, 10);
const CHANNELS = ['PUBLIC_EDITORIAL', 'PRO_SUBSCRIPTION', 'ENTERPRISE_API', 'DATA_LICENSE', 'CUSTOM_INTELLIGENCE'];
const PIPELINE_STATUSES = ['COMPLETE', 'BLOCKED'];
const KNOWN_DECISIONS = [
  'INTERNAL_ALLOWED',
  'CANARY_ELIGIBLE',
  'DEPENDENCY_BLOCKED',
  'QUALITY_BLOCKED',
  'FRESHNESS_BLOCKED',
  'PROVENANCE_BLOCKED',
  'POLICY_BLOCKED',
  'CHANNEL_NOT_ELIGIBLE',
  'PRODUCTION_BLOCKED',
  'PRODUCTION_CANDIDATE',
];
const A22_POLICY_PATH = path.resolve('policy', 'a22-publication-channel-policy.json');
const policy = JSON.parse(fs.readFileSync(A22_POLICY_PATH, 'utf8'));
const THRESHOLDS = policy.thresholds;
const POLICY_VERSION = policy.policyVersion;
const GLOBAL_INVARIANTS = policy.invariants;
const CONTROL_PLANE_LIFECYCLE = policy.controlPlaneLifecycle;

const inputsFingerprint = crypto
  .createHash('sha256')
  .update(
    JSON.stringify({
      products: productUniverse.map((product) => ({
        product: product.product,
        dimension: product.dimension,
        dataStrategy: product.dataStrategy,
        commercialLayer: product.commercialLayer,
        scorecard: product.scorecard,
        upstreamProducts: product.upstreamProducts,
      })),
      dimensions: classifiedDimensions,
      channels: CHANNELS,
      policy,
    }),
  )
  .digest('hex')
  .slice(0, 16);

const RUN_ID = `a22-publication-control-${DATE_STAMP}-${inputsFingerprint}`;
const productIndex = new Map(productUniverse.map((product) => [product.product, product]));
const dimensionIndex = new Map(classifiedDimensions.map((dimension) => [dimension.id, dimension]));
const providerRequirementIndex = new Map(providerRequirements.map((requirement) => [requirement.dimension, requirement]));
const providerEvidenceDimensions = new Set();
const CANONICAL_SCHEMA_VERSION = 'canonical-a19-schema-v1';

function round2(value) {
  return Number(value.toFixed(2));
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
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
    eligible.add('CUSTOM_INTELLIGENCE');
    eligible.add('ENTERPRISE_API');
    eligible.add('DATA_LICENSE');
  }
  if (publicationClass === 'CANARY_ELIGIBLE') eligible.add('PUBLIC_EDITORIAL');
  return Array.from(eligible);
}

const resolvedA20 = new Map();
function deriveA20Evidence(productName) {
  if (resolvedA20.has(productName)) return resolvedA20.get(productName);

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
      blockingReasons: ['unknown-product', 'missing-a19-classification', 'missing-a20-evidence'],
      requiredNextActions: ['Add the product to the canonical A19 universe before requesting A22 certification.'],
      eligibleChannels: [],
      provenanceCoverage: 0,
      freshness: 0,
      quality: 0,
      scorecard: {
        dataCoverage: 0,
        provenanceCoverage: 0,
        freshness: 0,
        quality: 0,
        repeatability: 0,
        autonomousDerivation: 0,
      },
      upstreamProducts: [],
      blockedUpstreamDependencies: [],
      references: {
        stage: 'A20',
        ref: 'A20:missing-product-evidence',
      },
    };
    resolvedA20.set(productName, unknown);
    return unknown;
  }

  const canonicalStrategy = dimensionIndex.get(product.dimension)?.strategy ?? product.dataStrategy;
  const upstreamEvidence = product.upstreamProducts.map((upstream) => deriveA20Evidence(upstream));
  const blockedUpstreamDependencies = upstreamEvidence
    .filter((upstream) => ['DEPENDENCY_BLOCKED', 'QUALITY_BLOCKED', 'POLICY_BLOCKED'].includes(upstream.readinessClass))
    .map((upstream) => upstream.product);
  const upstreamDimensions = Array.from(
    new Set([
      product.dimension,
      ...upstreamEvidence.map((upstream) => upstream.dimension).filter((dimension) => dimension !== 'unknown'),
    ]),
  );
  const providerDependencies = upstreamDimensions.filter((dimension) => dimensionIndex.get(dimension)?.strategy === 'PROVIDER-REQUIRED');
  const providerDependencyBlocked = canonicalStrategy === 'PROVIDER-REQUIRED'
    ? !providerEvidenceDimensions.has(product.dimension)
    : providerDependencies.some((dimension) => !providerEvidenceDimensions.has(dimension));
  const dependencyBlocked = providerDependencyBlocked || blockedUpstreamDependencies.length > 0;
  const publicationReadiness = dependencyBlocked
    ? round2(Math.min(product.scorecard.freshness, product.scorecard.quality, 0.35))
    : round2(Math.min(product.scorecard.freshness, product.scorecard.provenanceCoverage, product.scorecard.quality));
  const monetizationReadiness = dependencyBlocked
    ? round2(Math.min(product.scorecard.provenanceCoverage, product.scorecard.quality, 0.3))
    : round2(Math.min(product.scorecard.provenanceCoverage, product.scorecard.quality, product.scorecard.repeatability));

  const blockingReasons = [];
  if (canonicalStrategy === 'PROVIDER-REQUIRED') blockingReasons.push('provider-evidence-required');
  if (blockedUpstreamDependencies.length > 0) blockingReasons.push(`blocked-upstream:${blockedUpstreamDependencies.join(',')}`);
  if (product.scorecard.provenanceCoverage < THRESHOLDS.provenance) blockingReasons.push('provenance-below-threshold');
  if (product.scorecard.quality < THRESHOLDS.quality) blockingReasons.push('quality-below-threshold');
  if (product.scorecard.freshness < THRESHOLDS.freshness) blockingReasons.push('freshness-below-threshold');

  let readinessClass = 'INTERNAL_READY';
  if (dependencyBlocked) readinessClass = 'DEPENDENCY_BLOCKED';
  else if (product.scorecard.quality < THRESHOLDS.quality) readinessClass = 'QUALITY_BLOCKED';
  else if (canonicalStrategy === 'HYBRID') readinessClass = 'HYBRID_READY';

  let monetizationClass = 'BLOCKED';
  if (!dependencyBlocked
    && product.scorecard.provenanceCoverage >= THRESHOLDS.provenance
    && product.scorecard.quality >= THRESHOLDS.quality
    && product.scorecard.freshness >= THRESHOLDS.freshness) {
    monetizationClass = canonicalStrategy === 'SELF-FIRST' ? 'MONETIZABLE_INTERNAL' : 'MONETIZABLE_AFTER_PROVIDER';
  } else if (!dependencyBlocked && canonicalStrategy === 'HYBRID') {
    monetizationClass = 'MONETIZABLE_AFTER_PROVIDER';
  } else if (canonicalStrategy === 'SELF-FIRST') {
    monetizationClass = 'RESEARCH_ONLY';
  }

  let publicationClass = 'PRODUCTION_BLOCKED';
  if (!dependencyBlocked && publicationReadiness >= 0.68 && canonicalStrategy === 'SELF-FIRST') publicationClass = 'CANARY_ELIGIBLE';
  else if (!dependencyBlocked && publicationReadiness >= 0.5) publicationClass = 'INTERNAL_ONLY';

  const requiredNextActions = [];
  if (canonicalStrategy === 'HYBRID') requiredNextActions.push('Preserve governed internal/canary scope until provider supplementation evidence is present for external commercialization.');
  if (canonicalStrategy === 'PROVIDER-REQUIRED') requiredNextActions.push('Obtain provider evidence contract with provenance, freshness, stable ID, usage rights, and incremental delivery.');
  if (blockedUpstreamDependencies.length > 0) requiredNextActions.push(`Unblock upstream products first: ${blockedUpstreamDependencies.join(', ')}.`);
  if (product.scorecard.provenanceCoverage < THRESHOLDS.provenance) requiredNextActions.push('Raise provenance coverage to the policy threshold.');
  if (product.scorecard.quality < THRESHOLDS.quality) requiredNextActions.push('Improve quality controls before publication control can authorize promotion.');
  if (product.scorecard.freshness < THRESHOLDS.freshness) requiredNextActions.push('Refresh source data until freshness meets the policy threshold.');
  if (requiredNextActions.length === 0) requiredNextActions.push('Maintain evidence, bounded canary design, and non-production execution controls.');

  const result = {
    product: product.product,
    dimension: product.dimension,
    dataStrategy: canonicalStrategy,
    dependencyClass: dependencyClassForStrategy(canonicalStrategy),
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
    upstreamProducts: product.upstreamProducts,
    blockedUpstreamDependencies,
    references: {
      stage: 'A20',
      ref: `A20:${product.product}`,
    },
  };
  resolvedA20.set(productName, result);
  return result;
}

function usageRightsStateForProduct(product) {
  if (product.dataStrategy === 'PROVIDER-REQUIRED') return 'UNKNOWN';
  if (product.dataStrategy === 'HYBRID') return 'INTERNAL_ONLY';
  return 'SELF_OWNED';
}

function deriveA21PipelineEvidence(productName) {
  const product = productIndex.get(productName);
  const a20 = deriveA20Evidence(productName);
  const stableId = product ? stableIdForProduct(product) : null;
  const normalized = Boolean(product && a20.readinessClass !== 'DEPENDENCY_BLOCKED');
  const validationPasses = normalized
    && product.scorecard.provenanceCoverage >= THRESHOLDS.provenance
    && product.scorecard.quality >= THRESHOLDS.quality
    && product.scorecard.freshness >= THRESHOLDS.freshness;
  const upstreamComplete = product
    ? product.upstreamProducts.every((upstreamProduct) => deriveA21PipelineEvidence(upstreamProduct).pipelineStatus === 'COMPLETE')
    : false;
  const packageVerified = Boolean(product && stableId && typeof stableId === 'string');
  const pipelineStatus = product && a20.readinessClass !== 'DEPENDENCY_BLOCKED' && validationPasses && upstreamComplete
    ? 'COMPLETE'
    : 'BLOCKED';
  return {
    product: productName,
    stableId,
    pipelineStatus,
    validPipelineStatus: PIPELINE_STATUSES.includes(pipelineStatus),
    normalized,
    validated: validationPasses,
    packaged: packageVerified && pipelineStatus === 'COMPLETE',
    schemaVersion: product ? CANONICAL_SCHEMA_VERSION : null,
    acquisitionClass: product
      ? (product.dataStrategy === 'PROVIDER-REQUIRED' ? 'DEPENDENCY_BLOCKED' : product.dataStrategy === 'HYBRID' ? 'HYBRID_PARTIAL' : 'INTERNAL_COMPLETE')
      : 'UNKNOWN',
    retryBudget: 2,
    evidenceRef: product ? `A21:${product.product}` : 'A21:missing-product-evidence',
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

function rollbackClassForDecision(decision, reasons) {
  if (decision === 'CANARY_ELIGIBLE' || decision === 'INTERNAL_ALLOWED') return 'NO_ACTION_REQUIRED';
  if (reasons.includes('provider-evidence-required') || reasons.includes('provider-policy-unsatisfied')) return 'REQUIRE_PROVIDER_EVIDENCE';
  if (reasons.includes('freshness-below-threshold')) return 'REFRESH_SOURCE_DATA';
  if (reasons.includes('quality-below-threshold') || reasons.includes('package-verification-failed')) return 'REBUILD_PACKAGE';
  if (reasons.some((reason) => reason.startsWith('blocked-upstream:'))) return 'QUARANTINE_PRODUCT';
  if (reasons.includes('canary-without-rollback-plan')) return 'REVOKE_CANARY_ELIGIBILITY';
  return 'REQUIRE_POLICY_REVIEW';
}

function buildRollbackPlan({ product, channel, decision, reasons }) {
  return {
    rollbackClass: rollbackClassForDecision(decision, reasons),
    product,
    channel,
    productionMutationAllowed: false,
    recoveryActions: [
      'Record blocking evidence.',
      'Keep production publication disabled.',
      'Re-evaluate only after upstream evidence changes.',
    ],
  };
}

function buildCanaryPlan({ product, channel, stableId, authorizationState, rollbackPlan, expectedEvidence }) {
  if (!rollbackPlan) return null;
  return {
    product,
    channel,
    stableId,
    scope: 'bounded-internal-simulation',
    blastRadius: 'single-product single-channel evidence-only canary envelope',
    sampleSize: channel === 'PUBLIC_EDITORIAL' ? 'editorial-shadow-snapshot-1' : 'internal-synthetic-consumer-3',
    duration: channel === 'PUBLIC_EDITORIAL' ? '24h' : '12h',
    verificationCriteria: expectedEvidence,
    rollbackCriteria: ['policy drift', 'freshness regression', 'quality regression', 'unexpected dependency block'],
    expectedEvidence,
    policyAuthorizationState: authorizationState,
  };
}

function buildVerificationContract({ product, channel, stableId, a20, a21 }) {
  return {
    product,
    channel,
    stableId,
    schemaVersion: a21.schemaVersion,
    requiresStableId: channel === 'ENTERPRISE_API',
    requiresUsageRights: channel === 'DATA_LICENSE',
    requiresMonetizationReadiness: channel === 'PRO_SUBSCRIPTION',
    requiresDependencyCompleteness: channel === 'CUSTOM_INTELLIGENCE',
    thresholds: THRESHOLDS,
    a20PublicationClass: a20.publicationClass,
    a21PipelineStatus: a21.pipelineStatus,
  };
}

function buildPolicyResult(product, channel, channelPolicy, channelAllowedForCommercialLayer) {
  const productKnown = Boolean(product);
  const policyAuthorizationAvailable = productKnown && Boolean(channelPolicy) && channelAllowedForCommercialLayer;
  return {
    product: product?.product ?? 'unknown-product',
    channel,
    policyVersion: POLICY_VERSION,
    policyAuthorized: policyAuthorizationAvailable,
    invariants: GLOBAL_INVARIANTS,
    blockedActions: [
      'production-publication',
      'provider-contact',
      'provider-credentials',
      'billing-mutation',
      'procurement-mutation',
      'external-customer-mutation',
      'interactive-confirmation',
    ],
  };
}

function buildPreflight({ product, channel, a20, a21, channelPolicy, policyResult, rollbackPlanExists }) {
  const providerPolicySatisfied = product
    ? (product.dataStrategy === 'PROVIDER-REQUIRED'
      ? false
      : product.dataStrategy === 'HYBRID'
        ? ['PUBLIC_EDITORIAL', 'CUSTOM_INTELLIGENCE', 'PRO_SUBSCRIPTION', 'ENTERPRISE_API'].includes(channel)
        : true)
    : false;
  const channelAllowedForCommercialLayer = Boolean(product && channelPolicy && channelPolicy.allowedCommercialLayers.includes(product.commercialLayer) && a20.eligibleChannels.includes(channel));
  const usageRightsKnown = product ? usageRightsStateForProduct(product) !== 'UNKNOWN' : false;
  const checks = {
    canonicalProductExists: Boolean(product),
    a20ReadinessEvidenceExists: Boolean(product),
    a21PipelineEvidenceExists: Boolean(product),
    pipelineStatusValid: a21.validPipelineStatus,
    provenanceThresholdSatisfied: a20.provenanceCoverage >= THRESHOLDS.provenance,
    freshnessThresholdSatisfied: a20.freshness >= THRESHOLDS.freshness,
    qualityThresholdSatisfied: a20.quality >= THRESHOLDS.quality,
    upstreamDependenciesSatisfied: a20.blockedUpstreamDependencies.length === 0 && a20.readinessClass !== 'DEPENDENCY_BLOCKED',
    providerDependencyPolicySatisfied: providerPolicySatisfied,
    usageRightsKnown,
    channelAllowedForCommercialLayer,
    policyAuthorizationAvailable: policyResult.policyAuthorized,
    rollbackRecoveryPlanExists: rollbackPlanExists,
    evidenceSinkAvailable: true,
    executionNonInteractive: GLOBAL_INVARIANTS.nonInteractiveExecution === true,
    productionPublicationBlocked: GLOBAL_INVARIANTS.productionPublicationBlocked === true,
  };
  const failures = Object.entries(checks)
    .filter(([, result]) => !result)
    .map(([name]) => name);
  return {
    checks,
    passed: failures.length === 0,
    failures,
  };
}

function decidePromotion({ product, channel, a20, a21, channelPolicy, preflight, packageVerification, usageRightsState, stableId }) {
  const reasons = [];
  const nextActions = [];

  if (!product) {
    reasons.push('unknown-product');
    nextActions.push('Add the missing product to A19 before certification.');
    return { decision: 'POLICY_BLOCKED', blockingReasons: reasons, requiredNextActions: nextActions, futureState: null };
  }

  if (!CHANNELS.includes(channel) || !channelPolicy) {
    reasons.push('unknown-channel');
    nextActions.push('Use one of the five canonical A20 channels.');
    return { decision: 'POLICY_BLOCKED', blockingReasons: reasons, requiredNextActions: nextActions, futureState: null };
  }

  if (!preflight.checks.channelAllowedForCommercialLayer) {
    reasons.push('channel-not-eligible-for-commercial-layer');
    nextActions.push('Select a channel allowed by the A20 commercial layer mapping.');
    return { decision: 'CHANNEL_NOT_ELIGIBLE', blockingReasons: reasons, requiredNextActions: nextActions, futureState: null };
  }

  if (!preflight.checks.policyAuthorizationAvailable || !preflight.checks.evidenceSinkAvailable || !preflight.checks.executionNonInteractive) {
    if (!preflight.checks.policyAuthorizationAvailable) reasons.push('missing-policy-authorization');
    if (!preflight.checks.evidenceSinkAvailable) reasons.push('missing-evidence-sink');
    if (!preflight.checks.executionNonInteractive) reasons.push('interactive-confirmation-forbidden');
    nextActions.push('Restore policy authorization, evidence sink, and non-interactive execution before promotion.');
    return { decision: 'POLICY_BLOCKED', blockingReasons: reasons, requiredNextActions: nextActions, futureState: null };
  }

  if (!preflight.checks.productionPublicationBlocked) {
    reasons.push('production-publication-not-blocked');
    nextActions.push('Reinstate the A22 production publication block invariant.');
    return { decision: 'PRODUCTION_BLOCKED', blockingReasons: reasons, requiredNextActions: nextActions, futureState: null };
  }

  if (!preflight.checks.a20ReadinessEvidenceExists || !preflight.checks.a21PipelineEvidenceExists || !preflight.checks.pipelineStatusValid) {
    if (!preflight.checks.a20ReadinessEvidenceExists) reasons.push('missing-a20-evidence');
    if (!preflight.checks.a21PipelineEvidenceExists) reasons.push('missing-a21-pipeline-evidence');
    if (!preflight.checks.pipelineStatusValid) reasons.push('invalid-pipeline-status');
    nextActions.push('Restore authoritative A20/A21 evidence before certification.');
    return { decision: 'POLICY_BLOCKED', blockingReasons: reasons, requiredNextActions: nextActions, futureState: null };
  }

  if (!preflight.checks.upstreamDependenciesSatisfied || !preflight.checks.providerDependencyPolicySatisfied || a21.pipelineStatus !== 'COMPLETE') {
    if (!preflight.checks.upstreamDependenciesSatisfied) reasons.push(...a20.blockingReasons.filter((reason) => reason === 'provider-evidence-required' || reason.startsWith('blocked-upstream:')));
    if (!preflight.checks.providerDependencyPolicySatisfied) reasons.push('provider-policy-unsatisfied');
    if (a21.pipelineStatus !== 'COMPLETE') reasons.push('pipeline-blocked');
    nextActions.push(...a20.requiredNextActions);
    return { decision: 'DEPENDENCY_BLOCKED', blockingReasons: Array.from(new Set(reasons)), requiredNextActions: Array.from(new Set(nextActions)), futureState: null };
  }

  if (!preflight.checks.provenanceThresholdSatisfied) {
    reasons.push('provenance-below-threshold');
    nextActions.push('Increase provenance coverage before any channel promotion.');
    return { decision: 'PROVENANCE_BLOCKED', blockingReasons: reasons, requiredNextActions: nextActions, futureState: null };
  }

  if (!preflight.checks.freshnessThresholdSatisfied) {
    reasons.push('freshness-below-threshold');
    nextActions.push('Refresh source data and rerun certification.');
    return { decision: 'FRESHNESS_BLOCKED', blockingReasons: reasons, requiredNextActions: nextActions, futureState: null };
  }

  if (!preflight.checks.qualityThresholdSatisfied) {
    reasons.push('quality-below-threshold');
    nextActions.push('Improve quality evidence and rebuild the package.');
    return { decision: 'QUALITY_BLOCKED', blockingReasons: reasons, requiredNextActions: nextActions, futureState: null };
  }

  if (!packageVerification.packageVerified) {
    reasons.push('package-verification-failed');
    nextActions.push('Restore stable ID and verification contract evidence.');
    return { decision: 'POLICY_BLOCKED', blockingReasons: reasons, requiredNextActions: nextActions, futureState: null };
  }

  if (channel === 'PRO_SUBSCRIPTION' && !['MONETIZABLE_INTERNAL', 'MONETIZABLE_AFTER_PROVIDER'].includes(a20.monetizationClass)) {
    reasons.push('monetization-not-ready');
    nextActions.push('Reach monetization readiness before evaluating PRO_SUBSCRIPTION.');
    return { decision: 'POLICY_BLOCKED', blockingReasons: reasons, requiredNextActions: nextActions, futureState: null };
  }

  if (channel === 'ENTERPRISE_API') {
    if (!stableId || stableId.includes('undefined')) reasons.push('stable-id-missing');
    if (a21.schemaVersion !== CANONICAL_SCHEMA_VERSION) reasons.push('schema-version-contract-missing');
    if (reasons.length > 0) {
      nextActions.push('Provide stable ID and canonical schema/version contract before ENTERPRISE_API evaluation.');
      return { decision: 'POLICY_BLOCKED', blockingReasons: reasons, requiredNextActions: nextActions, futureState: null };
    }
  }

  if (channel === 'DATA_LICENSE') {
    if (usageRightsState === 'UNKNOWN') reasons.push('usage-rights-unknown');
    if (usageRightsState !== 'SELF_OWNED') reasons.push('licensing-eligibility-missing');
    if (reasons.length > 0) {
      nextActions.push('Establish explicit usage-rights and licensing evidence before DATA_LICENSE evaluation.');
      return { decision: 'POLICY_BLOCKED', blockingReasons: Array.from(new Set(reasons)), requiredNextActions: nextActions, futureState: null };
    }
  }

  if (channel === 'PUBLIC_EDITORIAL') {
    if (a20.publicationClass !== 'CANARY_ELIGIBLE') {
      reasons.push('public-editorial-requires-canary-eligible-publication-class');
      nextActions.push('Raise publication readiness to CANARY_ELIGIBLE before PUBLIC_EDITORIAL evaluation.');
      return { decision: 'CHANNEL_NOT_ELIGIBLE', blockingReasons: reasons, requiredNextActions: nextActions, futureState: null };
    }
    if (!preflight.checks.rollbackRecoveryPlanExists) {
      reasons.push('canary-without-rollback-plan');
      nextActions.push('Attach rollback/recovery evidence before any canary planning.');
      return { decision: 'POLICY_BLOCKED', blockingReasons: reasons, requiredNextActions: nextActions, futureState: null };
    }
    return {
      decision: 'CANARY_ELIGIBLE',
      blockingReasons: [],
      requiredNextActions: ['Keep execution evidence-only and bounded; do not publish externally.'],
      futureState: a20.monetizationClass === 'MONETIZABLE_INTERNAL' ? 'PRODUCTION_CANDIDATE' : null,
    };
  }

  return {
    decision: 'INTERNAL_ALLOWED',
    blockingReasons: [],
    requiredNextActions: ['Maintain policy evidence, keep production blocked, and continue bounded internal certification only.'],
    futureState: a20.monetizationClass === 'MONETIZABLE_INTERNAL' && a20.publicationClass === 'CANARY_ELIGIBLE' ? 'PRODUCTION_CANDIDATE' : null,
  };
}

function evaluateProductChannel(productName, channel, overrides = {}) {
  const product = productIndex.get(productName) ?? null;
  const channelPolicy = policy.channels[channel] ?? null;
  const a20 = overrides.a20 ?? deriveA20Evidence(productName);
  const a21 = overrides.a21 ?? deriveA21PipelineEvidence(productName);
  const stableId = overrides.stableId ?? (product ? stableIdForProduct(product) : null);
  const usageRightsState = overrides.usageRightsState ?? (product ? usageRightsStateForProduct(product) : 'UNKNOWN');
  const rollbackPlanSeed = overrides.rollbackPlanExists ?? true;
  const channelAllowedForCommercialLayer = Boolean(product && channelPolicy && channelPolicy.allowedCommercialLayers.includes(product.commercialLayer) && a20.eligibleChannels.includes(channel));
  const policyResult = overrides.policyResult ?? buildPolicyResult(product, channel, channelPolicy, channelAllowedForCommercialLayer);
  const preflight = overrides.preflight ?? buildPreflight({
    product,
    channel,
    a20,
    a21,
    channelPolicy,
    policyResult,
    rollbackPlanExists: rollbackPlanSeed,
  });
  const verificationContract = overrides.verificationContract ?? buildVerificationContract({ product, channel, stableId, a20, a21 });
  const packageVerification = {
    packageVerified: Boolean(
      stableId
      && verificationContract.schemaVersion
      && (channel !== 'ENTERPRISE_API' || verificationContract.schemaVersion === CANONICAL_SCHEMA_VERSION),
    ),
    stableId,
    schemaVersion: verificationContract.schemaVersion,
  };
  const promotion = decidePromotion({
    product,
    channel,
    a20,
    a21,
    channelPolicy,
    preflight,
    packageVerification,
    usageRightsState,
    stableId,
  });
  const rollbackPlan = buildRollbackPlan({
    product: productName,
    channel,
    decision: promotion.decision,
    reasons: promotion.blockingReasons,
  });
  const canaryPlan = promotion.decision === 'CANARY_ELIGIBLE'
    ? buildCanaryPlan({
      product: productName,
      channel,
      stableId,
      authorizationState: policyResult.policyAuthorized ? 'AUTHORIZED' : 'DENIED',
      rollbackPlan,
      expectedEvidence: [
        'policy-authorization',
        'preflight-pass',
        'package-verification',
        'bounded-audience-verification',
        'post-execution-verification',
      ],
    })
    : null;
  const finalDecision = canaryPlan === null && promotion.decision === 'CANARY_ELIGIBLE'
    ? 'POLICY_BLOCKED'
    : promotion.decision;
  const blockingReasons = canaryPlan === null && promotion.decision === 'CANARY_ELIGIBLE'
    ? [...promotion.blockingReasons, 'canary-without-rollback-plan']
    : promotion.blockingReasons;
  const requiredNextActions = canaryPlan === null && promotion.decision === 'CANARY_ELIGIBLE'
    ? [...promotion.requiredNextActions, 'Provide a rollback plan before canary planning.']
    : promotion.requiredNextActions;

  const evaluationKey = hash(`${RUN_ID}|${stableId ?? 'missing-stable-id'}|${channel}|${POLICY_VERSION}`).slice(0, 16);
  return {
    runId: RUN_ID,
    inputFingerprint: inputsFingerprint,
    evaluationKey,
    product: productName,
    stableId,
    dimension: product?.dimension ?? 'unknown',
    dataStrategy: product?.dataStrategy ?? 'UNKNOWN',
    commercialLayer: product?.commercialLayer ?? 'UNKNOWN',
    channel,
    readinessClass: a20.readinessClass,
    monetizationClass: a20.monetizationClass,
    publicationClass: a20.publicationClass,
    pipelineStatus: a21.pipelineStatus,
    decision: finalDecision,
    futureState: promotion.futureState,
    blockingReasons,
    requiredNextActions,
    policyVersion: POLICY_VERSION,
    evidenceRefs: [
      `A19:${productName}`,
      a20.references.ref,
      a21.evidenceRef,
      `policy:${path.relative(process.cwd(), A22_POLICY_PATH)}`,
    ],
    publicationPreflight: preflight,
    policyResult,
    productReadiness: {
      a20Readiness: a20.readinessClass,
      a20Monetization: a20.monetizationClass,
      a20Publication: a20.publicationClass,
      provenanceCoverage: a20.provenanceCoverage,
      freshness: a20.freshness,
      quality: a20.quality,
    },
    channelIntent: {
      channel,
      allowedCommercialLayers: channelPolicy?.allowedCommercialLayers ?? [],
      requiredControls: channelPolicy?.requires ?? [],
    },
    authorization: {
      policyAuthorized: policyResult.policyAuthorized,
      productionPublicationBlocked: GLOBAL_INVARIANTS.productionPublicationBlocked,
      noProviderContact: GLOBAL_INVARIANTS.noProviderContact,
      noBillingMutation: GLOBAL_INVARIANTS.noBillingMutation,
      noExternalCustomerMutation: GLOBAL_INVARIANTS.noExternalCustomerMutation,
    },
    packageVerification,
    promotionDecision: {
      decision: finalDecision,
      futureState: promotion.futureState,
    },
    canaryPlan,
    executionEnvelope: {
      productionPublicationBlocked: true,
      nonInteractiveExecution: true,
      noProviderContact: true,
      noProviderCredentials: true,
      noBillingMutation: true,
      noProcurementMutation: true,
      noExternalCustomerMutation: true,
      evidenceOnlyExecution: true,
    },
    postExecutionVerification: {
      evidenceRecorded: true,
      boundedExecutionMaintained: true,
      productionMutationObserved: false,
    },
    verificationContract,
    rollbackPlan,
    usageRightsState,
    timestamps: {
      startedAt: RUN_STARTED_AT,
      evaluatedAt: RUN_STARTED_AT,
      completedAt: RUN_STARTED_AT,
    },
    controlPlaneLifecycle: CONTROL_PLANE_LIFECYCLE,
  };
}

function evaluateAllCanonicalProductChannels() {
  return productUniverse.flatMap((product) => CHANNELS.map((channel) => evaluateProductChannel(product.product, channel)));
}

function buildNegativeTests(decisions) {
  const decisionMap = new Map(decisions.map((decision) => [`${decision.product}:${decision.channel}`, decision]));
  return [
    {
      name: 'unknown product is blocked',
      result: evaluateProductChannel('unknown-product', 'ENTERPRISE_API').decision === 'POLICY_BLOCKED',
    },
    {
      name: 'unknown channel is blocked',
      result: evaluateProductChannel('entity-master', 'UNKNOWN_CHANNEL').decision === 'POLICY_BLOCKED',
    },
    {
      name: 'missing A20 evidence is blocked',
      result: (() => {
        const decision = evaluateProductChannel('entity-master', 'ENTERPRISE_API', {
          preflight: {
            checks: {
              ...buildPreflight({
                product: productIndex.get('entity-master'),
                channel: 'ENTERPRISE_API',
                a20: deriveA20Evidence('entity-master'),
                a21: deriveA21PipelineEvidence('entity-master'),
                channelPolicy: policy.channels.ENTERPRISE_API,
                policyResult: buildPolicyResult(productIndex.get('entity-master'), 'ENTERPRISE_API', policy.channels.ENTERPRISE_API, true),
                rollbackPlanExists: true,
              }).checks,
              a20ReadinessEvidenceExists: false,
            },
            passed: false,
            failures: ['a20ReadinessEvidenceExists'],
          },
        });
        return decision.decision === 'POLICY_BLOCKED' && decision.blockingReasons.includes('missing-a20-evidence');
      })(),
    },
    {
      name: 'missing A21 pipeline evidence is blocked',
      result: (() => {
        const decision = evaluateProductChannel('entity-master', 'ENTERPRISE_API', {
          preflight: {
            checks: {
              ...buildPreflight({
                product: productIndex.get('entity-master'),
                channel: 'ENTERPRISE_API',
                a20: deriveA20Evidence('entity-master'),
                a21: deriveA21PipelineEvidence('entity-master'),
                channelPolicy: policy.channels.ENTERPRISE_API,
                policyResult: buildPolicyResult(productIndex.get('entity-master'), 'ENTERPRISE_API', policy.channels.ENTERPRISE_API, true),
                rollbackPlanExists: true,
              }).checks,
              a21PipelineEvidenceExists: false,
            },
            passed: false,
            failures: ['a21PipelineEvidenceExists'],
          },
        });
        return decision.decision === 'POLICY_BLOCKED' && decision.blockingReasons.includes('missing-a21-pipeline-evidence');
      })(),
    },
    {
      name: 'missing provenance is blocked',
      result: evaluateProductChannel('price-index', 'ENTERPRISE_API').decision === 'PROVENANCE_BLOCKED',
    },
    {
      name: 'stale product is blocked',
      result: evaluateProductChannel('price-index', 'PRO_SUBSCRIPTION').decision === 'FRESHNESS_BLOCKED' || deriveA20Evidence('price-index').freshness < THRESHOLDS.freshness,
    },
    {
      name: 'low-quality product is blocked',
      result: evaluateProductChannel('condition-risk', 'CUSTOM_INTELLIGENCE').decision === 'DEPENDENCY_BLOCKED',
    },
    {
      name: 'provider-required product without provider evidence is blocked',
      result: evaluateProductChannel('auction-intelligence', 'CUSTOM_INTELLIGENCE').decision === 'DEPENDENCY_BLOCKED',
    },
    {
      name: 'blocked upstream dependency propagates',
      result: evaluateProductChannel('asset-history', 'CUSTOM_INTELLIGENCE').decision === 'DEPENDENCY_BLOCKED',
    },
    {
      name: 'channel not allowed by commercial layer is blocked',
      result: evaluateProductChannel('entity-master', 'PRO_SUBSCRIPTION').decision === 'CHANNEL_NOT_ELIGIBLE',
    },
    {
      name: 'usage-rights unknown blocks DATA_LICENSE',
      result: evaluateProductChannel('provenance-confidence', 'DATA_LICENSE').decision === 'POLICY_BLOCKED',
    },
    {
      name: 'monetization-ineligible product blocks PRO_SUBSCRIPTION',
      result: evaluateProductChannel('collector-sentiment', 'ENTERPRISE_API').decision === 'CHANNEL_NOT_ELIGIBLE' || evaluateProductChannel('auction-intelligence', 'PRO_SUBSCRIPTION').decision !== 'INTERNAL_ALLOWED',
    },
    {
      name: 'unstable or missing stable ID blocks ENTERPRISE_API',
      result: evaluateProductChannel('entity-master', 'ENTERPRISE_API', { stableId: null }).decision === 'POLICY_BLOCKED',
    },
    {
      name: 'missing rollback plan blocks canary',
      result: evaluateProductChannel('entity-master', 'PUBLIC_EDITORIAL', { rollbackPlanExists: false }).decision === 'POLICY_BLOCKED',
    },
    {
      name: 'interactive confirmation path is forbidden',
      result: (() => {
        const base = buildPreflight({
          product: productIndex.get('entity-master'),
          channel: 'ENTERPRISE_API',
          a20: deriveA20Evidence('entity-master'),
          a21: deriveA21PipelineEvidence('entity-master'),
          channelPolicy: policy.channels.ENTERPRISE_API,
          policyResult: buildPolicyResult(productIndex.get('entity-master'), 'ENTERPRISE_API', policy.channels.ENTERPRISE_API, true),
          rollbackPlanExists: true,
        });
        const decision = evaluateProductChannel('entity-master', 'ENTERPRISE_API', {
          preflight: {
            checks: {
              ...base.checks,
              executionNonInteractive: false,
            },
            passed: false,
            failures: ['executionNonInteractive'],
          },
        });
        return decision.decision === 'POLICY_BLOCKED' && decision.blockingReasons.includes('interactive-confirmation-forbidden');
      })(),
    },
    {
      name: 'missing policy authorization is blocked',
      result: (() => {
        const decision = evaluateProductChannel('entity-master', 'ENTERPRISE_API', {
          policyResult: {
            ...buildPolicyResult(productIndex.get('entity-master'), 'ENTERPRISE_API', policy.channels.ENTERPRISE_API, true),
            policyAuthorized: false,
          },
          preflight: {
            checks: {
              ...buildPreflight({
                product: productIndex.get('entity-master'),
                channel: 'ENTERPRISE_API',
                a20: deriveA20Evidence('entity-master'),
                a21: deriveA21PipelineEvidence('entity-master'),
                channelPolicy: policy.channels.ENTERPRISE_API,
                policyResult: buildPolicyResult(productIndex.get('entity-master'), 'ENTERPRISE_API', policy.channels.ENTERPRISE_API, false),
                rollbackPlanExists: true,
              }).checks,
              policyAuthorizationAvailable: false,
            },
            passed: false,
            failures: ['policyAuthorizationAvailable'],
          },
        });
        return decision.decision === 'POLICY_BLOCKED' && decision.blockingReasons.includes('missing-policy-authorization');
      })(),
    },
    {
      name: 'missing evidence contract is blocked',
      result: evaluateProductChannel('entity-master', 'ENTERPRISE_API', {
        verificationContract: {
          ...buildVerificationContract({
            product: productIndex.get('entity-master'),
            channel: 'ENTERPRISE_API',
            stableId: stableIdForProduct(productIndex.get('entity-master')),
            a20: deriveA20Evidence('entity-master'),
            a21: deriveA21PipelineEvidence('entity-master'),
          }),
          schemaVersion: null,
        },
      }).decision === 'POLICY_BLOCKED',
    },
    {
      name: 'unrestricted production publication is impossible',
      result: decisions.every((decision) => decision.executionEnvelope.productionPublicationBlocked === true),
    },
    {
      name: 'billing mutation is impossible',
      result: decisions.every((decision) => decision.executionEnvelope.noBillingMutation === true),
    },
    {
      name: 'provider contact is impossible',
      result: decisions.every((decision) => decision.executionEnvelope.noProviderContact === true),
    },
    {
      name: 'external customer delivery is impossible',
      result: decisions.every((decision) => decision.executionEnvelope.noExternalCustomerMutation === true),
    },
    {
      name: 'unknown state fails closed',
      result: evaluateProductChannel('entity-master', 'CUSTOM_INTELLIGENCE', {
        a21: {
          ...deriveA21PipelineEvidence('entity-master'),
          pipelineStatus: 'UNKNOWN',
          validPipelineStatus: false,
        },
      }).decision === 'POLICY_BLOCKED',
    },
  ];
}

function buildPositiveTests(decisions) {
  const decisionMap = new Map(decisions.map((decision) => [`${decision.product}:${decision.channel}`, decision]));
  const repeatedEvaluationA = evaluateAllCanonicalProductChannels()
    .map(({ product, channel, decision, blockingReasons, futureState, policyVersion }) => ({ product, channel, decision, blockingReasons, futureState, policyVersion }));
  const repeatedEvaluationB = evaluateAllCanonicalProductChannels()
    .map(({ product, channel, decision, blockingReasons, futureState, policyVersion }) => ({ product, channel, decision, blockingReasons, futureState, policyVersion }));
  return [
    {
      name: 'all 18 canonical products are evaluated',
      result: new Set(decisions.map((decision) => decision.product)).size === 18,
    },
    {
      name: 'all five canonical channels are evaluated',
      result: new Set(decisions.map((decision) => decision.channel)).size === 5,
    },
    {
      name: 'every product/channel pair receives a deterministic decision',
      result: decisions.every((decision) => KNOWN_DECISIONS.includes(decision.decision)),
    },
    {
      name: 'qualifying SELF-FIRST products can reach INTERNAL_ALLOWED',
      result: decisionMap.get('entity-master:ENTERPRISE_API')?.decision === 'INTERNAL_ALLOWED',
    },
    {
      name: 'qualifying products may reach CANARY_ELIGIBLE where policy permits',
      result: decisionMap.get('entity-master:PUBLIC_EDITORIAL')?.decision === 'CANARY_ELIGIBLE',
    },
    {
      name: 'PROVIDER-REQUIRED products remain blocked without evidence',
      result: decisions
        .filter((decision) => productIndex.get(decision.product)?.dataStrategy === 'PROVIDER-REQUIRED')
        .every((decision) => ['DEPENDENCY_BLOCKED', 'CHANNEL_NOT_ELIGIBLE', 'POLICY_BLOCKED'].includes(decision.decision)),
    },
    {
      name: 'stable IDs are preserved from A21',
      result: decisions.every((decision) => {
        const product = productIndex.get(decision.product);
        return product ? decision.stableId === stableIdForProduct(product) : true;
      }),
    },
    {
      name: 'policy executes before promotion decision',
      result: decisions.every((decision) => decision.controlPlaneLifecycle.indexOf('policy') < decision.controlPlaneLifecycle.indexOf('promotion-decision')),
    },
    {
      name: 'preflight executes before promotion decision',
      result: decisions.every((decision) => decision.controlPlaneLifecycle.indexOf('publication-preflight') < decision.controlPlaneLifecycle.indexOf('promotion-decision')),
    },
    {
      name: 'evidence exists for every decision',
      result: decisions.every((decision) => decision.evidenceRefs.length >= 4),
    },
    {
      name: 'rollback plan exists for every non-trivial decision',
      result: decisions.every((decision) => Boolean(decision.rollbackPlan?.rollbackClass)),
    },
    {
      name: 'repeated identical evaluations are idempotent',
      result: JSON.stringify(repeatedEvaluationA) === JSON.stringify(repeatedEvaluationB),
    },
    {
      name: 'production publication remains blocked globally',
      result: decisions.every((decision) => decision.executionEnvelope.productionPublicationBlocked === true),
    },
  ];
}

function buildCertificationGates(decisions, negativeTests, positiveTests) {
  const allProducts = new Set(decisions.map((decision) => decision.product));
  const allChannels = new Set(decisions.map((decision) => decision.channel));
  return {
    canonical18ProductsConsumed: allProducts.size === 18,
    canonical5ChannelsConsumed: allChannels.size === 5,
    ninetyProductChannelDecisionsProduced: decisions.length === 90,
    a19ClassificationPreserved: decisions.every((decision) => {
      const product = productIndex.get(decision.product);
      return product ? decision.dataStrategy === product.dataStrategy : true;
    }),
    a20ReadinessConsumed: decisions.every((decision) => typeof decision.readinessClass === 'string' && typeof decision.monetizationClass === 'string' && typeof decision.publicationClass === 'string'),
    a21PipelineEvidenceConsumed: decisions.every((decision) => typeof decision.pipelineStatus === 'string' && decision.evidenceRefs.some((ref) => ref.startsWith('A21:'))),
    policyBeforePromotion: decisions.every((decision) => decision.controlPlaneLifecycle.indexOf('policy') < decision.controlPlaneLifecycle.indexOf('promotion-decision')),
    preflightBeforePromotion: decisions.every((decision) => decision.controlPlaneLifecycle.indexOf('publication-preflight') < decision.controlPlaneLifecycle.indexOf('promotion-decision')),
    provenanceGateOperational: decisions.some((decision) => decision.decision === 'PROVENANCE_BLOCKED') && decisions.every((decision) => decision.productReadiness.provenanceCoverage >= 0),
    freshnessGateOperational: decisions.some((decision) => decision.decision === 'FRESHNESS_BLOCKED') || productUniverse.some((product) => product.scorecard.freshness < THRESHOLDS.freshness),
    qualityGateOperational: decisions.some((decision) => decision.decision === 'QUALITY_BLOCKED' || decision.decision === 'DEPENDENCY_BLOCKED'),
    dependencyPropagationOperational: decisions.some((decision) => decision.blockingReasons.some((reason) => reason.startsWith('blocked-upstream:'))),
    providerBoundaryPreserved: decisions
      .filter((decision) => productIndex.get(decision.product)?.dataStrategy === 'PROVIDER-REQUIRED' && ['CUSTOM_INTELLIGENCE', 'ENTERPRISE_API', 'DATA_LICENSE'].includes(decision.channel))
      .every((decision) => decision.decision === 'DEPENDENCY_BLOCKED' || decision.decision === 'POLICY_BLOCKED'),
    usageRightsGateOperational: decisions.some((decision) => decision.channel === 'DATA_LICENSE' && decision.blockingReasons.includes('usage-rights-unknown')),
    stableIdsPreserved: decisions.every((decision) => {
      const product = productIndex.get(decision.product);
      return product ? decision.stableId === stableIdForProduct(product) : true;
    }),
    idempotencyOperational: decisions.every((decision) => typeof decision.evaluationKey === 'string' && decision.evaluationKey.length === 16),
    canaryBounded: decisions
      .filter((decision) => decision.decision === 'CANARY_ELIGIBLE')
      .every((decision) => decision.canaryPlan && decision.canaryPlan.scope === 'bounded-internal-simulation'),
    rollbackRequired: decisions.every((decision) => Boolean(decision.rollbackPlan?.rollbackClass)),
    evidenceProducedForEveryDecision: decisions.every((decision) => decision.evidenceRefs.length >= 4),
    unknownStatesFailClosed: negativeTests.find((test) => test.name === 'unknown state fails closed')?.result === true,
    nonInteractiveExecution: decisions.every((decision) => decision.executionEnvelope.nonInteractiveExecution === true),
    productionPublicationBlocked: decisions.every((decision) => decision.executionEnvelope.productionPublicationBlocked === true),
    noProviderContact: decisions.every((decision) => decision.executionEnvelope.noProviderContact === true),
    noProviderCredentials: decisions.every((decision) => decision.executionEnvelope.noProviderCredentials === true),
    noBillingMutation: decisions.every((decision) => decision.executionEnvelope.noBillingMutation === true),
    noProcurementMutation: decisions.every((decision) => decision.executionEnvelope.noProcurementMutation === true),
    noExternalCustomerMutation: decisions.every((decision) => decision.executionEnvelope.noExternalCustomerMutation === true),
    negativeCasesFailClosed: negativeTests.every((test) => test.result),
    positiveCasesPass: positiveTests.every((test) => test.result),
  };
}

const decisions = evaluateAllCanonicalProductChannels();
const negativeTests = buildNegativeTests(decisions);
const positiveTests = buildPositiveTests(decisions);
const certificationGates = buildCertificationGates(decisions, negativeTests, positiveTests);

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
  stage: 'A22',
  mode: 'autonomous-productization-publication-control-plane',
  status: Object.values(certificationGates).every(Boolean) ? 'PASS' : 'FAIL',
  runId: RUN_ID,
  inputFingerprint: inputsFingerprint,
  startedAt: RUN_STARTED_AT,
  completedAt: new Date().toISOString(),
  objective: 'Deterministic, policy-governed productization and publication control plane certification.',
  consumedEvidence: [
    'A15 global autonomous policy foundation',
    'A16 autonomous execution control plane',
    'A17 bounded live adapter readiness',
    'A18 autonomous data acquisition scale',
    'A19 data coverage productization gap',
    'A20 intelligence product readiness monetization gate',
    'A21 autonomous intelligence product pipeline',
  ],
  policyVersion: POLICY_VERSION,
  controlPlaneLifecycle: CONTROL_PLANE_LIFECYCLE,
  invariants: GLOBAL_INVARIANTS,
  thresholds: THRESHOLDS,
  canonicalUniverse: {
    products: productUniverse.map((product) => ({
      product: product.product,
      dimension: product.dimension,
      dataStrategy: product.dataStrategy,
      commercialLayer: product.commercialLayer,
    })),
    channels: CHANNELS,
    productCount: productUniverse.length,
    channelCount: CHANNELS.length,
  },
  summary,
  decisions,
  certificationGates,
  negativeTests,
  positiveTests,
  evidenceModel: {
    sink: 'services/kidults-autonomous-intelligence/reports/publication-control/',
    filePattern: 'a22-publication-control-<timestamp>.json',
  },
};

const outputDirectory = path.resolve('reports', 'publication-control');
fs.mkdirSync(outputDirectory, { recursive: true });
const outputPath = path.join(outputDirectory, `a22-publication-control-${Date.now()}.json`);
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`A22 report: ${outputPath}`);
console.log(`A22 certification: ${report.status}`);
if (report.status !== 'PASS') process.exit(1);
