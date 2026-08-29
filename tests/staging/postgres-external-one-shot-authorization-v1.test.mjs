#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CONTRACT_PATH,
  FRESHNESS_HELPER,
  GENERIC_CONTRACT_PATH,
  RESTORE_WORKFLOW,
  SOURCE_WORKFLOW,
  validateRepository,
} from '../../scripts/staging/validate-postgres-external-one-shot-authorization-v1.mjs';

const baseline = {
  contract: JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8')),
  genericContract: JSON.parse(fs.readFileSync(GENERIC_CONTRACT_PATH, 'utf8')),
  sourceText: fs.readFileSync(SOURCE_WORKFLOW, 'utf8'),
  restoreText: fs.readFileSync(RESTORE_WORKFLOW, 'utf8'),
  helperText: fs.readFileSync(FRESHNESS_HELPER, 'utf8'),
};

const clone = () => ({
  contract: structuredClone(baseline.contract),
  genericContract: structuredClone(baseline.genericContract),
  sourceText: baseline.sourceText,
  restoreText: baseline.restoreText,
  helperText: baseline.helperText,
});

const positive = validateRepository(clone());
assert.equal(positive.state, 'VERIFIED_PASS');
assert.equal(positive.operations_validated, 2);
assert.equal(positive.provider_credentials_before_verified_consume, 0);
assert.equal(spawnSync('bash', ['-n', FRESHNESS_HELPER], { encoding: 'utf8' }).status, 0);

const helperRuntimeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-postgres-one-shot-helper-'));
try {
  const verifierDirectory = path.join(helperRuntimeDirectory, 'scripts', 'governance');
  fs.mkdirSync(verifierDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(verifierDirectory, 'external-one-shot-approval-ledger-v1.mjs'),
    "process.exit(0);\n",
    { mode: 0o700 },
  );
  const approvalExpiry = '2099-01-01T00:00:00.000Z';
  const helperRequest = path.join(helperRuntimeDirectory, 'request.json');
  const helperReceipt = path.join(helperRuntimeDirectory, 'receipt.json');
  fs.writeFileSync(helperRequest, `${JSON.stringify({
    approval_expires_at: approvalExpiry,
    consume_nonce: '12345678-1234-4123-8123-123456789abc',
  })}\n`);
  fs.writeFileSync(helperReceipt, `${JSON.stringify({
    ledger_receipt: {
      approval_expires_at: approvalExpiry,
      consumed_at: '2026-08-29T00:00:00.000Z',
      consume_nonce: '12345678-1234-4123-8123-123456789abc',
      state: 'CONSUMED',
    },
  })}\n`);
  const helperPath = path.resolve(FRESHNESS_HELPER);
  const validHelperInvocation = spawnSync(
    'bash',
    [helperPath, helperRequest, helperReceipt, '1800'],
    { cwd: helperRuntimeDirectory, encoding: 'utf8' },
  );
  assert.equal(
    validHelperInvocation.status,
    0,
    `freshness helper must accept a valid TTL: ${validHelperInvocation.stderr}`,
  );
  for (const invalidMinimum of ['-1', '01800', '100000', 'not-a-number']) {
    const invalidHelperInvocation = spawnSync(
      'bash',
      [helperPath, helperRequest, helperReceipt, invalidMinimum],
      { cwd: helperRuntimeDirectory, encoding: 'utf8' },
    );
    assert.notEqual(
      invalidHelperInvocation.status,
      0,
      `freshness helper must reject invalid minimum TTL ${invalidMinimum}`,
    );
  }
} finally {
  fs.rmSync(helperRuntimeDirectory, { recursive: true, force: true });
}

