#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [
  discoveryPath = '/tmp/kidults-asi-mission-directed-discovery-v1/mission-directed-discovery-v1.json',
  gate1Path = '/tmp/asi-gate1-safe-candidate-pool-v1.json',
  gate2Path = '/tmp/asi-gate2-independent-reverification-v1.json',
  gate3Path = '/tmp/asi-gate3-admission-runtime-v1.json',
  strictGatePath = 'coordination/kidults/source-intelligence/strict-current-market-admission-gate-v1.json',
  contractPath = 'coordination/kidults/source-intelligence/asi-mission-directed-discovery-contract-v1.json',
  outputDir = '/tmp/kidults-asi-mission-directed-discovery-v1'
] = process.argv.slice(2);

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const digestFile = (file) => `sha256:${hash(fs.readFileSync(file))}`;
const normalizeHost = (value) => {
  try { return new URL(String(value)).hostname.toLowerCase().replace(/^www\./, ''); } catch { return 'unknown.invalid'; }
};
const unique = (values) => [...new Set(values)];
const discovery = readJson(discoveryPath);
const gate1 = readJson(gate1Path);
const gate2 = readJson(gate2Path);
const gate3 = readJson(gate3Path);
const strictGate = readJson(strictGatePath);
const contract = readJson(contractPath);

if (discovery.id !== 'kidults-asi-mission-directed-public-metadata-discovery-v1') throw new Error('DISCOVERY_INPUT_INVALID');
if (gate1.id !== 'kidults-asi-gate1-safe-candidate-pool-v1') throw new Error('GATE1_INPUT_INVALID');
if (gate2.id !== 'kidults-asi-gate2-independent-reverification-v1') throw new Error('GATE2_INPUT_INVALID');
if (gate3.id !== 'kidults-asi-gate3-admission-runtime-v1') throw new Error('GATE3_INPUT_INVALID');
if (strictGate.id !== 'kidults-strict-current-market-admission-gate-v1') throw new Error('STRICT_GATE_INPUT_INVALID');
if (contract.id !== 'kidults-asi-mission-directed-discovery-contract-v1') throw new Error('CONTRACT_INPUT_INVALID');
if (gate1.input_candidate_count !== discovery.candidate_count) throw new Error('GATE1_DISCOVERY_COUNT_MISMATCH');
if (gate2.input_safe_candidate_count !== gate1.safe_candidate_count) throw new Error('GATE2_GATE1_COUNT_MISMATCH');
if (gate3.input_verified_for_gate3_count !== gate2.verified_for_gate3_count) throw new Error('GATE3_GATE2_COUNT_MISMATCH');

const gate1ById = new Map((gate1.receipts || []).map((receipt) => [receipt.source_candidate_id, receipt]));
const gate2ById = new Map((gate2.receipts || []).map((receipt) => [receipt.source_candidate_id, receipt]));
const gate3ById = new Map((gate3.receipts || []).map((receipt) => [receipt.source_candidate_id, receipt]));
const gate1CandidateById = new Map([
  ...(gate1.safe_candidate_pool || []),
  ...(gate1.review_required_queue || []),
  ...(gate1.hard_block_queue || [])
].map((candidate) => [candidate.candidate_id, candidate]));

const claimTargets = (candidate) => candidate.evidence_class === 'CURRENT_SOLD_TRANSACTION'
  ? ['DATED_OBSERVED_SOLD_TRANSACTION', 'CURRENT_PRICE']
  : ['LIQUIDITY_OR_TIME_TO_SALE'];
const rightsAssertions = new Set(['COLLECT_RIGHT', 'BOUNDED_STORE_RIGHT', 'STORE_RIGHT', 'INTERNAL_DERIVE_RIGHT', 'DERIVE_RIGHT']);
const semanticAssertions = new Set([
  'SOLD_MARKET_STATE', 'VERIFIED_SOLD_SEMANTICS', 'EXPOSURE_DENOMINATOR', 'LISTING_START_OR_OBSERVATION_START',
  'SALE_OR_CENSOR_END', 'SOLD_UNSOLD_WITHDRAWN_SEMANTICS', 'FAILED_SALE_OR_CENSOR_HANDLING',
  'OUTLIER_AND_DUPLICATE_CONTROL', 'CONDITION_OR_GRADE_SEGMENTATION', 'MINIMUM_SAMPLE_RULE_CALIBRATED'
]);

