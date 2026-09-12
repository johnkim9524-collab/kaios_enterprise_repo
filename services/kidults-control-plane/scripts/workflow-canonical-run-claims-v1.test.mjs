import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acquireCanonicalWorkflowRunClaim,
  workflowCanonicalRunClaimInternals,
} from '../src/workflow-canonical-run-claims.mjs';

const contractBytes = '{"id":"continuous-assurance-canonical-identity-v1","version":"1.0.0"}\n';
const contractDigest = workflowCanonicalRunClaimInternals.trustedContractDigest(contractBytes);
const canonicalClaimId = '00000000-0000-4000-8000-000000000911';
const secondClaimId = '00000000-0000-4000-8000-000000000912';
const canonicalAliasId = '00000000-0000-4000-8000-000000000913';
const secondAliasId = '00000000-0000-4000-8000-000000000914';

function validClaim(overrides = {}) {
  return {
    repository: 'johnkim9524-collab/kaios_enterprise_repo',
    consumerWorkflowId: 'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE_V1',
    sourceSha: 'a'.repeat(40),
    upstreamClass: 'GENERIC_ASSURANCE_SUCCESS',
    generationDiscriminator: 'source-sha:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    classifierContractDigest: contractDigest,
    canonicalInputDigest: `sha256:${'b'.repeat(64)}`,
    canonicalInputDigestState: 'VERIFIED_GROUPED_SEMANTIC_INPUT',
    specialExactArtifactClass: false,
    upstreamBindingDigest: `sha256:${'c'.repeat(64)}`,
    sourceReceiptDigest: `sha256:${'d'.repeat(64)}`,
    dedupeEligible: true,
    workflowPath: '.github/workflows/kidults-platform-continuous-assurance-v1.yml',
    workflowRunId: 7001,
    workflowRunAttempt: 1,
    ...overrides,
  };
}

function storedClaim(params) {
  return {
    canonical_claim_id: params[0],
    repository: params[1],
    consumer_workflow_id: params[2],
    source_sha: params[3],
    upstream_class: params[4],
    generation_discriminator: params[5],
    classifier_contract_digest: params[6],
    canonical_input_digest: params[7],
    canonical_input_digest_state: params[8],
    special_exact_artifact_class: params[9],
    upstream_binding_digest: params[10],
    source_receipt_digest: params[11],
    dedupe_eligible: params[12],
    leader_workflow_path: params[13],
    leader_workflow_run_id: String(params[14]),
    leader_workflow_run_attempt: String(params[15]),
    leader_claim_binding_digest: params[16],
    writer_id: params[17],
  };
}

function storedAlias(params) {
  return {
    canonical_alias_id: params[0],
    canonical_claim_id: params[1],
    repository: params[2],
    consumer_workflow_id: params[3],
    leader_workflow_run_id: String(params[4]),
    leader_workflow_run_attempt: String(params[5]),
    leader_claim_binding_digest: params[6],
    canonical_input_digest: params[7],
    canonical_input_digest_state: params[8],
    special_exact_artifact_class: params[9],
    upstream_binding_digest: params[10],
    source_receipt_digest: params[11],
    alias_workflow_path: params[12],
    alias_workflow_run_id: String(params[13]),
    alias_workflow_run_attempt: String(params[14]),
    alias_binding_digest: params[15],
    writer_id: params[16],
  };
}

class PgClient {
  constructor() {
    this.calls = [];
    this.claimRow = null;
    this.aliasRows = new Map();
    this.failClaimInsert = false;
  }

  async query(sql, params = []) {
    const text = String(sql).trim();
    this.calls.push({ sql: text, params });
    if (text.includes('INSERT INTO kidults_control.workflow_canonical_run_claims')) {
      if (this.failClaimInsert) throw new Error('POSTGRES_NON_KEY_CONFLICT');
      if (this.claimRow) return { rows: [] };
      this.claimRow = storedClaim(params);
      return { rows: [{ canonical_claim_id: params[0] }] };
    }
    if (text.includes('FROM kidults_control.workflow_canonical_run_claims')) {
      return { rows: this.claimRow ? [structuredClone(this.claimRow)] : [] };
    }
    if (text.includes('INSERT INTO kidults_control.workflow_canonical_run_aliases')) {
      const key = `${params[2]}|${params[3]}|${params[13]}|${params[14]}`;
      if (this.aliasRows.has(key)) return { rows: [] };
      this.aliasRows.set(key, storedAlias(params));
      return { rows: [{ canonical_alias_id: params[0] }] };
    }
    if (text.includes('FROM kidults_control.workflow_canonical_run_aliases')) {
      const key = `${params[0]}|${params[1]}|${params[2]}|${params[3]}`;
      const row = this.aliasRows.get(key);
      return { rows: row ? [structuredClone(row)] : [] };
    }
    return { rows: [] };
  }
}

