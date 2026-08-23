#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [
  outputDir = '/tmp/kidults-asi-candidate-preflight-v1',
  candidateIncrementPath = '/tmp/kidults-asi-source-candidate-increment-v1.json',
  contractPath = 'coordination/kidults/source-intelligence/asi-candidate-preflight-contract-v1.json'
] = process.argv.slice(2);

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const readText = (name) => fs.readFileSync(path.join(outputDir, name), 'utf8');
const readJson = (name) => JSON.parse(readText(name));
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const unique = (values) => new Set(values).size === values.length;
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const increment = JSON.parse(fs.readFileSync(candidateIncrementPath, 'utf8'));

assert(contract.id === 'kidults-asi-candidate-preflight-contract-v1', 'CONTRACT_ID');
assert(contract.version === '1.0.0', 'CONTRACT_VERSION');
assert(contract.status === 'ACTIVE_MANDATORY_FAIL_CLOSED_AFTER_MAIN_MERGE', 'CONTRACT_STATUS');
assert(contract.owner === 'KPMO' && contract.priority === 'P1', 'CONTRACT_OWNER_PRIORITY');
assert(JSON.stringify(contract.platform_principles) === JSON.stringify(principles), 'CONTRACT_PRINCIPLE_ORDER');
assert(contract.execution_scope?.unit_of_network_execution === 'UNIQUE_CANONICAL_HOST', 'CONTRACT_EXECUTION_UNIT');
assert(contract.execution_scope?.maximum_hosts_per_cycle === 96, 'CONTRACT_HOST_LIMIT');
assert(contract.execution_scope?.maximum_body_bytes_per_get === 65536, 'CONTRACT_BODY_LIMIT');
assert(JSON.stringify(contract.execution_scope?.allowed_get_targets) === JSON.stringify(['ORIGIN_ROOT', 'ROBOTS_TXT']), 'CONTRACT_GET_TARGETS');
assert(contract.execution_scope?.market_record_collection_allowed === false, 'CONTRACT_MARKET_COLLECTION');
assert(contract.execution_scope?.deep_crawl_allowed === false, 'CONTRACT_DEEP_CRAWL');
assert(contract.execution_scope?.same_host_link_follow_allowed === false, 'CONTRACT_LINK_FOLLOW');
assert(contract.rights_policy?.robots_allow_is_collection_permission === false, 'CONTRACT_ROBOTS_LICENSE');
assert(contract.rights_policy?.automatic_rights_pass_allowed === false, 'CONTRACT_AUTOMATIC_RIGHTS');
assert(contract.semantic_policy?.semantic_signal_is_evidence === false, 'CONTRACT_SEMANTIC_EVIDENCE');
assert(contract.required_outputs?.length === 5, 'CONTRACT_OUTPUT_COUNT');
assert(contract.truth_boundary?.executes_bounded_host_preflight === true, 'CONTRACT_PREFLIGHT');
assert(contract.truth_boundary?.collects_market_records === false, 'CONTRACT_RECORD_COLLECTION');
assert(contract.truth_boundary?.follows_discovered_links === false, 'CONTRACT_FOLLOW_LINKS');
assert(contract.truth_boundary?.creates_collection_right === false, 'CONTRACT_RIGHTS');
assert(contract.truth_boundary?.admits_evidence === false, 'CONTRACT_ADMISSION');
assert(contract.truth_boundary?.creates_market_claim === false, 'CONTRACT_CLAIM');

assert(increment.id === 'kidults-asi-source-candidate-increment-v1', 'INCREMENT_ID');
assert(increment.state === 'DISCOVERY_METADATA_CANDIDATES_PREFLIGHT_REQUIRED', 'INCREMENT_STATE');
assert(Array.isArray(increment.candidates) && increment.candidates.length > 0, 'INCREMENT_EMPTY');
assert(increment.unique_query_group_candidates === increment.candidates.length, 'INCREMENT_COUNT');
assert(increment.candidate_is_evidence === false && increment.evidence_admitted === false, 'INCREMENT_PROMOTION');

for (const name of contract.required_outputs) {
  assert(fs.existsSync(path.join(outputDir, name)), `MISSING_OUTPUT:${name}`);
  JSON.parse(readText(name));
}

const ledger = readJson('candidate-host-preflight-ledger-v1.json');
const assignments = readJson('candidate-preflight-assignment-v1.json');
const readiness = readJson('candidate-admission-readiness-v1.json');
const health = readJson('candidate-preflight-health-v1.json');
const manifest = readJson('candidate-preflight-manifest-v1.json');

