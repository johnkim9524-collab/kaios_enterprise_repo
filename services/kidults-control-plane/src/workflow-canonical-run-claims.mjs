import { randomUUID } from 'node:crypto';
import { workflowReceiptLedgerInternals } from './workflow-receipt-ledger.mjs';

const { WRITER_ID, canonicalJson, sha256 } = workflowReceiptLedgerInternals;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const CONSUMER = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const UPSTREAM_CLASS = /^[A-Z][A-Z0-9_]{1,127}$/;
const GENERATION = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,254}$/;
const WORKFLOW_PATH = /^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUPED_INPUT = 'VERIFIED_GROUPED_SEMANTIC_INPUT';
const EXACT_INPUT = 'VERIFIED_EXACT_ARTIFACT_INPUT';

function fail(code) {
  throw new Error(code);
}

function text(value, name, pattern) {
  if (typeof value !== 'string' || !pattern.test(value)) fail(`${name}_INVALID`);
  return value;
}

function digest(value, name, nullable = false) {
  if (nullable && (value === null || value === undefined)) return null;
  return text(value, name, DIGEST);
}

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) fail(`${name}_INVALID`);
  return value;
}

function uuid(value, name) {
  return text(value, name, UUID);
}

function trustedContractDigest(bytes) {
  if (!(typeof bytes === 'string' || bytes instanceof Uint8Array)) fail('TRUSTED_CLASSIFIER_CONTRACT_BYTES_REQUIRED');
  if (bytes.length < 1) fail('TRUSTED_CLASSIFIER_CONTRACT_BYTES_REQUIRED');
  return sha256(bytes);
}

function leaderBindingDigest(claim) {
  return sha256(canonicalJson({
    domain: 'kidults.workflow-canonical-run-claim.v1',
    repository: claim.repository,
    consumer_workflow_id: claim.consumerWorkflowId,
    source_sha: claim.sourceSha,
    upstream_class: claim.upstreamClass,
    generation_discriminator: claim.generationDiscriminator,
    classifier_contract_digest: claim.classifierContractDigest,
    canonical_input_digest: claim.canonicalInputDigest,
    canonical_input_digest_state: claim.canonicalInputDigestState,
    special_exact_artifact_class: claim.specialExactArtifactClass,
    upstream_binding_digest: claim.upstreamBindingDigest,
    source_receipt_digest: claim.sourceReceiptDigest,
    leader_workflow_path: claim.workflowPath,
    leader_workflow_run_id: claim.workflowRunId,
    leader_workflow_run_attempt: claim.workflowRunAttempt,
  }));
}

function normalizeClaim(input, contractBytes) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('CANONICAL_CLAIM_INPUT_REQUIRED');
  if (input.dedupeEligible !== true) fail('CANONICAL_CLAIM_DEDUPE_INELIGIBLE');
  const expectedContractDigest = trustedContractDigest(contractBytes);
  const classifierContractDigest = digest(input.classifierContractDigest, 'CLASSIFIER_CONTRACT_DIGEST');
  if (classifierContractDigest !== expectedContractDigest) fail('CLASSIFIER_CONTRACT_DIGEST_MISMATCH');
  const normalized = {
    repository: text(input.repository, 'REPOSITORY', REPOSITORY),
    consumerWorkflowId: text(input.consumerWorkflowId, 'CONSUMER_WORKFLOW_ID', CONSUMER),
    sourceSha: text(input.sourceSha, 'SOURCE_SHA', /^[0-9a-f]{40}$/),
    upstreamClass: text(input.upstreamClass, 'UPSTREAM_CLASS', UPSTREAM_CLASS),
    generationDiscriminator: text(input.generationDiscriminator, 'GENERATION_DISCRIMINATOR', GENERATION),
    classifierContractDigest,
    canonicalInputDigest: digest(input.canonicalInputDigest, 'CANONICAL_INPUT_DIGEST'),
    canonicalInputDigestState: input.canonicalInputDigestState,
    specialExactArtifactClass: input.specialExactArtifactClass,
    upstreamBindingDigest: digest(input.upstreamBindingDigest, 'UPSTREAM_BINDING_DIGEST', true),
    sourceReceiptDigest: digest(input.sourceReceiptDigest, 'SOURCE_RECEIPT_DIGEST', true),
    dedupeEligible: true,
    workflowPath: text(input.workflowPath, 'WORKFLOW_PATH', WORKFLOW_PATH),
    workflowRunId: positiveInteger(input.workflowRunId, 'WORKFLOW_RUN_ID'),
    workflowRunAttempt: positiveInteger(input.workflowRunAttempt, 'WORKFLOW_RUN_ATTEMPT'),
  };
  if (typeof normalized.specialExactArtifactClass !== 'boolean') fail('SPECIAL_EXACT_ARTIFACT_CLASS_INVALID');
  if (normalized.specialExactArtifactClass) {
    if (normalized.canonicalInputDigestState !== EXACT_INPUT ||
        normalized.upstreamBindingDigest === null || normalized.sourceReceiptDigest === null) {
      fail('CANONICAL_CLAIM_EXACT_ARTIFACT_BINDING_REQUIRED');
    }
  } else if (normalized.canonicalInputDigestState !== GROUPED_INPUT) {
    fail('CANONICAL_INPUT_DIGEST_STATE_INVALID');
  }
  normalized.leaderClaimBindingDigest = leaderBindingDigest(normalized);
  return normalized;
}

