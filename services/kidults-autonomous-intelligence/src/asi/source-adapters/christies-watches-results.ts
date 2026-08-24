import {
  getPublicAuctionMarketAdapterProfile,
  parsePublicAuctionSoldSnapshot,
  type PublicAuctionImmutableSnapshot,
  type PublicAuctionSourceAdapterProfile,
} from './public-auction-results.js';

const profile: PublicAuctionSourceAdapterProfile = {
  source_id: 'christies-watches-results',
  canonical_host: 'www.christies.com',
  allowed_hosts: ['www.christies.com', 'christies.com'],
  allowed_path_prefixes: ['/en/departments/watches-and-wristwatches', '/en/auction-results', '/en/auction', '/en/auctions', '/en/lot', '/auction', '/lot'],
  source_schema_version: 'christies-watches-result-snapshot-v1',
  source_owner_candidate_id: 'christies',
  source_record_prefix: 'christies-watches',
  factual_origin_prefix: 'christies-watch-auction-lot',
  target_claims: ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE'],
  allowed_terminal_phrases: ['SOLD_FOR', 'SOLD_AT', 'SOLD_PRICE', 'SALE_PRICE'],
};

export const parseChristiesWatchesSoldSnapshot = (snapshot: PublicAuctionImmutableSnapshot) =>
  parsePublicAuctionSoldSnapshot(profile, snapshot);

export const getChristiesWatchesAdapterProfile = () => getPublicAuctionMarketAdapterProfile(profile);
