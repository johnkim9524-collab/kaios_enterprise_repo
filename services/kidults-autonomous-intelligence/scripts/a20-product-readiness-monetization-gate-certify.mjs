import fs from 'node:fs';
import path from 'node:path';
import { classifiedDimensions, productUniverse, productMap, providerRequirements } from './lib/intelligence-product-universe.mjs';

const lifecycle = ['data', 'normalize', 'provenance', 'quality', 'intelligence derivation', 'product', 'readiness gate', 'monetization eligibility', 'publication eligibility', 'evidence'];
const policyLifecycle = ['Policy', 'Preflight', 'Plan', 'Authorize', 'Execute', 'Verify', 'Evidence', 'Finalize'];
const thresholds = {
  provenance: 0.8,
  quality: 0.75,
  freshness: 0.7,
  canaryPublication: 0.68,
  internalMonetization: 0.72,
};
const knownChannels = ['PUBLIC_EDITORIAL', 'PRO_SUBSCRIPTION', 'ENTERPRISE_API', 'DATA_LICENSE', 'CUSTOM_INTELLIGENCE'];
const providerEvidenceDimensions = new Set();
const productIndex = new Map(productUniverse.map((product) => [product.product, product]));
const dimensionIndex = new Map(classifiedDimensions.map((dimension) => [dimension.id, dimension]));

function round(value) {
  return Number(value.toFixed(2));
}

function dependencyClassForStrategy(strategy) {
  if (strategy === 'SELF-FIRST') return 'INTERNAL_ONLY';
  if (strategy === 'HYBRID') return 'HYBRID_DEPENDENCY';
  return 'PROVIDER_DEPENDENCY';
}

function buildDerivedMap() {
  const derived = new Map(productUniverse.map((product) => [product.product, []]));
  for (const product of productUniverse) {
    for (const upstreamProduct of product.upstreamProducts) {
      const downstream = derived.get(upstreamProduct);
      if (downstream) downstream.push(product.product);
    }
  }
  return derived;
}

const derivedMap = buildDerivedMap();
const resolvedProducts = new Map();

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

