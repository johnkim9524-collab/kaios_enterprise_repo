import { createHash, randomUUID } from 'node:crypto';

const WRITER_ID = 'kpmo-workflow-receipt-writer-v1';
const MAX_RESULT_BYTES = 256 * 1024;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const WORKFLOW_PATH = /^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/;
const HEAD_SHA = /^[0-9a-f]{40}$/;
const EVENT_NAME = /^[a-z][a-z0-9_]{0,63}$/;
const RECEIPT_TYPE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const CONCLUSIONS = new Set([
  'success', 'failure', 'cancelled', 'timed_out',
  'action_required', 'neutral', 'skipped', 'stale',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET_KEY = /authorization|cookie|credential|dsn|password|passwd|private[_-]?key|secret|token/i;
const SECRET_VALUE = /(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|(?:Bearer|Basic)\s+[A-Za-z0-9._~+\/-]+=*|postgres(?:ql)?:\/\/[^\s@]+@|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;

function fail(code) {
  throw new Error(code);
}

function boundedText(value, name, maximum = 255) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum) fail(`${name}_INVALID`);
  if (value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) fail(`${name}_INVALID`);
  return value;
}

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) fail(`${name}_INVALID`);
  return value;
}

function digest(value, name) {
  if (typeof value !== 'string' || !DIGEST.test(value)) fail(`${name}_INVALID`);
  return value;
}

function conclusion(value, name) {
  if (!CONCLUSIONS.has(value)) fail(`${name}_INVALID`);
  return value;
}

function instant(value, name) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.valueOf())) fail(`${name}_INVALID`);
  return parsed.toISOString();
}

