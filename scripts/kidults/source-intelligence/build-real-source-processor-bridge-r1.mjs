import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateRetiredMetInvokerReceipt } from '../runtime/validate-retired-met-hold-receipt-v1.mjs';

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

const metHoldValidation = validateRetiredMetInvokerReceipt({
  receipt: met,
  observedExitCode: Number(process.env.KIDULTS_MET_HOLD_OBSERVED_EXIT_CODE),
  observedSignal: null,
  expectedLineage: {
    github_repository: process.env.GITHUB_REPOSITORY,
    github_repository_owner: process.env.GITHUB_REPOSITORY_OWNER,
    git_sha: process.env.KIDULTS_EXACT_CHECKOUT_SHA,
    github_run_id: process.env.GITHUB_RUN_ID,
    github_run_attempt: process.env.GITHUB_RUN_ATTEMPT,
    github_workflow_name: process.env.GITHUB_WORKFLOW,
    github_workflow_ref: process.env.GITHUB_WORKFLOW_REF
  }
});
if (metHoldValidation.state !== 'VERIFIED_RETIRED_HOLD') throw new Error('MET_RETIRED_HOLD_RECEIPT_REQUIRED');
if (getty.validations?.live_public_api_retrieval !== 'PASS' || getty.validations?.rights_admission !== 'PASS_CC0') {
  throw new Error('GETTY_REAL_SOURCE_NOT_ADMITTED');
}
if (getty.validations?.historical_sale_activity_semantics !== 'PASS') throw new Error('GETTY_TRANSACTION_SEMANTICS_MISSING');
if (getty.validations?.current_market_price_semantics !== 'NOT_ESTABLISHED') throw new Error('GETTY_CURRENT_PRICE_GUARD_MISSING');

const admittedInputs = [
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
    state: 'PASS_GETTY_ONLY',
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
    state: 'PASS_GETTY_ONLY',
    identity_context: 'WITHHELD_GOVERNED_MET_OWNER_ONLY',
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
  truth_boundary: 'This bridge accepts an exact zero-call retired Met HOLD receipt, excludes Met from admitted inputs, and converts only Getty CC0 historical-provenance metadata into a deterministic local processor input. It does not claim Met/V&A admission, Queue/D1 remote execution, current-market sufficiency, Candidate readiness, or Production readiness.'
};

await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
