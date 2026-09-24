import crypto from 'node:crypto';

const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ROLE = new Set(['ACCOUNTABLE_TRACK_AGENT', 'KPMO', 'INDEPENDENT_VERIFIER', 'FINALIZER']);

export class AutonomousLandingError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'AutonomousLandingError';
    this.code = code;
  }
}

const fail = (code, detail = '') => { throw new AutonomousLandingError(code, detail); };
const canonicalize = value => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonicalize(value[key])]),
  );
  return value;
};
export const canonicalJson = value => JSON.stringify(canonicalize(value));
export const sha256 = value => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;

export const assertAutonomousFileScope = ({files, policy, errorCode='AUTONOMOUS_OWNER_RESERVED_ACTION'}) => {
  if (!Array.isArray(files) || !policy) fail('AUTONOMOUS_CHANGED_FILE_SET_INVALID');
  const exceptions=new Set(policy.delegated_internal_exact_path_exceptions||[]);
  const exactReserved=new Set(policy.owner_reserved_exact_paths||[]);
  const prefixes=policy.owner_reserved_path_prefixes||[];
  const delegatedPrefixes=policy.delegated_internal_path_prefixes||[];
  const addedPatterns=(policy.owner_reserved_added_patch_patterns||[]).map(value=>new RegExp(value,'im'));
  for (const file of files) {
    const filename=typeof file==='string'?file:file?.filename;
    if (typeof filename!=='string'||!filename||filename.startsWith('/')||filename.includes('..')) fail('AUTONOMOUS_CHANGED_FILE_PATH_INVALID');
    if (exactReserved.has(filename)||prefixes.some(prefix=>filename.startsWith(prefix))) fail(errorCode,filename);
    const delegated=delegatedPrefixes.some(prefix=>filename.startsWith(prefix));
    if (!delegated && !exceptions.has(filename)) continue;
    const patch=typeof file==='object'?file.patch:null;
    if (typeof patch!=='string'||!patch) fail('AUTONOMOUS_OWNER_RESERVED_CLASSIFICATION_UNKNOWN',filename);
    const lines=patch.split('\n');
    const additions=lines.filter(line=>line.startsWith('+')&&!line.startsWith('+++')).map(line=>line.slice(1)).join('\n');
    const removals=lines.filter(line=>line.startsWith('-')&&!line.startsWith('---')).map(line=>line.slice(1));
    const materialRemoval=removals.find(line=>line.trim()&&!/^\s*(#|\/\/|\/\*|\*|<!--)/.test(line));
    if (materialRemoval) fail(errorCode,`${filename}:MATERIAL_DELETION_REQUIRES_OWNER`);
    const matched=addedPatterns.find(pattern=>pattern.test(additions));
    if (matched) fail(errorCode,`${filename}:${matched.source}`);
  }
  return files.map(value=>typeof value==='string'?value:value.filename).sort();
};

export const collectPaginatedApiValues = async ({request,endpoint,pageSize=100,maxPages=100}) => {
  if (typeof request !== 'function' || !endpoint || !Number.isInteger(pageSize) || pageSize < 1 || !Number.isInteger(maxPages) || maxPages < 1) {
    fail('AUTONOMOUS_PAGINATION_ARGUMENT_INVALID');
  }
  const values=[];
  for (let page=1; page<=maxPages; page+=1) {
    const separator=endpoint.includes('?') ? '&' : '?';
    const batch=await request(`${endpoint}${separator}per_page=${pageSize}&page=${page}`);
    if (!Array.isArray(batch)) fail('AUTONOMOUS_PAGINATION_RESPONSE_INVALID');
    values.push(...batch);
    if (batch.length < pageSize) return values;
  }
  fail('AUTONOMOUS_PAGINATION_LIMIT_EXCEEDED');
};

export const validateLiveChangedPaths = ({files,expectedPaths,expectedScopeDigest,policy,ownerReservedPathPrefixes,delegatedInternalExactPathExceptions,scopeDriftCode='AUTONOMOUS_LIVE_SCOPE_DRIFT'}) => {
  if (!Array.isArray(files) || !Array.isArray(expectedPaths)) fail('AUTONOMOUS_CHANGED_FILE_SET_INVALID');
  const livePaths=files.map(value=>value?.filename);
  if (livePaths.some(value=>typeof value!=='string'||!value)) fail('AUTONOMOUS_CHANGED_FILE_PATH_INVALID');
  const ordered=[...livePaths].sort();
  const expected=[...expectedPaths].sort();
  if (ordered.length!==expected.length || ordered.some((value,index)=>value!==expected[index])) fail('AUTONOMOUS_CHANGED_FILE_SET_DRIFT');
  if (sha256(ordered.join('\n'))!==expectedScopeDigest) fail(scopeDriftCode);
  if (policy) assertAutonomousFileScope({files,policy});
  else {
    const exceptions=new Set(delegatedInternalExactPathExceptions||[]);
    for (const prefix of ownerReservedPathPrefixes||[]) {
      const reserved=ordered.find(value=>value.startsWith(prefix)&&!exceptions.has(value));
      if (reserved) fail('AUTONOMOUS_OWNER_RESERVED_PATH',reserved);
    }
  }
  return ordered;
};

export function validateWorkload(workload, registry, expectedRole) {
  if (!ROLE.has(expectedRole)) fail('AUTONOMOUS_ROLE_INVALID');
  const fields = ['workload_id','environment','workflow_ref','workflow_sha','repository_id','signing_key_arn'];
  for (const field of fields) if (workload?.[field] === undefined || workload?.[field] === null || workload?.[field] === '') {
    fail('AUTONOMOUS_WORKLOAD_FIELD_MISSING', field);
  }
  if (!SHA.test(String(workload.workflow_sha))) fail('AUTONOMOUS_WORKLOAD_WORKFLOW_SHA_INVALID');
  if (!/^arn:aws:kms:[a-z0-9-]+:[0-9]{12}:key\/[0-9a-f-]{36}$/.test(String(workload.signing_key_arn))) {
    fail('AUTONOMOUS_WORKLOAD_SIGNING_KEY_INVALID');
  }
  const candidate = registry?.workloads?.find(value => value.role === expectedRole
    && value.workload_id === workload.workload_id
    && value.environment === workload.environment
    && String(value.repository_id) === String(workload.repository_id)
    && value.workflow_ref === workload.workflow_ref
    && value.signing_key_arn === workload.signing_key_arn);
  if (!candidate) fail('AUTONOMOUS_WORKLOAD_NOT_ALLOWLISTED');
  return {role: expectedRole, stable_id: workload.workload_id, signing_key_arn: workload.signing_key_arn};
}

export function deriveApprovalDecision({envelope, role, statuses = [], checks = []}) {
  if (!ROLE.has(role) || role === 'FINALIZER') fail('AUTONOMOUS_DECISION_ROLE_INVALID');
  if (!Array.isArray(statuses) || !Array.isArray(checks) || (!statuses.length && !checks.length)) fail('AUTONOMOUS_DECISION_EVIDENCE_MISSING');
  const normalizedStatuses=statuses.map(value=>({context:String(value.context),state:String(value.state)})).sort((a,b)=>a.context.localeCompare(b.context));
  const normalizedChecks=checks.map(value=>({name:String(value.name),status:String(value.status),conclusion:String(value.conclusion)})).sort((a,b)=>a.name.localeCompare(b.name));
  if (normalizedStatuses.some(value=>value.state!=='success') || normalizedChecks.some(value=>value.status!=='completed'||value.conclusion!=='success')) {
    fail('AUTONOMOUS_DECISION_EVIDENCE_NOT_GREEN');
  }
  const testEvidence={
    source:'GITHUB_LIVE_REQUIRED_CHECKS',result:'PASS',
    statuses:normalizedStatuses,checks:normalizedChecks,
  };
  testEvidence.artifact_digest=sha256(canonicalJson({statuses:normalizedStatuses,checks:normalizedChecks}));
  const rollbackPlan={
    source:'GITHUB_LIVE_EXACT_BINDING',strategy:'REVERT_MERGE_COMMIT',verified:true,
    base_sha:envelope.base_sha,head_tree_sha:envelope.head_tree_sha,
  };
  const decisionCore={
    role,state:role==='INDEPENDENT_VERIFIER'?'VERIFIED_PASS':'AUTHORIZED',
    repository:envelope.repository,pull_request:Number(envelope.pull_request),base_sha:envelope.base_sha,
    head_sha:envelope.head_sha,head_tree_sha:envelope.head_tree_sha,scope_digest:envelope.scope_digest,
    test_evidence_digest:sha256(canonicalJson(testEvidence)),rollback_digest:sha256(canonicalJson(rollbackPlan)),
  };
  return {
    ...envelope,
    test_evidence:testEvidence,test_evidence_digest:decisionCore.test_evidence_digest,
    rollback_plan:rollbackPlan,rollback_digest:decisionCore.rollback_digest,
    decision:{...decisionCore,decision_digest:sha256(canonicalJson(decisionCore))},
    ...(role==='INDEPENDENT_VERIFIER'?{verification_state:'VERIFIED_PASS'}:{}),
  };
}

export function validateEnvelope(envelope, {policy, now = Date.now()} = {}) {
  if (!policy || policy.id !== 'kidults-autonomous-internal-landing-policy-v1') fail('AUTONOMOUS_POLICY_INVALID');
  const exact = policy.exact_binding_fields || [];
  for (const field of exact) if (envelope?.[field] === undefined || envelope?.[field] === null || envelope?.[field] === '') {
    fail('AUTONOMOUS_BINDING_FIELD_MISSING', field);
  }
  for (const field of ['base_sha','head_sha','head_tree_sha']) if (!SHA.test(String(envelope[field]))) {
    fail('AUTONOMOUS_SHA_INVALID', field);
  }
  for (const field of ['scope_digest','test_evidence_digest','rollback_digest','nonce_digest']) if (!DIGEST.test(String(envelope[field]))) {
    fail('AUTONOMOUS_DIGEST_INVALID', field);
  }
  if (!envelope.test_evidence || typeof envelope.test_evidence !== 'object' || Array.isArray(envelope.test_evidence)) {
    fail('AUTONOMOUS_TEST_EVIDENCE_OBJECT_REQUIRED');
  }
  if (!envelope.rollback_plan || typeof envelope.rollback_plan !== 'object' || Array.isArray(envelope.rollback_plan)) {
    fail('AUTONOMOUS_ROLLBACK_PLAN_OBJECT_REQUIRED');
  }
  if (sha256(canonicalJson(envelope.test_evidence)) !== envelope.test_evidence_digest) {
    fail('AUTONOMOUS_TEST_EVIDENCE_DIGEST_MISMATCH');
  }
  if (envelope.test_evidence.result !== 'PASS' || !DIGEST.test(String(envelope.test_evidence.artifact_digest || ''))) {
    fail('AUTONOMOUS_TEST_EVIDENCE_NOT_PASS');
  }
  if (sha256(canonicalJson(envelope.rollback_plan)) !== envelope.rollback_digest) {
    fail('AUTONOMOUS_ROLLBACK_DIGEST_MISMATCH');
  }
  if (envelope.rollback_plan.verified !== true) fail('AUTONOMOUS_ROLLBACK_NOT_VERIFIED');
  if (envelope.operation !== policy.delegated_operation) fail('AUTONOMOUS_OPERATION_NOT_DELEGATED');
  if (envelope.production !== 'HOLD' || envelope.public !== 'HOLD' || envelope.g5 !== 'HOLD') fail('AUTONOMOUS_HOLD_WEAKENED');
  const issued = Date.parse(envelope.issued_at);
  const expires = Date.parse(envelope.expires_at);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued > now || expires <= now) fail('AUTONOMOUS_AUTHORITY_EXPIRED');
  if (expires - issued > Number(policy.durable_single_use.maximum_ttl_seconds) * 1000) fail('AUTONOMOUS_AUTHORITY_TTL_EXCEEDED');
  const paths = envelope.changed_paths;
  if (!Array.isArray(paths) || !paths.length || paths.some(path => typeof path !== 'string' || path.startsWith('/') || path.includes('..'))) {
    fail('AUTONOMOUS_SCOPE_PATH_INVALID');
  }
  const exceptions = new Set(policy.delegated_internal_exact_path_exceptions || []);
  const exactReserved = new Set(policy.owner_reserved_exact_paths || []);
  for (const path of paths) {
    if (exceptions.has(path)) continue;
    if (exactReserved.has(path) || (policy.owner_reserved_path_prefixes || []).some(prefix=>path.startsWith(prefix))) {
      fail('AUTONOMOUS_OWNER_RESERVED_ACTION', path);
    }
  }
  const expectedScope = sha256([...paths].sort().join('\n'));
  if (expectedScope !== envelope.scope_digest) fail('AUTONOMOUS_SCOPE_DIGEST_MISMATCH');
  return {...envelope, changed_paths:[...paths].sort()};
}

export function validateQuorum({track, kpmo, verifier, registry, policy, now = Date.now()}) {
  const envelopes = [track, kpmo, verifier].map(value => validateEnvelope(value, {policy, now}));
  const tuple = ['repository_id','repository','pull_request','base_sha','head_sha','head_tree_sha','scope_digest',
    'test_evidence_digest','rollback_digest','authorization_generation','nonce_digest','issued_at','expires_at'];
  for (const field of tuple) if (!envelopes.every(value => String(value[field]) === String(envelopes[0][field]))) {
    fail('AUTONOMOUS_QUORUM_BINDING_MISMATCH', field);
  }
  if (new Set(envelopes.map(value => value.workload?.workflow_sha)).size !== 1) fail('AUTONOMOUS_WORKLOAD_SHA_QUORUM_MISMATCH');
  const identities = [
    validateWorkload(track.workload, registry, 'ACCOUNTABLE_TRACK_AGENT'),
    validateWorkload(kpmo.workload, registry, 'KPMO'),
    validateWorkload(verifier.workload, registry, 'INDEPENDENT_VERIFIER'),
  ];
  if (new Set(identities.map(value => value.stable_id)).size !== identities.length) fail('AUTONOMOUS_WORKLOAD_SEPARATION_FAILED');
  if (new Set(identities.map(value => value.signing_key_arn)).size !== identities.length) fail('AUTONOMOUS_SIGNING_KEY_SEPARATION_FAILED');
  if (new Set(envelopes.map(value => value.workload?.workflow_ref)).size !== identities.length) fail('AUTONOMOUS_WORKFLOW_REF_SEPARATION_FAILED');
  if (new Set(envelopes.map(value => value.workload?.environment)).size !== identities.length) fail('AUTONOMOUS_ENVIRONMENT_SEPARATION_FAILED');
  if (verifier.verification_state !== 'VERIFIED_PASS') fail('AUTONOMOUS_INDEPENDENT_VERIFICATION_NOT_PASS');
  for (const [role,value] of [['ACCOUNTABLE_TRACK_AGENT',track],['KPMO',kpmo],['INDEPENDENT_VERIFIER',verifier]]) {
    const core=value.decision && Object.fromEntries(Object.entries(value.decision).filter(([key])=>key!=='decision_digest'));
    if (!core || value.decision.role!==role || value.decision.decision_digest!==sha256(canonicalJson(core))) fail('AUTONOMOUS_DERIVED_DECISION_INVALID',role);
    if (value.test_evidence?.source!=='GITHUB_LIVE_REQUIRED_CHECKS' || value.rollback_plan?.source!=='GITHUB_LIVE_EXACT_BINDING') fail('AUTONOMOUS_CALLER_ASSERTION_NOT_REPLACED',role);
  }
  return {
    state: 'INDEPENDENT_VERIFIED',
    binding: Object.fromEntries(tuple.map(field => [field, envelopes[0][field]])),
    workloads: identities,
    quorum_digest: sha256(envelopes.map(value => sha256(canonicalJson(value))).sort().join('\n')),
    production: 'HOLD', public: 'HOLD', g5: 'HOLD',
  };
}

export function validateRecoveryGeneration({prior, current, history = [], policy, now = Date.now()}) {
  if (!prior || !current || !policy?.bounded_recovery) fail('AUTONOMOUS_RECOVERY_CONTEXT_REQUIRED');
  const recovery=current.recovery;
  if (!recovery || typeof recovery!=='object' || Array.isArray(recovery)) fail('AUTONOMOUS_RECOVERY_BINDING_REQUIRED');
  const attempt=Number(recovery.attempt);
  if (!Number.isInteger(attempt) || attempt<2 || attempt>Number(policy.bounded_recovery.maximum_attempts)) fail('AUTONOMOUS_RECOVERY_ATTEMPT_INVALID');
  if (Number(prior.recovery?.attempt || 1)!==attempt-1) fail('AUTONOMOUS_RECOVERY_ATTEMPT_SEQUENCE_INVALID');
  if (recovery.prior_authorization_generation!==prior.authorization_generation || recovery.prior_head_sha!==prior.head_sha) fail('AUTONOMOUS_RECOVERY_PARENT_BINDING_INVALID');
  if (current.authorization_generation===prior.authorization_generation || current.head_sha===prior.head_sha) fail('AUTONOMOUS_RECOVERY_GENERATION_NOT_ADVANCED');
  for (const field of ['repository_id','repository','pull_request','base_sha','head_tree_sha','scope_digest','test_evidence_digest','rollback_digest','nonce_digest','operation']) {
    if (String(current[field])!==String(prior[field])) fail('AUTONOMOUS_RECOVERY_SCOPE_DRIFT',field);
  }
  if (Date.parse(current.issued_at)<Date.parse(prior.issued_at) || Date.parse(current.expires_at)!==Date.parse(prior.expires_at) || Date.parse(current.expires_at)<=now) fail('AUTONOMOUS_RECOVERY_LIFETIME_INVALID');
  if (!new Set(['PRE_MUTATION_FAILED','DRAFT_REBOUND','CHECKS_REBOUND']).has(recovery.prior_terminal_state)) fail('AUTONOMOUS_RECOVERY_PRIOR_STATE_INELIGIBLE');
  if (history.some(value=>value.authorization_generation===current.authorization_generation)) fail('AUTONOMOUS_RECOVERY_GENERATION_DUPLICATE');
  if (history.some(value=>value.authorization_generation===prior.authorization_generation && ['RESERVED','CONSUMED'].includes(value.state))) fail('AUTONOMOUS_RECOVERY_PRIOR_AUTHORITY_ALREADY_USED');
  return {state:'RECOVERY_GENERATION_VERIFIED',attempt,prior_authorization_generation:prior.authorization_generation,authorization_generation:current.authorization_generation,head_sha:current.head_sha,head_tree_sha:current.head_tree_sha};
}

export function validateDraftReadyRebind({before, after, envelope, policy}) {
  if (policy?.bounded_recovery?.draft_ready_rebind !== 'AUTOMATIC') fail('AUTONOMOUS_DRAFT_READY_REBIND_NOT_AUTHORIZED');
  if (!envelope?.recovery) fail('AUTONOMOUS_DRAFT_READY_RECOVERY_REQUIRED');
  if (!before || before.state !== 'open' || before.merged === true || before.draft !== true) fail('AUTONOMOUS_DRAFT_READY_SOURCE_INVALID');
  if (!after || after.state !== 'open' || after.merged === true || after.draft !== false) fail('AUTONOMOUS_DRAFT_READY_TARGET_INVALID');
  for (const [label, candidate] of [['SOURCE', before], ['TARGET', after]]) {
    if (String(candidate.number) !== String(envelope.pull_request)) fail(`AUTONOMOUS_DRAFT_READY_${label}_PR_MISMATCH`);
    if (candidate.head?.sha !== envelope.head_sha) fail(`AUTONOMOUS_DRAFT_READY_${label}_HEAD_DRIFT`);
    if (candidate.base?.sha !== envelope.base_sha) fail(`AUTONOMOUS_DRAFT_READY_${label}_BASE_DRIFT`);
  }
  if (!before.node_id || before.node_id !== after.node_id) fail('AUTONOMOUS_DRAFT_READY_IDENTITY_DRIFT');
  return {
    state:'DRAFT_READY_REBOUND',
    pull_request:Number(envelope.pull_request),
    node_id:before.node_id,
    head_sha:envelope.head_sha,
    head_tree_sha:envelope.head_tree_sha,
    authorization_generation:envelope.authorization_generation,
    recovery_attempt:Number(envelope.recovery.attempt),
  };
}

export function buildTerminalReceipt({quorum, reservation, merge, postmerge, now = new Date().toISOString()}) {
  if (reservation?.state !== 'CONSUMED' || reservation?.conditional_write !== true) fail('AUTONOMOUS_NONCE_NOT_CONSUMED');
  if (!SHA.test(String(merge?.merge_sha)) || merge?.main_sha !== merge.merge_sha) fail('AUTONOMOUS_LIVE_MAIN_MISMATCH');
  if (merge?.head_sha !== quorum.binding.head_sha || merge?.tree_sha !== quorum.binding.head_tree_sha) fail('AUTONOMOUS_MERGE_BINDING_MISMATCH');
  if (postmerge?.state !== 'VERIFIED_PASS') fail('AUTONOMOUS_POSTMERGE_NOT_PASS');
  const core = {
    id:'kidults-autonomous-internal-landing-terminal-receipt-v1', version:'1.0.0', state:'RECEIPT_SEALED',
    binding:quorum.binding, quorum_digest:quorum.quorum_digest, workloads:quorum.workloads,
    lifecycle:quorum.lifecycle || {state:'ALREADY_READY',head_sha:quorum.binding.head_sha},
    durable_reservation:reservation, merge, postmerge, production:'HOLD', public:'HOLD', g5:'HOLD',
    usb_copy_a:'PENDING_PHYSICAL_MEDIA', created_at:now,
  };
  return {...core, receipt_digest:sha256(canonicalJson(core))};
}
