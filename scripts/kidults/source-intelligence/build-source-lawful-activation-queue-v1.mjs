#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const programPath = process.argv[2] || 'coordination/kidults/source-intelligence/source-lawful-activation-program-v1.json';
const top16Path = process.argv[3] || 'coordination/kidults/source-intelligence/top16-empirical-activation-preflight-v1.json';
const rightsFirstPath = process.argv[4] || 'coordination/kidults/source-intelligence/rights-first-current-sold-source-preflight-v1.json';
const outputPath = process.argv[5] || 'out/source-lawful-activation/source-lawful-activation-queue-v1.json';

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const program = readJson(programPath);
const ledgers = [readJson(top16Path), readJson(rightsFirstPath)];
const rows = ledgers.flatMap(ledger => (ledger.rows || []).map(row => ({ ...row, _ledger_id: ledger.id || path.basename(top16Path) })));

const array = value => Array.isArray(value) ? value : [];
const upper = value => String(value ?? '').toUpperCase();
const hash = value => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const bool = value => value === true;
const round = value => Math.round(value * 100) / 100;

const externalCommitmentRequired = row => [
  row.account_required,
  row.login_required,
  row.credential_required,
  row.eula_required,
  row.paid_plan_required,
  row.spend_required
].some(bool) || /ACCOUNT|LOGIN|CREDENTIAL|TOKEN|OAUTH|PAID|SPEND|EULA|CONTRACT|SUBSCRIPTION|PRIVATE_FEED/.test(
  `${upper(row.rights_state)} ${upper(row.access_state)} ${upper(row.blocker)}`
);

const writtenClarificationRequired = row => bool(row.written_permission_required) ||
  /WRITTEN_PERMISSION|WRITTEN_CONSENT|EXPRESS_AUTHORIZATION|UNKNOWN_FAIL_CLOSED|REUSE_NOT_AUTHORIZED|PERSONAL_USE_ONLY|NONCOMMERCIAL_ONLY|WAF_BLOCKED/.test(
    `${upper(row.rights_state)} ${upper(row.access_state)} ${upper(row.blocker)}`
  );

const wrongPurpose = row => /WRONG_PURPOSE|NOT_CANDIDATE|LISTING_ASK_CONTEXT|PRIMARY_RETAIL|PRIMARY_RELEASE|AGGREGATE_ONLY|CURRENT_VALUE_ONLY/.test(
  `${upper(row.current_sold_purpose_candidate_state)} ${upper(row.semantic_state)}`
);

const collectorDomainFit = row => {
  const domain = upper(row.domain_fit_state);
  if (/NON_COLLECTOR|MUNICIPAL|PUBLIC_SURPLUS/.test(domain)) return false;
  return /COLLECTOR|COLLECTIBLES|TRADING_CARDS|WATCHES|HANDBAGS|SNEAKERS|CARS|INSTRUMENTS|LEGO|GAMES|CARDS|COMICS|COINS/.test(domain);
};

const exactSoldRole = row => array(row.source_roles).includes('SOLD_TRANSACTION');
const individualSoldSemantics = row => exactSoldRole(row) && !wrongPurpose(row) && !/LISTING|ASK_CONTEXT|BID_CONTEXT_NOT_SOLD|NOT_INDIVIDUAL/.test(upper(row.semantic_state));

const rightsClear = row => {
  const rights = row.purpose_rights || {};
  return upper(row.rights_state) === 'PASS' &&
    bool(row.field_purpose_rights_verified) &&
    bool(row.commercial_reuse_authorized) &&
    upper(rights.collect) === 'PASS' &&
    upper(rights.store) === 'PASS' &&
    upper(rights.derive) === 'PASS';
};

const classifyLane = row => {
  if (!collectorDomainFit(row) || wrongPurpose(row) || !individualSoldSemantics(row)) return 'DROP_OR_WRONG_PURPOSE';
  if (rightsClear(row) && !externalCommitmentRequired(row) && !writtenClarificationRequired(row)) return 'NO_CONTRACT_FAST_LANE';
  if (externalCommitmentRequired(row)) return 'CONTRACT_CREDENTIAL_LANE';
  return 'WRITTEN_CLARIFICATION_LANE';
};

