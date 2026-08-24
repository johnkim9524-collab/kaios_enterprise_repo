import {
  getPublicAuctionMarketAdapterProfile,
  parsePublicAuctionSoldSnapshot,
  type PublicAuctionImmutableSnapshot,
  type PublicAuctionSourceAdapterProfile,
} from './public-auction-results.js';

const profile: PublicAuctionSourceAdapterProfile = {
  source_id: 'barrett-jackson-results',
  canonical_host: 'www.barrett-jackson.com',
  allowed_hosts: ['www.barrett-jackson.com', 'barrett-jackson.com'],
  allowed_path_prefixes: ['/archive/event/results', '/archive/event', '/auction-results', '/auctions', '/events'],
  source_schema_version: 'barrett-jackson-result-snapshot-v1',
  source_owner_candidate_id: 'barrett-jackson',
  source_record_prefix: 'barrett-jackson',
  factual_origin_prefix: 'barrett-jackson-auction-lot',
  target_claims: ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE', 'LIQUIDITY_OR_TIME_TO_SALE'],
  allowed_terminal_phrases: ['SOLD_FOR', 'SOLD_PRICE', 'SALE_PRICE'],
};

export const parseBarrettJacksonSoldSnapshot = (snapshot: PublicAuctionImmutableSnapshot) =>
  parsePublicAuctionSoldSnapshot(profile, snapshot);

export const getBarrettJacksonAdapterProfile = () => getPublicAuctionMarketAdapterProfile(profile);