function value(row, key) {
  return row?.[key] ?? null;
}

function claimKeyMismatches(row, expected) {
  if (!row) return ['ROW_MISSING'];
  const fields = [
    ['repository', expected.repository],
    ['consumer_workflow_id', expected.consumerWorkflowId],
    ['source_sha', expected.sourceSha],
    ['upstream_class', expected.upstreamClass],
    ['generation_discriminator', expected.generationDiscriminator],
    ['classifier_contract_digest', expected.classifierContractDigest],
    ['canonical_input_digest_state', expected.canonicalInputDigestState],
    ['special_exact_artifact_class', expected.specialExactArtifactClass],
    ['dedupe_eligible', true],
    ['writer_id', WRITER_ID],
  ];
  return fields.filter(([key, expectedValue]) => String(value(row, key)) !== String(expectedValue)).map(([key]) => key);
}

function leaderMismatches(row, expected) {
  const fields = [
    ['canonical_input_digest', expected.canonicalInputDigest],
    ['canonical_input_digest_state', expected.canonicalInputDigestState],
    ['special_exact_artifact_class', expected.specialExactArtifactClass],
    ['upstream_binding_digest', expected.upstreamBindingDigest],
    ['source_receipt_digest', expected.sourceReceiptDigest],
    ['leader_workflow_path', expected.workflowPath],
    ['leader_workflow_run_id', expected.workflowRunId],
    ['leader_workflow_run_attempt', expected.workflowRunAttempt],
    ['leader_claim_binding_digest', expected.leaderClaimBindingDigest],
  ];
  return fields.filter(([key, expectedValue]) => {
    const observed = value(row, key);
    return observed === null ? expectedValue !== null : String(observed) !== String(expectedValue);
  }).map(([key]) => key);
}

function claimIntegrityMismatches(row) {
  const mismatches = [];
  if (!UUID.test(String(value(row, 'canonical_claim_id')))) mismatches.push('canonical_claim_id');
  for (const key of [
    'classifier_contract_digest', 'canonical_input_digest', 'leader_claim_binding_digest',
  ]) {
    if (!DIGEST.test(String(value(row, key)))) mismatches.push(key);
  }
  for (const key of ['upstream_binding_digest', 'source_receipt_digest']) {
    const observed = value(row, key);
    if (observed !== null && !DIGEST.test(String(observed))) mismatches.push(key);
  }
  const runId = Number(value(row, 'leader_workflow_run_id'));
  const runAttempt = Number(value(row, 'leader_workflow_run_attempt'));
  if (!Number.isSafeInteger(runId) || runId < 1) mismatches.push('leader_workflow_run_id');
  if (!Number.isSafeInteger(runAttempt) || runAttempt < 1) mismatches.push('leader_workflow_run_attempt');
  const expectedDigest = leaderBindingDigest({
    repository: value(row, 'repository'),
    consumerWorkflowId: value(row, 'consumer_workflow_id'),
    sourceSha: value(row, 'source_sha'),
    upstreamClass: value(row, 'upstream_class'),
    generationDiscriminator: value(row, 'generation_discriminator'),
    classifierContractDigest: value(row, 'classifier_contract_digest'),
    canonicalInputDigest: value(row, 'canonical_input_digest'),
    canonicalInputDigestState: value(row, 'canonical_input_digest_state'),
    specialExactArtifactClass: value(row, 'special_exact_artifact_class') === true || value(row, 'special_exact_artifact_class') === 'true',
    upstreamBindingDigest: value(row, 'upstream_binding_digest'),
    sourceReceiptDigest: value(row, 'source_receipt_digest'),
    workflowPath: value(row, 'leader_workflow_path'),
    workflowRunId: runId,
    workflowRunAttempt: runAttempt,
  });
  if (expectedDigest !== value(row, 'leader_claim_binding_digest')) mismatches.push('leader_claim_binding_digest_recomputed');
  return [...new Set(mismatches)];
}

