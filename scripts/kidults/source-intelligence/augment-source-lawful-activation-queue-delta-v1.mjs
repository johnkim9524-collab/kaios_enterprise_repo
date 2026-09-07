#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const queuePath = process.argv[2] || 'out/source-lawful-activation/source-lawful-activation-queue-v1.json';
const deltaPath = process.argv[3] || 'coordination/kidults/source-intelligence/source-lawful-activation-discovery-delta-20260901-v1.json';
const programPath = process.argv[4] || 'coordination/kidults/source-intelligence/source-lawful-activation-program-v1.json';

const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
const delta = JSON.parse(fs.readFileSync(deltaPath, 'utf8'));
const program = JSON.parse(fs.readFileSync(programPath, 'utf8'));
const array = value => Array.isArray(value) ? value : [];
const upper = value => String(value ?? '').toUpperCase();
const bool = value => value === true;
const round = value => Math.round(value * 100) / 100;
const hash = value => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;

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
const wrongPurpose = row => /WRONG_PURPOSE|NOT_CANDIDATE|LISTING_ASK_CONTEXT|PRIMARY_RETAIL|PRIMARY_RELEASE|AGGREGATE|CURRENT_VALUE_ONLY|STALE_FOR_7D/.test(
  `${upper(row.current_sold_purpose_candidate_state)} ${upper(row.semantic_state)}`
);
const collectorDomainFit = row => {
  const domain = upper(row.domain_fit_state);
  if (/NON_COLLECTOR|MUNICIPAL|PUBLIC_SURPLUS/.test(domain)) return false;
  return /COLLECTOR|COLLECTIBLES|TRADING_CARDS|WATCHES|HANDBAGS|SNEAKERS|CARS|INSTRUMENTS|LEGO|GAMES|CARDS|COMICS|COINS|ANTIQUES|LUXURY|ART/.test(domain);
};
const exactSoldRole = row => array(row.source_roles).includes('SOLD_TRANSACTION');
const individualSoldSemantics = row => exactSoldRole(row) && !wrongPurpose(row) && !/LISTING|ASK_CONTEXT|BID_CONTEXT_NOT_SOLD|NOT_INDIVIDUAL/.test(upper(row.semantic_state));
const rightsClear = row => {
  const rights = row.purpose_rights || {};
  return upper(row.rights_state) === 'PASS' && bool(row.field_purpose_rights_verified) && bool(row.commercial_reuse_authorized) &&
    upper(rights.collect) === 'PASS' && upper(rights.store) === 'PASS' && upper(rights.derive) === 'PASS';
};
const writtenClarificationRequired = row => bool(row.written_permission_required) ||
  /WRITTEN_PERMISSION|WRITTEN_CONSENT|EXPRESS_AUTHORIZATION|UNKNOWN_FAIL_CLOSED|REUSE_NOT_AUTHORIZED|PERSONAL_USE_ONLY|NONCOMMERCIAL|ALL_RIGHTS_RESERVED|ABSENT_APPROVAL/.test(
    `${upper(row.rights_state)} ${upper(row.access_state)} ${upper(row.blocker)}`
  );
