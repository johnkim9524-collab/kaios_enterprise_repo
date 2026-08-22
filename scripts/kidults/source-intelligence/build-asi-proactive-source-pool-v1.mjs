#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const discoveryPath = process.argv[2] || 'discovery-out/bounded-live-discovery.json';
const previousPath = process.argv[3] || '';
const outPath = process.argv[4] || '/tmp/asi-proactive-source-pool-v1.json';
const contract = JSON.parse(fs.readFileSync('coordination/kidults/source-intelligence/asi-proactive-source-pool-accumulator-v1.json', 'utf8'));
const discovery = JSON.parse(fs.readFileSync(discoveryPath, 'utf8'));
let previous = null;
if (previousPath && fs.existsSync(previousPath)) previous = JSON.parse(fs.readFileSync(previousPath, 'utf8'));

const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const normalizeUrl = value => {
  try {
    const url = new URL(value);
    url.hash = '';
    url.searchParams.sort();
    return url.toString().replace(/\/$/, '');
  } catch {
    return String(value || '').trim();
  }
};
const array = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values.filter(value => value !== undefined && value !== null && value !== ''))].sort();
const now = new Date().toISOString();

const byKey = new Map();
const keyByLocator = new Map();
for (const candidate of array(previous?.candidates)) {
  const locator = normalizeUrl(candidate.canonical_locator);
  const restored = {
    ...candidate,
    canonical_locator: locator,
    discovery_providers: array(candidate.discovery_providers),
    source_family_hints: array(candidate.source_family_hints),
    candidate_source_roles: array(candidate.candidate_source_roles),
    representative_product_ids: array(candidate.representative_product_ids),
    demand_instance_ids: array(candidate.demand_instance_ids),
    target_regions: array(candidate.target_regions),
    target_languages: array(candidate.target_languages),
    provider_record_ids: array(candidate.provider_record_ids)
  };
  byKey.set(candidate.source_candidate_key, restored);
  if (locator && !keyByLocator.has(locator)) keyByLocator.set(locator, candidate.source_candidate_key);
}

let newCount = 0;
let reobserved = 0;
const currentBatchKeys = new Set();
for (const candidate of array(discovery.candidates)) {
  const locator = normalizeUrl(candidate.endpoint_url || candidate.source_locator || candidate.provider_record_id);
  const existingKey = keyByLocator.get(locator);
  const canonicalKey = `src-cand:${sha(candidate.underlying_work_key || locator).slice(0, 24)}`;
  const key = existingKey || canonicalKey;
  const prior = byKey.get(key);
  const discoveryProviders = unique([
    ...(prior?.discovery_providers || []),
    ...array(candidate.discovery_providers),
    candidate.discovery_provider
  ]);
  const providerRecordIds = unique([
    ...(prior?.provider_record_ids || []),
    ...array(candidate.provider_record_ids),
    candidate.provider_record_id
  ]);
  const sourceFamilyHints = unique([
    ...(prior?.source_family_hints || []),
    ...array(candidate.source_family_hints),
    candidate.source_family_hint
  ]);

  const next = {
    source_candidate_key: key,
    canonical_locator: locator,
    source_name: candidate.source_name || candidate.owner || prior?.source_name || locator,
    first_seen_at: prior?.first_seen_at || candidate.observed_at || now,
    last_seen_at: candidate.observed_at || now,
    observation_count: Number(prior?.observation_count || 0) + 1,
    discovery_providers: discoveryProviders,
    source_family_hints: sourceFamilyHints,
    candidate_source_roles: unique([...(prior?.candidate_source_roles || []), ...array(candidate.candidate_source_roles)]),
    representative_product_ids: unique([...(prior?.representative_product_ids || []), candidate.representative_product_id]),
    demand_instance_ids: unique([...(prior?.demand_instance_ids || []), ...array(candidate.demand_instance_ids)]),
    target_regions: unique([...(prior?.target_regions || []), ...array(candidate.target_regions)]),
    target_languages: unique([...(prior?.target_languages || []), ...array(candidate.target_languages)]),
    provider_record_ids: providerRecordIds,
    provider_switchable_identity: true,
    rights_state: 'UNASSESSED',
    admission_state: 'NOT_ADMITTED',
    source_pool_state: 'CANDIDATE_ONLY',
    evidence_state: 'DISCOVERY_METADATA_ONLY',
    candidate_state: 'RIGHTS_ROBOTS_ACCESS_PREFLIGHT_PENDING',
    acquisition_authorized: false,
    target_site_traversal_authorized: false,
    market_claim_authorized: false,
    public_projection: false,
    production: 'HOLD',
    next_action: 'PURPOSE_SPECIFIC_RIGHTS_ROBOTS_ACCESS_PREFLIGHT'
  };
  byKey.set(key, next);
  keyByLocator.set(locator, key);
  currentBatchKeys.add(key);
  if (prior) reobserved++; else newCount++;
}

