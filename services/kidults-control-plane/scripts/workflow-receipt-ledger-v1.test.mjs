import assert from 'node:assert/strict';
import test from 'node:test';
import { appendWorkflowRunReceipt, workflowReceiptLedgerInternals } from '../src/workflow-receipt-ledger.mjs';

const receiptId = '00000000-0000-4000-8000-000000000901';
const otherReceiptId = '00000000-0000-4000-8000-000000000902';
const canonicalClaimId = '00000000-0000-4000-8000-000000000903';
const otherCanonicalClaimId = '00000000-0000-4000-8000-000000000904';
const sourceDigest = `sha256:${'a'.repeat(64)}`;
const artifactDigest = `sha256:${'b'.repeat(64)}`;
const leaderBindingDigest = `sha256:${'e'.repeat(64)}`;
const aliasBindingDigest = `sha256:${'f'.repeat(64)}`;
const repository = 'johnkim9524-collab/kaios_enterprise_repo';
const workflowPath = '.github/workflows/kidults-asi-p1-source-preflight-v1.yml';

function validReceipt(overrides = {}) {
  return {
    repository,
    workflowPath,
    workflowName: 'KIDULTS ASI P1 Source Preflight v1',
    workflowRunId: 123456789,
    workflowRunAttempt: 1,
    eventName: 'workflow_run',
    headBranch: 'main',
    headSha: 'c'.repeat(40),
    workflowConclusion: 'success',
    canonicalJobConclusion: 'success',
    receiptType: 'KIDULTS_ASI_P1_SOURCE_PREFLIGHT',
    receiptSchemaVersion: '1.0.0',
    sourceReceiptDigest: sourceDigest,
    artifact: {
      name: 'kidults-asi-p1-source-preflight-v1',
      id: 987654321,
      digest: artifactDigest,
      expiresAt: '2026-11-27T00:00:00.000Z',
    },
    resultState: 'VERIFIED_PASS',
    result: {
      state: 'VERIFIED_PASS',
      results: { requirements_accounted_for: 192, unresolved_preflight_actions: 0 },
      production: 'HOLD',
      public_release: 'HOLD',
    },
    observedAt: '2026-08-29T23:00:00.000Z',
    ...overrides,
  };
}

function storedRow(params) {
  return {
    workflow_receipt_id: params[0],
    repository: params[1],
    workflow_path: params[2],
    workflow_name: params[3],
    workflow_run_id: String(params[4]),
    workflow_run_attempt: String(params[5]),
    event_name: params[6],
    head_branch: params[7],
    head_sha: params[8],
    workflow_conclusion: params[9],
    canonical_job_conclusion: params[10],
    receipt_type: params[11],
    receipt_schema_version: params[12],
    source_receipt_digest: params[13],
    canonical_claim_id: params[14],
    canonical_relation: params[15],
    canonical_binding_digest: params[16],
    artifact_name: params[17],
    artifact_id: params[18] === null ? null : String(params[18]),
    artifact_digest: params[19],
    artifact_expires_at: params[20],
    result_state: params[21],
    result_json: JSON.parse(params[22]),
    result_digest: params[23],
    binding_digest: params[24],
    observed_at: params[25],
    writer_id: params[26],
  };
}

class PgClient {
  constructor() {
    this.calls = [];
    this.row = null;
    this.forceDuplicate = false;
    this.failInsert = false;
    this.claimRow = {
      canonical_claim_id: canonicalClaimId,
      repository,
      leader_workflow_path: workflowPath,
      leader_workflow_run_id: '123456789',
      leader_workflow_run_attempt: '1',
      leader_claim_binding_digest: leaderBindingDigest,
    };
    this.aliasRow = {
      canonical_claim_id: canonicalClaimId,
      parent_canonical_claim_id: canonicalClaimId,
      repository,
      parent_repository: repository,
      alias_workflow_path: workflowPath,
      alias_workflow_run_id: '223456789',
      alias_workflow_run_attempt: '2',
      alias_binding_digest: aliasBindingDigest,
    };
  }