const technicalAccessibility = row => {
  const access = upper(row.access_state);
  if (/OPEN_API/.test(access)) return 1.0;
  if (/PUBLIC_RESULTS|PUBLIC_ARCHIVE|PUBLIC_PERSONAL|PUBLIC_/.test(access)) return 0.7;
  if (/API_KEY/.test(access)) return 0.45;
  if (/REGISTER|LOGIN|ACCOUNT/.test(access)) return 0.3;
  if (/WAF/.test(access)) return 0.2;
  if (/PAID|TOKEN|OAUTH/.test(access)) return 0.35;
  return 0.5;
};

const freshness = row => /CURRENT|FINAL_PRICE|SOLD|AUCTION_RESULT/.test(
  `${upper(row.current_sold_purpose_candidate_state)} ${upper(row.semantic_state)}`
) ? 0.9 : 0.5;

const marketValue = row => individualSoldSemantics(row) && collectorDomainFit(row) ? 1.0 : exactSoldRole(row) ? 0.5 : 0.25;
const independence = row => array(row.source_roles).length ? 0.9 : 0.7;

const laneOrder = new Map(program.activation_queue.sort_order.map((lane, index) => [lane, index]));
const packetFor = row => {
  const lane = classifyLane(row);
  const laneFactor = program.activation_score.lane_factors[lane];
  const factors = {
    market_value: marketValue(row),
    rights_clarity: laneFactor.rights_clarity,
    technical_accessibility: technicalAccessibility(row),
    freshness: freshness(row),
    independence: independence(row),
    activation_cost: laneFactor.activation_cost
  };
  const score = round(100 * factors.market_value * factors.rights_clarity * factors.technical_accessibility * factors.freshness * factors.independence / factors.activation_cost);
  const evidenceRefs = array(row.evidence_refs);
  const rightsReceiptDigest = row.evidence_digest || (evidenceRefs.length ? hash(JSON.stringify(evidenceRefs.slice().sort())) : null);
  return {
    packet_id: `activation:${row.source_id}:${hash(row.source_id).slice(7, 19)}`,
    source_id: row.source_id,
    source_name: row.source_name,
    source_owner_or_venue: row.source_name,
    source_ledger: row._ledger_id,
    jurisdiction: row.jurisdiction || 'UNASSESSED',
    official_locator: row.official_locator || null,
    evidence_class: 'CURRENT_SOLD_TRANSACTION',
    collector_domain_fit: collectorDomainFit(row),
    individual_dated_sold_semantics_candidate: individualSoldSemantics(row),
    current_sold_candidate_state: row.current_sold_purpose_candidate_state || null,
    lane,
    activation_score: score,
    score_factors: factors,
    required_minimum_fields: program.claim_first_current_sold_contract.minimum_fields,
    rights: {
      discover: 'READ_ONLY_PREFLIGHT_COMPLETE',
      collect: row.purpose_rights?.collect || 'HOLD',
      store: row.purpose_rights?.store || 'HOLD',
      derive: row.purpose_rights?.derive || 'HOLD',
      internal_display: row.internal_display_right || 'UNASSESSED',
      public_derived_output: row.public_display_right || 'HOLD',
      retention: row.retention_right || 'UNASSESSED',
      field_purpose_rights_verified: bool(row.field_purpose_rights_verified),
      commercial_reuse_authorized: bool(row.commercial_reuse_authorized)
    },
    access: {
      state: row.access_state || 'UNASSESSED',
      account_required: bool(row.account_required),
      login_required: bool(row.login_required),
      credential_required: bool(row.credential_required),
      eula_required: bool(row.eula_required),
      paid_plan_required: bool(row.paid_plan_required),
      spend_required: bool(row.spend_required),
      written_permission_required: bool(row.written_permission_required)
    },
    schema_state: row.schema_state || 'UNASSESSED',
    semantic_state: row.semantic_state || 'UNASSESSED',
    domain_fit_state: row.domain_fit_state || 'UNASSESSED',
    blocker: row.blocker || null,
    evidence_refs: evidenceRefs,
    rights_receipt_digest: rightsReceiptDigest,
    technical_probe_receipt: null,
    freshness_observed_at: row.observed_at || null,
    rights_review_due_at: row.review_due_at || null,
    independent_source_owner_candidate: true,
    activation_decision: program.lanes[lane].next_state,
    acquisition_authorized: false,
    external_contact_authorized: false,
    credential_use_authorized: false,
    spend_authorized: false,
    evidence_admitted: false,
    first_event_state: 'NOT_ACQUIRED',
    public: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD'
  };
};