const readinessRecords = [];
const adapterMap = new Map();
for (const rawCandidate of discovery.candidates) {
  const candidate = gate1CandidateById.get(rawCandidate.candidate_id) || rawCandidate;
  const gate1Receipt = gate1ById.get(rawCandidate.candidate_id) || null;
  const gate2Receipt = gate2ById.get(rawCandidate.candidate_id) || null;
  const gate3Receipt = gate3ById.get(rawCandidate.candidate_id) || null;
  for (const claimClass of claimTargets(rawCandidate)) {
    const policy = strictGate.claim_classes?.[claimClass];
    if (!policy || !Array.isArray(policy.required)) throw new Error(`CLAIM_POLICY_MISSING:${claimClass}`);
    const requiredAssertions = policy.required;
    const satisfiedAssertions = [];
    const sourceMetadataSignals = [
      'SOURCE_CANDIDATE_IDENTITY_PRESENT',
      'PUBLIC_METADATA_ENDPOINT_PRESENT',
      'MISSION_AND_MARKET_CELL_LINEAGE_PRESENT',
      gate1Receipt ? `GATE1_${gate1Receipt.decision}` : 'GATE1_RECEIPT_MISSING',
      gate2Receipt ? `GATE2_${gate2Receipt.decision}` : 'GATE2_NOT_REACHED',
      gate3Receipt ? `GATE3_${gate3Receipt.decision}` : 'GATE3_NOT_REACHED'
    ];
    const missingAssertions = [...requiredAssertions];
    const missingRights = missingAssertions.filter((assertion) => rightsAssertions.has(assertion));
    const missingSemantics = missingAssertions.filter((assertion) => semanticAssertions.has(assertion));
    const claimState = 'HOLD_DISCOVERY_METADATA_ONLY_ALL_CLAIM_ASSERTIONS_UNSATISFIED';
    readinessRecords.push({
      readiness_id: `claim-readiness-${hash(`${rawCandidate.candidate_id}|${claimClass}`).slice(0, 32)}`,
      source_candidate_id: rawCandidate.candidate_id,
      mission_discovery_intent_id: rawCandidate.mission_discovery_intent_id,
      mission_id: rawCandidate.mission_id,
      market_cell_id: rawCandidate.market_cell_id,
      lane_slot: rawCandidate.lane_slot,
      scope_id: rawCandidate.scope_id,
      region: rawCandidate.region,
      evidence_class: rawCandidate.evidence_class,
      endpoint_url: rawCandidate.endpoint_url,
      source_name: rawCandidate.source_name,
      source_owner_hint: rawCandidate.source_owner_hint,
      discovery_provider: rawCandidate.discovery_provider,
      source_family_hint: candidate.source_family_hint || 'UNCLASSIFIED_ANY_SITE_CANDIDATE',
      candidate_source_roles: candidate.candidate_source_roles || ['UNCLASSIFIED_PENDING_RELEVANCE'],
      claim_class: claimClass,
      claim_state: claimState,
      required_assertion_count: requiredAssertions.length,
      satisfied_assertion_count: satisfiedAssertions.length,
      missing_assertion_count: missingAssertions.length,
      required_assertions: requiredAssertions,
      satisfied_assertions: satisfiedAssertions,
      missing_assertions: missingAssertions,
      missing_rights_assertions: missingRights,
      missing_semantic_assertions: missingSemantics,
      source_metadata_signals: sourceMetadataSignals,
      gate1_state: gate1Receipt?.decision || 'NOT_REACHED',
      gate2_state: gate2Receipt?.decision || 'NOT_REACHED',
      gate3_state: gate3Receipt?.decision || 'NOT_REACHED',
      metadata_index_admitted: gate3Receipt?.metadata_index_admission_authorized === true,
      metadata_index_admission_is_claim_admission: false,
      terminal_sold_assertion_present: rawCandidate.terminal_transaction_asserted === true,
      exposure_denominator_present: false,
      exact_item_identity_present: false,
      realized_price_present: false,
      event_date_present: false,
      field_purpose_rights_complete: false,
      source_owner_independence_verified: false,
      factual_origin_independence_verified: false,
      current_price_eligible: false,
      liquidity_eligible: false,
      market_event_admitted: false,
      public_release: 'HOLD',
      production: 'HOLD'
    });

    const host = normalizeHost(rawCandidate.endpoint_url);
    const adapterKey = `${host}|${rawCandidate.evidence_class}`;
    if (!adapterMap.has(adapterKey)) {
      adapterMap.set(adapterKey, {
        adapter_requirement_id: `adapter-requirement-${hash(adapterKey).slice(0, 32)}`,
        state: 'SOURCE_SPECIFIC_CLAIM_ADAPTER_NOT_IMPLEMENTED',
        canonical_host: host,
        endpoint_examples: [],
        source_candidate_ids: [],
        mission_ids: [],
        market_cell_ids: [],
        scopes: [],
        regions: [],
        evidence_class: rawCandidate.evidence_class,
        target_claim_classes: [],
        candidate_source_roles: [],
        discovery_providers: [],
        required_adapter_outputs: contract.claim_readiness.required_adapter_outputs,
        required_claim_assertions: [],
        required_field_purpose_rights: [],
        required_market_semantics: [],
        metadata_gate3_admission_present: false,
        exact_source_terms_and_rights_review_required: true,
        source_owner_independence_verification_required: true,
        factual_origin_independence_verification_required: true,
        collector_market_representativeness_review_required: true,
        adapter_runtime_implemented: false,
        adapter_runtime_tested: false,
        collection_authorized: false,
        market_event_admitted: false,
        public_release: 'HOLD',
        production: 'HOLD'
      });
    }
    const adapter = adapterMap.get(adapterKey);
    adapter.endpoint_examples = unique([...adapter.endpoint_examples, rawCandidate.endpoint_url]).sort().slice(0, 5);
    adapter.source_candidate_ids = unique([...adapter.source_candidate_ids, rawCandidate.candidate_id]).sort();
    adapter.mission_ids = unique([...adapter.mission_ids, rawCandidate.mission_id]).sort();
    adapter.market_cell_ids = unique([...adapter.market_cell_ids, rawCandidate.market_cell_id]).sort();
    adapter.scopes = unique([...adapter.scopes, rawCandidate.scope_id]).sort();
    adapter.regions = unique([...adapter.regions, rawCandidate.region]).sort();
    adapter.target_claim_classes = unique([...adapter.target_claim_classes, claimClass]).sort();
    adapter.candidate_source_roles = unique([...adapter.candidate_source_roles, ...(candidate.candidate_source_roles || [])]).sort();
    adapter.discovery_providers = unique([...adapter.discovery_providers, rawCandidate.discovery_provider]).sort();
    adapter.required_claim_assertions = unique([...adapter.required_claim_assertions, ...requiredAssertions]).sort();
    adapter.required_field_purpose_rights = unique([...adapter.required_field_purpose_rights, ...missingRights]).sort();
    adapter.required_market_semantics = unique([...adapter.required_market_semantics, ...missingSemantics]).sort();
    adapter.metadata_gate3_admission_present = adapter.metadata_gate3_admission_present || gate3Receipt?.metadata_index_admission_authorized === true;
  }
}