  async query(sql, params = []) {
    const text = String(sql).trim();
    this.calls.push({ sql: text, params });
    if (text.includes('FROM kidults_control.workflow_canonical_run_aliases a')) {
      const row = this.aliasRow;
      const exact = row
        && String(row.canonical_claim_id) === String(params[0])
        && String(row.repository) === String(params[1])
        && String(row.parent_repository) === String(params[1])
        && String(row.alias_workflow_path) === String(params[2])
        && String(row.alias_workflow_run_id) === String(params[3])
        && String(row.alias_workflow_run_attempt) === String(params[4])
        && String(row.alias_binding_digest) === String(params[5]);
      return { rows: exact ? [structuredClone(row)] : [] };
    }
    if (text.includes('FROM kidults_control.workflow_canonical_run_claims c')) {
      const row = this.claimRow;
      const exact = row
        && String(row.canonical_claim_id) === String(params[0])
        && String(row.repository) === String(params[1])
        && String(row.leader_workflow_path) === String(params[2])
        && String(row.leader_workflow_run_id) === String(params[3])
        && String(row.leader_workflow_run_attempt) === String(params[4])
        && String(row.leader_claim_binding_digest) === String(params[5]);
      return { rows: exact ? [structuredClone(row)] : [] };
    }
    if (text.includes('INSERT INTO kidults_control.workflow_run_receipts')) {
      if (this.failInsert) throw new Error('POSTGRES_FORCED_FAILURE');
      if (this.forceDuplicate) return { rows: [] };
      this.row = storedRow(params);
      return { rows: [{ workflow_receipt_id: params[0] }] };
    }
    if (text.includes('FROM kidults_control.workflow_run_receipts')) {
      return { rows: this.row ? [structuredClone(this.row)] : [] };
    }
    return { rows: [] };
  }
}

