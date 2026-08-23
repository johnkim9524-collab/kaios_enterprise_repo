#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [
  outputDir = '/tmp/kidults-asi-p0b-bounded-discovery-candidates-v1',
  contractPath = 'coordination/kidults/source-intelligence/asi-p0b-bounded-discovery-candidate-contract-v1.json'
] = process.argv.slice(2);

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const readText = (name) => fs.readFileSync(path.join(outputDir, name), 'utf8');
const readJson = (name) => JSON.parse(readText(name));
const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
};
const stableJson = (value) => `${JSON.stringify(stableValue(value), null, 2)}\n`;
const sha256Ref = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const unique = (values) => new Set(values).size === values.length;
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const requiredOutputs = [
  'p0b-source-candidate-registry-v1.json',
  'p0b-mission-candidate-binding-ledger-v1.json',
  'p0b-candidate-gap-register-v1.json',
  'p0b-provider-host-diversity-v1.json',
  'p0b-bounded-discovery-manifest-v1.json'
];

assert(contract.id === 'kidults-asi-p0b-bounded-discovery-candidate-contract-v1', 'CONTRACT_ID');
assert(contract.version === '1.0.0', 'CONTRACT_VERSION');
assert(contract.status === 'ACTIVE_MANDATORY_FAIL_CLOSED_AFTER_MAIN_MERGE', 'CONTRACT_STATUS');
assert(JSON.stringify(contract.platform_principles) === JSON.stringify(principles), 'CONTRACT_PRINCIPLE_ORDER');
assert(contract.scope_rotation_count === 4, 'CONTRACT_ROTATION_COUNT');
assert(contract.bounded_live_lanes?.length === 2, 'CONTRACT_LIVE_LANE_COUNT');
assert(contract.mission_binding?.scope_exact_match_required === true, 'CONTRACT_SCOPE_MATCH');
assert(contract.mission_binding?.region_exact_match_preferred === true, 'CONTRACT_REGION_PREFERENCE');
assert(contract.mission_binding?.region_unknown_counts_as_regional_coverage === false, 'CONTRACT_REGION_UNKNOWN_BOUNDARY');
assert(contract.mission_binding?.maximum_candidates_per_mission === 3, 'CONTRACT_CANDIDATE_LIMIT');
assert(contract.mission_binding?.different_host_is_factual_origin_independence === false, 'CONTRACT_HOST_ORIGIN_BOUNDARY');
assert(contract.mission_binding?.candidate_can_prove_factual_origin_replacement_slot === false, 'CONTRACT_ORIGIN_SLOT_BOUNDARY');
assert(contract.truth_boundary?.executes_bounded_public_metadata_network_discovery === true, 'CONTRACT_LIVE_EXECUTION');
assert(contract.truth_boundary?.observes_source_candidates === true, 'CONTRACT_CANDIDATE_OBSERVATION');
assert(contract.truth_boundary?.crawls_target_site_bodies === false, 'CONTRACT_BODY_CRAWL_BOUNDARY');
assert(contract.truth_boundary?.acquires_target_content === false, 'CONTRACT_CONTENT_BOUNDARY');
assert(contract.truth_boundary?.creates_collection_right === false, 'CONTRACT_RIGHTS_BOUNDARY');
assert(contract.truth_boundary?.admits_evidence === false, 'CONTRACT_ADMISSION_BOUNDARY');
assert(contract.truth_boundary?.proves_factual_origin_independence === false, 'CONTRACT_ORIGIN_BOUNDARY');
assert(contract.truth_boundary?.creates_market_claim === false, 'CONTRACT_CLAIM_BOUNDARY');

for (const name of requiredOutputs) {
  assert(fs.existsSync(path.join(outputDir, name)), `MISSING_OUTPUT:${name}`);
  JSON.parse(readText(name));
}

const candidates = readJson('p0b-source-candidate-registry-v1.json');
const bindings = readJson('p0b-mission-candidate-binding-ledger-v1.json');
const gaps = readJson('p0b-candidate-gap-register-v1.json');
const diversity = readJson('p0b-provider-host-diversity-v1.json');
const manifest = readJson('p0b-bounded-discovery-manifest-v1.json');

