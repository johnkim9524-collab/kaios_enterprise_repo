import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const matrixPath = process.argv[2] || '/tmp/global-data-acquisition-master-matrix-v1.json';
const outPath = process.argv[3] || '/tmp/asi-autonomous-action-queue-v1.json';
const matrix = JSON.parse(await fs.readFile(matrixPath, 'utf8'));
const control = JSON.parse(await fs.readFile('coordination/kidults/source-intelligence/asi-self-driving-control-loop-v1.json', 'utf8'));
const registry = JSON.parse(await fs.readFile('coordination/kidults/source-intelligence/asi-autonomous-safe-action-registry-v1.json', 'utf8'));
const sha = v => `sha256:${createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;

if (matrix.production !== 'HOLD' || control.production !== 'HOLD' || registry.production !== 'HOLD') throw new Error('PRODUCTION_BOUNDARY');
if (!Array.isArray(matrix.evidence_bindings) || matrix.evidence_bindings.length !== 4352) throw new Error('MATRIX_ROWS');

const forbidden = (registry.forbidden_command_patterns || []).map(x => String(x).toLowerCase());
for (const a of registry.actions || []) {
  if (!a.action_id || !a.action_type || !a.command || a.reversible !== true) throw new Error(`SAFE_ACTION_SCHEMA:${a.action_id || 'UNKNOWN'}`);
  if (a.rights_state !== 'ALLOW') throw new Error(`SAFE_ACTION_RIGHTS:${a.action_id}`);
  if (!['ADMITTED_INTERNAL_CONTROL_PLANE','EXPLICIT_BOUNDED_SHADOW_ADMISSION'].includes(a.admission_state)) throw new Error(`SAFE_ACTION_ADMISSION:${a.action_id}`);
  if (forbidden.some(p => a.command.toLowerCase().includes(p))) throw new Error(`FORBIDDEN_COMMAND:${a.action_id}`);
}

const priorityCfg = control.priority || {};
const score = r => Number(r.priority_score || 0)
  + (r.coverage_debt_state === 'OPEN' ? Number(priorityCfg.coverage_debt_bonus || 0) : 0)
  + (r.rights_state === 'ALLOW' ? Number(priorityCfg.rights_ready_bonus || 0) : 0)
  + (r.admission_state === 'ADMITTED' ? Number(priorityCfg.admission_ready_bonus || 0) : 0)
  + (['DEV','SHADOW','STAGING'].includes(r.runtime_state) ? Number(priorityCfg.runtime_ready_bonus || 0) : 0)
  - (r.evidence_state === 'VERIFIED_BOUNDED' ? Number(priorityCfg.verified_evidence_penalty || 0) : 0);

function decisionClass(r) {
  if (r.production === 'PRODUCTION' || r.runtime_state === 'PRODUCTION') return 'BLOCKED_PRODUCTION_OR_PUBLIC';
  if (r.evidence_state === 'VERIFIED_BOUNDED' && r.claim_state !== 'NOT_VERIFIED') return 'COMPLETE_BOUNDED';
  if (r.rights_state === 'BLOCKED') return 'WAIT_RIGHTS_OR_TERMS';
  if (r.rights_state === 'CONDITIONAL') return 'WAIT_RIGHTS_OR_TERMS';
  if (r.rights_state === 'UNASSESSED') return 'AUTO_BUILD_RIGHTS_REVIEW_PACKET';
  if (r.rights_state === 'ALLOW' && r.admission_state === 'NOT_ADMITTED') return 'WAIT_RIGHTS_OR_TERMS';
  if (r.rights_state === 'ALLOW' && r.admission_state === 'ADMITTED' && ['DEV','SHADOW','STAGING'].includes(r.runtime_state)) return 'AUTO_EXECUTE_SAFE';
  return 'WAIT_RIGHTS_OR_TERMS';
}

const dedupe = new Map();
for (const r of matrix.evidence_bindings) {
  const key = `${r.category_scope}::${r.macroregion_id}::${r.evidence_class}`;
  const candidate = {
    action_candidate_id: `acq-action::${key}`,
    category_scope: r.category_scope,
    macroregion_id: r.macroregion_id,
    evidence_class: r.evidence_class,
    sourcing_channel: r.sourcing_channel,
    source_role: r.source_role,
    decision_class: decisionClass(r),
    priority_score: score(r),
    rights_state: r.rights_state,
    admission_state: r.admission_state,
    runtime_state: r.runtime_state,
    evidence_state: r.evidence_state,
    coverage_debt_state: r.coverage_debt_state,
    claim_ceiling: r.claim_ceiling,
    next_action: r.next_action,
    production: 'HOLD'
  };
  const prev = dedupe.get(key);
  if (!prev || candidate.priority_score > prev.priority_score || (candidate.priority_score === prev.priority_score && candidate.sourcing_channel < prev.sourcing_channel)) dedupe.set(key, candidate);
}

const candidates = [...dedupe.values()].sort((a,b) => b.priority_score - a.priority_score || a.action_candidate_id.localeCompare(b.action_candidate_id));
const top = candidates.slice(0, 100);
const rightsReview = top.filter(x => x.decision_class === 'AUTO_BUILD_RIGHTS_REVIEW_PACKET').slice(0, 64).map((x,i) => ({
  review_packet_id: `rights-review-${String(i+1).padStart(3,'0')}`,
  ...x,
  allowed_automatic_work: ['COMPILE_PURPOSE_SPECIFIC_SOURCE_REQUIREMENT','SEARCH_EXISTING_REPOSITORY_DECLARATIONS','PREPARE_RIGHTS_CHECKLIST'],
  forbidden_automatic_work: ['ACCEPT_TERMS','CREATE_ACCOUNT','CONTACT_PROVIDER','COLLECT_SOURCE_PAYLOAD_WITHOUT_RIGHTS_ALLOW']
}));

const safeActions = (registry.actions || []).map(a => ({
  action_id: a.action_id,
  action_type: a.action_type,
  command: a.command,
  decision_class: 'AUTO_EXECUTE_SAFE',
  network: Boolean(a.network),
  rights_state: a.rights_state,
  admission_state: a.admission_state,
  reversible: true,
  production: 'HOLD'
}));

const counts = {};
for (const c of candidates) counts[c.decision_class] = (counts[c.decision_class] || 0) + 1;
const artifact = {
  id: 'kidults-asi-autonomous-action-queue-v1',
  version: control.version,
  status: 'SHADOW_AUTONOMOUS_ACTION_QUEUE_READY',
  generated_at: 'DETERMINISTIC_FROM_CURRENT_MATRIX_AND_ALLOWLIST',
  matrix_id: matrix.id,
  matrix_input_digest: matrix.input_digest,
  queue_digest: sha({ candidates: top, safeActions, rightsReview }),
  total_deduped_acquisition_demands: candidates.length,
  top_priority_count: top.length,
  decision_class_counts: counts,
  safe_execution_actions: safeActions,
  top_priority_actions: top,
  rights_review_queue: rightsReview,
  external_gate_queue: top.filter(x => ['WAIT_RIGHTS_OR_TERMS','WAIT_ACCOUNT_OR_CONTRACT','WAIT_HUMAN_REVIEW','BLOCKED_PRODUCTION_OR_PUBLIC'].includes(x.decision_class)),
  control_loop: control.loop,
  public_release: 'HOLD',
  production: 'HOLD',
  truth_boundary: control.truth_boundary
};

await fs.writeFile(outPath, JSON.stringify(artifact, null, 2) + '\n');
console.log(JSON.stringify({
  status: artifact.status,
  total_deduped_acquisition_demands: artifact.total_deduped_acquisition_demands,
  top_priority_count: artifact.top_priority_count,
  rights_review_packets: artifact.rights_review_queue.length,
  safe_execution_actions: artifact.safe_execution_actions.length,
  decision_class_counts: artifact.decision_class_counts,
  production: artifact.production
}, null, 2));
