export const intelligenceDimensions = [
  { id: 'identity', self: 0.92, provider: 0.08, products: ['entity-master', 'canon-strength'] },
  { id: 'market-observation', self: 0.82, provider: 0.18, products: ['market-momentum', 'collector-sentiment'] },
  { id: 'transaction-pricing', self: 0.48, provider: 0.52, products: ['price-index', 'comparables'] },
  { id: 'availability-inventory', self: 0.70, provider: 0.30, products: ['scarcity-signal', 'availability-monitor'] },
  { id: 'culture-attention', self: 0.90, provider: 0.10, products: ['culture-velocity', 'trend-radar'] },
  { id: 'auction-private-sales', self: 0.35, provider: 0.65, products: ['auction-intelligence', 'liquidity-signal'] },
  { id: 'ownership-provenance', self: 0.30, provider: 0.70, products: ['provenance-confidence', 'asset-history'] },
  { id: 'authentication-condition', self: 0.22, provider: 0.78, products: ['condition-risk', 'auth-confidence'] },
  { id: 'macro-category', self: 0.88, provider: 0.12, products: ['category-outlook', 'kidult-100'] },
];

export function classifyDataStrategy(selfCoverage) {
  if (selfCoverage >= 0.75) return 'SELF-FIRST';
  if (selfCoverage >= 0.45) return 'HYBRID';
  return 'PROVIDER-REQUIRED';
}

export const classifiedDimensions = intelligenceDimensions.map((dimension) => ({
  ...dimension,
  strategy: classifyDataStrategy(dimension.self),
  providerNeed: Number(dimension.provider.toFixed(2)),
  selfCoverage: Number(dimension.self.toFixed(2)),
}));

export const providerRequirements = classifiedDimensions
  .filter((dimension) => dimension.strategy !== 'SELF-FIRST')
  .map((dimension) => ({
    dimension: dimension.id,
    need: dimension.strategy,
    requiredFields:
      dimension.id === 'transaction-pricing'
        ? ['sale_price', 'currency', 'sold_at', 'venue', 'item_identity']
        : dimension.id === 'auction-private-sales'
          ? ['estimate', 'hammer_price', 'sale_status', 'sale_date', 'venue']
          : dimension.id === 'ownership-provenance'
            ? ['provenance_event', 'event_date', 'source', 'confidence']
            : dimension.id === 'authentication-condition'
              ? ['condition_grade', 'auth_result', 'grader', 'observed_at']
              : ['source_specific_fields'],
    contract: ['provenance', 'freshness', 'stable-id', 'usage-rights', 'incremental-delivery'],
  }));

