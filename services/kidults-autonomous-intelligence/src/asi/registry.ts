import type { AsiEventEnvelope } from './event';

export const ASI_FLEETS = [
  { id: 'DISCOVERY_COMMON_CRAWL_WDC', stage: 'DISCOVERY', binding: 'ASI_DISCOVERY_COMMON_CRAWL_WDC_QUEUE', queue: 'kidults-asi-shadow-discovery-common-crawl-wdc' },
  { id: 'DISCOVERY_OVERTURE_MAPS', stage: 'DISCOVERY', binding: 'ASI_DISCOVERY_OVERTURE_MAPS_QUEUE', queue: 'kidults-asi-shadow-discovery-overture-maps' },
  { id: 'DISCOVERY_WIKIDATA', stage: 'DISCOVERY', binding: 'ASI_DISCOVERY_WIKIDATA_QUEUE', queue: 'kidults-asi-shadow-discovery-wikidata' },
  { id: 'DISCOVERY_OPENSTREETMAP', stage: 'DISCOVERY', binding: 'ASI_DISCOVERY_OPENSTREETMAP_QUEUE', queue: 'kidults-asi-shadow-discovery-openstreetmap' },
  { id: 'DISCOVERY_GITHUB_HOMEPAGE', stage: 'DISCOVERY', binding: 'ASI_DISCOVERY_GITHUB_HOMEPAGE_QUEUE', queue: 'kidults-asi-shadow-discovery-github-homepage' },
  { id: 'DISCOVERY_DATACITE_OPEN_RESEARCH', stage: 'DISCOVERY', binding: 'ASI_DISCOVERY_DATACITE_OPEN_RESEARCH_QUEUE', queue: 'kidults-asi-shadow-discovery-datacite-open-research' },
  { id: 'DISCOVERY_GLOBAL_NEWS_EVENTS', stage: 'DISCOVERY', binding: 'ASI_DISCOVERY_GLOBAL_NEWS_EVENTS_QUEUE', queue: 'kidults-asi-shadow-discovery-global-news-events' },
  { id: 'DISCOVERY_GOVERNMENT_REGIONAL_CATALOGS', stage: 'DISCOVERY', binding: 'ASI_DISCOVERY_GOVERNMENT_REGIONAL_CATALOGS_QUEUE', queue: 'kidults-asi-shadow-discovery-government-regional-catalogs' },
  { id: 'DISCOVERY_ICANN_PUBLIC_ZONES', stage: 'DISCOVERY', binding: 'ASI_DISCOVERY_ICANN_PUBLIC_ZONES_QUEUE', queue: 'kidults-asi-shadow-discovery-icann-public-zones' },
  { id: 'DISCOVERY_INTERNET_ARCHIVE_CONTINUITY', stage: 'DISCOVERY', binding: 'ASI_DISCOVERY_INTERNET_ARCHIVE_CONTINUITY_QUEUE', queue: 'kidults-asi-shadow-discovery-internet-archive-continuity' },
  { id: 'DISCOVERY_APPROVED_DIRECTORY_OUTBOUND_FRONTIER', stage: 'DISCOVERY', binding: 'ASI_DISCOVERY_APPROVED_DIRECTORY_OUTBOUND_FRONTIER_QUEUE', queue: 'kidults-asi-shadow-discovery-directory-outbound-frontier' },
  { id: 'DISCOVERY_OPTIONAL_LICENSED_GAP_FILL', stage: 'DISCOVERY', binding: 'ASI_DISCOVERY_OPTIONAL_LICENSED_GAP_FILL_QUEUE', queue: 'kidults-asi-shadow-discovery-optional-licensed-gap-fill' },
  { id: 'SOURCE_SITE_IDENTITY_OWNER_LINEAGE', stage: 'CLASSIFICATION', binding: 'ASI_SOURCE_SITE_IDENTITY_OWNER_LINEAGE_QUEUE', queue: 'kidults-asi-shadow-source-site-identity-owner-lineage' },
  { id: 'SOURCE_SCOPE_ROLE_CLASSIFICATION', stage: 'CLASSIFICATION', binding: 'ASI_SOURCE_SCOPE_ROLE_CLASSIFICATION_QUEUE', queue: 'kidults-asi-shadow-source-scope-role-classification' },
  { id: 'SOURCE_REGION_LANGUAGE_CLASSIFICATION', stage: 'CLASSIFICATION', binding: 'ASI_SOURCE_REGION_LANGUAGE_CLASSIFICATION_QUEUE', queue: 'kidults-asi-shadow-source-region-language-classification' },
  { id: 'SOURCE_MARKET_SEMANTICS_CLASSIFICATION', stage: 'CLASSIFICATION', binding: 'ASI_SOURCE_MARKET_SEMANTICS_CLASSIFICATION_QUEUE', queue: 'kidults-asi-shadow-source-market-semantics-classification' },
  { id: 'SOURCE_UTILITY_VALUE_ANALYSIS', stage: 'QUALIFICATION', binding: 'ASI_SOURCE_UTILITY_VALUE_ANALYSIS_QUEUE', queue: 'kidults-asi-shadow-source-utility-value-analysis' },
  { id: 'SOURCE_RIGHTS_COMPLIANCE_ANALYSIS', stage: 'QUALIFICATION', binding: 'ASI_SOURCE_RIGHTS_COMPLIANCE_ANALYSIS_QUEUE', queue: 'kidults-asi-shadow-source-rights-compliance-analysis' },
  { id: 'SOURCE_TECHNICAL_ACCESS_SCHEMA_ANALYSIS', stage: 'QUALIFICATION', binding: 'ASI_SOURCE_TECHNICAL_ACCESS_SCHEMA_ANALYSIS_QUEUE', queue: 'kidults-asi-shadow-source-technical-access-schema-analysis' },
  { id: 'SOURCE_COVERAGE_BIAS_ANALYSIS', stage: 'QUALIFICATION', binding: 'ASI_SOURCE_COVERAGE_BIAS_ANALYSIS_QUEUE', queue: 'kidults-asi-shadow-source-coverage-bias-analysis' },
  { id: 'SOURCE_INDEPENDENCE_REDUNDANCY_ANALYSIS', stage: 'QUALIFICATION', binding: 'ASI_SOURCE_INDEPENDENCE_REDUNDANCY_ANALYSIS_QUEUE', queue: 'kidults-asi-shadow-source-independence-redundancy-analysis' },
  { id: 'SOURCE_FRESHNESS_STABILITY_ANALYSIS', stage: 'QUALIFICATION', binding: 'ASI_SOURCE_FRESHNESS_STABILITY_ANALYSIS_QUEUE', queue: 'kidults-asi-shadow-source-freshness-stability-analysis' },
  { id: 'SOURCE_COST_ROI_ANALYSIS', stage: 'QUALIFICATION', binding: 'ASI_SOURCE_COST_ROI_ANALYSIS_QUEUE', queue: 'kidults-asi-shadow-source-cost-roi-analysis' },
  { id: 'ACQUISITION_PLANNER', stage: 'DECISION', binding: 'ASI_ACQUISITION_PLANNER_QUEUE', queue: 'kidults-asi-shadow-acquisition-planner' },
  { id: 'SOURCE_POOL_EVOLUTION', stage: 'DECISION', binding: 'ASI_SOURCE_POOL_EVOLUTION_QUEUE', queue: 'kidults-asi-shadow-source-pool-evolution' },
] as const;

