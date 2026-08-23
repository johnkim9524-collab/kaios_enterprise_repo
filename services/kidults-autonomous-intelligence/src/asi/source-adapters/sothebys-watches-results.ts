import {
  getPublicAuctionMarketAdapterProfile,
  parsePublicAuctionSoldSnapshot,
  type PublicAuctionImmutableSnapshot,
  type PublicAuctionSourceAdapterProfile,
} from './public-auction-results.js';

const profile: PublicAuctionSourceAdapterProfile = {
  source_id: 'sothebys-watches-results',
  canonical_host: 'www.sothebys.com',
  allowed_hosts: ['www.sothebys.com', 'sothebys.com'],
  allowed_path_prefixes: ['/en/departments/watches', '/en/buy/auction-results', '/en/buy/auction', '/en/auction', '/en/auctions', '/auction', '/lot'],
  source_schema_version: 'sothebys-watches-result-snapshot-v1',
  source_owner_candidate_id: 'sothebys',
  source_record_prefix: 'sothebys-watches',
  factual_origin_prefix: 'sothebys-watch-auction-lot',
  target_claims: ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE'],
  allowed_terminal_phrases: ['SOLD_FOR', 'SOLD_AT', 'SOLD_PRICE', 'SALE_PRICE'],
};

export const parseSothebysWatchesSoldSnapshot = (snapshot: PublicAuctionImmutableSnapshot) =>
  parsePublicAuctionSoldSnapshot(profile, snapshot);

export const getSothebysWatchesAdapterProfile = () => getPublicAuctionMarketAdapterProfile(profile);