export const productUniverse = [
  {
    product: 'entity-master',
    commercialLayer: 'CORE_DATA',
    upstreamProducts: [],
    scorecard: { dataCoverage: 0.97, provenanceCoverage: 0.98, freshness: 0.91, quality: 0.95, repeatability: 0.97, autonomousDerivation: 0.99 },
  },
  {
    product: 'canon-strength',
    commercialLayer: 'SIGNAL',
    upstreamProducts: ['entity-master'],
    scorecard: { dataCoverage: 0.92, provenanceCoverage: 0.94, freshness: 0.88, quality: 0.91, repeatability: 0.93, autonomousDerivation: 0.96 },
  },
  {
    product: 'market-momentum',
    commercialLayer: 'SIGNAL',
    upstreamProducts: ['entity-master'],
    scorecard: { dataCoverage: 0.9, provenanceCoverage: 0.92, freshness: 0.87, quality: 0.89, repeatability: 0.91, autonomousDerivation: 0.95 },
  },
  {
    product: 'collector-sentiment',
    commercialLayer: 'SIGNAL',
    upstreamProducts: ['market-momentum'],
    scorecard: { dataCoverage: 0.86, provenanceCoverage: 0.88, freshness: 0.84, quality: 0.85, repeatability: 0.88, autonomousDerivation: 0.9 },
  },
  {
    product: 'price-index',
    commercialLayer: 'INDEX',
    upstreamProducts: ['entity-master'],
    scorecard: { dataCoverage: 0.68, provenanceCoverage: 0.79, freshness: 0.81, quality: 0.8, repeatability: 0.83, autonomousDerivation: 0.75 },
  },
  {
    product: 'comparables',
    commercialLayer: 'ANALYTICS',
    upstreamProducts: ['entity-master', 'price-index'],
    scorecard: { dataCoverage: 0.66, provenanceCoverage: 0.77, freshness: 0.78, quality: 0.79, repeatability: 0.81, autonomousDerivation: 0.74 },
  },
  {
    product: 'scarcity-signal',
    commercialLayer: 'SIGNAL',
    upstreamProducts: ['entity-master'],
    scorecard: { dataCoverage: 0.78, provenanceCoverage: 0.82, freshness: 0.83, quality: 0.82, repeatability: 0.85, autonomousDerivation: 0.84 },
  },
  {
    product: 'availability-monitor',
    commercialLayer: 'ANALYTICS',
    upstreamProducts: ['entity-master', 'scarcity-signal'],
    scorecard: { dataCoverage: 0.74, provenanceCoverage: 0.8, freshness: 0.82, quality: 0.81, repeatability: 0.84, autonomousDerivation: 0.82 },
  },
  {
    product: 'culture-velocity',
    commercialLayer: 'SIGNAL',
    upstreamProducts: ['entity-master'],
    scorecard: { dataCoverage: 0.91, provenanceCoverage: 0.93, freshness: 0.88, quality: 0.9, repeatability: 0.92, autonomousDerivation: 0.95 },
  },
  {
    product: 'trend-radar',
    commercialLayer: 'ANALYTICS',
    upstreamProducts: ['culture-velocity'],
    scorecard: { dataCoverage: 0.87, provenanceCoverage: 0.9, freshness: 0.85, quality: 0.87, repeatability: 0.89, autonomousDerivation: 0.92 },
  },
  {
    product: 'auction-intelligence',
    commercialLayer: 'PREMIUM_INTELLIGENCE',
    upstreamProducts: ['entity-master'],
    scorecard: { dataCoverage: 0.39, provenanceCoverage: 0.45, freshness: 0.63, quality: 0.68, repeatability: 0.61, autonomousDerivation: 0.42 },
  },
  {
    product: 'liquidity-signal',
    commercialLayer: 'SIGNAL',
    upstreamProducts: ['auction-intelligence'],
    scorecard: { dataCoverage: 0.33, provenanceCoverage: 0.41, freshness: 0.58, quality: 0.65, repeatability: 0.56, autonomousDerivation: 0.39 },
  },
  {
    product: 'provenance-confidence',
    commercialLayer: 'PREMIUM_INTELLIGENCE',
    upstreamProducts: ['entity-master'],
    scorecard: { dataCoverage: 0.31, provenanceCoverage: 0.38, freshness: 0.56, quality: 0.67, repeatability: 0.54, autonomousDerivation: 0.36 },
  },
  {
    product: 'asset-history',
    commercialLayer: 'PREMIUM_INTELLIGENCE',
    upstreamProducts: ['provenance-confidence'],
    scorecard: { dataCoverage: 0.29, provenanceCoverage: 0.36, freshness: 0.54, quality: 0.64, repeatability: 0.51, autonomousDerivation: 0.34 },
  },
  {
    product: 'condition-risk',
    commercialLayer: 'PREMIUM_INTELLIGENCE',
    upstreamProducts: ['entity-master'],
    scorecard: { dataCoverage: 0.28, provenanceCoverage: 0.34, freshness: 0.57, quality: 0.62, repeatability: 0.49, autonomousDerivation: 0.33 },
  },
  {
    product: 'auth-confidence',
    commercialLayer: 'PREMIUM_INTELLIGENCE',
    upstreamProducts: ['condition-risk'],
    scorecard: { dataCoverage: 0.26, provenanceCoverage: 0.32, freshness: 0.55, quality: 0.61, repeatability: 0.47, autonomousDerivation: 0.31 },
  },
  {
    product: 'category-outlook',
    commercialLayer: 'ANALYTICS',
    upstreamProducts: ['market-momentum', 'culture-velocity'],
    scorecard: { dataCoverage: 0.91, provenanceCoverage: 0.94, freshness: 0.87, quality: 0.91, repeatability: 0.93, autonomousDerivation: 0.95 },
  },
  {
    product: 'kidult-100',
    commercialLayer: 'INDEX',
    upstreamProducts: ['canon-strength', 'market-momentum', 'culture-velocity', 'category-outlook'],
    scorecard: { dataCoverage: 0.89, provenanceCoverage: 0.93, freshness: 0.86, quality: 0.9, repeatability: 0.92, autonomousDerivation: 0.94 },
  },
].map((productDefinition) => {
  const dimension = classifiedDimensions.find((dimensionEntry) => dimensionEntry.products.includes(productDefinition.product));
  return {
    ...productDefinition,
    dimension: dimension.id,
    dataStrategy: dimension.strategy,
  };
});

export const productMap = productUniverse.map((productDefinition) => ({
  product: productDefinition.product,
  dimension: productDefinition.dimension,
  dataStrategy: productDefinition.dataStrategy,
  readiness:
    productDefinition.dataStrategy === 'SELF-FIRST'
      ? 'INTERNAL-CANDIDATE'
      : productDefinition.dataStrategy === 'HYBRID'
        ? 'HYBRID-CANDIDATE'
        : 'DEPENDENCY-BLOCKED',
}));