assert(ledger.id === 'kidults-asi-candidate-host-preflight-ledger-v1', 'LEDGER_ID');
assert(['HOST_PREFLIGHT_CYCLE_EXECUTED', 'NO_NEW_HOSTS_REVALIDATED_CUMULATIVE_LEDGER'].includes(ledger.state), 'LEDGER_STATE');
assert(Number.isInteger(ledger.total_candidate_hosts) && ledger.total_candidate_hosts > 0, 'LEDGER_TOTAL_HOSTS');
assert(ledger.total_candidate_hosts === increment.unique_hosts, 'LEDGER_INPUT_HOST_COUNT');
assert(ledger.selected_hosts_this_cycle >= 0 && ledger.selected_hosts_this_cycle <= 96, 'LEDGER_SELECTED_HOSTS');
assert(ledger.preflighted_hosts_cumulative === ledger.entries?.length, 'LEDGER_CUMULATIVE_COUNT');
assert(ledger.preflighted_hosts_cumulative <= ledger.total_candidate_hosts, 'LEDGER_CUMULATIVE_LIMIT');
assert(ledger.remaining_hosts === ledger.total_candidate_hosts - ledger.preflighted_hosts_cumulative, 'LEDGER_REMAINING_HOSTS');
assert(ledger.maximum_hosts_per_cycle === 96, 'LEDGER_HOST_LIMIT');
assert(unique(ledger.entries.map((entry) => entry.canonical_host)), 'LEDGER_HOST_DUPLICATE');
assert(unique(ledger.entries.map((entry) => entry.preflight_id)), 'LEDGER_PREFLIGHT_DUPLICATE');
assert(ledger.bounded_root_and_robots_only === true, 'LEDGER_BOUNDED_TARGETS');
assert(ledger.market_records_collected === false, 'LEDGER_MARKET_COLLECTION');
const preflightStates = new Set(contract.preflight_states.filter((state) => state !== 'PREFLIGHT_NOT_EXECUTED_CYCLE_LIMIT'));
for (const entry of ledger.entries) {
  assert(preflightStates.has(entry.preflight_state), `LEDGER_PREFLIGHT_STATE:${entry.canonical_host}`);
  assert(typeof entry.canonical_host === 'string' && /^https?:\/\//.test(entry.origin), `LEDGER_IDENTITY:${entry.canonical_host}`);
  assert(Array.isArray(entry.candidate_ids) && entry.candidate_ids.length >= 1, `LEDGER_CANDIDATE_IDS:${entry.canonical_host}`);
  assert(entry.identity?.host_identity_is_factual_origin_proof === false, `LEDGER_ORIGIN_OVERCLAIM:${entry.canonical_host}`);
  assert(entry.technical?.root_body_bytes <= 65536, `LEDGER_BODY_LIMIT:${entry.canonical_host}`);
  assert(entry.technical?.target_site_market_records_collected === false && entry.technical?.deep_crawl_executed === false, `LEDGER_CRAWL_BOUNDARY:${entry.canonical_host}`);
  assert(entry.robots?.robots_is_license === false, `LEDGER_ROBOTS_LICENSE:${entry.canonical_host}`);
  assert(entry.root_metadata?.discovered_links_followed === false, `LEDGER_LINK_FOLLOW:${entry.canonical_host}`);
  assert(entry.rights?.robots_allow_is_collection_permission === false, `LEDGER_ROBOTS_PERMISSION:${entry.canonical_host}`);
  assert(entry.rights?.public_web_access_is_collection_permission === false, `LEDGER_PUBLIC_ACCESS_PERMISSION:${entry.canonical_host}`);
  assert(entry.rights?.terms_link_is_rights_pass === false && entry.rights?.automatic_rights_pass === false, `LEDGER_RIGHTS_PASS:${entry.canonical_host}`);
  assert(entry.request_evidence?.head?.method === 'HEAD', `LEDGER_HEAD_METHOD:${entry.canonical_host}`);
  assert(entry.request_evidence?.root?.method === 'GET' && entry.request_evidence?.robots?.method === 'GET', `LEDGER_GET_METHODS:${entry.canonical_host}`);
  for (const request of [entry.request_evidence.head, entry.request_evidence.root, entry.request_evidence.robots]) {
    assert(typeof request.request_url_digest === 'string' && request.request_url_digest.startsWith('sha256:'), `LEDGER_REQUEST_DIGEST:${entry.canonical_host}`);
    assert(Array.isArray(request.attempts) && request.attempts.length >= 1, `LEDGER_REQUEST_ATTEMPTS:${entry.canonical_host}`);
    assert(!Object.hasOwn(request, 'body_text'), `LEDGER_RAW_BODY_LEAK:${entry.canonical_host}`);
  }
  for (const evidenceClass of entry.evidence_classes) {
    const semantic = entry.semantics?.[evidenceClass];
    assert(semantic && Number.isFinite(semantic.score), `LEDGER_SEMANTIC_SCORE:${entry.canonical_host}:${evidenceClass}`);
    assert(semantic.semantic_signal_is_evidence === false, `LEDGER_SEMANTIC_EVIDENCE:${entry.canonical_host}:${evidenceClass}`);
  }
  assert(entry.source_candidate_is_evidence === false && entry.evidence_admitted === false && entry.market_claim_authorized === false, `LEDGER_PROMOTION:${entry.canonical_host}`);
  assert(entry.public_release === 'HOLD' && entry.production === 'HOLD', `LEDGER_RELEASE_BOUNDARY:${entry.canonical_host}`);
}

assert(assignments.id === 'kidults-asi-candidate-preflight-assignment-v1', 'ASSIGNMENT_ID');
assert(assignments.state === 'CANDIDATES_BOUND_TO_HOST_PREFLIGHT_OR_EXPLICIT_WAITING_STATE', 'ASSIGNMENT_STATE');
assert(assignments.candidate_count === increment.candidates.length && assignments.assignments?.length === increment.candidates.length, 'ASSIGNMENT_COUNT');
assert(assignments.assigned_to_completed_host_preflight + assignments.waiting_for_host_preflight === assignments.candidate_count, 'ASSIGNMENT_PARTITION');
assert(unique(assignments.assignments.map((item) => item.candidate_id)), 'ASSIGNMENT_CANDIDATE_DUPLICATE');
assert(unique(assignments.assignments.map((item) => item.assignment_id)), 'ASSIGNMENT_ID_DUPLICATE');
const inputCandidateIds = new Set(increment.candidates.map((candidate) => candidate.candidate_id));
const preflightIds = new Set(ledger.entries.map((entry) => entry.preflight_id));
const readinessStates = new Set(contract.admission_readiness_states);
for (const item of assignments.assignments) {
  assert(inputCandidateIds.has(item.candidate_id), `ASSIGNMENT_INPUT_LINK:${item.candidate_id}`);
  assert(contract.preflight_states.includes(item.preflight_state), `ASSIGNMENT_PREFLIGHT_STATE:${item.candidate_id}`);
  assert(readinessStates.has(item.admission_readiness_state), `ASSIGNMENT_READINESS_STATE:${item.candidate_id}`);
  if (item.preflight_id === null) {
    assert(item.preflight_state === 'PREFLIGHT_NOT_EXECUTED_CYCLE_LIMIT' && item.admission_readiness_state === 'WAITING_FOR_HOST_PREFLIGHT', `ASSIGNMENT_WAITING_STATE:${item.candidate_id}`);
  } else {
    assert(preflightIds.has(item.preflight_id), `ASSIGNMENT_PREFLIGHT_LINK:${item.candidate_id}`);
    assert(item.rights_state !== 'ALLOW', `ASSIGNMENT_RIGHTS_PASS_FORBIDDEN:${item.candidate_id}`);
  }
  assert(item.evidence_admitted === false, `ASSIGNMENT_ADMISSION:${item.candidate_id}`);
  assert(item.public_release === 'HOLD' && item.production === 'HOLD', `ASSIGNMENT_RELEASE_BOUNDARY:${item.candidate_id}`);
}
assert(assignments.preflight_is_admission === false && assignments.evidence_admitted === 0, 'ASSIGNMENT_PROMOTION');

assert(readiness.id === 'kidults-asi-candidate-admission-readiness-v1', 'READINESS_ID');
assert(readiness.state === 'NO_AUTOMATIC_ADMISSION_RIGHTS_REVIEW_REQUIRED', 'READINESS_STATE');
assert(readiness.candidate_count === increment.candidates.length, 'READINESS_COUNT');
assert(readiness.automatic_admission_eligible === 0 && readiness.evidence_admitted === 0, 'READINESS_ADMISSION_OVERCLAIM');
assert(Object.keys(readiness.readiness_counts || {}).length === contract.admission_readiness_states.length, 'READINESS_STATE_COUNT');
assert(Object.values(readiness.readiness_counts).reduce((total, value) => total + Number(value), 0) === readiness.candidate_count, 'READINESS_PARTITION');
assert(readiness.rights_unknown_candidates === readiness.readiness_counts.NOT_READY_RIGHTS_UNKNOWN, 'READINESS_RIGHTS_COUNT');
assert(readiness.semantic_hold_candidates === readiness.readiness_counts.NOT_READY_SEMANTIC_INSUFFICIENT, 'READINESS_SEMANTIC_COUNT');
assert(readiness.technical_hold_candidates === readiness.readiness_counts.NOT_READY_TECHNICAL_FAILURE, 'READINESS_TECHNICAL_COUNT');
assert(readiness.rejected_automation_or_access_candidates === readiness.readiness_counts.REJECTED_AUTOMATION_OR_ACCESS, 'READINESS_REJECT_COUNT');
assert(readiness.waiting_candidates === readiness.readiness_counts.WAITING_FOR_HOST_PREFLIGHT, 'READINESS_WAITING_COUNT');

assert(health.id === 'kidults-asi-candidate-preflight-health-v1', 'HEALTH_ID');
assert(['ALL_SELECTED_HOST_REQUESTS_COMPLETED', 'PARTIAL_NETWORK_OR_ACCESS_FAILURE_EXPLICIT'].includes(health.state), 'HEALTH_STATE');
assert(health.selected_hosts === ledger.selected_hosts_this_cycle, 'HEALTH_SELECTED_HOSTS');
assert(health.request_count === health.selected_hosts * 3, 'HEALTH_REQUEST_COUNT');
assert(health.successful_requests + health.failed_or_non_success_requests === health.request_count, 'HEALTH_REQUEST_PARTITION');
assert(health.bounded_body_limit_bytes === 65536, 'HEALTH_BODY_LIMIT');
assert(health.discovered_links_followed === false && health.market_records_collected === false, 'HEALTH_BOUNDARY');
if (health.failed_or_non_success_requests > 0) assert(Array.isArray(health.failure_codes), 'HEALTH_FAILURE_CODES');

assert(manifest.id === 'kidults-asi-candidate-preflight-manifest-v1', 'MANIFEST_ID');
assert(manifest.state === 'P1_CANDIDATE_PREFLIGHT_EXECUTED_AND_READY_FOR_VALIDATION', 'MANIFEST_STATE');
assert(JSON.stringify(manifest.platform_principles) === JSON.stringify(principles), 'MANIFEST_PRINCIPLE_ORDER');
assert(manifest.results?.total_candidate_hosts === ledger.total_candidate_hosts, 'MANIFEST_TOTAL_HOSTS');
assert(manifest.results?.selected_hosts_this_cycle === ledger.selected_hosts_this_cycle, 'MANIFEST_SELECTED_HOSTS');
assert(manifest.results?.preflighted_hosts_cumulative === ledger.preflighted_hosts_cumulative, 'MANIFEST_CUMULATIVE_HOSTS');
assert(manifest.results?.remaining_hosts === ledger.remaining_hosts, 'MANIFEST_REMAINING_HOSTS');
assert(manifest.results?.candidate_records === assignments.candidate_count, 'MANIFEST_CANDIDATES');
assert(manifest.results?.candidates_bound_to_completed_preflight === assignments.assigned_to_completed_host_preflight, 'MANIFEST_ASSIGNED');
assert(manifest.results?.candidates_waiting_for_host_preflight === assignments.waiting_for_host_preflight, 'MANIFEST_WAITING');
assert(manifest.results?.automatic_admission_eligible === 0 && manifest.results?.evidence_admitted === 0, 'MANIFEST_ADMISSION_OVERCLAIM');
assert(manifest.results?.market_records_collected === false && manifest.results?.discovered_links_followed === false, 'MANIFEST_COLLECTION_BOUNDARY');
assert(manifest.output_files?.length === 4, 'MANIFEST_OUTPUT_FILE_COUNT');
for (const output of manifest.output_files) {
  const content = readText(output.name);
  assert(output.sha256 === sha256(content), `MANIFEST_OUTPUT_DIGEST:${output.name}`);
  assert(output.bytes === Buffer.byteLength(content), `MANIFEST_OUTPUT_BYTES:${output.name}`);
}
assert(manifest.public_release === 'HOLD' && manifest.production === 'HOLD', 'MANIFEST_RELEASE_BOUNDARY');

console.log(JSON.stringify({
  id: 'kidults-asi-candidate-preflight-validation-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  total_candidate_hosts: ledger.total_candidate_hosts,
  selected_hosts_this_cycle: ledger.selected_hosts_this_cycle,
  preflighted_hosts_cumulative: ledger.preflighted_hosts_cumulative,
  remaining_hosts: ledger.remaining_hosts,
  candidate_records: assignments.candidate_count,
  candidates_bound_to_completed_preflight: assignments.assigned_to_completed_host_preflight,
  candidates_waiting_for_host_preflight: assignments.waiting_for_host_preflight,
  rights_review_required_candidates: readiness.rights_unknown_candidates,
  semantic_hold_candidates: readiness.semantic_hold_candidates,
  technical_hold_candidates: readiness.technical_hold_candidates,
  rejected_automation_or_access_candidates: readiness.rejected_automation_or_access_candidates,
  automatic_admission_eligible: 0,
  evidence_admitted: 0,
  market_records_collected: false,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