export type AsiFleet = typeof ASI_FLEETS[number];
export type AsiFleetId = AsiFleet['id'];
export type AsiQueueBinding = AsiFleet['binding'];
export type AsiFleetStage = AsiFleet['stage'];

export const ASI_FLEET_BY_ID = new Map<AsiFleetId, AsiFleet>(ASI_FLEETS.map((fleet) => [fleet.id, fleet]));
export const ASI_FLEET_BY_QUEUE = new Map<string, AsiFleet>(ASI_FLEETS.map((fleet) => [fleet.queue, fleet]));

const fleetIdsByStage = (stage: AsiFleetStage): AsiFleetId[] =>
  ASI_FLEETS.filter((fleet) => fleet.stage === stage).map((fleet) => fleet.id);

export const ASI_DISCOVERY_FLEETS = fleetIdsByStage('DISCOVERY');
export const ASI_CLASSIFICATION_FLEETS = fleetIdsByStage('CLASSIFICATION');
export const ASI_QUALIFICATION_FLEETS = fleetIdsByStage('QUALIFICATION');
export const ASI_DECISION_FLEETS = fleetIdsByStage('DECISION');

export function targetFleetsFor(event: AsiEventEnvelope): AsiFleetId[] {
  const explicit = event.payload.target_fleet;
  if (explicit !== undefined) throw new Error('ASI_EXPLICIT_TARGET_ROUTING_FORBIDDEN_USE_CANONICAL_STAGE_TRANSITION');
  if (event.event_type === 'SOURCE_DISCOVERED') return ASI_CLASSIFICATION_FLEETS;
  if (event.event_type === 'SOURCE_IDENTIFIED' || event.event_type === 'SOURCE_CLASSIFICATION_ASSERTED') return [];
  if (event.event_type === 'SOURCE_QUALIFICATION_ASSERTED') return [];
  return [];
}