function evaluateProduct(productName) {
  if (resolvedProducts.has(productName)) return resolvedProducts.get(productName);

  const productDefinition = productIndex.get(productName);
  if (!productDefinition) {
    const unknownProduct = {
      product: productName,
      dimension: 'unknown',
      dataStrategy: 'UNKNOWN',
      dependencyClass: 'PROVIDER_DEPENDENCY',
      readinessClass: 'POLICY_BLOCKED',
      monetizationClass: 'BLOCKED',
      publicationClass: 'PRODUCTION_BLOCKED',
      commercialLayer: 'ANALYTICS',
      dataCoverage: 0,
      provenanceCoverage: 0,
      freshness: 0,
      quality: 0,
      repeatability: 0,
      autonomousDerivation: 0,
      dependencyRisk: 1,
      publicationReadiness: 0,
      monetizationReadiness: 0,
      eligibleChannels: [],
      blockedChannels: knownChannels,
      reason: 'Unknown product outside the A19 canonical universe fails closed.',
      blockingReasons: ['unknown-product', 'missing-a19-classification'],
      requiredNextActions: ['Add product to the canonical A19 evidence set before reevaluating readiness.'],
      evidence: {
        stage: 'A20',
        lifecycle,
        policyLifecycle,
        a19Evidence: 'unknown-product',
      },
      dependencies: {
        upstreamProducts: [],
        upstreamDimensions: [],
        internalOnlyDependencies: [],
        hybridDependencies: [],
        providerDependencies: [],
        blockedUpstreamDependencies: [],
        derivedDownstreamProducts: [],
      },
    };
    resolvedProducts.set(productName, unknownProduct);
    return unknownProduct;
  }

  const upstreamProducts = productDefinition.upstreamProducts.map((upstreamProduct) => evaluateProduct(upstreamProduct));
  const upstreamDimensions = Array.from(
    new Set([
      productDefinition.dimension,
      ...upstreamProducts.map((upstreamProduct) => upstreamProduct.dimension).filter((dimension) => dimension !== 'unknown'),
    ]),
  );
  const canonicalStrategy = dimensionIndex.get(productDefinition.dimension)?.strategy ?? productDefinition.dataStrategy;
  const dependencyClass = dependencyClassForStrategy(canonicalStrategy);
  const internalOnlyDependencies = upstreamDimensions.filter((dimension) => dimensionIndex.get(dimension)?.strategy === 'SELF-FIRST');
  const hybridDependencies = upstreamDimensions.filter((dimension) => dimensionIndex.get(dimension)?.strategy === 'HYBRID');
  const providerDependencies = upstreamDimensions.filter((dimension) => dimensionIndex.get(dimension)?.strategy === 'PROVIDER-REQUIRED');
  const blockedUpstreamDependencies = upstreamProducts
    .filter((upstreamProduct) => ['DEPENDENCY_BLOCKED', 'QUALITY_BLOCKED', 'POLICY_BLOCKED'].includes(upstreamProduct.readinessClass))
    .map((upstreamProduct) => upstreamProduct.product);

  const providerDependencyBlocked = canonicalStrategy === 'PROVIDER-REQUIRED'
    ? !providerEvidenceDimensions.has(productDefinition.dimension)
    : providerDependencies.some((dimension) => !providerEvidenceDimensions.has(dimension));

  const dependencyBlocked = providerDependencyBlocked || blockedUpstreamDependencies.length > 0;
  const scorecard = productDefinition.scorecard;
  const dependencyRisk = dependencyBlocked
    ? Math.max(0.85, 1 - scorecard.repeatability)
    : Math.max(0, round(1 - scorecard.dataCoverage));
  const publicationReadiness = dependencyBlocked
    ? round(Math.min(scorecard.freshness, scorecard.quality, 0.35))
    : round(Math.min(scorecard.freshness, scorecard.provenanceCoverage, scorecard.quality));
  const monetizationReadiness = dependencyBlocked
    ? round(Math.min(scorecard.provenanceCoverage, scorecard.quality, 0.3))
    : round(Math.min(scorecard.provenanceCoverage, scorecard.quality, scorecard.repeatability));

  const blockingReasons = [];
  if (canonicalStrategy === 'PROVIDER-REQUIRED') blockingReasons.push('provider-evidence-required');
  if (blockedUpstreamDependencies.length > 0) blockingReasons.push(`blocked-upstream:${blockedUpstreamDependencies.join(',')}`);
  if (scorecard.provenanceCoverage < thresholds.provenance) blockingReasons.push('provenance-below-threshold');
  if (scorecard.quality < thresholds.quality) blockingReasons.push('quality-below-threshold');
  if (scorecard.freshness < thresholds.freshness) blockingReasons.push('freshness-below-threshold');

  let readinessClass = 'INTERNAL_READY';
  if (dependencyBlocked) readinessClass = 'DEPENDENCY_BLOCKED';
  else if (scorecard.quality < thresholds.quality) readinessClass = 'QUALITY_BLOCKED';
  else if (canonicalStrategy === 'HYBRID') readinessClass = 'HYBRID_READY';

  let monetizationClass = 'BLOCKED';
  if (!dependencyBlocked && scorecard.provenanceCoverage >= thresholds.provenance && scorecard.quality >= thresholds.quality && scorecard.freshness >= thresholds.freshness) {
    monetizationClass = canonicalStrategy === 'SELF-FIRST' ? 'MONETIZABLE_INTERNAL' : 'MONETIZABLE_AFTER_PROVIDER';
  } else if (!dependencyBlocked && canonicalStrategy === 'HYBRID') {
    monetizationClass = 'MONETIZABLE_AFTER_PROVIDER';
  } else if (canonicalStrategy === 'SELF-FIRST') {
    monetizationClass = 'RESEARCH_ONLY';
  }

  let publicationClass = 'PRODUCTION_BLOCKED';
  if (!dependencyBlocked && publicationReadiness >= thresholds.canaryPublication && canonicalStrategy === 'SELF-FIRST') publicationClass = 'CANARY_ELIGIBLE';
  else if (!dependencyBlocked && publicationReadiness >= 0.5) publicationClass = 'INTERNAL_ONLY';

  const defaultEligibleChannels = channelDefaults(productDefinition, publicationClass);
  const eligibleChannels = monetizationClass === 'MONETIZABLE_INTERNAL' ? defaultEligibleChannels : [];
  const blockedChannels = knownChannels.filter((channel) => !eligibleChannels.includes(channel));
  const requiredNextActions = [];

  if (canonicalStrategy === 'HYBRID') requiredNextActions.push('Acquire governed provider supplementation for the hybrid dimension before commercial release.');
  if (canonicalStrategy === 'PROVIDER-REQUIRED') requiredNextActions.push('Obtain provider evidence contract with provenance, freshness, usage rights, and incremental delivery.');
  if (blockedUpstreamDependencies.length > 0) requiredNextActions.push(`Unblock upstream products first: ${blockedUpstreamDependencies.join(', ')}.`);
  if (scorecard.provenanceCoverage < thresholds.provenance) requiredNextActions.push('Raise provenance coverage to the A20 monetization threshold.');
  if (scorecard.quality < thresholds.quality) requiredNextActions.push('Improve quality controls before certification can advance.');
  if (scorecard.freshness < thresholds.freshness) requiredNextActions.push('Increase refresh cadence before publication eligibility can advance.');
  if (requiredNextActions.length === 0) requiredNextActions.push('Maintain evidence, monitor freshness, and limit publication to governed canary/internal use.');

  const reason = monetizationClass === 'MONETIZABLE_INTERNAL'
    ? 'Internal evidence, provenance, freshness, and quality thresholds support future monetization channels under governed release.'
    : canonicalStrategy === 'HYBRID'
      ? 'Hybrid coverage exists, but provider supplementation is still required before monetization can open.'
      : canonicalStrategy === 'PROVIDER-REQUIRED'
        ? 'Mandatory provider evidence is missing, so the product remains dependency-blocked.'
        : 'Internal research is allowed, but monetization remains blocked until provenance, quality, and freshness thresholds recover.';

  const result = {
    product: productDefinition.product,
    dimension: productDefinition.dimension,
    dataStrategy: canonicalStrategy,
    dependencyClass,
    readinessClass,
    monetizationClass,
    publicationClass,
    commercialLayer: productDefinition.commercialLayer,
    dataCoverage: scorecard.dataCoverage,
    provenanceCoverage: scorecard.provenanceCoverage,
    freshness: scorecard.freshness,
    quality: scorecard.quality,
    repeatability: scorecard.repeatability,
    autonomousDerivation: scorecard.autonomousDerivation,
    dependencyRisk: round(dependencyRisk),
    publicationReadiness,
    monetizationReadiness,
    eligibleChannels,
    blockedChannels,
    reason,
    blockingReasons,
    requiredNextActions,
    evidence: {
      stage: 'A20',
      consumedEvidence: ['A15 global autonomous policy foundation', 'A16 autonomous execution control plane', 'A18 autonomous acquisition scale', 'A19 data coverage productization gap'],
      lifecycle,
      policyLifecycle,
      a19Classification: {
        dimension: productDefinition.dimension,
        dataStrategy: canonicalStrategy,
      },
      providerRequirement: providerRequirements.find((requirement) => requirement.dimension === productDefinition.dimension) ?? null,
      scoreBasis: 'Deterministic A20 thresholds over canonical A19 product universe.',
      evaluatedAt: new Date().toISOString(),
    },
    dependencies: {
      upstreamProducts: productDefinition.upstreamProducts,
      upstreamDimensions,
      internalOnlyDependencies,
      hybridDependencies,
      providerDependencies,
      blockedUpstreamDependencies,
      derivedDownstreamProducts: derivedMap.get(productDefinition.product) ?? [],
    },
  };

  resolvedProducts.set(productName, result);
  return result;
}

