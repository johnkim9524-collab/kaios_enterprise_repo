import fs from 'node:fs';
import path from 'node:path';
import { AutonomousRuntime, MemoryTransitionLedger } from './lib/autonomous-runtime-v1.mjs';
import { AwsDurabilityBoundary, MockImmutableStore, deterministicFixtureEd25519 } from './lib/aws-durability-v1.mjs';
import { idFrom, sha256 } from './lib/canonical-v1.mjs';
import { ProviderControl, ShadowFetchBroker } from './lib/provider-control-v1.mjs';

const observedAt = '2026-09-21T16:00:00.000Z';
const nowMs = Date.parse(observedAt);
const mainSha = process.env.TARGET_MAIN_SHA ?? '598ebea42f14730e1227c4af711238ff8b0d30b5';
const approval = (role, taskId, approverId) => ({
  approval_id: idFrom('approval', { role, task_id: taskId, approver_id: approverId }),
  approver_id: approverId, role, task_id: taskId, expires_at: '2026-09-21T17:00:00.000Z',
});
const request = taskId => ({
  task_id: taskId,
  provider_id: 'fixture-open-metadata',
  policy_version: 'provider-control-staging-v1',
  rights: { snapshot_id: `rights:${taskId}`, expires_at: '2026-09-22T16:00:00.000Z' },
  approval_a: approval('TRACK_A', taskId, `track-a-${taskId}`),
  approval_z: approval('TRACK_Z', taskId, `track-z-${taskId}`),
  environment: 'STAGING', production: 'HOLD', public: 'HOLD', g5: 'HOLD',
});

const ledger = new MemoryTransitionLedger();
const store = new MockImmutableStore();
const keys = deterministicFixtureEd25519();
const results = [];
const brokers = [];
for (let index = 1; index <= 3; index += 1) {
  const taskId = `shadow-cycle-${index}`;
  const broker = new ShadowFetchBroker({ fixture: { record_id: `fixture-${index}`, synthetic: true } });
  brokers.push(broker);
  const runtime = new AutonomousRuntime({
    now: () => nowMs + index,
    ledger,
    providerControl: new ProviderControl({
      now: () => nowMs + index,
      providers: [{ provider_id: 'fixture-open-metadata', kill_switch: false }],
    }),
    broker,
    durability: new AwsDurabilityBoundary({ store, ...keys, mainSha }),
  });
  results.push(runtime.tick(request(taskId)));
}

const receipt = {
  id: 'kidults-staging-shadow-vertical-cycle-receipt-v1',
  observed_at: observedAt,
  execution_mode: 'LOCAL_SHADOW_NO_FETCH',
  protected_main_sha: mainSha,
  cycles: results,
  consecutive_complete_verified: results.filter(result => result.state === 'COMPLETE_VERIFIED').length,
  ledger_transition_count: ledger.transitions.length,
  ledger_evidence_one_to_one: results.every(result => ledger.rows(result.task_id).filter(row => row.state === 'COMPLETE_VERIFIED').length === 1),
  external_provider_requests: brokers.reduce((sum, broker) => sum + broker.externalCalls, 0),
  postgres_adapter: 'NOT_EXECUTED_LOCAL_MEMORY_CONTRACT_ONLY',
  aws_adapter: 'NOT_EXECUTED_LOCAL_ED25519_AND_IMMUTABLE_STORE_CONTRACT_ONLY',
  production: 'HOLD', public: 'HOLD', g5: 'HOLD', usb: 'PENDING_PHYSICAL_MEDIA',
  state: results.every(result => result.state === 'COMPLETE_VERIFIED') ? 'LOCAL_SHADOW_COMPLETE_VERIFIED' : 'VERIFIED_FAIL',
};
receipt.receipt_digest = sha256(receipt);
const outputPath = process.argv[2] ?? 'evidence/staging-operations/local-shadow-cycle-receipt-v1.json';
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ state: receipt.state, cycles: receipt.consecutive_complete_verified, receipt_digest: receipt.receipt_digest, output: outputPath }));