assert(candidates.id === 'kidults-asi-p0b-source-candidate-registry-v1', 'CANDIDATE_REGISTRY_ID');
assert(candidates.state === 'EMPIRICAL_PUBLIC_METADATA_SOURCE_CANDIDATES_OBSERVED', 'CANDIDATE_REGISTRY_STATE');
assert(Number(candidates.raw_candidate_observations) > 0, 'CANDIDATE_RAW_COUNT');
assert(Number(candidates.canonical_candidate_count) > 0 && candidates.candidates?.length === candidates.canonical_candidate_count, 'CANDIDATE_CANONICAL_COUNT');
assert(Number(candidates.unique_host_count) > 0, 'CANDIDATE_HOST_COUNT');
assert(unique(candidates.candidates.map((candidate) => candidate.candidate_id)), 'CANDIDATE_ID_DUPLICATE');
assert(unique(candidates.candidates.map((candidate) => candidate.canonical_endpoint)), 'CANDIDATE_ENDPOINT_DUPLICATE');
const candidateById = new Map(candidates.candidates.map((candidate) => [candidate.candidate_id, candidate]));
const candidateHosts = new Set();
for (const candidate of candidates.candidates) {
  assert(['OBSERVED_PUBLIC_METADATA_DISCOVERY_CANDIDATE', 'UNBOUND_SCOPE_HINT'].includes(candidate.state), `CANDIDATE_STATE:${candidate.candidate_id}`);
  let url;
  try { url = new URL(candidate.canonical_endpoint); } catch { fail(`CANDIDATE_URL:${candidate.candidate_id}`); }
  assert(['http:', 'https:'].includes(url.protocol), `CANDIDATE_PROTOCOL:${candidate.candidate_id}`);
  assert(candidate.canonical_host === url.hostname, `CANDIDATE_HOST:${candidate.candidate_id}`);
  candidateHosts.add(candidate.canonical_host);
  assert(/^sha256:[a-f0-9]{64}$/.test(candidate.canonical_host_hash), `CANDIDATE_HOST_HASH:${candidate.candidate_id}`);
  assert(Number(candidate.observation_count) >= 1, `CANDIDATE_OBSERVATIONS:${candidate.candidate_id}`);
  assert(Array.isArray(candidate.discovery_providers) && candidate.discovery_providers.length >= 1, `CANDIDATE_PROVIDERS:${candidate.candidate_id}`);
  assert(Array.isArray(candidate.discovery_channels) && candidate.discovery_channels.length >= 1, `CANDIDATE_CHANNELS:${candidate.candidate_id}`);
  assert(Array.isArray(candidate.scope_hints), `CANDIDATE_SCOPE_HINTS:${candidate.candidate_id}`);
  assert(Array.isArray(candidate.region_hints) && candidate.region_hints.length >= 1, `CANDIDATE_REGION_HINTS:${candidate.candidate_id}`);
  assert(candidate.rights_state_for_target_collection === 'UNASSESSED', `CANDIDATE_TARGET_RIGHTS:${candidate.candidate_id}`);
  assert(candidate.admission_state === 'NOT_ADMITTED' && candidate.evidence_state === 'DISCOVERY_METADATA_ONLY', `CANDIDATE_ADMISSION_EVIDENCE:${candidate.candidate_id}`);
  assert(candidate.target_site_body_crawled === false && candidate.target_content_acquired === false, `CANDIDATE_CONTENT_BOUNDARY:${candidate.candidate_id}`);
  assert(candidate.collection_authorized === false && candidate.evidence_admitted === false && candidate.market_claim_authorized === false, `CANDIDATE_PERMISSION:${candidate.candidate_id}`);
  assert(candidate.factual_origin_id === null && candidate.factual_origin_independence_proven === false, `CANDIDATE_ORIGIN_OVERCLAIM:${candidate.candidate_id}`);
  assert(candidate.public_release === 'HOLD' && candidate.production === 'HOLD', `CANDIDATE_RELEASE_BOUNDARY:${candidate.candidate_id}`);
}
assert(candidateHosts.size === candidates.unique_host_count, 'CANDIDATE_UNIQUE_HOST_MISMATCH');
assert(candidates.target_site_bodies_crawled === 0 && candidates.target_content_records_acquired === 0, 'CANDIDATE_AGGREGATE_CONTENT_BOUNDARY');
assert(candidates.collection_authorized_count === 0 && candidates.evidence_admitted_count === 0 && candidates.market_claim_authorized_count === 0, 'CANDIDATE_AGGREGATE_PERMISSION');
assert(candidates.quarantined?.length === candidates.invalid_endpoint_quarantine_count, 'CANDIDATE_QUARANTINE_COUNT');

