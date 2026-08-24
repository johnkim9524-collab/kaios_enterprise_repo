import {
  getPublicAuctionMarketAdapterProfile,
  parsePublicAuctionSoldSnapshot,
  type PublicAuctionImmutableSnapshot,
  type PublicAuctionSourceAdapterProfile,
} from './public-auction-results.js';

const profile: PublicAuctionSourceAdapterProfile = {
  source_id: 'iconic-auctioneers-results',
  canonical_host: 'www.iconicauctioneers.com',
  allowed_hosts: ['www.iconicauctioneers.com', 'iconicauctioneers.com'],
  allowed_path_prefixes: ['/auction-results', '/auction', '/auctions', '/results'],
  source_schema_version: 'iconic-auctioneers-result-snapshot-v1',
  source_owner_candidate_id: 'iconic-auctioneers',
  source_record_prefix: 'iconic-auctioneers',
  factual_origin_prefix: 'iconic-auctioneers-auction-lot',
  target_claims: ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE', 'LIQUIDITY_OR_TIME_TO_SALE'],
  allowed_terminal_phrases: ['SOLD_FOR', 'SOLD_AT', 'SOLD_PRICE', 'SALE_PRICE'],
};

export const parseIconicAuctioneersSoldSnapshot = (snapshot: PublicAuctionImmutableSnapshot) =>
  parsePublicAuctionSoldSnapshot(profile, snapshot);

export const getIconicAuctioneersAdapterProfile = () => getPublicAuctionMarketAdapterProfile(profile);