test('records a digest-bound workflow receipt and reads it back before commit', async () => {
  const client = new PgClient();
  const result = await appendWorkflowRunReceipt({ client, receipt: validReceipt(), id: () => receiptId });
  assert.equal(result.state, 'RECORDED');
  assert.equal(result.workflowReceiptId, receiptId);
  assert.match(result.bindingDigest, /^sha256:[0-9a-f]{64}$/);
  assert.match(result.resultDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(result.production, 'HOLD');
  assert(client.calls.some(call => call.sql.includes('ON CONFLICT DO NOTHING')));
  assert(!client.calls.some(call => /\bFOR (?:UPDATE|NO KEY UPDATE|SHARE|KEY SHARE)\b/.test(call.sql)));
  assert.equal(client.calls.at(-1).sql, 'COMMIT');
});

test('returns IDEMPOTENT_REPLAY for the same immutable run-attempt binding', async () => {
  const client = new PgClient();
  const receipt = validReceipt({
    canonicalBinding: {
      claimId: canonicalClaimId,
      relation: 'LEADER',
      bindingDigest: leaderBindingDigest,
    },
  });
  await appendWorkflowRunReceipt({ client, receipt, id: () => receiptId });
  client.forceDuplicate = true;
  const replay = await appendWorkflowRunReceipt({ client, receipt, id: () => otherReceiptId });
  assert.equal(replay.state, 'IDEMPOTENT_REPLAY');
  assert.equal(replay.workflowReceiptId, receiptId);
  assert.equal(client.calls.filter(call => call.sql.includes('FROM kidults_control.workflow_canonical_run_claims c')).length, 4);
  assert.equal(client.calls.at(-1).sql, 'COMMIT');
});

test('rolls back a conflicting replay instead of overwriting permanent evidence', async () => {
  const client = new PgClient();
  const receipt = validReceipt();
  await appendWorkflowRunReceipt({ client, receipt, id: () => receiptId });
  client.forceDuplicate = true;
  client.row.artifact_digest = `sha256:${'d'.repeat(64)}`;
  await assert.rejects(
    () => appendWorkflowRunReceipt({ client, receipt, id: () => otherReceiptId }),
    /WORKFLOW_RECEIPT_REPLAY_CONFLICT:artifact_digest/
  );
  assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
  assert(!client.calls.some(call => /^UPDATE kidults_control\.workflow_run_receipts/.test(call.sql)));
});

test('accepts a terminal failed job without pretending that an artifact exists', async () => {
  const client = new PgClient();
  const failure = validReceipt({
    workflowConclusion: 'failure',
    canonicalJobConclusion: 'failure',
    artifact: null,
    resultState: 'VERIFIED_FAIL',
    result: { state: 'VERIFIED_FAIL', failure_code: 'CANONICAL_JOB_FAILED', production: 'HOLD' },
  });
  const result = await appendWorkflowRunReceipt({ client, receipt: failure, id: () => receiptId });
  assert.equal(result.state, 'RECORDED');
  const insert = client.calls.find(call => call.sql.includes('INSERT INTO kidults_control.workflow_run_receipts'));
  assert.deepEqual(insert.params.slice(14, 21), [null, null, null, null, null, null, null]);
});

test('binds a leader receipt to the exact immutable canonical claim identity', async () => {
  const client = new PgClient();
  const result = await appendWorkflowRunReceipt({
    client,
    receipt: validReceipt({
      canonicalBinding: {
        claimId: canonicalClaimId,
        relation: 'LEADER',
        bindingDigest: leaderBindingDigest,
      },
    }),
    id: () => receiptId,
  });
  assert.equal(result.canonicalClaimId, canonicalClaimId);
  assert.equal(result.canonicalRelation, 'LEADER');
  assert.equal(result.canonicalBindingDigest, leaderBindingDigest);
  const insert = client.calls.find(call => call.sql.includes('INSERT INTO kidults_control.workflow_run_receipts'));
  assert.deepEqual(insert.params.slice(14, 17), [canonicalClaimId, 'LEADER', leaderBindingDigest]);
  assert.equal(client.calls.filter(call => call.sql.includes('FROM kidults_control.workflow_canonical_run_claims c')).length, 2);
});

test('binds an alias receipt to the exact alias row and parent canonical claim', async () => {
  const client = new PgClient();
  const result = await appendWorkflowRunReceipt({
    client,
    receipt: validReceipt({
      workflowRunId: 223456789,
      workflowRunAttempt: 2,
      canonicalBinding: {
        claimId: canonicalClaimId,
        relation: 'ALIAS',
        bindingDigest: aliasBindingDigest,
      },
    }),
    id: () => receiptId,
  });
  assert.equal(result.canonicalClaimId, canonicalClaimId);
  assert.equal(result.canonicalRelation, 'ALIAS');
  assert.equal(result.canonicalBindingDigest, aliasBindingDigest);
  const insert = client.calls.find(call => call.sql.includes('INSERT INTO kidults_control.workflow_run_receipts'));
  assert.deepEqual(insert.params.slice(14, 17), [canonicalClaimId, 'ALIAS', aliasBindingDigest]);
  assert.equal(client.calls.filter(call => call.sql.includes('FROM kidults_control.workflow_canonical_run_aliases a')).length, 2);
});

test('rejects forged leader relation, digest, run and cross-claim bindings before insert', async () => {
  const cases = [
    [{ relation: 'ALIAS', bindingDigest: leaderBindingDigest }, /CANONICAL_ALIAS_BINDING_INVALID:PRE_INSERT/],
    [{ bindingDigest: `sha256:${'9'.repeat(64)}` }, /CANONICAL_LEADER_BINDING_INVALID:PRE_INSERT/],
    [{ workflowRunId: 123456790 }, /CANONICAL_LEADER_BINDING_INVALID:PRE_INSERT/],
    [{ workflowRunAttempt: 2 }, /CANONICAL_LEADER_BINDING_INVALID:PRE_INSERT/],
    [{ workflowPath: '.github/workflows/forged-v1.yml' }, /CANONICAL_LEADER_BINDING_INVALID:PRE_INSERT/],
    [{ claimId: otherCanonicalClaimId }, /CANONICAL_LEADER_BINDING_INVALID:PRE_INSERT/],
  ];
  for (const [overrides, pattern] of cases) {
    const client = new PgClient();
    const canonicalBinding = {
      claimId: overrides.claimId ?? canonicalClaimId,
      relation: overrides.relation ?? 'LEADER',
      bindingDigest: overrides.bindingDigest ?? leaderBindingDigest,
    };
    await assert.rejects(() => appendWorkflowRunReceipt({
      client,
      receipt: validReceipt({ ...overrides, canonicalBinding }),
      id: () => receiptId,
    }), pattern);
    assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
    assert(!client.calls.some(call => call.sql.includes('INSERT INTO kidults_control.workflow_run_receipts')));
  }
});

test('rejects forged alias relation, digest, run, cross-claim and missing alias before insert', async () => {
  const base = {
    workflowRunId: 223456789,
    workflowRunAttempt: 2,
  };
  const cases = [
    [{ relation: 'LEADER', bindingDigest: aliasBindingDigest }, /CANONICAL_LEADER_BINDING_INVALID:PRE_INSERT/],
    [{ bindingDigest: `sha256:${'8'.repeat(64)}` }, /CANONICAL_ALIAS_BINDING_INVALID:PRE_INSERT/],
    [{ workflowRunId: 223456790 }, /CANONICAL_ALIAS_BINDING_INVALID:PRE_INSERT/],
    [{ workflowRunAttempt: 3 }, /CANONICAL_ALIAS_BINDING_INVALID:PRE_INSERT/],
    [{ claimId: otherCanonicalClaimId }, /CANONICAL_ALIAS_BINDING_INVALID:PRE_INSERT/],
  ];
  for (const [overrides, pattern] of cases) {
    const client = new PgClient();
    const canonicalBinding = {
      claimId: overrides.claimId ?? canonicalClaimId,
      relation: overrides.relation ?? 'ALIAS',
      bindingDigest: overrides.bindingDigest ?? aliasBindingDigest,
    };
    await assert.rejects(() => appendWorkflowRunReceipt({
      client,
      receipt: validReceipt({ ...base, ...overrides, canonicalBinding }),
      id: () => receiptId,
    }), pattern);
    assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
    assert(!client.calls.some(call => call.sql.includes('INSERT INTO kidults_control.workflow_run_receipts')));
  }

  const missing = new PgClient();
  missing.aliasRow = null;
  await assert.rejects(() => appendWorkflowRunReceipt({
    client: missing,
    receipt: validReceipt({
      ...base,
      canonicalBinding: { claimId: canonicalClaimId, relation: 'ALIAS', bindingDigest: aliasBindingDigest },
    }),
    id: () => receiptId,
  }), /CANONICAL_ALIAS_BINDING_INVALID:PRE_INSERT:CARDINALITY_0/);
  assert.equal(missing.calls.at(-1).sql, 'ROLLBACK');
  assert(!missing.calls.some(call => call.sql.includes('INSERT INTO kidults_control.workflow_run_receipts')));
});

test('keeps every canonical field null when a receipt has no canonical relation', async () => {
  const client = new PgClient();
  await appendWorkflowRunReceipt({ client, receipt: validReceipt(), id: () => receiptId });
  const insert = client.calls.find(call => call.sql.includes('INSERT INTO kidults_control.workflow_run_receipts'));
  assert.deepEqual(insert.params.slice(14, 17), [null, null, null]);
  assert(!client.calls.some(call => call.sql.includes('FROM kidults_control.workflow_canonical_run_claim')));
});

test('rolls back if the exact leader or alias relation cannot be reproduced at readback', async () => {
  for (const fixture of [
    {
      table: 'FROM kidults_control.workflow_canonical_run_claims c',
      receipt: validReceipt({
        canonicalBinding: {
          claimId: canonicalClaimId,
          relation: 'LEADER',
          bindingDigest: leaderBindingDigest,
        },
      }),
      field: 'leader_claim_binding_digest',
      pattern: /CANONICAL_LEADER_BINDING_INVALID:READBACK/,
    },
    {
      table: 'FROM kidults_control.workflow_canonical_run_aliases a',
      receipt: validReceipt({
        workflowRunId: 223456789,
        workflowRunAttempt: 2,
        canonicalBinding: {
          claimId: canonicalClaimId,
          relation: 'ALIAS',
          bindingDigest: aliasBindingDigest,
        },
      }),
      field: 'alias_binding_digest',
      pattern: /CANONICAL_ALIAS_BINDING_INVALID:READBACK/,
    },
  ]) {
    const client = new PgClient();
    const originalQuery = client.query.bind(client);
    let relationReads = 0;
    client.query = async (sql, params = []) => {
      const result = await originalQuery(sql, params);
      if (String(sql).includes(fixture.table) && ++relationReads === 2 && result.rows[0]) {
        result.rows[0][fixture.field] = `sha256:${'7'.repeat(64)}`;
      }
      return result;
    };
    await assert.rejects(
      () => appendWorkflowRunReceipt({ client, receipt: fixture.receipt, id: () => receiptId }),
      fixture.pattern
    );
    assert(client.calls.some(call => call.sql.includes('INSERT INTO kidults_control.workflow_run_receipts')));
    assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
  }
});

test('requires an exact artifact for a successful canonical job', async () => {
  const client = new PgClient();
  await assert.rejects(
    () => appendWorkflowRunReceipt({ client, receipt: validReceipt({ artifact: null }), id: () => receiptId }),
    /SUCCESS_ARTIFACT_REQUIRED/
  );
  assert.equal(client.calls.length, 0);
});

test('rejects secret-like keys and high-confidence credential values before database access', async () => {
  for (const result of [
    { state: 'HOLD', access_token: 'redacted' },
    { state: 'HOLD', api_key: 'redacted' },
    { state: 'HOLD', access_key_id: 'redacted' },
    { state: 'HOLD', client_secret: 'redacted' },
    { state: 'HOLD', endpoint: 'postgresql://operator:password@example.invalid/db' },
    { state: 'HOLD', header: 'Bearer abc.def.ghi' },
  ]) {
    const client = new PgClient();
    await assert.rejects(
      () => appendWorkflowRunReceipt({ client, receipt: validReceipt({ result }), id: () => receiptId }),
      /RESULT_SECRET_LIKE_MATERIAL_DENIED/
    );
    assert.equal(client.calls.length, 0);
  }
});

test('rejects oversized, malformed and stale bindings before database access', async () => {
  const cases = [
    [validReceipt({ result: { payload: 'x'.repeat(workflowReceiptLedgerInternals.MAX_RESULT_BYTES + 1) } }), /RESULT_JSON_TOO_LARGE/],
    [validReceipt({ workflowRunAttempt: 0 }), /WORKFLOW_RUN_ATTEMPT_INVALID/],
    [validReceipt({ sourceReceiptDigest: 'sha256:not-a-digest' }), /SOURCE_RECEIPT_DIGEST_INVALID/],
    [validReceipt({ headSha: 'ABC' }), /HEAD_SHA_INVALID/],
    [validReceipt({ artifact: { name: 'a', id: 1, digest: artifactDigest, expiresAt: '2026-08-01T00:00:00.000Z' } }), /ARTIFACT_EXPIRED_OR_INVALID/],
  ];
  for (const [receipt, pattern] of cases) {
    const client = new PgClient();
    await assert.rejects(() => appendWorkflowRunReceipt({ client, receipt, id: () => receiptId }), pattern);
    assert.equal(client.calls.length, 0);
  }
  const cyclic = { state: 'HOLD' };
  cyclic.self = cyclic;
  const sparse = [];
  sparse.length = 1;
  for (const [result, pattern] of [
    [cyclic, /RESULT_JSON_CYCLIC/],
    [{ state: 'HOLD', sparse }, /RESULT_JSON_SPARSE_ARRAY/],
  ]) {
    const client = new PgClient();
    await assert.rejects(() => appendWorkflowRunReceipt({
      client, receipt: validReceipt({ result }), id: () => receiptId,
    }), pattern);
    assert.equal(client.calls.length, 0);
  }
});

test('fails closed and rolls back when PostgreSQL cannot persist the receipt', async () => {
  const client = new PgClient();
  client.failInsert = true;
  await assert.rejects(
    () => appendWorkflowRunReceipt({ client, receipt: validReceipt(), id: () => receiptId }),
    /POSTGRES_FORCED_FAILURE/
  );
  assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
});

test('detects an inserted-row readback identity mismatch', async () => {
  const client = new PgClient();
  const originalQuery = client.query.bind(client);
  client.query = async (sql, params = []) => {
    const result = await originalQuery(sql, params);
    if (String(sql).includes('FROM kidults_control.workflow_run_receipts') && result.rows[0]) {
      result.rows[0].workflow_receipt_id = otherReceiptId;
    }
    return result;
  };
  await assert.rejects(
    () => appendWorkflowRunReceipt({ client, receipt: validReceipt(), id: () => receiptId }),
    /WORKFLOW_RECEIPT_INSERT_READBACK_ID_MISMATCH/
  );
  assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
});