const classifyLane = row => {
  if (!collectorDomainFit(row) || wrongPurpose(row) || !individualSoldSemantics(row)) return 'DROP_OR_WRONG_PURPOSE';
  if (rightsClear(row) && !externalCommitmentRequired(row) && !writtenClarificationRequired(row)) return 'NO_CONTRACT_FAST_LANE';
  if (externalCommitmentRequired(row)) return 'CONTRACT_CREDENTIAL_LANE';
  return 'WRITTEN_CLARIFICATION_LANE';
};
const technicalAccessibility = row => {
  const access = upper(row.access_state);
  if (/OPEN_API|PUBLIC_DOWNLOAD/.test(access)) return 1.0;
  if (/PUBLIC_RESULTS|PUBLIC_RESEARCH|PUBLIC_/.test(access)) return 0.7;
  if (/API_KEY/.test(access)) return 0.45;
  if (/REGISTER|LOGIN|ACCOUNT/.test(access)) return 0.3;
  if (/WAF/.test(access)) return 0.2;
  if (/PAID|TOKEN|OAUTH/.test(access)) return 0.35;
  return 0.5;
};
const freshness = row => /WEEKLY_REFRESH|DAILY_UPDATE|2026_08_2|2026_08_3|CURRENT|FINAL_PRICE|SOLD|AUCTION_RESULT/.test(
  `${upper(row.freshness_state)} ${upper(row.current_sold_purpose_candidate_state)} ${upper(row.semantic_state)}`
) ? 0.9 : 0.5;
const marketValue = row => individualSoldSemantics(row) && collectorDomainFit(row) ? 1.0 : exactSoldRole(row) ? 0.5 : 0.25;
const independence = row => array(row.source_roles).length ? 0.9 : 0.7;

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
  return {
    packet_id: `activation:${row.source_id}:${hash(row.source_id).slice(7, 19)}`,
    source_id: row.source_id,
    source_name: row.source_name,
    source_owner_or_venue: row.source_name,
    source_ledger: delta.id,
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
    rights_receipt_digest: row.evidence_digest || (evidenceRefs.length ? hash(JSON.stringify(evidenceRefs.slice().sort())) : null),
    technical_probe_receipt: null,
    freshness_observed_at: row.observed_at || delta.as_of || null,
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

const originalPackets = [
  ...array(queue.activation_queue),
  ...array(queue.deferred_actionable),
  ...array(queue.dropped_or_wrong_purpose)
];
const bySource = new Map(originalPackets.map(packet => [packet.source_id, packet]));
for (const row of array(delta.rows)) bySource.set(row.source_id, packetFor(row));
const packets = [...bySource.values()];
const laneOrder = new Map(program.activation_queue.sort_order.map((lane, index) => [lane, index]));
packets.sort((a, b) => {
  const laneDelta = (laneOrder.get(a.lane) ?? 99) - (laneOrder.get(b.lane) ?? 99);
  if (laneDelta) return laneDelta;
  if (b.activation_score !== a.activation_score) return b.activation_score - a.activation_score;
  return a.source_id.localeCompare(b.source_id);
});
const actionable = packets.filter(packet => packet.lane !== 'DROP_OR_WRONG_PURPOSE');
const active = actionable.slice(0, program.activation_queue.max_source_purpose_packets);
const deferred = actionable.slice(program.activation_queue.max_source_purpose_packets);
const dropped = packets.filter(packet => packet.lane === 'DROP_OR_WRONG_PURPOSE');
const countLane = lane => packets.filter(packet => packet.lane === lane).length;
const rightsPass = countLane('NO_CONTRACT_FAST_LANE');
const technicalPass = packets.filter(packet => packet.lane === 'NO_CONTRACT_FAST_LANE' && packet.score_factors.technical_accessibility >= 0.7).length;
const historicalFactorCount = array(delta.rows).filter(row =>
  upper(row.rights_state) === 'PASS' && bool(row.field_purpose_rights_verified) && bool(row.commercial_reuse_authorized) &&
  array(row.candidate_purpose_intents).some(purpose => /HISTORICAL_SOLD_AGGREGATE|LIQUIDITY_AGGREGATE/.test(upper(purpose)))
).length;
const safeRate = (n, d) => d ? round(n / d) : 0;

queue.source_ledgers = [...new Set([...(queue.source_ledgers || []), delta.id])];
queue.lane_counts = {
  no_contract_fast_lane: rightsPass,
  written_clarification_lane: countLane('WRITTEN_CLARIFICATION_LANE'),
  contract_credential_lane: countLane('CONTRACT_CREDENTIAL_LANE'),
  drop_or_wrong_purpose: countLane('DROP_OR_WRONG_PURPOSE')
};
queue.funnel = {
  discovered_or_preflighted: packets.length,
  rights_reviewed: packets.length,
  rights_pass: rightsPass,
  technical_pass: technicalPass,
  acquired: 0,
  evidence_admitted: 0,
  independent_redundancy: 0,
  discovery_to_rights_decision_rate: safeRate(packets.length, packets.length),
  rights_decision_to_pass_rate: safeRate(rightsPass, packets.length),
  rights_pass_to_first_record_rate: 0,
  first_record_to_evidence_admission_rate: 0,
  evidence_to_second_owner_redundancy_rate: 0,
  time_to_first_lawful_record: null
};
queue.adjacent_rights_clear_market_factors = {
  historical_or_aggregate_sources: historicalFactorCount,
  current_sold_authority_created: false,
  note: 'Rights-clear historical/aggregate factors remain separate from strict 7-day individual Current-SOLD admission.'
};
queue.activation_queue = active;
queue.deferred_actionable = deferred;
queue.dropped_or_wrong_purpose = dropped;
queue.fail_closed_truth = {
  rights_clear_collector_current_sold_sources: rightsPass,
  lawful_current_sold_records_acquired: 0,
  current_sold_evidence_admitted: 0,
  independent_current_market_source_owners: 0,
  no_external_action_executed: true,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD'
};

fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`, { mode: 0o600 });
console.log(`DISCOVERY_DELTA_ROWS=${array(delta.rows).length}`);
console.log(`ACTIVATION_QUEUE_COUNT=${active.length}`);
console.log(`DEFERRED_ACTIONABLE=${deferred.length}`);
console.log(`NO_CONTRACT_FAST_LANE=${rightsPass}`);
console.log(`WRITTEN_CLARIFICATION_LANE=${queue.lane_counts.written_clarification_lane}`);
console.log(`CONTRACT_CREDENTIAL_LANE=${queue.lane_counts.contract_credential_lane}`);
console.log(`DROP_OR_WRONG_PURPOSE=${queue.lane_counts.drop_or_wrong_purpose}`);
console.log(`RIGHTS_CLEAR_HISTORICAL_OR_AGGREGATE_FACTOR=${historicalFactorCount}`);
console.log('EMPIRICAL_CURRENT_SOLD_ADMITTED=0');
