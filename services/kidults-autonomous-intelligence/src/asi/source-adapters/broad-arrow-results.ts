import {
  getPublicAuctionMarketAdapterProfile,
  parsePublicAuctionSoldSnapshot,
  type PublicAuctionImmutableSnapshot,
  type PublicAuctionSourceAdapterProfile,
} from './public-auction-results.js';

const profile: PublicAuctionSourceAdapterProfile = {
  source_id: 'broad-arrow-results',
  canonical_host: 'www.broadarrowauctions.com',
  allowed_hosts: ['www.broadarrowauctions.com', 'broadarrowauctions.com'],
  allowed_path_prefixes: ['/auction-results', '/auction', '/auctions', '/results'],
  source_schema_version: 'broad-arrow-result-snapshot-v1',
  source_owner_candidate_id: 'broad-arrow-auctions',
  source_record_prefix: 'broad-arrow',
  factual_origin_prefix: 'broad-arrow-auction-lot',
  target_claims: ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE', 'LIQUIDITY_OR_TIME_TO_SALE'],
  allowed_terminal_phrases: ['SOLD_FOR', 'SOLD_AT', 'SOLD_PRICE', 'SALE_PRICE'],
};

export const parseBroadArrowSoldSnapshot = (snapshot: PublicAuctionImmutableSnapshot) =>
  parsePublicAuctionSoldSnapshot(profile, snapshot);

export const getBroadArrowAdapterProfile = () => getPublicAuctionMarketAdapterProfile(profile);