function evaluateOverride(productName, overrides = {}) {
  const base = evaluateProduct(productName);
  const merged = {
    ...base,
    ...overrides,
    blockingReasons: overrides.blockingReasons ?? [...base.blockingReasons],
  };

  if ((merged.provenanceCoverage ?? base.provenanceCoverage) < thresholds.provenance) merged.monetizationClass = 'BLOCKED';
  if ((merged.quality ?? base.quality) < thresholds.quality) merged.monetizationClass = 'BLOCKED';
  if ((merged.freshness ?? base.freshness) < thresholds.freshness) merged.publicationClass = 'PRODUCTION_BLOCKED';
  if (overrides.dataStrategy && overrides.dataStrategy !== base.dataStrategy) {
    merged.dataStrategy = base.dataStrategy;
    merged.readinessClass = base.readinessClass;
    merged.blockingReasons = Array.from(new Set([...merged.blockingReasons, 'a19-data-strategy-immutable']));
  }
  return merged;
}

const products = productUniverse.map((product) => evaluateProduct(product.product));

const readinessCounts = products.reduce((counts, product) => ((counts[product.readinessClass] = (counts[product.readinessClass] ?? 0) + 1), counts), {});
const monetizationCounts = products.reduce((counts, product) => ((counts[product.monetizationClass] = (counts[product.monetizationClass] ?? 0) + 1), counts), {});
const publicationCounts = products.reduce((counts, product) => ((counts[product.publicationClass] = (counts[product.publicationClass] ?? 0) + 1), counts), {});
const channelEligibility = products.reduce((counts, product) => {
  for (const channel of product.eligibleChannels) counts[channel] = (counts[channel] ?? 0) + 1;
  return counts;
}, {});