const mutationCases = [
  ['standing true reactivation', (x) => { x.sourceText = x.sourceText.replaceAll("vars.KIDULTS_REMOTE_POSTGRES_AUTO_ACTIVATION_AUTHORIZED == 'false'", "vars.KIDULTS_REMOTE_POSTGRES_AUTO_ACTIVATION_AUTHORIZED == 'true'"); }],
  ['missing standing value fail-open', (x) => { x.contract.standing_activation.missing_value_behavior = 'ALLOW'; }],
  ['replay run attempt accepted', (x) => { x.restoreText = x.restoreText.replace('test "$GITHUB_RUN_ATTEMPT" = "1"', 'test "$GITHUB_RUN_ATTEMPT" = "2"'); }],
  ['fresh nonce missing', (x) => { x.sourceText = x.sourceText.replace("CONSUME_NONCE=\"$(python3 -c 'import uuid; print(uuid.uuid4())')\"", "CONSUME_NONCE=''" ); }],
  ['static reused nonce', (x) => { x.restoreText = x.restoreText.replace('consume_nonce=str(uuid.uuid4())', "consume_nonce='00000000-0000-4000-8000-000000000000'"); }],
  ['expected approval expiry omitted', (x) => { x.sourceText = x.sourceText.replace("              'approval_expires_at':os.environ['EXPECTED_APPROVAL_EXPIRES_AT'],\n", ''); }],
  ['caller expiry mislabeled as authority', (x) => { x.restoreText = x.restoreText.replace('expected_approval_expiry_is_authority": False', 'expected_approval_expiry_is_authority": True'); }],
  ['signed approval expiry mirror not rechecked', (x) => { x.sourceText = x.sourceText.replace("          assert ledger['approval_expires_at']==context['approval_expires_at']\n", ''); }],
  ['post-bind exact grant template omitted', (x) => { x.restoreText = x.restoreText.replace("              'external_ledger_request':ledger_request,\n", ''); }],
  ['consume without exact operation', (x) => { x.sourceText = x.sourceText.replace("'operation_id':'KIDULTS_POSTGRES_SOURCE_FIXTURE_V1'", "'operation_id':'OTHER_OPERATION'"); }],
  ['dynamic target resource prefix mismatch', (x) => { x.restoreText = x.restoreText.replace("restore_target_resource_id='kidults-staging-postgres-pitr-restore/'", "restore_target_resource_id='other-target/'"); }],
  ['restore source run omitted from target binding', (x) => { x.restoreText = x.restoreText.replace("              'source_run_id':os.environ['SOURCE_RUN_ID'],\n", ''); }],
  ['restore source artifact id omitted from target binding', (x) => { x.restoreText = x.restoreText.replace("              'source_artifact_id':(temp/'source-artifact-id').read_text(),\n", ''); }],
  ['restore source artifact digest omitted from target binding', (x) => { x.restoreText = x.restoreText.replace("              'source_artifact_digest':api_digest,\n", ''); }],
  ['restore source receipt omitted from target binding', (x) => { x.restoreText = x.restoreText.replace("              'source_receipt_sha256':receipt_digest,\n", ''); }],
  ['restore reference digest omitted from target binding', (x) => { x.restoreText = x.restoreText.replace("              'restore_operation_reference_sha256':restore_reference_sha256,\n", ''); }],
  ['restore reference hashing weakened', (x) => { x.restoreText = x.restoreText.replace("restore_reference_sha256='sha256:'+hashlib.sha256(restore_reference.encode('utf-8')).hexdigest()", "restore_reference_sha256='sha256:'+'0'*64"); }],
  ['restore target canonicalization weakened', (x) => { x.restoreText = x.restoreText.replace("canonical_binding=json.dumps(target_binding_material,sort_keys=True,separators=(',',':')).encode('utf-8')", "canonical_binding=json.dumps(target_binding_material).encode('utf-8')"); }],
  ['restore nonce generated before source binding', (x) => { x.restoreText = x.restoreText.replace('consume_nonce=str(uuid.uuid4())', "consume_nonce='prebound'"); }],
  ['restore request window removed after source binding', (x) => { x.restoreText = x.restoreText.replace('now+datetime.timedelta(seconds=600)', 'now'); }],
  ['restore authorization request digest omitted', (x) => { x.restoreText = x.restoreText.replaceAll("              'authorization_request_sha256':authorization_request_sha256,\n", ''); }],
  ['restore target digest output mismatch accepted', (x) => { x.restoreText = x.restoreText.replace("assert target['target_digest']==os.environ['EXPECTED_RESTORE_TARGET_DIGEST']", 'assert True'); }],
  ['restore target provider recheck removed', (x) => { x.restoreText = x.restoreText.replace("assert context['target']==expected_target", 'assert True'); }],
  ['restore binding contract mode weakened', (x) => { x.contract.operations[1].target.mode = 'STATIC'; }],
  ['restore binding contract field removed', (x) => { x.contract.operations[1].target_binding.required_fields = x.contract.operations[1].target_binding.required_fields.filter((field) => field !== 'source_receipt_sha256'); }],
  ['contract target digest mismatch', (x) => { x.contract.operations[0].target.target_digest = `sha256:${'0'.repeat(64)}`; }],
  ['generic signature verification removed', (x) => { x.sourceText = x.sourceText.replace('node scripts/governance/external-one-shot-approval-ledger-v1.mjs verify', 'true'); }],
  ['repository Ed25519 pin load removed', (x) => { x.sourceText = x.sourceText.replace('Load repository-machine-pinned ledger verification digest', 'Skip ledger verification pin'); }],
  ['repository Ed25519 pin export removed', (x) => { x.restoreText = x.restoreText.replace("          printf 'KIDULTS_APPROVAL_LEDGER_RESPONSE_ED25519_PUBLIC_KEY_SHA256=%s\\n' \"$PIN\" >> \"$GITHUB_ENV\"\n", ''); }],
  ['repository Ed25519 pin falsely claimed provisioned', (x) => { x.contract.external_ledger.response_verification.public_key_spki_sha256 = `sha256:${'0'.repeat(64)}`; }],
  ['generic public-key pin requirement removed', (x) => { x.genericContract.authentication.response.client_public_key_sha256_must_be_pinned_by_repository_machine_binding = false; }],
  ['symmetric response key reintroduced', (x) => { x.sourceText = x.sourceText.replace('          KIDULTS_APPROVAL_LEDGER_BASE_URL:', '          KIDULTS_APPROVAL_LEDGER_RESPONSE_HMAC_KEY_B64: ${{ secrets.KIDULTS_APPROVAL_LEDGER_RESPONSE_HMAC_KEY_B64 }}\n          KIDULTS_APPROVAL_LEDGER_BASE_URL:'); }],
  ['ledger private signing key introduced into GitHub', (x) => { x.restoreText = x.restoreText.replace('          KIDULTS_APPROVAL_LEDGER_BASE_URL:', '          KIDULTS_APPROVAL_LEDGER_RESPONSE_ED25519_PRIVATE_KEY_B64: ${{ secrets.KIDULTS_APPROVAL_LEDGER_RESPONSE_ED25519_PRIVATE_KEY_B64 }}\n          KIDULTS_APPROVAL_LEDGER_BASE_URL:'); }],
  ['provider secret introduced into ledger job', (x) => { x.sourceText = x.sourceText.replace('          KIDULTS_APPROVAL_LEDGER_BASE_URL:', '          POSTGRES_DSN: ${{ secrets.KIDULTS_STAGING_POSTGRES_DSN }}\n          KIDULTS_APPROVAL_LEDGER_BASE_URL:'); }],
  ['provider needs gate removed', (x) => { x.restoreText = x.restoreText.replace("needs.consume-one-shot-authorization.outputs.authorized == 'true'", "'true' == 'true'"); }],
  ['provider receipt recheck removed', (x) => { x.sourceText = x.sourceText.replace('Verify consumed external one-shot authorization binding before provider credentials', 'Skip authorization binding'); }],
  ['provider operation recheck mismatch', (x) => { x.restoreText = x.restoreText.replace("assert context['operation_id']=='KIDULTS_POSTGRES_TARGET_TIME_RESTORE_VERIFY_V1'", "assert context['operation_id']=='OTHER_OPERATION'"); }],
  ['provider expiry recheck removed', (x) => { x.helperText = x.helperText.replace('assert now + datetime.timedelta(seconds=minimum_remaining) < expiry', 'assert True'); }],
  ['provider start minimum ttl removed', (x) => { x.sourceText = x.sourceText.replace('"$AUTHORIZATION_CONTEXT" "$AUTHORIZATION_RECEIPT" 1800', '"$AUTHORIZATION_CONTEXT" "$AUTHORIZATION_RECEIPT" 0'); }],
  ['consume minimum ttl removed', (x) => { x.sourceText = x.sourceText.replace('datetime.timedelta(seconds=1800) < expiry', 'datetime.timedelta(seconds=0) < expiry'); }],
  ['signed consumed-at minimum ttl removed', (x) => { x.restoreText = x.restoreText.replace('parse(consumed_at)+datetime.timedelta(seconds=1800) < parse(approval_expires_at)', 'parse(consumed_at) < parse(approval_expires_at)'); }],
  ['provider signed consumed-at ttl recheck removed', (x) => { x.helperText = x.helperText.replace('assert consumed + datetime.timedelta(seconds=minimum_remaining) < expiry', 'assert consumed < expiry'); }],
  ['contract minimum ttl weakened', (x) => { x.contract.request_window.minimum_approval_seconds_remaining_at_consume_and_provider_start = 0; }],
  ['contract signed consumed-at ttl weakened', (x) => { x.contract.request_window.minimum_approval_seconds_remaining_at_signed_consumed_at = 0; }],
  ['same-run artifact binding removed', (x) => { x.sourceText = x.sourceText.replace("item.get('workflow_run',{}).get('id')==int(os.environ['GITHUB_RUN_ID'])", 'True'); }],
  ['artifact listing retry removed', (x) => { x.sourceText = x.sourceText.replace('for attempt in $(seq 1 12); do', 'for attempt in $(seq 1 1); do'); }],
  ['artifact download retry removed', (x) => { x.restoreText = x.restoreText.replace('for attempt in $(seq 1 6); do', 'for attempt in $(seq 1 1); do'); }],
  ['artifact digest recheck removed', (x) => { x.restoreText = x.restoreText.replace("'sha256:'+hashlib.sha256(archive.read_bytes()).hexdigest()==expected", 'True'); }],
  ['artifact symlink rejection removed', (x) => { x.sourceText = x.sourceText.replace('                  assert not stat.S_ISLNK(member.external_attr >> 16)\n', ''); }],
  ['artifact root-file cardinality weakened', (x) => { x.restoreText = x.restoreText.replace('assert sorted(item.filename for item in files)', 'assert sorted(PurePosixPath(item.filename).name for item in files)'); }],
  ['provider Ed25519 verification removed', (x) => { x.helperText = x.helperText.replace('node scripts/governance/external-one-shot-approval-ledger-v1.mjs verify', 'true'); }],
  ['freshness helper consumed-state check removed', (x) => { x.helperText = x.helperText.replace("assert ledger['state'] == 'CONSUMED'", 'assert True'); }],
  ['freshness helper nonce mirror removed', (x) => { x.helperText = x.helperText.replace("assert ledger['consume_nonce'] == request['consume_nonce']", 'assert True'); }],
  ['freshness helper expiry mirror removed', (x) => { x.helperText = x.helperText.replace("assert ledger['approval_expires_at'] == request['approval_expires_at']", 'assert True'); }],
  ['freshness helper numeric guard removed', (x) => { x.helperText = x.helperText.replace('[[ "$minimum_remaining_seconds" =~ ^(0|[1-9][0-9]{0,4})$ ]]', 'true'); }],
  ['freshness helper fail-open replacement', (x) => { x.helperText = '#!/usr/bin/env bash\nexit 0\n'; }],
  ['freshness helper exact-main trigger removed', (x) => { x.sourceText = x.sourceText.replace("      - 'scripts/staging/verify-postgres-one-shot-authorization-fresh-v1.sh'\n", ''); }],
  ['secret step in-step reverify removed', (x) => {
    const marker='      - name: Materialize dedicated STAGING key';
    const start=x.sourceText.indexOf(marker);
    const call='          scripts/staging/verify-postgres-one-shot-authorization-fresh-v1.sh "$AUTHORIZATION_CONTEXT" "$AUTHORIZATION_RECEIPT" 0\n';
    const at=x.sourceText.indexOf(call,start);
    x.sourceText=x.sourceText.slice(0,at)+x.sourceText.slice(at+call.length);
  }],
  ['provider-call step in-step reverify removed', (x) => {
    const marker='      - name: Execute target-time restore verification through pinned SSH tunnel';
    const start=x.restoreText.indexOf(marker);
    const call='          scripts/staging/verify-postgres-one-shot-authorization-fresh-v1.sh "$AUTHORIZATION_CONTEXT" "$AUTHORIZATION_RECEIPT" 0\n';
    const at=x.restoreText.indexOf(call,start);
    x.restoreText=x.restoreText.slice(0,at)+x.restoreText.slice(at+call.length);
  }],
  ['provider secret precedes receipt', (x) => {
    const marker='      - name: Verify consumed external one-shot authorization binding before provider credentials';
    x.sourceText=x.sourceText.replace(marker, '      - name: Unsafe provider secret\n        env:\n          POSTGRES_DSN: ${{ secrets.KIDULTS_STAGING_POSTGRES_DSN }}\n        run: true\n\n      - name: Verify consumed external one-shot authorization binding before provider credentials');
  }],
  ['concurrency cancellation weakens terminal receipt', (x) => { x.sourceText = x.sourceText.replace('cancel-in-progress: false', 'cancel-in-progress: true'); }],
  ['offline fail-open contract', (x) => { x.contract.external_ledger.offline_or_ambiguous_behavior = 'ALLOW'; }],
  ['atomic transition removed', (x) => { x.contract.external_ledger.atomic_transition = 'READ_ONLY_CHECK'; }],
  ['replay response accepted', (x) => { x.contract.external_ledger.replay_http_status = 201; }],
  ['expired response accepted', (x) => { x.contract.external_ledger.expired_http_status = 201; }],
  ['mismatch response accepted', (x) => { x.contract.external_ledger.binding_mismatch_http_status = 201; }],
  ['generic approval expiry request binding removed', (x) => { x.genericContract.consume_request.required_fields = x.genericContract.consume_request.required_fields.filter((field) => field !== 'approval_expires_at'); }],
  ['generic ledger atomic transition drift', (x) => { x.genericContract.atomic_transition.transition = 'READ_ONLY_CHECK'; }],
];

