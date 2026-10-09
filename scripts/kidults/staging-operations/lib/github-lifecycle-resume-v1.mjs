import {operationKey, resumeOperation} from './resume-operation-v1.mjs';
import {canonicalJson, sha256} from '../../kpmo/lib/canonical-json-v1.mjs';

const operations = new Set(['READY_FOR_REVIEW', 'OWNER_APPROVAL_COMMENT', 'WORKFLOW_DISPATCH', 'MERGE_PROTECTED_MAIN']);
const targetFields = ['base_sha', 'head_sha', 'head_tree_sha', 'pull_request', 'repository'];
const fail = code => { throw new Error(`GITHUB_LIFECYCLE_RESUME_DENIED:${code}`); };
function snapshot(value) {
  // Never hash a payload and subsequently execute a mutable caller object.
  const visiting = new Set();
  function validate(v) {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number' && Number.isFinite(v)) return;
    if (!v || typeof v !== 'object' || visiting.has(v)) fail('PAYLOAD_INVALID');
    if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype) fail('PAYLOAD_INVALID');
    visiting.add(v);
    if (Array.isArray(v)) {
      if (Object.keys(v).length !== v.length) fail('PAYLOAD_INVALID');
      for (const item of v) validate(item);
    } else {
      if (Reflect.ownKeys(v).length !== Object.keys(v).length) fail('PAYLOAD_INVALID');
      for (const item of Object.values(v)) validate(item);
    }
    visiting.delete(v);
  }
  validate(value);
  const text = canonicalJson(value);
  if (typeof text !== 'string') fail('PAYLOAD_INVALID');
  return JSON.parse(text);
}
export function githubLifecycleBinding({repository, rootMissionId, stageId, operation, target, payload}) {
  if (!operations.has(operation)) fail('OPERATION_INVALID');
  if (!target || Object.keys(target).sort().join(',') !== targetFields.join(',')
      || target.repository !== repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
      || !Number.isSafeInteger(target.pull_request) || target.pull_request < 1
      || ['base_sha', 'head_sha', 'head_tree_sha'].some(k => !/^[a-f0-9]{40}$/.test(target[k]))) fail('TARGET_INVALID');
  if (!payload || Object.getPrototypeOf(payload) !== Object.prototype) fail('PAYLOAD_INVALID');
  const exactPayload = snapshot(payload);
  const binding = {repository, root_mission_id: rootMissionId, stage_id: stageId,
    operation_kind: operation, exact_target: canonicalJson(target), payload_sha256: sha256(canonicalJson(exactPayload))};
  operationKey(binding);
  return binding;
}

// These adapters are supplied only by the authenticated protected executor.
// This module is not a public RPC handler, credential broker, or Owner identity.
// Native UI operations must retain the actual Owner actor; App events cannot be
// relabelled as Owner events. Deployment/transport authentication is separate.
export async function resumeGitHubLifecycle({repository, rootMissionId, stageId, operation, target, payload,
  owner, ledger, readExternal, authenticateReceipt, authorize, execute}) {
  if ([readExternal, authenticateReceipt, authorize, execute].some(v => typeof v !== 'function')) fail('PROTECTED_ADAPTER_MISSING');
  const exactTarget = snapshot(target), exactPayload = snapshot(payload);
  const binding = githubLifecycleBinding({repository, rootMissionId, stageId, operation, target: exactTarget, payload: exactPayload});
  const key = operationKey(binding);
  const context = () => ({operation, target: snapshot(exactTarget), payload: snapshot(exactPayload), binding: {...binding}, key});
  const verifyReceipt = async receipt => {
    if (!receipt || receipt.id !== 'kidults-github-lifecycle-operation-receipt-v1'
        || receipt.state !== 'SUCCESS' || receipt.operation_key !== key
        || canonicalJson(receipt.binding) !== canonicalJson(binding)
        || receipt.production !== 'HOLD' || receipt.public !== 'HOLD' || receipt.g5 !== 'HOLD') return false;
    // Schema/hash matching alone is never producer authentication.
    return await authenticateReceipt(receipt, context()) === true;
  };
  return resumeOperation({binding, owner, ledger,
    readExternal: () => readExternal(context()), verifyReceipt,
    authorize: () => authorize(context()), execute: () => execute(context())});
}