function ids(...values) {
  let index = 0;
  return () => values[index++];
}

test('atomically records the first eligible run as canonical leader', async () => {
  const client = new PgClient();
  const result = await acquireCanonicalWorkflowRunClaim({
    client,
    claim: validClaim(),
    trustedClassifierContractBytes: contractBytes,
    id: ids(canonicalClaimId),
  });
  assert.equal(result.state, 'CANONICAL_CLAIMED');
  assert.equal(result.canonicalClaimId, canonicalClaimId);
  assert.match(result.leaderClaimBindingDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(result.remoteActivation, 'HOLD');
  assert.equal(result.production, 'HOLD');
  assert(client.calls.some(call => call.sql.includes('ON CONFLICT ON CONSTRAINT workflow_canonical_run_claims_key DO NOTHING')));
  assert(!client.calls.some(call => /\bFOR (?:UPDATE|NO KEY UPDATE|SHARE|KEY SHARE)\b/.test(call.sql)));
  assert.equal(client.calls.at(-1).sql, 'COMMIT');
});

test('admits a special class only after exact artifact and source-receipt binding', async () => {
  const client = new PgClient();
  const result = await acquireCanonicalWorkflowRunClaim({
    client,
    claim: validClaim({
      upstreamClass: 'ASI_REQUIREMENT_COVERAGE',
      canonicalInputDigestState: 'VERIFIED_EXACT_ARTIFACT_INPUT',
      specialExactArtifactClass: true,
    }),
    trustedClassifierContractBytes: contractBytes,
    id: ids(canonicalClaimId),
  });
  assert.equal(result.state, 'CANONICAL_CLAIMED');
  assert.equal(client.claimRow.canonical_input_digest_state, 'VERIFIED_EXACT_ARTIFACT_INPUT');
  assert.equal(client.claimRow.special_exact_artifact_class, true);
});

test('returns an idempotent replay for the exact leader run and binding', async () => {
  const client = new PgClient();
  await acquireCanonicalWorkflowRunClaim({
    client, claim: validClaim(), trustedClassifierContractBytes: contractBytes, id: ids(canonicalClaimId),
  });
  const replay = await acquireCanonicalWorkflowRunClaim({
    client, claim: validClaim(), trustedClassifierContractBytes: contractBytes, id: ids(secondClaimId),
  });
  assert.equal(replay.state, 'IDEMPOTENT_LEADER_REPLAY');
  assert.equal(replay.canonicalClaimId, canonicalClaimId);
  assert.equal(client.calls.at(-1).sql, 'COMMIT');
});

test('binds a same-input loser as an immutable alias and replays it idempotently', async () => {
  const client = new PgClient();
  await acquireCanonicalWorkflowRunClaim({
    client, claim: validClaim(), trustedClassifierContractBytes: contractBytes, id: ids(canonicalClaimId),
  });
  const aliasClaim = validClaim({
    workflowRunId: 7002,
    upstreamBindingDigest: `sha256:${'e'.repeat(64)}`,
    sourceReceiptDigest: `sha256:${'f'.repeat(64)}`,
  });
  const alias = await acquireCanonicalWorkflowRunClaim({
    client,
    claim: aliasClaim,
    trustedClassifierContractBytes: contractBytes,
    id: ids(secondClaimId, canonicalAliasId),
  });
  assert.equal(alias.state, 'DEDUPED_ALIAS');
  assert.equal(alias.canonicalClaimId, canonicalClaimId);
  assert.equal(alias.canonicalAliasId, canonicalAliasId);
  assert.match(alias.aliasBindingDigest, /^sha256:[0-9a-f]{64}$/);
  const replay = await acquireCanonicalWorkflowRunClaim({
    client,
    claim: aliasClaim,
    trustedClassifierContractBytes: contractBytes,
    id: ids(secondClaimId, secondAliasId),
  });
  assert.equal(replay.state, 'IDEMPOTENT_ALIAS_REPLAY');
  assert.equal(replay.canonicalAliasId, canonicalAliasId);
  assert.equal(client.calls.at(-1).sql, 'COMMIT');
});

test('same canonical key with divergent normalized input returns HOLD and never aliases', async () => {
  const client = new PgClient();
  await acquireCanonicalWorkflowRunClaim({
    client, claim: validClaim(), trustedClassifierContractBytes: contractBytes, id: ids(canonicalClaimId),
  });
  const result = await acquireCanonicalWorkflowRunClaim({
    client,
    claim: validClaim({ workflowRunId: 7002, canonicalInputDigest: `sha256:${'9'.repeat(64)}` }),
    trustedClassifierContractBytes: contractBytes,
    id: ids(secondClaimId),
  });
  assert.equal(result.state, 'INPUT_DIVERGENCE_HOLD');
  assert.equal(client.aliasRows.size, 0);
  assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
});

test('rejects non-dedupable classification and untrusted contract bytes before PostgreSQL', async () => {
  const ineligibleClient = new PgClient();
  await assert.rejects(
    () => acquireCanonicalWorkflowRunClaim({
      client: ineligibleClient,
      claim: validClaim({ dedupeEligible: false }),
      trustedClassifierContractBytes: contractBytes,
      id: ids(canonicalClaimId),
    }),
    /CANONICAL_CLAIM_DEDUPE_INELIGIBLE/
  );
  assert.equal(ineligibleClient.calls.length, 0);

  const mismatchClient = new PgClient();
  await assert.rejects(
    () => acquireCanonicalWorkflowRunClaim({
      client: mismatchClient,
      claim: validClaim(),
      trustedClassifierContractBytes: '{"different":true}\n',
      id: ids(canonicalClaimId),
    }),
    /CLASSIFIER_CONTRACT_DIGEST_MISMATCH/
  );
  assert.equal(mismatchClient.calls.length, 0);

  const provisionalSpecialClient = new PgClient();
  await assert.rejects(
    () => acquireCanonicalWorkflowRunClaim({
      client: provisionalSpecialClient,
      claim: validClaim({
        upstreamClass: 'ASI_REQUIREMENT_COVERAGE',
        specialExactArtifactClass: true,
        canonicalInputDigestState: 'UPSTREAM_OBSERVATION_BOUND_EXACT_ARTIFACT_VERIFICATION_REQUIRED',
      }),
      trustedClassifierContractBytes: contractBytes,
      id: ids(canonicalClaimId),
    }),
    /CANONICAL_CLAIM_EXACT_ARTIFACT_BINDING_REQUIRED/
  );
  assert.equal(provisionalSpecialClient.calls.length, 0);
});

test('rolls back corrupted leader readback and non-key PostgreSQL conflicts', async () => {
  const corruptClient = new PgClient();
  await acquireCanonicalWorkflowRunClaim({
    client: corruptClient, claim: validClaim(), trustedClassifierContractBytes: contractBytes, id: ids(canonicalClaimId),
  });
  corruptClient.claimRow.leader_claim_binding_digest = `sha256:${'0'.repeat(64)}`;
  await assert.rejects(
    () => acquireCanonicalWorkflowRunClaim({
      client: corruptClient,
      claim: validClaim({ workflowRunId: 7002 }),
      trustedClassifierContractBytes: contractBytes,
      id: ids(secondClaimId),
    }),
    /CANONICAL_CLAIM_INTEGRITY_CONFLICT/
  );
  assert.equal(corruptClient.calls.at(-1).sql, 'ROLLBACK');

  const conflictClient = new PgClient();
  conflictClient.failClaimInsert = true;
  await assert.rejects(
    () => acquireCanonicalWorkflowRunClaim({
      client: conflictClient,
      claim: validClaim(),
      trustedClassifierContractBytes: contractBytes,
      id: ids(canonicalClaimId),
    }),
    /POSTGRES_NON_KEY_CONFLICT/
  );
  assert.equal(conflictClient.calls.at(-1).sql, 'ROLLBACK');
});
