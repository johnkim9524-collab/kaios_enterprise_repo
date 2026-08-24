import {
  classifyContextOnlySurface,
  cloneGovernedMarketSurfaceProfile,
  parseStrictExposureSurface,
  type GovernedMarketSurfaceProfile,
  type GovernedMarketSurfaceResult,
  type GovernedMarketSurfaceSnapshot,
} from './governed-market-surface.js';

const priceChartingProfile: GovernedMarketSurfaceProfile = {
  source_id: 'pricecharting-api',
  canonical_host: 'www.pricecharting.com',
  allowed_hosts: ['www.pricecharting.com', 'pricecharting.com'],
  allowed_path_prefixes: ['/api/product', '/api-documentation'],
  source_schema_version: 'pricecharting-current-value-context-snapshot-v1',
  source_owner_candidate_id: 'pricecharting',
  family: 'AGGREGATE_PRICE_GUIDE_CONTEXT',
  registered_claims: ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE'],
  implemented_claim_parsers: [],
};

const reverbProfile: GovernedMarketSurfaceProfile = {
  source_id: 'reverb-price-guide',
  canonical_host: 'reverb.com',
  allowed_hosts: ['reverb.com', 'www.reverb.com'],
  allowed_path_prefixes: ['/price-guide'],
  source_schema_version: 'reverb-price-guide-context-snapshot-v1',
  source_owner_candidate_id: 'reverb',
  family: 'AGGREGATE_PRICE_GUIDE_CONTEXT',
  registered_claims: ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE'],
  implemented_claim_parsers: [],
};

const hasbroPulseProfile: GovernedMarketSurfaceProfile = {
  source_id: 'hasbro-pulse-collections',
  canonical_host: 'www.hasbropulse.com',
  allowed_hosts: ['www.hasbropulse.com', 'hasbropulse.com'],
  allowed_path_prefixes: ['/collections'],
  source_schema_version: 'hasbro-pulse-release-context-snapshot-v1',
  source_owner_candidate_id: 'hasbro',
  family: 'RELEASE_OR_LISTING_CONTEXT',
  registered_claims: ['LIQUIDITY_OR_TIME_TO_SALE'],
  implemented_claim_parsers: [],
};

const goatProfile: GovernedMarketSurfaceProfile = {
  source_id: 'goat-sneaker-marketplace',
  canonical_host: 'www.goat.com',
  allowed_hosts: ['www.goat.com', 'goat.com'],
  allowed_path_prefixes: ['/sneakers', '/apparel', '/bags'],
  source_schema_version: 'goat-exposure-snapshot-v1',
  source_owner_candidate_id: 'goat',
  family: 'MARKETPLACE_EXPOSURE',
  registered_claims: ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE', 'LIQUIDITY_OR_TIME_TO_SALE'],
  implemented_claim_parsers: ['LIQUIDITY_OR_TIME_TO_SALE'],
  exposure_fields: {
    record_id: 'listing_id',
    exposure_start_at: 'listed_at',
    observation_end_at: 'observed_at',
    outcome_state: 'outcome_state',
    censoring_state: 'censoring_state',
    failed_sale_handling: 'failed_sale_handling',
    exposure_denominator_id: 'exposure_denominator_id',
  },
};

const comcProfile: GovernedMarketSurfaceProfile = {
  source_id: 'comc-marketplace',
  canonical_host: 'www.comc.com',
  allowed_hosts: ['www.comc.com', 'comc.com'],
  allowed_path_prefixes: ['/Cards', '/card', '/Items', '/items'],
  source_schema_version: 'comc-exposure-snapshot-v1',
  source_owner_candidate_id: 'comc',
  family: 'MARKETPLACE_EXPOSURE',
  registered_claims: ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE', 'LIQUIDITY_OR_TIME_TO_SALE'],
  implemented_claim_parsers: ['LIQUIDITY_OR_TIME_TO_SALE'],
  exposure_fields: {
    record_id: 'item_id',
    exposure_start_at: 'listed_at',
    observation_end_at: 'observed_at',
    outcome_state: 'outcome_state',
    censoring_state: 'censoring_state',
    failed_sale_handling: 'failed_sale_handling',
    exposure_denominator_id: 'exposure_denominator_id',
  },
};