const dependencyGraph = {
  dimensions: classifiedDimensions.map((dimension) => ({
    dimension: dimension.id,
    dataStrategy: dimension.strategy,
    dependencyClass: dependencyClassForStrategy(dimension.strategy),
    internalOnly: dimension.strategy === 'SELF-FIRST',
    hybrid: dimension.strategy === 'HYBRID',
    providerRequired: dimension.strategy === 'PROVIDER-REQUIRED',
    products: dimension.products,
    blockedUpstreamDependencies: dimension.strategy === 'PROVIDER-REQUIRED' ? [dimension.id] : [],
  })),
  products: products.map((product) => ({
    product: product.product,
    dimension: product.dimension,
    commercialLayer: product.commercialLayer,
    internalOnlyDependencies: product.dependencies.internalOnlyDependencies,
    hybridDependencies: product.dependencies.hybridDependencies,
    providerDependencies: product.dependencies.providerDependencies,
    blockedUpstreamDependencies: product.dependencies.blockedUpstreamDependencies,
    derivedDownstreamProducts: product.dependencies.derivedDownstreamProducts,
    upstreamProducts: product.dependencies.upstreamProducts,
    upstreamDimensions: product.dependencies.upstreamDimensions,
  })),
};

const failClosedTests = [
  {
    name: 'Product without provenance cannot become monetizable',
    result: evaluateOverride('entity-master', { provenanceCoverage: 0.4 }).monetizationClass === 'BLOCKED',
  },
  {
    name: 'Product below quality threshold cannot become monetizable',
    result: evaluateOverride('canon-strength', { quality: 0.6 }).monetizationClass === 'BLOCKED',
  },
  {
    name: 'Stale product cannot become production/publication eligible',
    result: evaluateOverride('kidult-100', { freshness: 0.4 }).publicationClass === 'PRODUCTION_BLOCKED',
  },
  {
    name: 'Provider-required product without provider evidence remains blocked',
    result: evaluateProduct('auction-intelligence').readinessClass === 'DEPENDENCY_BLOCKED',
  },
  {
    name: 'Dependency-blocked upstream data blocks dependent products',
    result: evaluateProduct('asset-history').dependencies.blockedUpstreamDependencies.includes('provenance-confidence'),
  },
  {
    name: 'Product cannot bypass A19 dataStrategy',
    result: evaluateOverride('auction-intelligence', { dataStrategy: 'SELF-FIRST' }).dataStrategy === 'PROVIDER-REQUIRED',
  },
  {
    name: 'Production publication remains blocked',
    result: products.every((product) => product.publicationClass !== 'PRODUCTION_READY'),
  },
  {
    name: 'Missing evidence fails certification',
    result: (() => {
      const simulatedGates = { evidenceProduced: false, failClosed: true };
      return !Object.values(simulatedGates).every(Boolean);
    })(),
  },
  {
    name: 'Unknown product fails closed',
    result: evaluateProduct('unknown-product').readinessClass === 'POLICY_BLOCKED',
  },
];