const packets = rows.map(packetFor).sort((a, b) => {
  const laneDelta = (laneOrder.get(a.lane) ?? 99) - (laneOrder.get(b.lane) ?? 99);
  if (laneDelta) return laneDelta;
  if (b.activation_score !== a.activation_score) return b.activation_score - a.activation_score;
  return a.source_id.localeCompare(b.source_id);
});

const actionable = packets.filter(packet => packet.lane !== 'DROP_OR_WRONG_PURPOSE');
const activationQueue = actionable.slice(0, program.activation_queue.max_source_purpose_packets);
const dropped = packets.filter(packet => packet.lane === 'DROP_OR_WRONG_PURPOSE');
const countLane = lane => packets.filter(packet => packet.lane === lane).length;
const rightsReviewed = packets.length;
const rightsPass = countLane('NO_CONTRACT_FAST_LANE');
const technicalPass = packets.filter(packet => packet.lane === 'NO_CONTRACT_FAST_LANE' && packet.score_factors.technical_accessibility >= 0.7).length;

const safeRate = (numerator, denominator) => denominator ? round(numerator / denominator) : 0;
const result = {
  id: 'kidults-source-lawful-activation-queue-v1',
  version: '1.0.0',
  generated_at: process.env.KIDULTS_ACTIVATION_AS_OF || new Date().toISOString(),
  execution_class: 'CONTROL_ONLY_NO_NETWORK_NO_PROVIDER_AUTHORITY',
  program_id: program.id,
  source_ledgers: ledgers.map(ledger => ledger.id),
  allocation: program.operating_allocation,
  queue_cap: program.activation_queue.max_source_purpose_packets,
  lane_counts: {
    no_contract_fast_lane: countLane('NO_CONTRACT_FAST_LANE'),
    written_clarification_lane: countLane('WRITTEN_CLARIFICATION_LANE'),
    contract_credential_lane: countLane('CONTRACT_CREDENTIAL_LANE'),
    drop_or_wrong_purpose: countLane('DROP_OR_WRONG_PURPOSE')
  },
  funnel: {
    discovered_or_preflighted: packets.length,
    rights_reviewed: rightsReviewed,
    rights_pass: rightsPass,
    technical_pass: technicalPass,
    acquired: 0,
    evidence_admitted: 0,
    independent_redundancy: 0,
    discovery_to_rights_decision_rate: safeRate(rightsReviewed, packets.length),
    rights_decision_to_pass_rate: safeRate(rightsPass, rightsReviewed),
    rights_pass_to_first_record_rate: 0,
    first_record_to_evidence_admission_rate: 0,
    evidence_to_second_owner_redundancy_rate: 0,
    time_to_first_lawful_record: null
  },
  first_empirical_target: {
    chain: ['RIGHTS_CLEAR_COLLECTOR_SOURCE_1', 'GENUINE_SOLD_EVENT_1', 'CURRENT_SOLD_EVENT_1', 'EVIDENCE_1'],
    current_completed: 0,
    canary_ladder: program.empirical_ladder
  },
  activation_queue: activationQueue,
  dropped_or_wrong_purpose: dropped,
  fail_closed_truth: {
    rights_clear_collector_current_sold_sources: rightsPass,
    lawful_current_sold_records_acquired: 0,
    current_sold_evidence_admitted: 0,
    independent_current_market_source_owners: 0,
    no_external_action_executed: true,
    public: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD'
  }
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
console.log(`SOURCE_LAWFUL_ACTIVATION_QUEUE_BUILT=${activationQueue.length}`);
console.log(`NO_CONTRACT_FAST_LANE=${rightsPass}`);
console.log(`WRITTEN_CLARIFICATION_LANE=${countLane('WRITTEN_CLARIFICATION_LANE')}`);
console.log(`CONTRACT_CREDENTIAL_LANE=${countLane('CONTRACT_CREDENTIAL_LANE')}`);
console.log('EMPIRICAL_CURRENT_SOLD_ADMITTED=0');