function aliasExpected(claim, candidate, canonicalAliasId) {
  const expected = {
    canonicalAliasId,
    canonicalClaimId: value(claim, 'canonical_claim_id'),
    repository: candidate.repository,
    consumerWorkflowId: candidate.consumerWorkflowId,
    leaderWorkflowRunId: Number(value(claim, 'leader_workflow_run_id')),
    leaderWorkflowRunAttempt: Number(value(claim, 'leader_workflow_run_attempt')),
    leaderClaimBindingDigest: value(claim, 'leader_claim_binding_digest'),
    canonicalInputDigest: candidate.canonicalInputDigest,
    canonicalInputDigestState: candidate.canonicalInputDigestState,
    specialExactArtifactClass: candidate.specialExactArtifactClass,
    upstreamBindingDigest: candidate.upstreamBindingDigest,
    sourceReceiptDigest: candidate.sourceReceiptDigest,
    workflowPath: candidate.workflowPath,
    workflowRunId: candidate.workflowRunId,
    workflowRunAttempt: candidate.workflowRunAttempt,
  };
  expected.aliasBindingDigest = sha256(canonicalJson({
    domain: 'kidults.workflow-canonical-run-alias.v1',
    canonical_claim_id: expected.canonicalClaimId,
    repository: expected.repository,
    consumer_workflow_id: expected.consumerWorkflowId,
    leader_workflow_run_id: expected.leaderWorkflowRunId,
    leader_workflow_run_attempt: expected.leaderWorkflowRunAttempt,
    leader_claim_binding_digest: expected.leaderClaimBindingDigest,
    canonical_input_digest: expected.canonicalInputDigest,
    canonical_input_digest_state: expected.canonicalInputDigestState,
    special_exact_artifact_class: expected.specialExactArtifactClass,
    upstream_binding_digest: expected.upstreamBindingDigest,
    source_receipt_digest: expected.sourceReceiptDigest,
    alias_workflow_path: expected.workflowPath,
    alias_workflow_run_id: expected.workflowRunId,
    alias_workflow_run_attempt: expected.workflowRunAttempt,
  }));
  return expected;
}

function aliasMismatches(row, expected) {
  if (!row) return ['ROW_MISSING'];
  const fields = [
    ['canonical_claim_id', expected.canonicalClaimId],
    ['repository', expected.repository],
    ['consumer_workflow_id', expected.consumerWorkflowId],
    ['leader_workflow_run_id', expected.leaderWorkflowRunId],
    ['leader_workflow_run_attempt', expected.leaderWorkflowRunAttempt],
    ['leader_claim_binding_digest', expected.leaderClaimBindingDigest],
    ['canonical_input_digest', expected.canonicalInputDigest],
    ['canonical_input_digest_state', expected.canonicalInputDigestState],
    ['special_exact_artifact_class', expected.specialExactArtifactClass],
    ['upstream_binding_digest', expected.upstreamBindingDigest],
    ['source_receipt_digest', expected.sourceReceiptDigest],
    ['alias_workflow_path', expected.workflowPath],
    ['alias_workflow_run_id', expected.workflowRunId],
    ['alias_workflow_run_attempt', expected.workflowRunAttempt],
    ['alias_binding_digest', expected.aliasBindingDigest],
    ['writer_id', WRITER_ID],
  ];
  return fields.filter(([key, expectedValue]) => {
    const observed = value(row, key);
    return observed === null ? expectedValue !== null : String(observed) !== String(expectedValue);
  }).map(([key]) => key);
}

function holdBoundary(result) {
  return {
    ...result,
    remoteActivation: 'HOLD',
    publicRelease: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  };
}