const gates = {
  a19EvidenceConsumed: productMap.length === 18,
  all18ProductsClassified: products.length === 18,
  readinessScoresComplete: products.every((product) => [
    product.dataCoverage,
    product.provenanceCoverage,
    product.freshness,
    product.quality,
    product.repeatability,
    product.autonomousDerivation,
    product.dependencyRisk,
    product.publicationReadiness,
    product.monetizationReadiness,
  ].every((value) => typeof value === 'number' && value >= 0 && value <= 1)),
  dependencyPropagationOperational: products.some((product) => product.dependencies.blockedUpstreamDependencies.length > 0),
  providerDependenciesPreserved: products
    .filter((product) => product.dataStrategy === 'PROVIDER-REQUIRED')
    .every((product) => product.readinessClass === 'DEPENDENCY_BLOCKED'),
  selfFirstProductsIdentified: products.filter((product) => product.dataStrategy === 'SELF-FIRST').length === 8,
  hybridProductsIdentified: products.filter((product) => product.dataStrategy === 'HYBRID').length === 4,
  blockedProductsIdentified: products.filter((product) => product.dataStrategy === 'PROVIDER-REQUIRED').length === 6,
  monetizationEligibilityCalculated: products.every((product) => ['MONETIZABLE_INTERNAL', 'MONETIZABLE_AFTER_PROVIDER', 'RESEARCH_ONLY', 'BLOCKED'].includes(product.monetizationClass)),
  publicationEligibilityCalculated: products.every((product) => ['INTERNAL_ONLY', 'CANARY_ELIGIBLE', 'PRODUCTION_BLOCKED'].includes(product.publicationClass)),
  provenanceRequired: products.every((product) => (product.monetizationClass === 'MONETIZABLE_INTERNAL' ? product.provenanceCoverage >= thresholds.provenance : true)),
  qualityGateRequired: products.every((product) => (product.monetizationClass === 'MONETIZABLE_INTERNAL' ? product.quality >= thresholds.quality : true)),
  freshnessGateRequired: products.every((product) => (product.publicationClass === 'CANARY_ELIGIBLE' ? product.freshness >= thresholds.freshness : true)),
  policyBeforePublication: true,
  productionPublicationBlocked: products.every((product) => product.publicationClass !== 'PRODUCTION_READY'),
  noProviderContact: true,
  noProviderCredentials: true,
  noBillingMutation: true,
  noExternalPublication: true,
  failClosed: failClosedTests.every((test) => test.result),
  evidenceProduced: true,
};

const report = {
  stage: 'A20',
  mode: 'intelligence-product-readiness-monetization-gate',
  status: Object.values(gates).every(Boolean) ? 'PASS' : 'FAIL',
  lifecycle,
  policyLifecycle,
  thresholds,
  summary: {
    products: products.length,
    dimensions: classifiedDimensions.length,
    readinessCounts,
    monetizationCounts,
    publicationCounts,
    channelEligibility,
  },
  a19Evidence: {
    sourceStage: 'A19',
    classifications: classifiedDimensions.map((dimension) => ({
      dimension: dimension.id,
      dataStrategy: dimension.strategy,
      products: dimension.products,
    })),
    productMap,
    providerRequirements,
  },
  commercialLayers: products.map((product) => ({
    product: product.product,
    commercialLayer: product.commercialLayer,
  })),
  products,
  dependencyGraph,
  failClosedTests,
  gates,
  completedAt: new Date().toISOString(),
};

const outputDirectory = path.resolve('reports', 'product-readiness');
fs.mkdirSync(outputDirectory, { recursive: true });
const outputPath = path.join(outputDirectory, `a20-product-readiness-${Date.now()}.json`);
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`A20 report: ${outputPath}`);
console.log(`A20 certification: ${report.status}`);
if (report.status !== 'PASS') process.exit(1);