assert(bindings.id === 'kidults-asi-p0b-mission-candidate-binding-ledger-v1', 'BINDING_LEDGER_ID');
assert(bindings.state === 'MISSION_CANDIDATE_BINDING_COMPLETE_WITH_EXPLICIT_GAPS', 'BINDING_LEDGER_STATE');
assert(bindings.mission_count === 192 && bindings.bindings?.length === 192, 'BINDING_MISSION_COUNT');
assert(unique(bindings.bindings.map((binding) => binding.binding_id)), 'BINDING_ID_DUPLICATE');
assert(unique(bindings.bindings.map((binding) => binding.mission_id)), 'BINDING_MISSION_DUPLICATE');
let missionsWithCandidate = 0;
let missionsWithTwo = 0;
let missionsWithThree = 0;
let missionsWithExactRegion = 0;
for (const binding of bindings.bindings) {
  assert(binding.slot_bindings?.length === 3, `BINDING_SLOT_COUNT:${binding.mission_id}`);
  assert(unique(binding.slot_bindings.map((slot) => slot.lane_slot)), `BINDING_SLOT_DUPLICATE:${binding.mission_id}`);
  assert(Number(binding.candidates_assigned) >= 0 && Number(binding.candidates_assigned) <= 3, `BINDING_CANDIDATE_COUNT:${binding.mission_id}`);
  assert(binding.distinct_hosts_assigned <= binding.candidates_assigned, `BINDING_HOST_COUNT:${binding.mission_id}`);
  assert(binding.regional_coverage_proven === false && binding.factual_origin_independence_proven === false, `BINDING_COVERAGE_OR_ORIGIN_OVERCLAIM:${binding.mission_id}`);
  assert(binding.collection_authorized === false && binding.evidence_admitted === false && binding.market_claim_authorized === false, `BINDING_PERMISSION:${binding.mission_id}`);
  assert(binding.public_release === 'HOLD' && binding.production === 'HOLD', `BINDING_RELEASE_BOUNDARY:${binding.mission_id}`);
  const assignedSlots = binding.slot_bindings.filter((slot) => slot.candidate_id !== null);
  assert(assignedSlots.length === binding.candidates_assigned, `BINDING_ASSIGNED_SLOT_COUNT:${binding.mission_id}`);
  for (const slot of binding.slot_bindings) {
    assert(slot.regional_coverage_proven === false && slot.factual_origin_independence_proven === false, `BINDING_SLOT_OVERCLAIM:${binding.mission_id}:${slot.lane_slot}`);
    assert(slot.rights_state_for_target_collection === 'UNASSESSED', `BINDING_SLOT_RIGHTS:${binding.mission_id}:${slot.lane_slot}`);
    assert(slot.collection_authorized === false && slot.evidence_admitted === false && slot.market_claim_authorized === false, `BINDING_SLOT_PERMISSION:${binding.mission_id}:${slot.lane_slot}`);
    if (slot.candidate_id !== null) {
      const candidate = candidateById.get(slot.candidate_id);
      assert(candidate, `BINDING_UNKNOWN_CANDIDATE:${binding.mission_id}:${slot.candidate_id}`);
      assert(candidate.scope_hints.includes(binding.scope_id), `BINDING_SCOPE_NOT_EXACT:${binding.mission_id}:${slot.candidate_id}`);
      assert(slot.canonical_endpoint === candidate.canonical_endpoint && slot.canonical_host === candidate.canonical_host, `BINDING_CANDIDATE_FIELDS:${binding.mission_id}:${slot.candidate_id}`);
      if (slot.region_match_state === 'REGION_HINT_EXACT') assert(candidate.region_hints.includes(binding.region), `BINDING_REGION_NOT_EXACT:${binding.mission_id}:${slot.candidate_id}`);
      if (slot.lane_slot === 'FACTUAL_ORIGIN_REPLACEMENT_LANE') {
        assert(slot.assignment_state === 'CANDIDATE_ASSIGNED_ORIGIN_INDEPENDENCE_UNVERIFIED', `BINDING_ORIGIN_SLOT_STATE:${binding.mission_id}`);
      }
    } else {
      assert(slot.assignment_state === 'UNFILLED_NO_SCOPE_EXACT_CANDIDATE', `BINDING_UNFILLED_STATE:${binding.mission_id}:${slot.lane_slot}`);
    }
  }
  if (binding.candidates_assigned >= 1) missionsWithCandidate += 1;
  if (binding.candidates_assigned >= 2) missionsWithTwo += 1;
  if (binding.candidates_assigned >= 3) missionsWithThree += 1;
  if (binding.exact_region_hint_candidates_assigned >= 1) missionsWithExactRegion += 1;
}
assert(bindings.missions_with_at_least_one_candidate === missionsWithCandidate, 'BINDING_AGGREGATE_ONE');
assert(bindings.missions_with_primary_and_fallback_candidates === missionsWithTwo, 'BINDING_AGGREGATE_TWO');
assert(bindings.missions_with_three_candidate_hosts === missionsWithThree, 'BINDING_AGGREGATE_THREE');
assert(bindings.missions_with_exact_region_hint_candidate === missionsWithExactRegion, 'BINDING_AGGREGATE_REGION');
assert(bindings.missions_with_regional_coverage_proven === 0 && bindings.missions_with_factual_origin_independence_proven === 0, 'BINDING_AGGREGATE_OVERCLAIM');
assert(missionsWithCandidate > 0, 'BINDING_NO_MISSION_CANDIDATE_INCREMENT');

