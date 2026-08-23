import {
  getPublicAuctionMarketAdapterProfile,
  parsePublicAuctionSoldSnapshot,
  type PublicAuctionImmutableSnapshot,
  type PublicAuctionSourceAdapterProfile,
} from './public-auction-results.js';

const profile: PublicAuctionSourceAdapterProfile = {
  source_id: 'bonhams-watches-results',
  canonical_host: 'www.bonhams.com',
  allowed_hosts: ['www.bonhams.com', 'bonhams.com'],
  allowed_path_prefixes: ['/department/wat', '/auction-results', '/auction', '/auctions', '/lot', '/lots'],
  source_schema_version: 'bonhams-watches-result-snapshot-v1',
  source_owner_candidate_id: 'bonhams',
  source_record_prefix: 'bonhams-watches',
  factual_origin_prefix: 'bonhams-watch-auction-lot',
  target_claims: ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE'],
  allowed_terminal_phrases: ['SOLD_FOR', 'SOLD_AT', 'SOLD_PRICE', 'SALE_PRICE'],
};

export const parseBonhamsWatchesSoldSnapshot = (snapshot: PublicAuctionImmutableSnapshot) =>
  parsePublicAuctionSoldSnapshot(profile, snapshot);

export const getBonhamsWatchesAdapterProfile = () => getPublicAuctionMarketAdapterProfile(profile);
