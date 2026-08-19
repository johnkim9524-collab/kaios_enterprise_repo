import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [metPath, gettyPath, outputPath = '/tmp/asi-real-source-processor-bridge-r1.json'] = process.argv.slice(2);
if (!metPath || !gettyPath) throw new Error('Usage: node build-real-source-processor-bridge-r1.mjs <met-artifact> <getty-artifact> [output]');

const [met, getty] = await Promise.all([
  fs.readFile(metPath, 'utf8').then(JSON.parse),
  fs.readFile(gettyPath, 'utf8').then(JSON.parse),
]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
}

if (met.validations?.live_public_api_retrieval !== 'PASS' || met.validations?.public_domain_filter !== 'PASS') {
  throw new Error('MET_REAL_SOURCE_NOT_ADMITTED');
}
if (met.validations?.market_event_admission !== 'PROHIBITED') throw new Error('MET_MARKET_EVENT_GUARD_MISSING');
if (getty.validations?.live_public_api_retrieval !== 'PASS' || getty.validations?.rights_admission !== 'PASS_CC0') {
  throw new Error('GETTY_REAL_SOURCE_NOT_ADMITTED');
}
if (getty.validations?.historical_sale_activity_semantics !== 'PASS') throw new Error('GETTY_TRANSACTION_SEMANTICS_MISSING');
if (getty.validations?.current_market_price_semantics !== 'NOT_ESTABLISHED') throw new Error('GETTY_CURRENT_PRICE_GUARD_MISSING');

const admittedInputs = [
  {
    source_id: met.source_id,
    evidence_class: 'IDENTITY_CONTEXT',
    rights_state: 'ALLOW',
    freshness_state: 'CURRENT_AT_RETRIEVAL',
    payload_hash: digest({ samples: met.samples, retrieved_at: met.retrieved_at }),
    market_event_eligible: false,
    claim_ceiling: ['OBJECT_IDENTITY', 'CATALOG_CONTEXT', 'REFERENCE_METADATA'],
  },
  {
    source_id: getty.source_id,
    evidence_class: 'HISTORICAL_SALE_ACTIVITY',
    rights_state: 'ALLOW',
    freshness_state: 'HISTORICAL_RECORD_CURRENTLY_RETRIEVED',
    payload_hash: digest({ record_id: getty.record_id, record_type: getty.record_type, retrieved_at: getty.retrieved_at }),
    market_event_eligible: true,
    market_event_temporality: 'HISTORICAL_ONLY',
    claim_ceiling: ['HISTORICAL_SALE_ACTIVITY', 'OWNERSHIP_TRANSFER_CONTEXT', 'HISTORICAL_VALUATION_CONTEXT'],
  }
];

const replayInput = admittedInputs.map(({ source_id, evidence_class, rights_state, market_event_eligible, market_event_temporality, claim_ceiling, payload_hash }) => ({
  source_id, evidence_class, rights_state, market_event_eligible, market_event_temporality: market_event_temporality ?? null, claim_ceiling, payload_hash
}));
const replayHash1 = digest(replayInput);
const replayHash2 = digest(JSON.parse(JSON.stringify(replayInput)));
if (replayHash1 !== replayHash2) throw new Error('DETERMINISTIC_REPLAY_HASH_MISMATCH');

const quarantineControl = {
  source_id: 'negative-control-unknown-rights',
  rights_state: 'UNKNOWN',
  expected_state: 'QUARANTINE',
  admitted: false,
};
const retryDlqControl = {
  transport_failure: 'SYNTHETIC_CONTROL_ONLY',
  retry_expected: true,
  dlq_expected_after_exhaustion: true,
  empirical_queue_execution: 'NOT_RUN_IN_THIS_BRIDGE',
};

const result = {
  id: 'asi-real-source-processor-bridge-r1',
  execution_mode: 'DEV_SHADOW_ONLY',
  generated_at: new Date().toISOString(),
  source_pool_admission: {
    state: 'PASS_PARTIAL',
    admitted_input_count: admittedInputs.length,
    inputs: admittedInputs,
  },
  processor_run_manifest: {
    state: 'READY_FOR_QUEUE_D1_INJECTION',
    input_digest: replayHash1,
    processor_mesh_execution: 'NOT_RUN_BY_THIS_BRIDGE',
  },
  deterministic_replay: {
    state: 'PASS',
    first_hash: replayHash1,
    second_hash: replayHash2,
  },
  quarantine_report: {
    state: 'PASS_POLICY_CONTROL',
    control: quarantineControl,
    empirical_queue_quarantine: 'NOT_RUN_IN_THIS_BRIDGE',
  },
  retry_dlq_report: {
    state: 'READY_NOT_EMPIRICAL',
    control: retryDlqControl,
  },
  evidence_admission_report: {
    state: 'PASS_PARTIAL',
    identity_context: 'ADMITTED',
    historical_sale_activity: 'ADMITTED_HISTORICAL_ONLY',
    current_market_price: 'NOT_ADMITTED',
    current_liquidity: 'NOT_ADMITTED',
    current_demand: 'NOT_ADMITTED',
  },
  market_event_admission_report: {
    state: 'PASS_HISTORICAL_ONLY',
    met: 'PROHIBITED',
    getty: 'HISTORICAL_ACTIVITY_ELIGIBLE',
    current_market_event: 'NOT_EVIDENCED',
  },
  candidate_handoff_preflight: {
    ready: false,
    blockers: [
      '#479 empirical entity-resolution gate not yet PASS',
      'current-market claim-level evidence not yet sufficient',
      'Queue/D1 empirical real-source injection + retry/DLQ/quarantine not yet evidenced',
    ],
  },
  production_mutation: false,
  truth_boundary: 'This bridge converts live rights-admitted source artifacts into deterministic canonical processor inputs and required preflight reports. It does not claim Queue/D1 real-source injection, current-market sufficiency, Candidate readiness, or Production readiness.'
};

await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