assert(gaps.id === 'kidults-asi-p0b-candidate-gap-register-v1', 'GAP_REGISTER_ID');
assert(gaps.state === 'ACTIVE_POST_DISCOVERY_CANDIDATE_GAPS', 'GAP_REGISTER_STATE');
assert(gaps.mission_count === 192 && gaps.records?.length === 192, 'GAP_MISSION_COUNT');
assert(gaps.no_candidate_missions + gaps.one_candidate_missions + gaps.two_candidate_missions + gaps.three_candidate_missions === 192, 'GAP_DISTRIBUTION_COUNT');
assert(gaps.no_candidate_missions === 192 - missionsWithCandidate, 'GAP_NO_CANDIDATE_COUNT');
assert(gaps.one_candidate_missions === bindings.bindings.filter((binding) => binding.candidates_assigned === 1).length, 'GAP_ONE_COUNT');
assert(gaps.two_candidate_missions === bindings.bindings.filter((binding) => binding.candidates_assigned === 2).length, 'GAP_TWO_COUNT');
assert(gaps.three_candidate_missions === missionsWithThree, 'GAP_THREE_COUNT');
assert(gaps.factual_origin_independence_unresolved_missions === 192 && gaps.regional_coverage_unproven_missions === 192, 'GAP_ORIGIN_REGION_BOUNDARY');
for (const record of gaps.records) {
  assert(record.factual_origin_independence_proven === false && record.regional_coverage_proven === false, `GAP_RECORD_OVERCLAIM:${record.mission_id}`);
  assert(record.rights_for_target_collection_assessed === false && record.evidence_admitted === false, `GAP_RECORD_PERMISSION:${record.mission_id}`);
  assert(Array.isArray(record.next_required_actions) && record.next_required_actions.includes('GATE1_SOURCE_SAFETY'), `GAP_RECORD_NEXT_ACTION:${record.mission_id}`);
}

assert(diversity.id === 'kidults-asi-p0b-provider-host-diversity-v1', 'DIVERSITY_ID');
assert(diversity.state === 'DISCOVERY_DIVERSITY_OBSERVED_FACTUAL_ORIGIN_DIVERSITY_UNPROVEN', 'DIVERSITY_STATE');
assert(diversity.canonical_candidate_count === candidates.canonical_candidate_count, 'DIVERSITY_CANDIDATE_COUNT');
assert(diversity.unique_host_count === candidates.unique_host_count, 'DIVERSITY_HOST_COUNT');
assert(Number(diversity.discovery_provider_count) >= 1 && diversity.provider_summary?.length === diversity.discovery_provider_count, 'DIVERSITY_PROVIDER_COUNT');
assert(Number(diversity.successful_live_discovery_lane_observations) >= 1, 'DIVERSITY_LIVE_LANE_COUNT');
assert(Array.isArray(diversity.live_lane_health) && diversity.live_lane_health.length >= diversity.successful_live_discovery_lane_observations, 'DIVERSITY_LANE_HEALTH');
assert(diversity.distinct_host_is_distinct_factual_origin === false, 'DIVERSITY_HOST_ORIGIN_BOUNDARY');
assert(diversity.discovery_provider_is_factual_origin === false, 'DIVERSITY_PROVIDER_ORIGIN_BOUNDARY');
assert(diversity.factual_origin_independence_proven_count === 0, 'DIVERSITY_ORIGIN_OVERCLAIM');

