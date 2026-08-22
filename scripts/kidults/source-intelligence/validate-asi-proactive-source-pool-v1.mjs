#!/usr/bin/env node
import fs from 'node:fs';

const filePath = process.argv[2] || '/tmp/asi-proactive-source-pool-v1.json';
const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const fail = message => { throw new Error(message); };

if (value.id !== 'kidults-asi-proactive-source-pool-v1') fail('ID');
if (value.version !== '1.1.0') fail('VERSION');
if (value.status !== 'ROLLING_DISCOVERY_CANDIDATE_POOL') fail('STATUS');
if (value.lineage_policy !== 'CANONICAL_LOCATOR_STABLE_PROVIDER_SWITCHABLE') fail('LINEAGE_POLICY');
if (value.provider_switching_preserves_source_candidate_identity !== true) fail('PROVIDER_SWITCHING_BOUNDARY');
if (value.production !== 'HOLD' || value.public_release !== 'HOLD') fail('RELEASE_BOUNDARY');
if (value.acquisition_authorized !== false || value.rights_promoted_automatically !== false || value.admission_promoted_automatically !== false) fail('AUTOMATIC_PROMOTION_FORBIDDEN');
if (!Array.isArray(value.candidates) || !Array.isArray(value.rights_review_queue)) fail('ARRAYS');

const keys = new Set();
const locators = new Set();
for (const candidate of value.candidates) {
  if (keys.has(candidate.source_candidate_key)) fail(`DUPLICATE_KEY:${candidate.source_candidate_key}`);
  keys.add(candidate.source_candidate_key);
  if (locators.has(candidate.canonical_locator)) fail(`DUPLICATE_LOCATOR:${candidate.canonical_locator}`);
  locators.add(candidate.canonical_locator);
  for (const field of [
    'source_candidate_key', 'canonical_locator', 'source_name', 'first_seen_at', 'last_seen_at', 'observation_count',
    'discovery_providers', 'source_family_hints', 'candidate_source_roles', 'representative_product_ids',
    'demand_instance_ids', 'target_regions', 'target_languages', 'provider_record_ids', 'rights_state',
    'admission_state', 'source_pool_state', 'evidence_state', 'next_action'
  ]) {
    if (candidate[field] === undefined || candidate[field] === null) fail(`MISSING:${field}`);
  }
  if (!Array.isArray(candidate.discovery_providers) || candidate.discovery_providers.length < 1) fail(`PROVIDER_EMPTY:${candidate.source_candidate_key}`);
  if (new Set(candidate.discovery_providers).size !== candidate.discovery_providers.length) fail(`PROVIDER_DUPLICATE:${candidate.source_candidate_key}`);
  if (candidate.provider_switchable_identity !== true) fail(`PROVIDER_SWITCHING_DISABLED:${candidate.source_candidate_key}`);
  if (candidate.rights_state !== 'UNASSESSED' || candidate.admission_state !== 'NOT_ADMITTED' || candidate.source_pool_state !== 'CANDIDATE_ONLY' || candidate.evidence_state !== 'DISCOVERY_METADATA_ONLY') fail(`PROMOTION:${candidate.source_candidate_key}`);
  if (candidate.acquisition_authorized !== false || candidate.target_site_traversal_authorized !== false || candidate.market_claim_authorized !== false || candidate.public_projection !== false || candidate.production !== 'HOLD') fail(`BOUNDARY:${candidate.source_candidate_key}`);
  if (Number(candidate.observation_count) < 1) fail(`OBSERVATION_COUNT:${candidate.source_candidate_key}`);
}

if (Number(value.candidate_count) !== value.candidates.length) fail('COUNT');
if (value.rights_review_queue.length > 64) fail('RIGHTS_QUEUE_LIMIT');
for (const receipt of value.rights_review_queue) {
  if (receipt.rights_state !== 'UNASSESSED' || receipt.admission_state !== 'NOT_ADMITTED' || receipt.acquisition_authorized !== false) fail(`RIGHTS_PACKET_PROMOTION:${receipt.packet_id}`);
  if (!keys.has(receipt.source_candidate_key)) fail(`RIGHTS_PACKET_ORPHAN:${receipt.packet_id}`);
  if (!Array.isArray(receipt.discovery_providers) || receipt.discovery_providers.length < 1) fail(`RIGHTS_PACKET_PROVIDER_MISSING:${receipt.packet_id}`);
}

const providers = [...new Set(value.candidates.flatMap(candidate => candidate.discovery_providers))];
for (const provider of providers) {
  const actual = value.candidates.filter(candidate => candidate.discovery_providers.includes(provider)).length;
  if (Number(value.provider_counts?.[provider] || 0) !== actual) fail(`PROVIDER_COUNT:${provider}`);
}
for (const provider of Object.keys(value.provider_counts || {})) {
  if (!providers.includes(provider)) fail(`ORPHAN_PROVIDER_COUNT:${provider}`);
}

console.log(JSON.stringify({
  status: 'PASS',
  cycle_count: value.cycle_count,
  candidate_count: value.candidate_count,
  new_candidate_count: value.new_candidate_count,
  reobserved_candidate_count: value.reobserved_candidate_count,
  provider_count: providers.length,
  rights_review_packets: value.rights_review_queue.length,
  production: value.production
}));
