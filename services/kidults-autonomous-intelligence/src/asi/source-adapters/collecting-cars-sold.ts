import {
  getPublicAuctionMarketAdapterProfile,
  parsePublicAuctionSoldSnapshot,
  type PublicAuctionImmutableSnapshot,
  type PublicAuctionSourceAdapterProfile,
} from './public-auction-results.js';

const profile: PublicAuctionSourceAdapterProfile = {
  source_id: 'collecting-cars-sold',
  canonical_host: 'collectingcars.com',
  allowed_hosts: ['collectingcars.com', 'www.collectingcars.com'],
  allowed_path_prefixes: ['/sold', '/cars', '/auctions', '/auction'],
  source_schema_version: 'collecting-cars-sold-snapshot-v1',
  source_owner_candidate_id: 'collecting-cars',
  source_record_prefix: 'collecting-cars',
  factual_origin_prefix: 'collecting-cars-auction-lot',
  target_claims: ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE', 'LIQUIDITY_OR_TIME_TO_SALE'],
  allowed_terminal_phrases: ['SOLD_FOR', 'SOLD_AT', 'SOLD_PRICE', 'SALE_PRICE'],
};

export const parseCollectingCarsSoldSnapshot = (snapshot: PublicAuctionImmutableSnapshot) =>
  parsePublicAuctionSoldSnapshot(profile, snapshot);

export const getCollectingCarsAdapterProfile = () => getPublicAuctionMarketAdapterProfile(profile);