assert(manifest.id === 'kidults-asi-p0b-bounded-discovery-manifest-v1', 'MANIFEST_ID');
assert(manifest.state === 'BOUNDED_PUBLIC_METADATA_DISCOVERY_EXECUTED_SOURCE_CANDIDATES_OBSERVED', 'MANIFEST_STATE');
assert(JSON.stringify(manifest.platform_principles) === JSON.stringify(principles), 'MANIFEST_PRINCIPLE_ORDER');
assert(manifest.results?.bounded_public_metadata_network_discovery_executed === true, 'MANIFEST_LIVE_EXECUTION');
assert(manifest.results?.successful_live_discovery_lane_observations === diversity.successful_live_discovery_lane_observations, 'MANIFEST_LIVE_LANE_COUNT');
assert(manifest.results?.raw_candidate_observations === candidates.raw_candidate_observations, 'MANIFEST_RAW_COUNT');
assert(manifest.results?.canonical_source_candidates_observed === candidates.canonical_candidate_count, 'MANIFEST_CANDIDATE_COUNT');
assert(manifest.results?.unique_hosts_observed === candidates.unique_host_count, 'MANIFEST_HOST_COUNT');
assert(manifest.results?.discovery_providers_observed === diversity.discovery_provider_count, 'MANIFEST_PROVIDER_COUNT');
assert(manifest.results?.missions_total === 192 && manifest.results?.missions_with_candidate === missionsWithCandidate, 'MANIFEST_MISSION_COUNT');
assert(manifest.results?.missions_with_primary_and_fallback_candidates === missionsWithTwo, 'MANIFEST_MISSION_TWO');
assert(manifest.results?.missions_with_three_candidate_hosts === missionsWithThree, 'MANIFEST_MISSION_THREE');
assert(manifest.results?.missions_with_exact_region_hint_candidate === missionsWithExactRegion, 'MANIFEST_REGION_HINT_COUNT');
assert(manifest.results?.missions_with_regional_coverage_proven === 0 && manifest.results?.missions_with_factual_origin_independence_proven === 0, 'MANIFEST_REGION_ORIGIN_OVERCLAIM');
for (const key of ['target_site_bodies_crawled', 'target_content_records_acquired', 'collection_rights_created', 'evidence_admitted', 'market_claims_created']) {
  assert(manifest.results?.[key] === 0, `MANIFEST_PROMOTION_BOUNDARY:${key}`);
}
assert(manifest.output_files?.length === 4, 'MANIFEST_OUTPUT_COUNT');
for (const file of manifest.output_files) {
  const content = readText(file.name);
  assert(file.sha256 === sha256Ref(content), `MANIFEST_OUTPUT_DIGEST:${file.name}`);
  assert(file.bytes === Buffer.byteLength(content), `MANIFEST_OUTPUT_BYTES:${file.name}`);
}
assert(manifest.public_release === 'HOLD' && manifest.production === 'HOLD', 'MANIFEST_RELEASE_BOUNDARY');

console.log(JSON.stringify({
  id: 'kidults-asi-p0b-bounded-discovery-candidate-validation-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  successful_live_discovery_lane_observations: diversity.successful_live_discovery_lane_observations,
  raw_candidate_observations: candidates.raw_candidate_observations,
  canonical_source_candidates_observed: candidates.canonical_candidate_count,
  unique_hosts_observed: candidates.unique_host_count,
  discovery_providers_observed: diversity.discovery_provider_count,
  missions_with_candidate: missionsWithCandidate,
  missions_with_primary_and_fallback_candidates: missionsWithTwo,
  missions_with_three_candidate_hosts: missionsWithThree,
  missions_with_regional_coverage_proven: 0,
  missions_with_factual_origin_independence_proven: 0,
  target_site_bodies_crawled: 0,
  target_content_records_acquired: 0,
  collection_rights_created: 0,
  evidence_admitted: 0,
  market_claims_created: 0,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