const candidates = [...byKey.values()].sort((a, b) =>
  b.demand_instance_ids.length - a.demand_instance_ids.length ||
  b.candidate_source_roles.length - a.candidate_source_roles.length ||
  a.source_candidate_key.localeCompare(b.source_candidate_key)
);
const review = [...candidates]
  .filter(candidate => candidate.rights_state === 'UNASSESSED')
  .sort((a, b) =>
    Number(currentBatchKeys.has(b.source_candidate_key)) - Number(currentBatchKeys.has(a.source_candidate_key)) ||
    b.demand_instance_ids.length - a.demand_instance_ids.length ||
    b.candidate_source_roles.length - a.candidate_source_roles.length ||
    b.target_regions.length - a.target_regions.length ||
    b.observation_count - a.observation_count
  )
  .slice(0, contract.rights_review_queue.max_packets_per_cycle)
  .map((candidate, index) => ({
    packet_id: `rights-review:${candidate.source_candidate_key}:${index + 1}`,
    source_candidate_key: candidate.source_candidate_key,
    canonical_locator: candidate.canonical_locator,
    source_name: candidate.source_name,
    discovery_providers: candidate.discovery_providers,
    candidate_source_roles: candidate.candidate_source_roles,
    target_regions: candidate.target_regions,
    target_languages: candidate.target_languages,
    demand_instance_ids: candidate.demand_instance_ids,
    purpose: 'PURPOSE_SPECIFIC_RIGHTS_ROBOTS_ACCESS_PREFLIGHT_ONLY',
    rights_state: 'UNASSESSED',
    admission_state: 'NOT_ADMITTED',
    acquisition_authorized: false,
    next_action: 'REVIEW_RIGHTS_TERMS_ROBOTS_AND_PURPOSE_BOUNDARY'
  }));

const cycleCount = Number(previous?.cycle_count || 0) + 1;
const providerNames = unique(candidates.flatMap(candidate => candidate.discovery_providers));
const artifact = {
  id: 'kidults-asi-proactive-source-pool-v1',
  version: '1.1.0',
  status: 'ROLLING_DISCOVERY_CANDIDATE_POOL',
  cycle_count: cycleCount,
  rotation_cycle_index: (cycleCount - 1) % contract.discovery.rotation_cycle_count,
  updated_at: now,
  previous_candidate_count: Number(previous?.candidate_count || 0),
  discovery_batch_candidate_count: Number(discovery.candidate_count || 0),
  new_candidate_count: newCount,
  reobserved_candidate_count: reobserved,
  candidate_count: candidates.length,
  covered_representative_products: unique(candidates.flatMap(candidate => candidate.representative_product_ids)).length,
  covered_regions: unique(candidates.flatMap(candidate => candidate.target_regions)),
  provider_counts: Object.fromEntries(providerNames.map(provider => [provider, candidates.filter(candidate => candidate.discovery_providers.includes(provider)).length])),
  lineage_policy: 'CANONICAL_LOCATOR_STABLE_PROVIDER_SWITCHABLE',
  provider_switching_preserves_source_candidate_identity: true,
  rights_review_queue: review,
  candidates,
  content_acquired: false,
  rights_promoted_automatically: false,
  admission_promoted_automatically: false,
  acquisition_authorized: false,
  public_release: 'HOLD',
  production: 'HOLD',
  truth_boundary: contract.truth_boundary
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({
  status: artifact.status,
  cycle_count: cycleCount,
  rotation_cycle_index: artifact.rotation_cycle_index,
  previous_candidate_count: artifact.previous_candidate_count,
  batch_candidates: artifact.discovery_batch_candidate_count,
  new_candidates: newCount,
  reobserved_candidates: reobserved,
  candidate_count: artifact.candidate_count,
  provider_count: providerNames.length,
  covered_products: artifact.covered_representative_products,
  rights_review_packets: review.length,
  production: 'HOLD'
}));
