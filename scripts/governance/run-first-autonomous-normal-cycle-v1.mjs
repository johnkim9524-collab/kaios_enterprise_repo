import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const fail = (code) => { throw new Error(code); };
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const canonical = (value) => JSON.stringify(value, Object.keys(value).sort());
const arg = (name) => {
  const prefix = `--${name}=`;
  const value = process.argv.find((entry) => entry.startsWith(prefix));
  return value?.slice(prefix.length);
};

const authorityPath = arg('authority-receipt');
const kpmoBootstrapMarkerPath = arg('kpmo-bootstrap-marker');
const trackBootstrapMarkerPath = arg('track-bootstrap-marker');
const scopeFilePath = arg('scope-file');
const ledgerRoot = arg('ledger-root');
const outputPath = arg('output');
const scenario = arg('scenario') ?? 'recover';
if (!authorityPath || !kpmoBootstrapMarkerPath || !trackBootstrapMarkerPath || !scopeFilePath || !ledgerRoot || !outputPath) fail('REQUIRED_ARGUMENT_MISSING');
if (!['success', 'recover', 'violation'].includes(scenario)) fail('SCENARIO_INVALID');

const authority = JSON.parse(fs.readFileSync(path.resolve(authorityPath), 'utf8'));
const kpmoBootstrap = JSON.parse(fs.readFileSync(path.resolve(kpmoBootstrapMarkerPath), 'utf8'));
const trackBootstrap = JSON.parse(fs.readFileSync(path.resolve(trackBootstrapMarkerPath), 'utf8'));
for (const marker of [kpmoBootstrap, trackBootstrap]) if (marker.id !== 'kidults-ai-agent-bootstrap-consumption-v1') fail('BOOTSTRAP_NOT_CONSUMED');
if (kpmoBootstrap.agent_id !== authority.kpmo_approval.agent_id) fail('KPMO_BOOTSTRAP_IDENTITY_MISMATCH');
if (trackBootstrap.agent_id !== authority.track_approval.agent_id) fail('TRACK_BOOTSTRAP_IDENTITY_MISMATCH');
if (kpmoBootstrap.session_id === trackBootstrap.session_id) fail('BOOTSTRAP_SESSIONS_NOT_DISTINCT');
if (authority.track_approval.agent_id === authority.kpmo_approval.agent_id) fail('APPROVER_IDENTITIES_NOT_DISTINCT');
for (const key of ['EXPECTED_REPOSITORY', 'EXPECTED_BASE_SHA', 'EXPECTED_HEAD_SHA', 'EXPECTED_HEAD_TREE_SHA', 'EXPECTED_SCOPE_DIGEST', 'EXPECTED_NONCE_DIGEST']) {
  if (!process.env[key]) fail(`${key}_REQUIRED`);
}

const gitHead = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8' });
const gitTree = spawnSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: process.cwd(), encoding: 'utf8' });
if (gitHead.status !== 0 || gitTree.status !== 0) fail('CURRENT_GIT_BINDING_UNAVAILABLE');
if (authority.head_sha !== gitHead.stdout.trim()) fail('CURRENT_HEAD_SHA_MISMATCH');
if (authority.head_tree_sha !== gitTree.stdout.trim()) fail('CURRENT_HEAD_TREE_SHA_MISMATCH');
if (authority.scope_digest !== sha256(fs.readFileSync(path.resolve(scopeFilePath)))) fail('CURRENT_SCOPE_DIGEST_MISMATCH');
const consume = spawnSync(process.execPath, ['scripts/governance/consume-delegated-autonomous-internal-authority-v1.mjs'], {
  cwd: process.cwd(), encoding: 'utf8',
  env: { ...process.env, DELEGATED_AUTHORITY_RECEIPT_PATH: path.resolve(authorityPath), DELEGATED_AUTHORITY_LEDGER_ROOT: ledgerRoot },
});
if (consume.status !== 0) fail('DELEGATED_AUTHORITY_NOT_CONSUMED');
const consumed = JSON.parse(consume.stdout);

const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-first-autonomous-cycle-'));
const target = path.join(taskRoot, 'reversible-state.json');
const original = Buffer.from('{"generation":0,"state":"BASELINE"}\n');
fs.writeFileSync(target, original, { flag: 'wx', mode: 0o600 });

