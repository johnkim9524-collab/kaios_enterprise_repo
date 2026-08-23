import {
  parsePublicAuctionSoldSnapshot,
  type PublicAuctionAdapterProfile,
  type PublicAuctionAdapterResult,
  type PublicAuctionImmutableSnapshot,
} from './public-auction-result-adapter.js';

export const registeredPublicAuctionAdapterProfiles = {
  'barrett-jackson-results': {
    source_id: 'barrett-jackson-results',
    canonical_host: 'www.barrett-jackson.com',
    allowed_hosts: ['barrett-jackson.com', 'www.barrett-jackson.com'],
    source_owner_candidate_id: 'barrett-jackson',
    source_schema_version: 'barrett-jackson-result-snapshot-unverified-v1',
    target_claims: ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE', 'LIQUIDITY_OR_TIME_TO_SALE'],
    verified_assignment_count: 18,
    implementation_family: 'PUBLIC_WEB_AUCTION_RESULTS',
  },
  'broad-arrow-results': {
    source_id: 'broad-arrow-results',
    canonical_host: 'www.broadarrowauctions.com',
    allowed_hosts: ['broadarrowauctions.com', 'www.broadarrowauctions.com'],
    source_owner_candidate_id: 'broad-arrow-auctions',
    source_schema_version: 'broad-arrow-result-snapshot-unverified-v1',
    target_claims: ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE', 'LIQUIDITY_OR_TIME_TO_SALE'],
    verified_assignment_count: 12,
    implementation_family: 'PUBLIC_WEB_AUCTION_RESULTS',
  },
  'collecting-cars-sold': {
    source_id: 'collecting-cars-sold',
    canonical_host: 'collectingcars.com',
    allowed_hosts: ['collectingcars.com', 'www.collectingcars.com'],
    source_owner_candidate_id: 'collecting-cars',
    source_schema_version: 'collecting-cars-sold-snapshot-unverified-v1',
    target_claims: ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE', 'LIQUIDITY_OR_TIME_TO_SALE'],
    verified_assignment_count: 6,
    implementation_family: 'PUBLIC_WEB_MARKETPLACE_RESULTS',
  },
  'iconic-auctioneers-results': {
    source_id: 'iconic-auctioneers-results',
    canonical_host: 'www.iconicauctioneers.com',
    allowed_hosts: ['iconicauctioneers.com', 'www.iconicauctioneers.com'],
    source_owner_candidate_id: 'iconic-auctioneers',
    source_schema_version: 'iconic-auctioneers-result-snapshot-unverified-v1',
    target_claims: ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE', 'LIQUIDITY_OR_TIME_TO_SALE'],
    verified_assignment_count: 6,
    implementation_family: 'PUBLIC_WEB_AUCTION_RESULTS',
  },
} as const satisfies Record<string, PublicAuctionAdapterProfile>;

export type RegisteredPublicAuctionSourceId = keyof typeof registeredPublicAuctionAdapterProfiles;

export function getRegisteredPublicAuctionAdapterProfile(
  sourceId: RegisteredPublicAuctionSourceId,
): PublicAuctionAdapterProfile {
  const profile = registeredPublicAuctionAdapterProfiles[sourceId];
  return {
    ...profile,
    allowed_hosts: [...profile.allowed_hosts],
    target_claims: [...profile.target_claims],
  };
}

export async function parseRegisteredPublicAuctionSoldSnapshot(
  sourceId: RegisteredPublicAuctionSourceId,
  snapshot: PublicAuctionImmutableSnapshot,
): Promise<PublicAuctionAdapterResult> {
  return parsePublicAuctionSoldSnapshot(getRegisteredPublicAuctionAdapterProfile(sourceId), snapshot);
}

export async function parseBarrettJacksonSoldSnapshot(
  snapshot: PublicAuctionImmutableSnapshot,
): Promise<PublicAuctionAdapterResult> {
  return parseRegisteredPublicAuctionSoldSnapshot('barrett-jackson-results', snapshot);
}

export async function parseBroadArrowSoldSnapshot(
  snapshot: PublicAuctionImmutableSnapshot,
): Promise<PublicAuctionAdapterResult> {
  return parseRegisteredPublicAuctionSoldSnapshot('broad-arrow-results', snapshot);
}

export async function parseCollectingCarsSoldSnapshot(
  snapshot: PublicAuctionImmutableSnapshot,
): Promise<PublicAuctionAdapterResult> {
  return parseRegisteredPublicAuctionSoldSnapshot('collecting-cars-sold', snapshot);
}

export async function parseIconicAuctioneersSoldSnapshot(
  snapshot: PublicAuctionImmutableSnapshot,
): Promise<PublicAuctionAdapterResult> {
  return parseRegisteredPublicAuctionSoldSnapshot('iconic-auctioneers-results', snapshot);
}