function canonicalJson(value, ancestors = new Set()) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('RESULT_JSON_NONFINITE_NUMBER');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) fail('RESULT_JSON_CYCLIC');
    ancestors.add(value);
    const items = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) fail('RESULT_JSON_SPARSE_ARRAY');
      items.push(canonicalJson(value[index], ancestors));
    }
    ancestors.delete(value);
    return `[${items.join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail('RESULT_JSON_NONPLAIN_OBJECT');
    if (ancestors.has(value)) fail('RESULT_JSON_CYCLIC');
    ancestors.add(value);
    if (Object.getOwnPropertySymbols(value).length) fail('RESULT_JSON_SYMBOL_KEY_DENIED');
    const result = `{${Object.keys(value).sort().map((key) => {
      if (value[key] === undefined) fail('RESULT_JSON_UNDEFINED_VALUE');
      return `${JSON.stringify(key)}:${canonicalJson(value[key], ancestors)}`;
    }).join(',')}}`;
    ancestors.delete(value);
    return result;
  }
  fail('RESULT_JSON_UNSUPPORTED_VALUE');
}

function hasSecretLikeMaterial(value) {
  if (typeof value === 'string') return SECRET_VALUE.test(value);
  if (Array.isArray(value)) return value.some(hasSecretLikeMaterial);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => SECRET_KEY.test(key) || hasSecretLikeMaterial(child));
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function normalizeArtifact(artifact, canonicalJobConclusion, observedAt) {
  if (artifact === undefined || artifact === null) {
    if (canonicalJobConclusion === 'success') fail('SUCCESS_ARTIFACT_REQUIRED');
    return { name: null, id: null, digest: null, expiresAt: null };
  }
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) fail('ARTIFACT_OBJECT_REQUIRED');
  const normalized = {
    name: boundedText(artifact.name, 'ARTIFACT_NAME'),
    id: positiveInteger(artifact.id, 'ARTIFACT_ID'),
    digest: digest(artifact.digest, 'ARTIFACT_DIGEST'),
    expiresAt: instant(artifact.expiresAt, 'ARTIFACT_EXPIRES_AT'),
  };
  if (Date.parse(normalized.expiresAt) <= Date.parse(observedAt)) fail('ARTIFACT_EXPIRED_OR_INVALID');
  return normalized;
}

function normalizeCanonicalBinding(binding) {
  if (binding === undefined || binding === null) {
    return { claimId: null, relation: null, bindingDigest: null };
  }
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) fail('CANONICAL_BINDING_OBJECT_REQUIRED');
  if (typeof binding.claimId !== 'string' || !UUID.test(binding.claimId)) fail('CANONICAL_CLAIM_ID_INVALID');
  if (!['LEADER', 'ALIAS'].includes(binding.relation)) fail('CANONICAL_RELATION_INVALID');
  return {
    claimId: binding.claimId,
    relation: binding.relation,
    bindingDigest: digest(binding.bindingDigest, 'CANONICAL_BINDING_DIGEST'),
  };
}

function normalizeInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('WORKFLOW_RECEIPT_INPUT_REQUIRED');
  const repository = boundedText(input.repository, 'REPOSITORY');
  if (!REPOSITORY.test(repository)) fail('REPOSITORY_INVALID');
  const workflowPath = boundedText(input.workflowPath, 'WORKFLOW_PATH');
  if (!WORKFLOW_PATH.test(workflowPath)) fail('WORKFLOW_PATH_INVALID');
  const eventName = boundedText(input.eventName, 'EVENT_NAME', 64);
  if (!EVENT_NAME.test(eventName)) fail('EVENT_NAME_INVALID');
  const headSha = boundedText(input.headSha, 'HEAD_SHA', 40);
  if (!HEAD_SHA.test(headSha)) fail('HEAD_SHA_INVALID');
  const receiptType = boundedText(input.receiptType, 'RECEIPT_TYPE', 128);
  if (!RECEIPT_TYPE.test(receiptType)) fail('RECEIPT_TYPE_INVALID');
  const receiptSchemaVersion = boundedText(input.receiptSchemaVersion, 'RECEIPT_SCHEMA_VERSION', 32);
  if (!SEMVER.test(receiptSchemaVersion)) fail('RECEIPT_SCHEMA_VERSION_INVALID');
  const workflowConclusion = conclusion(input.workflowConclusion, 'WORKFLOW_CONCLUSION');
  const canonicalJobConclusion = conclusion(input.canonicalJobConclusion, 'CANONICAL_JOB_CONCLUSION');
  const observedAt = instant(input.observedAt, 'OBSERVED_AT');
  if (!input.result || typeof input.result !== 'object' || Array.isArray(input.result)) fail('RESULT_JSON_OBJECT_REQUIRED');
  const resultJson = canonicalJson(input.result);
  if (hasSecretLikeMaterial(input.result)) fail('RESULT_SECRET_LIKE_MATERIAL_DENIED');
  if (Buffer.byteLength(resultJson, 'utf8') > MAX_RESULT_BYTES) fail('RESULT_JSON_TOO_LARGE');
  const artifact = normalizeArtifact(input.artifact, canonicalJobConclusion, observedAt);
  const canonicalBinding = normalizeCanonicalBinding(input.canonicalBinding);
  const normalized = {
    repository,
    workflowPath,
    workflowName: boundedText(input.workflowName, 'WORKFLOW_NAME'),
    workflowRunId: positiveInteger(input.workflowRunId, 'WORKFLOW_RUN_ID'),
    workflowRunAttempt: positiveInteger(input.workflowRunAttempt, 'WORKFLOW_RUN_ATTEMPT'),
    eventName,
    headBranch: boundedText(input.headBranch, 'HEAD_BRANCH'),
    headSha,
    workflowConclusion,
    canonicalJobConclusion,
    receiptType,
    receiptSchemaVersion,
    sourceReceiptDigest: digest(input.sourceReceiptDigest, 'SOURCE_RECEIPT_DIGEST'),
    canonicalBinding,
    artifact,
    resultState: boundedText(input.resultState, 'RESULT_STATE', 160),
    result: input.result,
    resultJson,
    resultDigest: sha256(resultJson),
    observedAt,
  };
  normalized.bindingDigest = sha256(canonicalJson({
    repository: normalized.repository,
    workflow_path: normalized.workflowPath,
    workflow_name: normalized.workflowName,
    workflow_run_id: normalized.workflowRunId,
    workflow_run_attempt: normalized.workflowRunAttempt,
    event_name: normalized.eventName,
    head_branch: normalized.headBranch,
    head_sha: normalized.headSha,
    workflow_conclusion: normalized.workflowConclusion,
    canonical_job_conclusion: normalized.canonicalJobConclusion,
    receipt_type: normalized.receiptType,
    receipt_schema_version: normalized.receiptSchemaVersion,
    source_receipt_digest: normalized.sourceReceiptDigest,
    canonical_claim_id: normalized.canonicalBinding.claimId,
    canonical_relation: normalized.canonicalBinding.relation,
    canonical_binding_digest: normalized.canonicalBinding.bindingDigest,
    artifact_name: normalized.artifact.name,
    artifact_id: normalized.artifact.id,
    artifact_digest: normalized.artifact.digest,
    artifact_expires_at: normalized.artifact.expiresAt,
    result_state: normalized.resultState,
    result_digest: normalized.resultDigest,
    observed_at: normalized.observedAt,
  }));
  return normalized;
}

function rowValue(row, key) {
  return row?.[key] ?? null;
}

function canonicalRowResult(row) {
  const value = rowValue(row, 'result_json');
  if (typeof value === 'string') {
    try { return canonicalJson(JSON.parse(value)); } catch { fail('WORKFLOW_RECEIPT_READBACK_RESULT_INVALID'); }
  }
  return canonicalJson(value);
}

function readbackMismatches(row, expected) {
  if (!row) return ['ROW_MISSING'];
  const scalar = [
    ['repository', expected.repository],
    ['workflow_path', expected.workflowPath],
    ['workflow_name', expected.workflowName],
    ['workflow_run_id', String(expected.workflowRunId)],
    ['workflow_run_attempt', String(expected.workflowRunAttempt)],
    ['event_name', expected.eventName],
    ['head_branch', expected.headBranch],
    ['head_sha', expected.headSha],
    ['workflow_conclusion', expected.workflowConclusion],
    ['canonical_job_conclusion', expected.canonicalJobConclusion],
    ['receipt_type', expected.receiptType],
    ['receipt_schema_version', expected.receiptSchemaVersion],
    ['source_receipt_digest', expected.sourceReceiptDigest],
    ['canonical_claim_id', expected.canonicalBinding.claimId],
    ['canonical_relation', expected.canonicalBinding.relation],
    ['canonical_binding_digest', expected.canonicalBinding.bindingDigest],
    ['artifact_name', expected.artifact.name],
    ['artifact_id', expected.artifact.id === null ? null : String(expected.artifact.id)],
    ['artifact_digest', expected.artifact.digest],
    ['result_state', expected.resultState],
    ['result_digest', expected.resultDigest],
    ['binding_digest', expected.bindingDigest],
    ['writer_id', WRITER_ID],
  ];
  const mismatches = scalar
    .filter(([key, value]) => {
      const observed = rowValue(row, key);
      return observed === null ? value !== null : String(observed) !== String(value);
    })
    .map(([key]) => key);
  for (const [key, value] of [
    ['artifact_expires_at', expected.artifact.expiresAt],
    ['observed_at', expected.observedAt],
  ]) {
    const observed = rowValue(row, key);
    const normalized = observed === null ? null : instant(observed, `READBACK_${key.toUpperCase()}`);
    if (normalized !== value) mismatches.push(key);
  }
  if (canonicalRowResult(row) !== expected.resultJson) mismatches.push('result_json');
  return mismatches;
}

function canonicalRelationRowMismatches(row, expected, relation) {
  if (!row) return ['ROW_MISSING'];
  const canonical = expected.canonicalBinding;
  const fields = relation === 'LEADER'
    ? [
        ['canonical_claim_id', canonical.claimId],
        ['repository', expected.repository],
        ['leader_workflow_path', expected.workflowPath],
        ['leader_workflow_run_id', expected.workflowRunId],
        ['leader_workflow_run_attempt', expected.workflowRunAttempt],
        ['leader_claim_binding_digest', canonical.bindingDigest],
      ]
    : [
        ['canonical_claim_id', canonical.claimId],
        ['parent_canonical_claim_id', canonical.claimId],
        ['repository', expected.repository],
        ['parent_repository', expected.repository],
        ['alias_workflow_path', expected.workflowPath],
        ['alias_workflow_run_id', expected.workflowRunId],
        ['alias_workflow_run_attempt', expected.workflowRunAttempt],
        ['alias_binding_digest', canonical.bindingDigest],
      ];
  return fields
    .filter(([key, value]) => String(rowValue(row, key)) !== String(value))
    .map(([key]) => key);
}

async function verifyCanonicalRelationBinding(client, expected, phase) {
  const canonical = expected.canonicalBinding;
  if (canonical.relation === null) {
    if (canonical.claimId !== null || canonical.bindingDigest !== null) {
      fail(`WORKFLOW_RECEIPT_CANONICAL_BINDING_PARTIAL:${phase}`);
    }
    return;
  }

  const leader = canonical.relation === 'LEADER';
  const readback = leader
    ? await client.query(`
        SELECT c.canonical_claim_id,c.repository,c.leader_workflow_path,
          c.leader_workflow_run_id,c.leader_workflow_run_attempt,
          c.leader_claim_binding_digest
        FROM kidults_control.workflow_canonical_run_claims c
        WHERE c.canonical_claim_id=$1 AND c.repository=$2
          AND c.leader_workflow_path=$3 AND c.leader_workflow_run_id=$4
          AND c.leader_workflow_run_attempt=$5 AND c.leader_claim_binding_digest=$6
      `, [
        canonical.claimId, expected.repository, expected.workflowPath,
        expected.workflowRunId, expected.workflowRunAttempt, canonical.bindingDigest,
      ])
    : await client.query(`
        SELECT a.canonical_claim_id,c.canonical_claim_id AS parent_canonical_claim_id,
          a.repository,c.repository AS parent_repository,a.alias_workflow_path,
          a.alias_workflow_run_id,a.alias_workflow_run_attempt,a.alias_binding_digest
        FROM kidults_control.workflow_canonical_run_aliases a
        JOIN kidults_control.workflow_canonical_run_claims c
          ON c.canonical_claim_id=a.canonical_claim_id
        WHERE a.canonical_claim_id=$1 AND a.repository=$2 AND c.repository=$2
          AND a.alias_workflow_path=$3 AND a.alias_workflow_run_id=$4
          AND a.alias_workflow_run_attempt=$5 AND a.alias_binding_digest=$6
      `, [
        canonical.claimId, expected.repository, expected.workflowPath,
        expected.workflowRunId, expected.workflowRunAttempt, canonical.bindingDigest,
      ]);

  const relation = leader ? 'LEADER' : 'ALIAS';
  if (readback.rows?.length !== 1) {
    fail(`WORKFLOW_RECEIPT_CANONICAL_${relation}_BINDING_INVALID:${phase}:CARDINALITY_${readback.rows?.length ?? 0}`);
  }
  const mismatches = canonicalRelationRowMismatches(readback.rows[0], expected, relation);
  if (mismatches.length) {
    fail(`WORKFLOW_RECEIPT_CANONICAL_${relation}_BINDING_INVALID:${phase}:${mismatches.join(',')}`);
  }
}

export async function appendWorkflowRunReceipt({
  client,
  receipt,
  writerId = WRITER_ID,
  id = () => randomUUID(),
}) {
  if (!client?.query) fail('POSTGRES_CLIENT_REQUIRED');
  if (writerId !== WRITER_ID) fail('WORKFLOW_RECEIPT_WRITER_ID_INVALID');
  const normalized = normalizeInput(receipt);
  const workflowReceiptId = id();
  if (typeof workflowReceiptId !== 'string' || !UUID.test(workflowReceiptId)) {
    fail('WORKFLOW_RECEIPT_ID_INVALID');
  }

  await client.query('BEGIN');
  try {
    await client.query("SELECT set_config('kidults.writer_id', $1, true)", [WRITER_ID]);
    await verifyCanonicalRelationBinding(client, normalized, 'PRE_INSERT');
    const inserted = await client.query(`
      INSERT INTO kidults_control.workflow_run_receipts (
        workflow_receipt_id,repository,workflow_path,workflow_name,workflow_run_id,
        workflow_run_attempt,event_name,head_branch,head_sha,workflow_conclusion,
        canonical_job_conclusion,receipt_type,receipt_schema_version,source_receipt_digest,
        canonical_claim_id,canonical_relation,canonical_binding_digest,
        artifact_name,artifact_id,artifact_digest,artifact_expires_at,result_state,result_json,
        result_digest,binding_digest,observed_at,writer_id
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb,
        $24,$25,$26,$27
      ) ON CONFLICT DO NOTHING
      RETURNING workflow_receipt_id
    `, [
      workflowReceiptId, normalized.repository, normalized.workflowPath, normalized.workflowName,
      normalized.workflowRunId, normalized.workflowRunAttempt, normalized.eventName,
      normalized.headBranch, normalized.headSha, normalized.workflowConclusion,
      normalized.canonicalJobConclusion, normalized.receiptType, normalized.receiptSchemaVersion,
      normalized.sourceReceiptDigest, normalized.canonicalBinding.claimId,
      normalized.canonicalBinding.relation, normalized.canonicalBinding.bindingDigest,
      normalized.artifact.name, normalized.artifact.id,
      normalized.artifact.digest, normalized.artifact.expiresAt, normalized.resultState,
      normalized.resultJson, normalized.resultDigest, normalized.bindingDigest,
      normalized.observedAt, WRITER_ID,
    ]);

    const readback = await client.query(`
      SELECT workflow_receipt_id,repository,workflow_path,workflow_name,workflow_run_id,
        workflow_run_attempt,event_name,head_branch,head_sha,workflow_conclusion,
        canonical_job_conclusion,receipt_type,receipt_schema_version,source_receipt_digest,
        canonical_claim_id,canonical_relation,canonical_binding_digest,
        artifact_name,artifact_id,artifact_digest,artifact_expires_at,result_state,result_json,
        result_digest,binding_digest,observed_at,writer_id
      FROM kidults_control.workflow_run_receipts
      WHERE repository=$1 AND workflow_run_id=$2 AND workflow_run_attempt=$3 AND receipt_type=$4
    `, [normalized.repository, normalized.workflowRunId, normalized.workflowRunAttempt, normalized.receiptType]);
    const row = readback.rows?.[0];
    const mismatches = readbackMismatches(row, normalized);
    if (mismatches.length) fail(`WORKFLOW_RECEIPT_REPLAY_CONFLICT:${mismatches.join(',')}`);
    if (inserted.rows?.length && row.workflow_receipt_id !== workflowReceiptId) {
      fail('WORKFLOW_RECEIPT_INSERT_READBACK_ID_MISMATCH');
    }
    await verifyCanonicalRelationBinding(client, normalized, 'READBACK');
    await client.query('COMMIT');
    return {
      state: inserted.rows?.length ? 'RECORDED' : 'IDEMPOTENT_REPLAY',
      workflowReceiptId: row.workflow_receipt_id,
      repository: normalized.repository,
      workflowRunId: normalized.workflowRunId,
      workflowRunAttempt: normalized.workflowRunAttempt,
      receiptType: normalized.receiptType,
      sourceReceiptDigest: normalized.sourceReceiptDigest,
      canonicalClaimId: normalized.canonicalBinding.claimId,
      canonicalRelation: normalized.canonicalBinding.relation,
      canonicalBindingDigest: normalized.canonicalBinding.bindingDigest,
      resultDigest: normalized.resultDigest,
      bindingDigest: normalized.bindingDigest,
      production: 'HOLD',
      publicRelease: 'HOLD',
      g5: 'HOLD',
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export const workflowReceiptLedgerInternals = {
  MAX_RESULT_BYTES,
  WRITER_ID,
  canonicalJson,
  hasSecretLikeMaterial,
  normalizeInput,
  sha256,
  verifyCanonicalRelationBinding,
};