for (const [name, mutate] of mutationCases) {
  const fixture = clone();
  const before = JSON.stringify(fixture);
  mutate(fixture);
  assert.notEqual(JSON.stringify(fixture), before, `mutation must change fixture: ${name}`);
  assert.throws(() => validateRepository(fixture), undefined, name);
}

class SyntheticAtomicLedger {
  #state = 'ACTIVE';
  #consumedNonces = new Set();
  async consume(binding) {
    await new Promise((resolve) => setImmediate(resolve));
    if (binding.offline) return { status: 0, provider_calls: 0 };
    if (binding.expired) return { status: 410, provider_calls: 0 };
    if (binding.mismatch) return { status: 422, provider_calls: 0 };
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(binding.consume_nonce || '')) {
      return { status: 422, provider_calls: 0 };
    }
    if (this.#consumedNonces.has(binding.consume_nonce)) return { status: 409, provider_calls: 0 };
    if (this.#state !== 'ACTIVE') return { status: 409, provider_calls: 0 };
    this.#state = 'CONSUMED';
    this.#consumedNonces.add(binding.consume_nonce);
    return { status: 201, provider_calls: 1 };
  }
}

const ledger = new SyntheticAtomicLedger();
const nonce = '12345678-1234-4123-8123-123456789abc';
const concurrent = await Promise.all(Array.from({ length: 16 }, () => ledger.consume({ consume_nonce: nonce })));
assert.equal(concurrent.filter((item) => item.status === 201).length, 1);
assert.equal(concurrent.filter((item) => item.status === 409).length, 15);
assert.equal(concurrent.filter((item) => item.status === 409).reduce((sum, item) => sum + item.provider_calls, 0), 0);
assert.equal(concurrent.reduce((sum, item) => sum + item.provider_calls, 0), 1);
assert.deepEqual(await new SyntheticAtomicLedger().consume({ consume_nonce: nonce, expired: true }), { status: 410, provider_calls: 0 });
assert.deepEqual(await new SyntheticAtomicLedger().consume({ consume_nonce: nonce, mismatch: true }), { status: 422, provider_calls: 0 });
assert.deepEqual(await new SyntheticAtomicLedger().consume({ consume_nonce: nonce, offline: true }), { status: 0, provider_calls: 0 });
assert.deepEqual(await new SyntheticAtomicLedger().consume({}), { status: 422, provider_calls: 0 });
const replayLedger = new SyntheticAtomicLedger();
assert.deepEqual(await replayLedger.consume({ consume_nonce: nonce }), { status: 201, provider_calls: 1 });
assert.deepEqual(await replayLedger.consume({ consume_nonce: nonce }), { status: 409, provider_calls: 0 });

process.stdout.write(`${JSON.stringify({
  id: 'kidults-postgres-external-one-shot-authorization-test-v1',
  state: 'VERIFIED_PASS',
  mutation_cases_rejected: mutationCases.length,
  concurrent_consumers: concurrent.length,
  concurrent_winners: 1,
  replay_rejections: 15,
  expired_provider_calls: 0,
  mismatch_provider_calls: 0,
  offline_provider_calls: 0,
  missing_nonce_provider_calls: 0,
  reused_nonce_provider_calls: 0,
  production: 'HOLD',
  public_release: 'HOLD',
  g5: 'HOLD',
}, null, 2)}\n`);