const adapterRequirements = [...adapterMap.values()].sort((left, right) =>
  left.evidence_class.localeCompare(right.evidence_class) || left.canonical_host.localeCompare(right.canonical_host)
);
const gateSummary = {
  id: 'kidults-asi-mission-directed-gate-summary-v1',
  version: '1.0.0',
  state: 'GATE1_TO_GATE3_METADATA_CONTROL_CHAIN_COMPLETE',
  discovery_candidates: discovery.candidate_count,
  gate1: {
    input: gate1.input_candidate_count,
    safe: gate1.safe_candidate_count,
    review_required: gate1.review_required_count,
    hard_block: gate1.hard_block_count
  },
  gate2: {
    input: gate2.input_safe_candidate_count,
    verified_for_gate3: gate2.verified_for_gate3_count,
    needs_clarification: gate2.needs_clarification_count,
    blocked: gate2.blocked_count,
    stale_gate1: gate2.stale_gate1_count
  },
  gate3: {
    input: gate3.input_verified_for_gate3_count,
    metadata_admitted: gate3.admitted_count,
    external_approval_required: gate3.external_approval_required_count,
    conditional_hold: gate3.conditional_hold_count,
    rejected: gate3.rejected_count
  },
  metadata_admission_scope: 'DISCOVERY_METADATA_INDEX_ONLY',
  metadata_admission_is_market_event_admission: false,
  current_price_eligible_count: 0,
  liquidity_eligible_count: 0,
  market_event_admitted_count: 0,
  public_release: 'HOLD',
  production: 'HOLD'
};
const readiness = {
  id: 'kidults-asi-mission-claim-admission-readiness-v1',
  version: '1.0.0',
  state: 'CLAIM_ADMISSION_GAPS_COMPILED_ALL_HOLD',
  strict_gate_id: strictGate.id,
  strict_gate_version: strictGate.version,
  source_candidate_count: discovery.candidate_count,
  readiness_record_count: readinessRecords.length,
  claim_class_counts: Object.fromEntries(contract.claim_readiness.claim_classes.map((claimClass) => [
    claimClass,
    readinessRecords.filter((record) => record.claim_class === claimClass).length
  ])),
  claim_ready_count: 0,
  current_price_eligible_count: 0,
  liquidity_eligible_count: 0,
  dated_observed_sold_transaction_eligible_count: 0,
  metadata_candidate_can_pass_claim_admission: false,
  gate3_metadata_admission_can_pass_claim_admission: false,
  records: readinessRecords,
  public_release: 'HOLD',
  production: 'HOLD'
};
const adapters = {
  id: 'kidults-asi-mission-source-adapter-requirements-v1',
  version: '1.0.0',
  state: 'SOURCE_SPECIFIC_ADAPTER_BACKLOG_COMPILED',
  unique_host_evidence_class_count: adapterRequirements.length,
  adapter_runtime_implemented_count: 0,
  adapter_runtime_tested_count: 0,
  collection_authorized_count: 0,
  market_event_admitted_count: 0,
  requirements: adapterRequirements,
  public_release: 'HOLD',
  production: 'HOLD'
};