const transitions = [];
const record = (state, detail, evidence = {}) => transitions.push({ sequence: transitions.length + 1, state, detail, ...evidence });
record('PLANNED', 'Exact-bound reversible internal task accepted.', { scope_digest: authority.scope_digest });
record('APPROVED', 'Distinct Track and KPMO approvals validated and authority consumed.', { authority_marker: consumed.marker });

let attempts = 0;
let rollbackVerified = false;
let replacementRequired = false;
let finalAgentId = authority.track_approval.agent_id;
const execute = (injectFailure) => {
  attempts += 1;
  const candidate = Buffer.from(`${JSON.stringify({ generation: attempts, state: 'CANDIDATE' })}\n`);
  fs.writeFileSync(target, candidate);
  record('EXECUTING', `Attempt ${attempts} wrote bounded candidate.`, { candidate_sha256: sha256(candidate) });
  if (injectFailure) fail('INJECTED_REVERSIBLE_FAILURE');
  return candidate;
};

if (scenario === 'violation') {
  record('VIOLATION_CONFIRMED', 'Synthetic red-team identity abandoned an executable bounded duty.', { violating_agent_id: authority.track_approval.agent_id });
  record('AGENT_QUARANTINED', 'Violating identity removed from this task; its output is rejected.');
  replacementRequired = true;
  finalAgentId = `${authority.track_approval.agent_id}-REPLACEMENT`;
  record('REPLACEMENT_BLOCKED', 'Replacement dispatch requires a distinct newly consumed bootstrap receipt.', { required_agent_id: finalAgentId });
} else {
  if (scenario === 'recover') {
    try { execute(true); } catch (error) {
      if (error.message !== 'INJECTED_REVERSIBLE_FAILURE') throw error;
      record('FAILURE_DETECTED', error.message);
      fs.writeFileSync(target, original);
      rollbackVerified = fs.readFileSync(target).equals(original);
      if (!rollbackVerified) fail('ROLLBACK_VERIFICATION_FAILED');
      record('ROLLED_BACK', 'Exact baseline bytes restored.', { baseline_sha256: sha256(original) });
    }
  }
  const finalBytes = execute(false);
  record('RECOVERED', 'Bounded task completed after verified recovery.', { final_sha256: sha256(finalBytes) });
  record('AUDITED', 'Terminal receipt constructed from ordered transition evidence.');
}

const terminalState = replacementRequired ? 'HOLD' : 'COMPLETE_VERIFIED';
const receiptBody = {
  id: 'kidults-first-autonomous-normal-cycle-receipt-v1', version: '1.0.0',
  state: terminalState, scenario, authorization_id: authority.authorization_id,
  repository: authority.repository, base_sha: authority.base_sha, head_sha: authority.head_sha,
  head_tree_sha: authority.head_tree_sha, scope_digest: authority.scope_digest,
  bootstrap_consumption: {
    kpmo: { agent_id: kpmoBootstrap.agent_id, task_id: kpmoBootstrap.task_id, session_id: kpmoBootstrap.session_id, consumed_at: kpmoBootstrap.consumed_at },
    track: { agent_id: trackBootstrap.agent_id, task_id: trackBootstrap.task_id, session_id: trackBootstrap.session_id, consumed_at: trackBootstrap.consumed_at },
  },
  accountable_track_agent_id: authority.track_approval.agent_id,
  kpmo_agent_id: authority.kpmo_approval.agent_id,
  final_agent_id: finalAgentId, attempts, rollback_verified: rollbackVerified,
  replacement_bootstrap_required: replacementRequired,
  transitions,
  evidence: {
    authority_consumption_marker_sha256: sha256(fs.readFileSync(consumed.marker)),
    final_task_state_sha256: sha256(fs.readFileSync(target)),
    transition_chain_sha256: sha256(canonical(transitions)),
  },
  truth_boundary: replacementRequired
    ? 'Deterministic red-team control proof only; no replacement agent was dispatched.'
    : 'Deterministic repository-internal reversible execution proof only; no Production, Public, G5, provider, or external-data action occurred.',
  production: 'HOLD', public: 'HOLD', g5: 'HOLD',
};
const receipt = { ...receiptBody, receipt_sha256: sha256(canonical(receiptBody)) };
fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ state: receipt.state, scenario, attempts, rollback_verified: rollbackVerified, replacement_bootstrap_required: replacementRequired, receipt: path.resolve(outputPath), production: 'HOLD', public: 'HOLD', g5: 'HOLD' }));