const brickLinkProfile: GovernedMarketSurfaceProfile = {
  source_id: 'bricklink-catalog-api',
  canonical_host: 'www.bricklink.com',
  allowed_hosts: ['www.bricklink.com', 'bricklink.com'],
  allowed_path_prefixes: ['/v3/api.page', '/api/store/v1'],
  source_schema_version: 'bricklink-exposure-snapshot-v1',
  source_owner_candidate_id: 'bricklink',
  family: 'MARKETPLACE_EXPOSURE',
  registered_claims: ['LIQUIDITY_OR_TIME_TO_SALE'],
  implemented_claim_parsers: ['LIQUIDITY_OR_TIME_TO_SALE'],
  exposure_fields: {
    record_id: 'inventory_id',
    exposure_start_at: 'listed_at',
    observation_end_at: 'observed_at',
    outcome_state: 'outcome_state',
    censoring_state: 'censoring_state',
    failed_sale_handling: 'failed_sale_handling',
    exposure_denominator_id: 'exposure_denominator_id',
  },
};

const nikeSnkrsProfile: GovernedMarketSurfaceProfile = {
  source_id: 'nike-snkrs-launch-calendar',
  canonical_host: 'www.nike.com',
  allowed_hosts: ['www.nike.com', 'nike.com'],
  allowed_path_prefixes: ['/launch'],
  source_schema_version: 'nike-snkrs-release-context-snapshot-v1',
  source_owner_candidate_id: 'nike',
  family: 'RELEASE_OR_LISTING_CONTEXT',
  registered_claims: ['LIQUIDITY_OR_TIME_TO_SALE'],
  implemented_claim_parsers: [],
};

export async function classifyPriceChartingCurrentValueSnapshot(
  snapshot: GovernedMarketSurfaceSnapshot,
): Promise<GovernedMarketSurfaceResult> {
  return classifyContextOnlySurface(snapshot, priceChartingProfile);
}

export async function classifyReverbPriceGuideSnapshot(
  snapshot: GovernedMarketSurfaceSnapshot,
): Promise<GovernedMarketSurfaceResult> {
  return classifyContextOnlySurface(snapshot, reverbProfile);
}

export async function classifyHasbroPulseCollectionSnapshot(
  snapshot: GovernedMarketSurfaceSnapshot,
): Promise<GovernedMarketSurfaceResult> {
  return classifyContextOnlySurface(snapshot, hasbroPulseProfile);
}

export async function parseGoatExposureSnapshot(
  snapshot: GovernedMarketSurfaceSnapshot,
): Promise<GovernedMarketSurfaceResult> {
  return parseStrictExposureSurface(snapshot, goatProfile);
}

export async function parseComcExposureSnapshot(
  snapshot: GovernedMarketSurfaceSnapshot,
): Promise<GovernedMarketSurfaceResult> {
  return parseStrictExposureSurface(snapshot, comcProfile);
}

export async function parseBrickLinkExposureSnapshot(
  snapshot: GovernedMarketSurfaceSnapshot,
): Promise<GovernedMarketSurfaceResult> {
  return parseStrictExposureSurface(snapshot, brickLinkProfile);
}

export async function classifyNikeSnkrsLaunchSnapshot(
  snapshot: GovernedMarketSurfaceSnapshot,
): Promise<GovernedMarketSurfaceResult> {
  return classifyContextOnlySurface(snapshot, nikeSnkrsProfile);
}

export function getWave4SourceAdapterProfiles(): GovernedMarketSurfaceProfile[] {
  return [
    priceChartingProfile,
    reverbProfile,
    hasbroPulseProfile,
    goatProfile,
    comcProfile,
    brickLinkProfile,
    nikeSnkrsProfile,
  ].map(cloneGovernedMarketSurfaceProfile);
}