const outputFiles = [];
const write = (name, value) => {
  const target = path.join(outputDir, name);
  const text = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(target, text);
  outputFiles.push({ name, sha256: `sha256:${hash(text)}`, bytes: Buffer.byteLength(text) });
};
write('mission-directed-gate-summary-v1.json', gateSummary);
write('mission-claim-admission-readiness-v1.json', readiness);
write('mission-source-adapter-requirements-v1.json', adapters);
const manifest = {
  id: 'kidults-asi-mission-directed-discovery-manifest-v1',
  version: '1.0.0',
  state: 'LIVE_DISCOVERY_GATE_CHAIN_AND_P1_GAPS_READY',
  platform_principles: contract.platform_principles,
  input_digests: {
    discovery: digestFile(discoveryPath),
    gate1: digestFile(gate1Path),
    gate2: digestFile(gate2Path),
    gate3: digestFile(gate3Path),
    strict_gate: digestFile(strictGatePath),
    contract: digestFile(contractPath)
  },
  results: {
    cycle_number: discovery.cycle_number,
    attempted_intents: discovery.attempted_intent_count,
    candidates: discovery.candidate_count,
    unique_endpoints: discovery.unique_endpoint_count,
    missions_with_candidates: discovery.missions_with_candidates,
    gate1_safe: gate1.safe_candidate_count,
    gate2_verified: gate2.verified_for_gate3_count,
    gate3_metadata_admitted: gate3.admitted_count,
    claim_readiness_records: readinessRecords.length,
    claim_ready: 0,
    source_specific_adapter_requirements: adapterRequirements.length,
    current_price_eligible: 0,
    liquidity_eligible: 0,
    market_event_admitted: 0,
    target_site_body_traversed: false,
    source_content_collected: false,
    collection_right_created: false
  },
  output_files: outputFiles,
  autonomous_effect: 'POSITIVE_ROLLING_CURSOR_CONSUMES_MISSION_DISCOVERY_INTENTS_WITHOUT_ROUTINE_MANUAL_ORCHESTRATION',
  global_effect: 'POSITIVE_MISSION_REGION_SCOPE_EVIDENCE_GAPS_DRIVE_MULTI_PROVIDER_PUBLIC_METADATA_DISCOVERY',
  irreplaceable_value_effect: 'POSITIVE_KIDULTS_OWNED_SOURCE_CANDIDATE_GATE_LINEAGE_AND_ADAPTER_REQUIREMENT_ASSETS',
  transparency_effect: 'POSITIVE_PARTIAL_FAILURE_GATE_STATE_MISSING_ASSERTIONS_AND_CLAIM_CEILINGS_EXPLICIT',
  public_release: 'HOLD',
  production: 'HOLD'
};
write('mission-directed-discovery-manifest-v1.json', manifest);

console.log(JSON.stringify({
  state: manifest.state,
  discovery_candidates: discovery.candidate_count,
  gate1_safe: gate1.safe_candidate_count,
  gate2_verified: gate2.verified_for_gate3_count,
  gate3_metadata_admitted: gate3.admitted_count,
  claim_readiness_records: readinessRecords.length,
  claim_ready: 0,
  adapter_requirements: adapterRequirements.length,
  current_price_eligible: 0,
  liquidity_eligible: 0,
  market_event_admitted: 0
}, null, 2));