export async function acquireCanonicalWorkflowRunClaim({
  client,
  claim,
  trustedClassifierContractBytes,
  id = () => randomUUID(),
}) {
  if (!client?.query) fail('POSTGRES_CLIENT_REQUIRED');
  const candidate = normalizeClaim(claim, trustedClassifierContractBytes);
  const canonicalClaimId = uuid(id(), 'CANONICAL_CLAIM_ID');

  await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  try {
    await client.query("SELECT set_config('kidults.writer_id', $1, true)", [WRITER_ID]);
    const inserted = await client.query(`
      INSERT INTO kidults_control.workflow_canonical_run_claims (
        canonical_claim_id,repository,consumer_workflow_id,source_sha,upstream_class,
        generation_discriminator,classifier_contract_digest,canonical_input_digest,
        canonical_input_digest_state,special_exact_artifact_class,
        upstream_binding_digest,source_receipt_digest,dedupe_eligible,leader_workflow_path,
        leader_workflow_run_id,leader_workflow_run_attempt,leader_claim_binding_digest,writer_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      ON CONFLICT ON CONSTRAINT workflow_canonical_run_claims_key DO NOTHING
      RETURNING canonical_claim_id
    `, [
      canonicalClaimId, candidate.repository, candidate.consumerWorkflowId, candidate.sourceSha,
      candidate.upstreamClass, candidate.generationDiscriminator, candidate.classifierContractDigest,
      candidate.canonicalInputDigest, candidate.canonicalInputDigestState,
      candidate.specialExactArtifactClass, candidate.upstreamBindingDigest, candidate.sourceReceiptDigest,
      true, candidate.workflowPath, candidate.workflowRunId, candidate.workflowRunAttempt,
      candidate.leaderClaimBindingDigest, WRITER_ID,
    ]);
    const readback = await client.query(`
      SELECT canonical_claim_id,repository,consumer_workflow_id,source_sha,upstream_class,
        generation_discriminator,classifier_contract_digest,canonical_input_digest,
        canonical_input_digest_state,special_exact_artifact_class,
        upstream_binding_digest,source_receipt_digest,dedupe_eligible,leader_workflow_path,
        leader_workflow_run_id,leader_workflow_run_attempt,leader_claim_binding_digest,writer_id
      FROM kidults_control.workflow_canonical_run_claims
      WHERE repository=$1 AND consumer_workflow_id=$2 AND source_sha=$3 AND upstream_class=$4
        AND generation_discriminator=$5 AND classifier_contract_digest=$6
    `, [
      candidate.repository, candidate.consumerWorkflowId, candidate.sourceSha,
      candidate.upstreamClass, candidate.generationDiscriminator, candidate.classifierContractDigest,
    ]);
    if (readback.rows?.length !== 1) fail('CANONICAL_CLAIM_READBACK_CARDINALITY_INVALID');
    if (![0, 1].includes(inserted.rows?.length)) fail('CANONICAL_CLAIM_INSERT_CARDINALITY_INVALID');
    const storedClaim = readback.rows[0];
    const keyMismatches = claimKeyMismatches(storedClaim, candidate);
    if (keyMismatches.length) fail(`CANONICAL_CLAIM_READBACK_CONFLICT:${keyMismatches.join(',')}`);
    const integrityMismatches = claimIntegrityMismatches(storedClaim);
    if (integrityMismatches.length) fail(`CANONICAL_CLAIM_INTEGRITY_CONFLICT:${integrityMismatches.join(',')}`);

    if (inserted.rows?.length) {
      const mismatches = leaderMismatches(storedClaim, candidate);
      if (value(storedClaim, 'canonical_claim_id') !== canonicalClaimId) mismatches.push('canonical_claim_id');
      if (mismatches.length) fail(`CANONICAL_CLAIM_INSERT_READBACK_CONFLICT:${mismatches.join(',')}`);
      await client.query('COMMIT');
      return holdBoundary({
        state: 'CANONICAL_CLAIMED',
        canonicalClaimId,
        leaderWorkflowRunId: candidate.workflowRunId,
        leaderWorkflowRunAttempt: candidate.workflowRunAttempt,
        leaderClaimBindingDigest: candidate.leaderClaimBindingDigest,
      });
    }

    if (value(storedClaim, 'canonical_input_digest') !== candidate.canonicalInputDigest) {
      await client.query('ROLLBACK');
      return holdBoundary({
        state: 'INPUT_DIVERGENCE_HOLD',
        canonicalClaimId: value(storedClaim, 'canonical_claim_id'),
        leaderWorkflowRunId: Number(value(storedClaim, 'leader_workflow_run_id')),
        leaderWorkflowRunAttempt: Number(value(storedClaim, 'leader_workflow_run_attempt')),
        leaderClaimBindingDigest: value(storedClaim, 'leader_claim_binding_digest'),
      });
    }

    const sameLeader = String(value(storedClaim, 'leader_workflow_run_id')) === String(candidate.workflowRunId)
      && String(value(storedClaim, 'leader_workflow_run_attempt')) === String(candidate.workflowRunAttempt);
    if (sameLeader) {
      const mismatches = leaderMismatches(storedClaim, candidate);
      if (mismatches.length) fail(`CANONICAL_LEADER_REPLAY_CONFLICT:${mismatches.join(',')}`);
      await client.query('COMMIT');
      return holdBoundary({
        state: 'IDEMPOTENT_LEADER_REPLAY',
        canonicalClaimId: value(storedClaim, 'canonical_claim_id'),
        leaderWorkflowRunId: candidate.workflowRunId,
        leaderWorkflowRunAttempt: candidate.workflowRunAttempt,
        leaderClaimBindingDigest: candidate.leaderClaimBindingDigest,
      });
    }

    const canonicalAliasId = uuid(id(), 'CANONICAL_ALIAS_ID');
    const alias = aliasExpected(storedClaim, candidate, canonicalAliasId);
    const aliasInserted = await client.query(`
      INSERT INTO kidults_control.workflow_canonical_run_aliases (
        canonical_alias_id,canonical_claim_id,repository,consumer_workflow_id,
        leader_workflow_run_id,leader_workflow_run_attempt,leader_claim_binding_digest,
        canonical_input_digest,canonical_input_digest_state,special_exact_artifact_class,
        upstream_binding_digest,source_receipt_digest,
        alias_workflow_path,alias_workflow_run_id,alias_workflow_run_attempt,
        alias_binding_digest,writer_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      ON CONFLICT ON CONSTRAINT workflow_canonical_run_aliases_run_key DO NOTHING
      RETURNING canonical_alias_id
    `, [
      alias.canonicalAliasId, alias.canonicalClaimId, alias.repository, alias.consumerWorkflowId,
      alias.leaderWorkflowRunId, alias.leaderWorkflowRunAttempt, alias.leaderClaimBindingDigest,
      alias.canonicalInputDigest, alias.canonicalInputDigestState, alias.specialExactArtifactClass,
      alias.upstreamBindingDigest, alias.sourceReceiptDigest,
      alias.workflowPath, alias.workflowRunId, alias.workflowRunAttempt,
      alias.aliasBindingDigest, WRITER_ID,
    ]);
    const aliasReadback = await client.query(`
      SELECT canonical_alias_id,canonical_claim_id,repository,consumer_workflow_id,
        leader_workflow_run_id,leader_workflow_run_attempt,leader_claim_binding_digest,
        canonical_input_digest,canonical_input_digest_state,special_exact_artifact_class,
        upstream_binding_digest,source_receipt_digest,
        alias_workflow_path,alias_workflow_run_id,alias_workflow_run_attempt,
        alias_binding_digest,writer_id
      FROM kidults_control.workflow_canonical_run_aliases
      WHERE repository=$1 AND consumer_workflow_id=$2
        AND alias_workflow_run_id=$3 AND alias_workflow_run_attempt=$4
    `, [alias.repository, alias.consumerWorkflowId, alias.workflowRunId, alias.workflowRunAttempt]);
    if (aliasReadback.rows?.length !== 1) fail('CANONICAL_ALIAS_READBACK_CARDINALITY_INVALID');
    if (![0, 1].includes(aliasInserted.rows?.length)) fail('CANONICAL_ALIAS_INSERT_CARDINALITY_INVALID');
    const aliasRow = aliasReadback.rows[0];
    const mismatches = aliasMismatches(aliasRow, alias);
    if (aliasInserted.rows?.length && value(aliasRow, 'canonical_alias_id') !== canonicalAliasId) {
      mismatches.push('canonical_alias_id');
    }
    if (mismatches.length) fail(`CANONICAL_ALIAS_REPLAY_CONFLICT:${mismatches.join(',')}`);
    await client.query('COMMIT');
    return holdBoundary({
      state: aliasInserted.rows?.length ? 'DEDUPED_ALIAS' : 'IDEMPOTENT_ALIAS_REPLAY',
      canonicalClaimId: alias.canonicalClaimId,
      canonicalAliasId: value(aliasRow, 'canonical_alias_id'),
      leaderWorkflowRunId: alias.leaderWorkflowRunId,
      leaderWorkflowRunAttempt: alias.leaderWorkflowRunAttempt,
      leaderClaimBindingDigest: alias.leaderClaimBindingDigest,
      aliasBindingDigest: alias.aliasBindingDigest,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export const workflowCanonicalRunClaimInternals = {
  leaderBindingDigest,
  normalizeClaim,
  trustedContractDigest,
};
