#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';

export const CONTRACT_PATH = 'coordination/kidults/runtime/postgres-external-one-shot-authorization-v1.json';
export const GENERIC_CONTRACT_PATH = 'coordination/kidults/governance/external-one-shot-approval-ledger-v1.json';
export const SOURCE_WORKFLOW = '.github/workflows/p0-remote-postgres-persistence-pitr.yml';
export const RESTORE_WORKFLOW = '.github/workflows/p0-postgres-target-time-restore-verification.yml';
export const FRESHNESS_HELPER = 'scripts/staging/verify-postgres-one-shot-authorization-fresh-v1.sh';

const STANDING_VARIABLE = 'KIDULTS_REMOTE_POSTGRES_AUTO_ACTIVATION_AUTHORIZED';
const CONSUME_JOB = 'consume-one-shot-authorization';
const CONSUME_ENVIRONMENT = 'kidults-approval-ledger-consume';
const RECEIPT_STEP = 'Verify consumed external one-shot authorization binding before provider credentials';
const GENERIC_CLIENT = 'scripts/governance/external-one-shot-approval-ledger-v1.mjs';
const SECRET_NAMES = ['KIDULTS_APPROVAL_LEDGER_REQUEST_HMAC_KEY_B64'];
const RESPONSE_PUBLIC_KEY_VARIABLE = 'KIDULTS_APPROVAL_LEDGER_RESPONSE_ED25519_PUBLIC_KEY_B64';
const RESPONSE_PUBLIC_KEY_PIN_ENVIRONMENT = 'KIDULTS_APPROVAL_LEDGER_RESPONSE_ED25519_PUBLIC_KEY_SHA256';
const LEDGER_PRIVATE_KEY_ENVIRONMENT = 'KIDULTS_APPROVAL_LEDGER_RESPONSE_ED25519_PRIVATE_KEY_B64';
const PIN_STEP = 'Load repository-machine-pinned ledger verification digest';

const fail = (code) => { throw new Error(code); };
const requireTrue = (condition, code) => { if (!condition) fail(code); };

function jobBlock(text, jobId) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${jobId}:`);
  if (start < 0) fail(`JOB_MISSING:${jobId}`);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[index])) { end = index; break; }
  }
  return lines.slice(start, end).join('\n');
}

function count(text, marker) {
  return text.split(marker).length - 1;
}

function namedStepBlock(jobText, stepName) {
  const marker = `      - name: ${stepName}`;
  const start = jobText.indexOf(marker);
  if (start < 0) fail(`STEP_MISSING:${stepName}`);
  const candidates = [
    jobText.indexOf('\n      - name:', start + marker.length),
    jobText.indexOf('\n      - uses:', start + marker.length),
  ].filter((index) => index >= 0);
  const end = candidates.length > 0 ? Math.min(...candidates) : jobText.length;
  return jobText.slice(start, end);
}

function pythonObjectBlock(text, assignment) {
  const start = text.indexOf(assignment);
  if (start < 0) fail(`PYTHON_OBJECT_MISSING:${assignment}`);
  const end = text.indexOf('\n          }', start + assignment.length);
  if (end < 0) fail(`PYTHON_OBJECT_UNTERMINATED:${assignment}`);
  return text.slice(start, end);
}

export function validateWorkflow(text, operation) {
  const { operation_id: operationId, provider_job: providerJob, target } = operation;
  const dynamicRestoreTarget = target.mode === 'DYNAMIC_DIGEST_BOUND_RESOURCE_ID';
  let targetDigest = null;
  let targetIdentity = null;
  if (dynamicRestoreTarget) {
    requireTrue(operation.target_binding?.id === 'kidults-postgres-restore-target-binding-v1', `DYNAMIC_TARGET_BINDING_ID:${operationId}`);
    requireTrue(target.resource_id_prefix === 'kidults-staging-postgres-pitr-restore/', `DYNAMIC_TARGET_RESOURCE_PREFIX:${operationId}`);
    requireTrue(operation.target_binding?.canonical_json === 'UTF8_SORTED_KEYS_NO_WHITESPACE', `DYNAMIC_TARGET_CANONICALIZATION:${operationId}`);
    requireTrue(operation.target_binding?.source_run_id_type === 'DECIMAL_STRING' && operation.target_binding?.source_artifact_id_type === 'DECIMAL_STRING', `DYNAMIC_TARGET_ID_TYPES:${operationId}`);
    requireTrue(operation.target_binding?.restore_operation_reference === 'BOUND_NOT_VERIFIED', `DYNAMIC_TARGET_REFERENCE_TRUTH:${operationId}`);
    requireTrue(operation.target_binding?.restore_target_time_format === 'WHOLE_SECOND_UTC_RFC3339', `DYNAMIC_TARGET_TIME_FORMAT:${operationId}`);
    requireTrue(JSON.stringify(operation.target_binding?.required_fields) === JSON.stringify([
      'id', 'source_run_id', 'source_artifact_id', 'source_artifact_digest', 'source_receipt_sha256', 'restore_target_time', 'restore_operation_reference_sha256'
    ]), `DYNAMIC_TARGET_BINDING_FIELDS:${operationId}`);
  } else {
    ({ target_digest: targetDigest, ...targetIdentity } = target);
    const computedTargetDigest = `sha256:${crypto.createHash('sha256').update(JSON.stringify(
      Object.fromEntries(Object.entries(targetIdentity).sort(([left], [right]) => left.localeCompare(right)))
    )).digest('hex')}`;
    requireTrue(targetDigest === computedTargetDigest, `CONTRACT_TARGET_DIGEST_MISMATCH:${operationId}`);
  }
  const triggerText = text.split('\npermissions:')[0];
  requireTrue(triggerText.includes('approval_id:'), `APPROVAL_ID_INPUT_MISSING:${operationId}`);
  requireTrue(triggerText.includes('approval_expires_at:'), `EXPECTED_APPROVAL_EXPIRY_INPUT_MISSING:${operationId}`);
  requireTrue(triggerText.includes('input cannot create or extend authority'), `APPROVAL_EXPIRY_NON_AUTHORITY_DESCRIPTION_MISSING:${operationId}`);
  requireTrue(!new RegExp(`vars\\.${STANDING_VARIABLE}\\s*==\\s*['\"]true['\"]`).test(text), `STANDING_TRUE_GUARD_FORBIDDEN:${operationId}`);
  requireTrue(!text.includes('ACTIVATION_AUTHORIZED:'), `LEGACY_ACTIVATION_ENV_FORBIDDEN:${operationId}`);
  requireTrue(text.includes(`vars.${STANDING_VARIABLE} == 'false'`), `STANDING_FALSE_JOB_GUARD_MISSING:${operationId}`);
  requireTrue(text.includes('BLOCKED_STANDING_AUTHORIZATION_MUST_BE_FALSE'), `STANDING_FALSE_RECEIPT_MISSING:${operationId}`);
  requireTrue(text.includes('BLOCKED_RUN_ATTEMPT_REPLAY'), `RUN_ATTEMPT_REPLAY_BLOCK_MISSING:${operationId}`);
  requireTrue(
    dynamicRestoreTarget
      ? text.includes('consume_nonce=str(uuid.uuid4())')
      : text.includes("CONSUME_NONCE=\"$(python3 -c 'import uuid; print(uuid.uuid4())')\""),
    `FRESH_UUID_GENERATION_MISSING:${operationId}`
  );
  requireTrue(text.includes("'consume_nonce':os.environ['CONSUME_NONCE']"), `CONSUME_NONCE_CONTEXT_BINDING_MISSING:${operationId}`);
  requireTrue(text.includes("'requested_at':os.environ['REQUESTED_AT']"), `READINESS_REQUESTED_AT_BINDING_MISSING:${operationId}`);
  requireTrue(text.includes("'request_expires_at':os.environ['REQUEST_EXPIRES_AT']"), `READINESS_REQUEST_EXPIRY_BINDING_MISSING:${operationId}`);
  requireTrue(text.includes("'approval_expires_at':os.environ['EXPECTED_APPROVAL_EXPIRES_AT']"), `EXPECTED_APPROVAL_EXPIRY_BINDING_MISSING:${operationId}`);
  requireTrue(text.includes('expected_approval_expiry_is_authority": False'), `APPROVAL_EXPIRY_NON_AUTHORITY_RECEIPT_MISSING:${operationId}`);
  requireTrue(text.includes('datetime.timedelta(seconds=600)'), `BOUNDED_REQUEST_WINDOW_MISSING:${operationId}`);
  requireTrue(!text.includes('KIDULTS_APPROVAL_AUTHORIZATION_NONCE'), `STANDING_AUTHORIZATION_NONCE_FORBIDDEN:${operationId}`);

  const consume = jobBlock(text, CONSUME_JOB);
  const readiness = jobBlock(text, 'activation-readiness-receipt');
  const provider = jobBlock(text, providerJob);
  const terminal = jobBlock(text, 'terminal-receipt');
  const grantPreparation = dynamicRestoreTarget ? jobBlock(text, 'bind-source-fixture') : readiness;
  requireTrue(
    dynamicRestoreTarget
      ? grantPreparation.includes("'external_ledger_request':ledger_request")
      : grantPreparation.includes('"external_ledger_request": ledger_request'),
    `READINESS_EXACT_GRANT_TEMPLATE_MISSING:${operationId}`
  );
  requireTrue(
    dynamicRestoreTarget
      ? grantPreparation.includes(`'operation_id':'${operationId}'`)
      : grantPreparation.includes(`"operation_id":"${operationId}"`),
    `READINESS_OPERATION_BINDING_MISSING:${operationId}`
  );
  if (dynamicRestoreTarget) {
    requireTrue(readiness.includes('"external_ledger_request": None') && readiness.includes('"external_ledger_request_prepared_after_source_binding": True'), `RESTORE_PREBIND_GRANT_FORBIDDEN:${operationId}`);
    const bindingObject = pythonObjectBlock(grantPreparation, 'target_binding_material={');
    for (const marker of [
      "'id':'kidults-postgres-restore-target-binding-v1'",
      "'source_run_id':os.environ['SOURCE_RUN_ID']",
      "'source_artifact_id':(temp/'source-artifact-id').read_text()",
      "'source_artifact_digest':api_digest",
      "'source_receipt_sha256':receipt_digest",
      "'restore_target_time':fixture['target_time']",
      "'restore_operation_reference_sha256':restore_reference_sha256",
    ]) requireTrue(bindingObject.includes(marker), `RESTORE_POST_BIND_TARGET_FIELD_MISSING:${operationId}:${marker}`);
    for (const marker of [
      "restore_reference_sha256='sha256:'+hashlib.sha256(restore_reference.encode('utf-8')).hexdigest()",
      "canonical_binding=json.dumps(target_binding_material,sort_keys=True,separators=(',',':')).encode('utf-8')",
      "restore_target_resource_id='kidults-staging-postgres-pitr-restore/'",
      "target['target_digest']='sha256:'",
      'consume_nonce=str(uuid.uuid4())',
      'datetime.timedelta(seconds=600)',
      "'authorization_request_sha256':authorization_request_sha256",
      "'restore_operation_reference_state':'BOUND_NOT_VERIFIED'",
    ]) requireTrue(grantPreparation.includes(marker), `RESTORE_POST_BIND_GRANT_BINDING_MISSING:${operationId}:${marker}`);
  } else {
    requireTrue(grantPreparation.includes(`"target_digest":"${targetDigest}"`), `READINESS_TARGET_DIGEST_BINDING_MISSING:${operationId}`);
    for (const marker of ['"repository":os.environ["GITHUB_REPOSITORY"]','"workflow_ref":os.environ["GITHUB_WORKFLOW_REF"]','"github_run_id":os.environ["GITHUB_RUN_ID"]','"github_run_attempt":int(os.environ["GITHUB_RUN_ATTEMPT"])','"requested_at":requested_at','"request_expires_at":request_expires_at','"approval_expires_at":os.environ["APPROVAL_EXPIRES_AT"]']) {
      requireTrue(grantPreparation.includes(marker), `READINESS_GRANT_BINDING_MISSING:${operationId}:${marker}`);
    }
  }
  requireTrue(consume.includes(`environment: ${CONSUME_ENVIRONMENT}`), `LEDGER_ENVIRONMENT_MISSING:${operationId}`);
  requireTrue(consume.includes("github.event_name == 'workflow_dispatch'"), `CONSUME_DISPATCH_ONLY_MISSING:${operationId}`);
  requireTrue(consume.includes("github.ref == 'refs/heads/main'"), `CONSUME_MAIN_ONLY_MISSING:${operationId}`);
  requireTrue(consume.includes(`vars.${STANDING_VARIABLE} == 'false'`), `CONSUME_STANDING_FALSE_MISSING:${operationId}`);
  requireTrue(consume.includes('test "$GITHUB_RUN_ATTEMPT" = "1"'), `CONSUME_ATTEMPT_ONE_MISSING:${operationId}`);
  requireTrue(consume.includes('[[ "$CONSUME_NONCE" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]]'), `CONSUME_NONCE_UUID_MISSING:${operationId}`);
  requireTrue(consume.includes(`'operation_id':'${operationId}'`), `OPERATION_BINDING_MISSING:${operationId}`);
  if (dynamicRestoreTarget) {
    const bindingObject = pythonObjectBlock(consume, 'target_binding_material={');
    for (const marker of [
      "'id':'kidults-postgres-restore-target-binding-v1'",
      "'source_run_id':os.environ['SOURCE_RUN_ID']",
      "'source_artifact_id':os.environ['SOURCE_ARTIFACT_ID']",
      "'source_artifact_digest':os.environ['SOURCE_ARTIFACT_DIGEST']",
      "'source_receipt_sha256':os.environ['SOURCE_RECEIPT_SHA256']",
      "'restore_target_time':os.environ['RESTORE_TARGET_TIME']",
      "'restore_operation_reference_sha256':restore_reference_sha256",
    ]) requireTrue(bindingObject.includes(marker), `DYNAMIC_TARGET_CONSUME_FIELD_MISSING:${operationId}:${marker}`);
    for (const marker of [
      'CONSUME_NONCE: ${{ needs.bind-source-fixture.outputs.consume_nonce }}',
      'REQUESTED_AT: ${{ needs.bind-source-fixture.outputs.requested_at }}',
      'REQUEST_EXPIRES_AT: ${{ needs.bind-source-fixture.outputs.request_expires_at }}',
      "restore_reference_sha256='sha256:'+hashlib.sha256(os.environ['RESTORE_OPERATION_REFERENCE'].encode('utf-8')).hexdigest()",
      "json.dumps(target_binding_material,sort_keys=True,separators=(',',':')).encode('utf-8')",
      "assert restore_target_binding_digest==os.environ['EXPECTED_RESTORE_TARGET_BINDING_DIGEST']",
      "assert resource_id==os.environ['EXPECTED_RESTORE_TARGET_RESOURCE_ID']",
      "assert target['target_digest']==os.environ['EXPECTED_RESTORE_TARGET_DIGEST']",
      "assert request_sha256==os.environ['EXPECTED_AUTHORIZATION_REQUEST_SHA256']",
    ]) requireTrue(consume.includes(marker), `DYNAMIC_TARGET_CONSUME_BINDING_MISSING:${operationId}:${marker}`);
  } else {
    for (const [key, value] of Object.entries(targetIdentity)) {
      requireTrue(consume.includes(`'${key}':'${value}'`), `TARGET_BINDING_MISSING:${operationId}:${key}`);
    }
  }
  requireTrue(consume.includes("target['target_digest']='sha256:'"), `TARGET_DIGEST_MISSING:${operationId}`);
  requireTrue(consume.includes('datetime.timedelta(seconds=1800) < expiry'), `CONSUME_MINIMUM_APPROVAL_TTL_MISSING:${operationId}`);
  requireTrue(consume.includes(`node ${GENERIC_CLIENT} consume`) && consume.includes('--request'), `ATOMIC_CONSUME_CLIENT_MISSING:${operationId}`);
  requireTrue(consume.includes('--receipt-out'), `CONSUME_RECEIPT_OUTPUT_MISSING:${operationId}`);
  requireTrue(consume.includes(`node ${GENERIC_CLIENT} verify`) && count(consume, '--request') >= 2, `SIGNED_RECEIPT_REVERIFY_MISSING:${operationId}`);
  requireTrue(consume.indexOf(`node ${GENERIC_CLIENT} consume`) < consume.indexOf("'authorized':'true'"), `AUTHORIZED_OUTPUT_BEFORE_CONSUME:${operationId}`);
  requireTrue(consume.indexOf(`node ${GENERIC_CLIENT} verify`) < consume.indexOf("'authorized':'true'"), `AUTHORIZED_OUTPUT_BEFORE_VERIFY:${operationId}`);
  requireTrue(consume.includes("ledger=receipt['ledger_receipt']") && consume.includes("assert ledger['state']=='CONSUMED'"), `CONSUMED_STATE_ASSERTION_MISSING:${operationId}`);
  requireTrue(consume.includes("assert ledger['consume_nonce']==context['consume_nonce']"), `SIGNED_NONCE_RECHECK_MISSING:${operationId}`);
  requireTrue(consume.includes("assert ledger['approval_expires_at']==context['approval_expires_at']"), `SIGNED_EXPECTED_EXPIRY_RECHECK_MISSING:${operationId}`);
  requireTrue(consume.includes('assert parse(consumed_at)+datetime.timedelta(seconds=1800) < parse(approval_expires_at)'), `SIGNED_CONSUMED_AT_MINIMUM_TTL_RECHECK_MISSING:${operationId}`);
  requireTrue(consume.includes(`KIDULTS_APPROVAL_LEDGER_RESPONSE_ED25519_PUBLIC_KEY_B64: \${{ vars.${RESPONSE_PUBLIC_KEY_VARIABLE} }}`), `LEDGER_PUBLIC_KEY_VARIABLE_MISSING:${operationId}`);
  requireTrue(consume.includes(`- name: ${PIN_STEP}`), `LEDGER_REPOSITORY_PIN_STEP_MISSING:${operationId}`);
  requireTrue(consume.includes("['external_ledger']['response_verification']['public_key_spki_sha256']"), `LEDGER_REPOSITORY_PIN_SOURCE_MISSING:${operationId}`);
  requireTrue(consume.includes(`printf '${RESPONSE_PUBLIC_KEY_PIN_ENVIRONMENT}=%s\\n' "$PIN" >> "$GITHUB_ENV"`), `LEDGER_REPOSITORY_PIN_EXPORT_MISSING:${operationId}`);
  requireTrue(consume.indexOf(`- name: ${PIN_STEP}`) < consume.indexOf(`node ${GENERIC_CLIENT} consume`), `LEDGER_CONSUME_BEFORE_REPOSITORY_PIN:${operationId}`);
  requireTrue(!consume.includes('KIDULTS_APPROVAL_LEDGER_RESPONSE_HMAC_KEY_B64'), `SYMMETRIC_RESPONSE_KEY_FORBIDDEN:${operationId}`);
  requireTrue(!consume.includes(LEDGER_PRIVATE_KEY_ENVIRONMENT), `LEDGER_PRIVATE_KEY_IN_GITHUB_FORBIDDEN:${operationId}`);
  requireTrue(!/secrets\.(?:KIDULTS_STAGING_POSTGRES_DSN|KIDULTS_STAGING_POSTGRES_PITR_RESTORE_DSN|KIDULTS_STAGING_SSH_PRIVATE_KEY_B64)/.test(consume), `PROVIDER_SECRET_IN_LEDGER_JOB:${operationId}`);
  for (const secret of SECRET_NAMES) {
    requireTrue(count(consume, `secrets.${secret}`) === 1, `LEDGER_SECRET_SCOPE_INVALID:${operationId}:${secret}`);
  }

  requireTrue(provider.includes(`- ${CONSUME_JOB}`) || provider.includes(`needs: ${CONSUME_JOB}`), `PROVIDER_NEEDS_CONSUME_MISSING:${operationId}`);
  requireTrue(provider.includes(`needs.${CONSUME_JOB}.result == 'success'`), `PROVIDER_CONSUME_RESULT_GUARD_MISSING:${operationId}`);
  requireTrue(provider.includes(`needs.${CONSUME_JOB}.outputs.authorized == 'true'`), `PROVIDER_AUTHORIZED_OUTPUT_GUARD_MISSING:${operationId}`);
  requireTrue(provider.includes(`vars.${STANDING_VARIABLE} == 'false'`), `PROVIDER_STANDING_FALSE_GUARD_MISSING:${operationId}`);
  requireTrue(provider.includes(`- name: ${RECEIPT_STEP}`), `PROVIDER_RECEIPT_STEP_MISSING:${operationId}`);
  requireTrue(provider.includes('Download exact same-run signed authorization receipt'), `PROVIDER_RECEIPT_ARTIFACT_DOWNLOAD_MISSING:${operationId}`);
  requireTrue(provider.includes('$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID/artifacts?per_page=100&name=$ARTIFACT_NAME'), `PROVIDER_SAME_RUN_ARTIFACT_API_MISSING:${operationId}`);
  requireTrue(provider.includes('for attempt in $(seq 1 12); do') && provider.includes('if [ "$attempt" -lt 12 ]; then sleep 5; fi'), `PROVIDER_ARTIFACT_BOUNDED_RETRY_MISSING:${operationId}`);
  requireTrue(provider.includes('for attempt in $(seq 1 6); do') && provider.includes('if [ "$attempt" -lt 6 ]; then sleep 5; fi') && provider.includes('test "$downloaded" = "true"'), `PROVIDER_ARTIFACT_DOWNLOAD_BOUNDED_RETRY_MISSING:${operationId}`);
  requireTrue(provider.includes("item.get('workflow_run',{}).get('id')==int(os.environ['GITHUB_RUN_ID'])"), `PROVIDER_ARTIFACT_RUN_BINDING_MISSING:${operationId}`);
  requireTrue(provider.includes("item.get('workflow_run',{}).get('head_sha')==os.environ['GITHUB_SHA']"), `PROVIDER_ARTIFACT_SHA_BINDING_MISSING:${operationId}`);
  requireTrue(count(provider, "'sha256:'+hashlib.sha256(archive.read_bytes()).hexdigest()==expected") >= 2, `PROVIDER_ARTIFACT_DIGEST_RECHECK_MISSING:${operationId}`);
  requireTrue(provider.includes('assert not stat.S_ISLNK(member.external_attr >> 16)'), `PROVIDER_ARTIFACT_SYMLINK_REJECTION_MISSING:${operationId}`);
  requireTrue(provider.includes("assert sorted(item.filename for item in files)==['authorization-consumption.json','authorization-context.json']"), `PROVIDER_ARTIFACT_EXACT_ROOT_FILES_MISSING:${operationId}`);
  requireTrue(provider.includes("['authorization-consumption.json','authorization-context.json']"), `PROVIDER_ARTIFACT_EXACT_FILES_MISSING:${operationId}`);
  requireTrue(provider.includes(`assert context['operation_id']=='${operationId}'`), `PROVIDER_OPERATION_RECHECK_MISSING:${operationId}`);
  if (dynamicRestoreTarget) {
    const bindingObject = pythonObjectBlock(provider, 'target_binding_material={');
    for (const marker of [
      "'id':'kidults-postgres-restore-target-binding-v1'",
      "'source_run_id':os.environ['SOURCE_RUN_ID']",
      "'source_artifact_id':os.environ['SOURCE_ARTIFACT_ID']",
      "'source_artifact_digest':os.environ['SOURCE_ARTIFACT_DIGEST']",
      "'source_receipt_sha256':os.environ['SOURCE_RECEIPT_SHA256']",
      "'restore_target_time':os.environ['RESTORE_TARGET_TIME']",
      "'restore_operation_reference_sha256':restore_reference_sha256",
    ]) requireTrue(bindingObject.includes(marker), `PROVIDER_DYNAMIC_TARGET_FIELD_MISSING:${operationId}:${marker}`);
    for (const marker of [
      "restore_reference_sha256='sha256:'+hashlib.sha256(os.environ['RESTORE_OPERATION_REFERENCE'].encode('utf-8')).hexdigest()",
      "json.dumps(target_binding_material,sort_keys=True,separators=(',',':')).encode('utf-8')",
      "assert restore_target_binding_digest==os.environ['EXPECTED_RESTORE_TARGET_BINDING_DIGEST']",
      "assert resource_id==os.environ['EXPECTED_RESTORE_TARGET_RESOURCE_ID']",
      "assert expected_target['target_digest']==os.environ['EXPECTED_RESTORE_TARGET_DIGEST']",
      "assert context['target']==expected_target",
      'EXPECTED_AUTHORIZATION_REQUEST_SHA256: ${{ needs.bind-source-fixture.outputs.authorization_request_sha256 }}',
    ]) requireTrue(provider.includes(marker), `PROVIDER_DYNAMIC_TARGET_RECHECK_MISSING:${operationId}:${marker}`);
  } else {
    requireTrue(provider.includes(`'target_digest':'${target.target_digest}'`), `PROVIDER_EXACT_TARGET_DIGEST_RECHECK_MISSING:${operationId}`);
  }
  for (const marker of [
    `${FRESHNESS_HELPER} "$AUTHORIZATION_CONTEXT" "$AUTHORIZATION_RECEIPT" 1800`,
    'AUTHORIZATION_CONTEXT: ${{ steps.authorization_artifact.outputs.context_path }}',
    'AUTHORIZATION_RECEIPT: ${{ steps.authorization_artifact.outputs.receipt_path }}',
    `KIDULTS_APPROVAL_LEDGER_RESPONSE_ED25519_PUBLIC_KEY_B64: \${{ vars.${RESPONSE_PUBLIC_KEY_VARIABLE} }}`,
    "ledger=receipt['ledger_receipt']",
    "assert ledger[field]==context[field]",
    "assert context['repository']==os.environ['GITHUB_REPOSITORY']",
    "assert context['workflow_ref']==os.environ['GITHUB_WORKFLOW_REF']",
    "assert context['control_sha']==context['source_sha']==os.environ['GITHUB_SHA']",
    "assert context['github_run_id']==os.environ['GITHUB_RUN_ID']",
    "assert context['github_run_attempt']==int(os.environ['GITHUB_RUN_ATTEMPT'])==1",
    "hashlib.sha256(context['consume_nonce'].encode()).hexdigest()==os.environ['CONSUME_NONCE_SHA256']",
    "hashlib.sha256(receipt_path.read_bytes()).hexdigest()==os.environ['RECEIPT_SHA256']",
    "receipt['verification_key_spki_sha256']",
    'datetime.timedelta(seconds=1800) < expiry',
  ]) requireTrue(provider.includes(marker), `PROVIDER_RECEIPT_BINDING_MISSING:${operationId}:${marker}`);
  const receiptIndex = provider.indexOf(`- name: ${RECEIPT_STEP}`);
  const liveMainIndex = provider.indexOf('- name: Verify live main before provider credential resolution');
  const checkoutIndex = provider.indexOf('- name: Checkout exact main SHA');
  const pinIndex = provider.indexOf(`- name: ${PIN_STEP}`);
  const providerContactIndex = provider.indexOf('- name: Pin and verify ED25519 host key');
  const sshCredentialGuardIndex = provider.indexOf('- name: Reverify signed authorization immediately before SSH credential use');
  const sshCredentialIndex = provider.indexOf('- name: Materialize dedicated STAGING key');
  const postgresCredentialGuardIndex = provider.indexOf('- name: Reverify signed authorization immediately before PostgreSQL credential use');
  const postgresCredentialIndex = provider.search(/- name: Execute (?:source PostgreSQL fixture|target-time restore verification) through pinned SSH tunnel/);
  const firstProviderSecret = provider.search(/secrets\.(?:KIDULTS_STAGING_POSTGRES_DSN|KIDULTS_STAGING_POSTGRES_PITR_RESTORE_DSN|KIDULTS_STAGING_SSH_PRIVATE_KEY_B64)/);
  requireTrue(liveMainIndex >= 0 && checkoutIndex > liveMainIndex && pinIndex > checkoutIndex && receiptIndex > pinIndex, `PROVIDER_TRUSTED_CHECKOUT_AND_PIN_BEFORE_RECEIPT:${operationId}`);
  requireTrue(provider.includes("['external_ledger']['response_verification']['public_key_spki_sha256']") && provider.includes(`printf '${RESPONSE_PUBLIC_KEY_PIN_ENVIRONMENT}=%s\\n' "$PIN" >> "$GITHUB_ENV"`), `PROVIDER_REPOSITORY_PIN_BINDING_MISSING:${operationId}`);
  requireTrue(providerContactIndex > receiptIndex && firstProviderSecret > receiptIndex, `PROVIDER_CONTACT_OR_SECRET_BEFORE_RECEIPT:${operationId}`);
  const contactBlock = provider.slice(providerContactIndex, firstProviderSecret);
  requireTrue(count(provider, FRESHNESS_HELPER) >= 7, `PROVIDER_SIGNATURE_NOT_REVERIFIED_AT_USE_SITES:${operationId}`);
  requireTrue(contactBlock.indexOf(FRESHNESS_HELPER) >= 0 && contactBlock.indexOf(FRESHNESS_HELPER) < contactBlock.indexOf('ssh-keyscan'), `PROVIDER_CONTACT_BEFORE_FINAL_SIGNATURE_VERIFY:${operationId}`);
  requireTrue(sshCredentialGuardIndex > providerContactIndex && sshCredentialIndex > sshCredentialGuardIndex && (provider.slice(sshCredentialGuardIndex, sshCredentialIndex).match(/- name:/g) || []).length === 1, `SSH_CREDENTIAL_NOT_IMMEDIATELY_PRECEDED_BY_REVERIFY:${operationId}`);
  requireTrue(postgresCredentialGuardIndex > sshCredentialIndex && postgresCredentialIndex > postgresCredentialGuardIndex && (provider.slice(postgresCredentialGuardIndex, postgresCredentialIndex).match(/- name:/g) || []).length === 1, `POSTGRES_CREDENTIAL_NOT_IMMEDIATELY_PRECEDED_BY_REVERIFY:${operationId}`);

  requireTrue(terminal.includes('if: ${{ always() }}'), `TERMINAL_RECEIPT_ALWAYS_MISSING:${operationId}`);
  requireTrue(terminal.includes('- activation-readiness-receipt') && terminal.includes(`- ${CONSUME_JOB}`) && terminal.includes(`- ${providerJob}`), `TERMINAL_RECEIPT_NEEDS_INCOMPLETE:${operationId}`);
  if (dynamicRestoreTarget) requireTrue(terminal.includes('- bind-source-fixture'), `TERMINAL_RECEIPT_SOURCE_BIND_NEED_MISSING:${operationId}`);
  requireTrue(count(terminal, 'Emit exactly one non-empty sanitized terminal receipt') === 1, `TERMINAL_RECEIPT_EMITTER_CARDINALITY:${operationId}`);
  requireTrue(terminal.includes("'terminal_receipt_cardinality':1"), `TERMINAL_RECEIPT_DECLARED_CARDINALITY:${operationId}`);
  requireTrue(terminal.includes('test -s "$RECEIPT"'), `TERMINAL_RECEIPT_NONEMPTY_GUARD_MISSING:${operationId}`);
  requireTrue(terminal.includes('find "$ROOT" -type f -name \'*.json\' | wc -l') && terminal.includes(' -eq 1'), `TERMINAL_RECEIPT_FILE_CARDINALITY_GUARD_MISSING:${operationId}`);
  requireTrue(terminal.includes('if-no-files-found: error'), `TERMINAL_RECEIPT_UPLOAD_FAIL_CLOSED_MISSING:${operationId}`);
  requireTrue(terminal.includes("'approval_id_sha256':") && !terminal.includes("'approval_id':approval"), `TERMINAL_RECEIPT_APPROVAL_SANITIZATION_MISSING:${operationId}`);
  requireTrue(!/secrets\./.test(terminal), `TERMINAL_RECEIPT_SECRET_REFERENCE_FORBIDDEN:${operationId}`);
  requireTrue(terminal.includes("'production':'HOLD'") && terminal.includes("'public_release':'HOLD'") && terminal.includes("'g5':'HOLD'"), `TERMINAL_RECEIPT_HOLDS_MISSING:${operationId}`);
  for (const guardBlock of [provider.slice(sshCredentialGuardIndex, sshCredentialIndex), provider.slice(postgresCredentialGuardIndex, postgresCredentialIndex)]) {
    requireTrue(guardBlock.includes(`${FRESHNESS_HELPER} "$AUTHORIZATION_CONTEXT" "$AUTHORIZATION_RECEIPT" 0`), `CREDENTIAL_REVERIFY_CONTRACT_MISSING:${operationId}`);
  }
  const useOrCallSteps = [
    'Materialize dedicated STAGING key',
    'Verify exact non-root STAGING identity',
    ...(dynamicRestoreTarget ? [] : ['Discover existing PostgreSQL runtime read-only']),
    dynamicRestoreTarget
      ? 'Execute target-time restore verification through pinned SSH tunnel'
      : 'Execute source PostgreSQL fixture through pinned SSH tunnel',
  ];
  for (const stepName of useOrCallSteps) {
    const step = namedStepBlock(provider, stepName);
    requireTrue(step.includes(`${FRESHNESS_HELPER} "$AUTHORIZATION_CONTEXT" "$AUTHORIZATION_RECEIPT" 0`), `IN_STEP_REVERIFY_MISSING:${operationId}:${stepName}`);
  }
  requireTrue(!/secrets\.KIDULTS_APPROVAL_/.test(provider), `LEDGER_SECRET_IN_PROVIDER_JOB:${operationId}`);
  requireTrue(!provider.includes(LEDGER_PRIVATE_KEY_ENVIRONMENT), `LEDGER_PRIVATE_KEY_IN_PROVIDER_JOB_FORBIDDEN:${operationId}`);
  requireTrue(!provider.includes('KIDULTS_APPROVAL_LEDGER_RESPONSE_HMAC_KEY_B64'), `SYMMETRIC_RESPONSE_KEY_IN_PROVIDER_JOB_FORBIDDEN:${operationId}`);
  requireTrue(text.includes('actions: read') && text.includes('contents: read'), `READ_ONLY_ARTIFACT_PERMISSION_MISSING:${operationId}`);
  requireTrue(text.includes('cancel-in-progress: false'), `CONCURRENCY_CANCEL_MUST_BE_FALSE:${operationId}`);
}

function validateFreshnessHelper(helperText) {
  for (const marker of [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'if [ "$#" -ne 3 ]',
    `node ${GENERIC_CLIENT} verify`,
    '--request "$request_path"',
    '--receipt "$receipt_path"',
    '[[ "$minimum_remaining_seconds" =~ ^(0|[1-9][0-9]{0,4})$ ]]',
    "ledger = receipt['ledger_receipt']",
    "assert ledger['state'] == 'CONSUMED'",
    "assert ledger['approval_expires_at'] == request['approval_expires_at']",
    "assert ledger['consume_nonce'] == request['consume_nonce']",
    'minimum_remaining = int(sys.argv[3])',
    "consumed = datetime.datetime.fromisoformat(consumed_text[:-1] + '+00:00')",
    'consumed + datetime.timedelta(seconds=minimum_remaining) < expiry',
    'now + datetime.timedelta(seconds=minimum_remaining) < expiry',
  ]) requireTrue(helperText.includes(marker), `FRESHNESS_HELPER_CONTRACT_MISSING:${marker}`);
  requireTrue(helperText.indexOf(`node ${GENERIC_CLIENT} verify`) < helperText.indexOf("ledger = receipt['ledger_receipt']"), 'FRESHNESS_HELPER_SIGNATURE_VERIFY_ORDER');
  requireTrue(!/secrets\.|POSTGRES_DSN|SSH_PRIVATE_KEY|ssh-keyscan|\bssh\b/.test(helperText), 'FRESHNESS_HELPER_PROVIDER_OR_SECRET_BOUNDARY');
}

export function validateRepository({ contract, genericContract, sourceText, restoreText, helperText }) {
  validateFreshnessHelper(helperText);
  requireTrue(contract.id === 'kidults-postgres-external-one-shot-authorization-v1', 'CONTRACT_ID');
  requireTrue(contract.version === '1.0.0', 'CONTRACT_VERSION');
  requireTrue(contract.state === 'IMPLEMENTED_NOT_ACTIVATED', 'CONTRACT_IMPLEMENTED_NOT_ACTIVATED');
  requireTrue(JSON.stringify(contract.issues) === JSON.stringify([240, 921]), 'ISSUE_BINDING');
  requireTrue(contract.standing_activation?.repository_variable === STANDING_VARIABLE, 'STANDING_VARIABLE');
  requireTrue(contract.standing_activation?.required_value === 'false', 'STANDING_REQUIRED_FALSE');
  requireTrue(contract.standing_activation?.missing_value_behavior === 'BLOCK', 'STANDING_MISSING_BLOCK');
  requireTrue(contract.standing_activation?.true_value_behavior === 'BLOCK_STANDING_AUTHORIZATION_FORBIDDEN', 'STANDING_TRUE_BLOCK');
  requireTrue(contract.external_readback_baseline?.repository_variable_value === 'false', 'REPORTED_REPOSITORY_FALSE_BASELINE');
  requireTrue(contract.external_readback_baseline?.kidults_do_staging_ssh_environment_variable_shadow_present === false, 'REPORTED_ENVIRONMENT_SHADOW_ABSENT');
  requireTrue(contract.external_readback_baseline?.readback_reperformed_by_this_change === false, 'READBACK_NOT_REPERFORMED_BOUNDARY');
  requireTrue(contract.external_readback_baseline?.configuration_mutated_by_this_change === false, 'REMOTE_CONFIG_NOT_MUTATED_BOUNDARY');
  requireTrue(contract.external_ledger?.contract === 'coordination/kidults/governance/external-one-shot-approval-ledger-v1.json', 'GENERIC_CONTRACT_BINDING');
  requireTrue(contract.external_ledger?.contract_id === 'external-one-shot-approval-ledger-v1', 'GENERIC_CONTRACT_ID');
  requireTrue(contract.external_ledger?.contract_version === '1.0.0', 'GENERIC_CONTRACT_VERSION');
  requireTrue(contract.external_ledger?.client === GENERIC_CLIENT, 'GENERIC_CLIENT_BINDING');
  requireTrue(contract.external_ledger?.consume_environment === CONSUME_ENVIRONMENT, 'CONSUME_ENVIRONMENT_BINDING');
  requireTrue(JSON.stringify(contract.external_ledger?.required_secrets) === JSON.stringify(SECRET_NAMES), 'LEDGER_SECRETS_BINDING');
  requireTrue(JSON.stringify(contract.external_ledger?.required_public_variables) === JSON.stringify(['KIDULTS_APPROVAL_LEDGER_BASE_URL', RESPONSE_PUBLIC_KEY_VARIABLE]), 'LEDGER_PUBLIC_VARIABLES_BINDING');
  requireTrue(contract.external_ledger?.response_signature === 'ED25519_DETACHED_OVER_EXACT_RAW_BODY', 'LEDGER_ED25519_RESPONSE_SIGNATURE');
  requireTrue(contract.external_ledger?.verification_key_format === 'SPKI_DER_BASE64', 'LEDGER_ED25519_PUBLIC_KEY_FORMAT');
  requireTrue(contract.external_ledger?.verification_key_digest_receipt_field === 'verification_key_spki_sha256', 'LEDGER_PUBLIC_KEY_DIGEST_RECEIPT');
  requireTrue(contract.external_ledger?.response_verification?.algorithm === 'Ed25519', 'LEDGER_RESPONSE_VERIFICATION_ALGORITHM');
  requireTrue(contract.external_ledger?.response_verification?.public_key_environment === RESPONSE_PUBLIC_KEY_VARIABLE, 'LEDGER_RESPONSE_PUBLIC_KEY_ENVIRONMENT');
  requireTrue(contract.external_ledger?.response_verification?.public_key_spki_sha256 === 'UNPROVISIONED', 'LEDGER_RESPONSE_PUBLIC_KEY_PIN_UNPROVISIONED');
  requireTrue(contract.external_ledger?.response_verification?.pin_source === 'REPOSITORY_MACHINE_BINDING_AT_EXACT_CONTROL_SHA', 'LEDGER_RESPONSE_PUBLIC_KEY_PIN_SOURCE');
  requireTrue(contract.external_ledger?.response_verification?.github_private_signing_key_forbidden === true, 'LEDGER_RESPONSE_PRIVATE_KEY_GITHUB_FORBIDDEN');
  requireTrue(contract.external_ledger?.ledger_only_private_key_environment === LEDGER_PRIVATE_KEY_ENVIRONMENT, 'LEDGER_PRIVATE_KEY_ENVIRONMENT');
  requireTrue(contract.external_ledger?.ledger_private_key_allowed_in_github === false, 'LEDGER_PRIVATE_KEY_GITHUB_FORBIDDEN');
  requireTrue(contract.external_ledger?.atomic_transition === 'ACTIVE_TO_CONSUMED_COMPARE_AND_SWAP', 'ATOMIC_TRANSITION');
  requireTrue(contract.external_ledger?.success_http_status === 201, 'WINNER_STATUS');
  for (const [field, expected] of [['replay_http_status',409],['expired_http_status',410],['unknown_http_status',404],['binding_mismatch_http_status',422]]) {
    requireTrue(contract.external_ledger?.[field] === expected, `DENIAL_STATUS:${field}`);
  }
  requireTrue(contract.external_ledger?.offline_or_ambiguous_behavior === 'FAIL_CLOSED', 'OFFLINE_FAIL_CLOSED');
  requireTrue(genericContract?.id === contract.external_ledger.contract_id, 'GENERIC_MACHINE_CONTRACT_ID_COMPATIBILITY');
  requireTrue(genericContract?.version === contract.external_ledger.contract_version, 'GENERIC_MACHINE_CONTRACT_VERSION_COMPATIBILITY');
  requireTrue(genericContract?.transport?.path === '/v1/approvals/consume', 'GENERIC_ENDPOINT_COMPATIBILITY');
  requireTrue(genericContract?.authentication?.base_url_environment === 'KIDULTS_APPROVAL_LEDGER_BASE_URL', 'GENERIC_BASE_URL_ENV_COMPATIBILITY');
  requireTrue(genericContract?.authentication?.request?.key_environment === SECRET_NAMES[0], 'GENERIC_REQUEST_KEY_ENV_COMPATIBILITY');
  requireTrue(genericContract?.authentication?.response?.client_public_key_environment === RESPONSE_PUBLIC_KEY_VARIABLE, 'GENERIC_RESPONSE_PUBLIC_KEY_ENV_COMPATIBILITY');
  requireTrue(genericContract?.authentication?.response?.client_public_key_sha256_environment === RESPONSE_PUBLIC_KEY_PIN_ENVIRONMENT, 'GENERIC_RESPONSE_PUBLIC_KEY_PIN_ENV_COMPATIBILITY');
  requireTrue(genericContract?.authentication?.response?.client_public_key_sha256_must_be_pinned_by_repository_machine_binding === true, 'GENERIC_RESPONSE_PUBLIC_KEY_REPOSITORY_PIN_COMPATIBILITY');
  requireTrue(genericContract?.authentication?.response?.algorithm === 'Ed25519', 'GENERIC_RESPONSE_ALGORITHM_COMPATIBILITY');
  requireTrue(genericContract?.authentication?.response?.ledger_only_private_key_environment === LEDGER_PRIVATE_KEY_ENVIRONMENT, 'GENERIC_RESPONSE_PRIVATE_KEY_ENV_COMPATIBILITY');
  requireTrue(genericContract?.authentication?.response?.github_private_signing_key_forbidden === true, 'GENERIC_RESPONSE_PRIVATE_KEY_GITHUB_FORBIDDEN');
  requireTrue(genericContract?.client_receipt?.required_fields?.includes('verification_key_spki_sha256'), 'GENERIC_PUBLIC_KEY_DIGEST_RECEIPT_COMPATIBILITY');
  requireTrue(genericContract?.atomic_transition?.transition === contract.external_ledger.atomic_transition, 'GENERIC_ATOMIC_TRANSITION_COMPATIBILITY');
  requireTrue(genericContract?.consume_response?.success_http_status === contract.external_ledger.success_http_status, 'GENERIC_WINNER_STATUS_COMPATIBILITY');
  requireTrue(genericContract?.consume_request?.github_run_attempt_exact === 1, 'GENERIC_ATTEMPT_ONE_COMPATIBILITY');
  requireTrue(genericContract?.consume_request?.consume_nonce === 'UUID_V4', 'GENERIC_NONCE_COMPATIBILITY');
  for (const field of ['id','version',...contract.required_request_bindings.filter((item) => !item.startsWith('target.')),'target']) {
    requireTrue(genericContract?.consume_request?.required_fields?.includes(field), `GENERIC_REQUEST_FIELD_COMPATIBILITY:${field}`);
  }
  for (const field of ['provider','resource_type','resource_id','environment','target_digest']) {
    requireTrue(genericContract?.consume_request?.target_required_fields?.includes(field), `GENERIC_TARGET_FIELD_COMPATIBILITY:${field}`);
  }
  requireTrue(contract.required_signed_response_bindings?.includes('approval_expires_at'), 'LEDGER_AUTHORITATIVE_APPROVAL_EXPIRY');
  requireTrue(contract.required_signed_response_bindings?.includes('consumed_at'), 'LEDGER_AUTHORITATIVE_CONSUMED_AT');
  requireTrue(contract.required_signed_response_bindings?.includes('consume_nonce'), 'SIGNED_RESPONSE_NONCE_BINDING');
  requireTrue(contract.required_request_bindings?.includes('approval_expires_at'), 'EXPECTED_APPROVAL_EXPIRY_REQUEST_BINDING');
  requireTrue(contract.workflow_inputs?.approval_expires_at?.role === 'EXPECTED_IMMUTABLE_LEDGER_BINDING_NOT_AUTHORITY', 'EXPECTED_APPROVAL_EXPIRY_NON_AUTHORITY');
  requireTrue(contract.workflow_inputs?.approval_expires_at?.mismatch_behavior === 'LEDGER_422_AND_NO_PROVIDER_CREDENTIAL_USE', 'EXPECTED_APPROVAL_EXPIRY_MISMATCH_BLOCK');
  requireTrue(contract.request_window?.seconds === 600, 'REQUEST_WINDOW_SECONDS');
  requireTrue(contract.request_window?.restore_created_by === 'POST_SOURCE_FIXTURE_BINDING', 'RESTORE_REQUEST_WINDOW_POST_BINDING');
  requireTrue(contract.request_window?.minimum_approval_seconds_remaining_at_consume_and_provider_start === 1800, 'MINIMUM_APPROVAL_TTL_SECONDS');
  requireTrue(contract.request_window?.minimum_approval_seconds_remaining_at_signed_consumed_at === 1800, 'SIGNED_CONSUMED_AT_MINIMUM_TTL_SECONDS');
  requireTrue(Array.isArray(contract.operations) && contract.operations.length === 2, 'OPERATION_COUNT');
  const source = contract.operations.find((item) => item.workflow === SOURCE_WORKFLOW);
  const restore = contract.operations.find((item) => item.workflow === RESTORE_WORKFLOW);
  requireTrue(Boolean(source) && Boolean(restore), 'WORKFLOW_OPERATION_BINDINGS');
  requireTrue(restore.target_binding?.required_fields?.includes('restore_target_time'), 'RESTORE_TARGET_TIME_CONTRACT_BINDING');
  requireTrue(restore.target_binding?.restore_target_time_format === 'WHOLE_SECOND_UTC_RFC3339', 'RESTORE_TARGET_TIME_FORMAT_BINDING');
  validateWorkflow(sourceText, source);
  validateWorkflow(restoreText, restore);
  requireTrue(sourceText.includes(`- '${FRESHNESS_HELPER}'`), 'FRESHNESS_HELPER_PUSH_PATH_MISSING');
  requireTrue(restoreText.indexOf('  bind-source-fixture:') < restoreText.indexOf(`  ${CONSUME_JOB}:`), 'RESTORE_BIND_BEFORE_CONSUME');
  requireTrue(jobBlock(restoreText, CONSUME_JOB).includes('- bind-source-fixture'), 'RESTORE_CONSUME_NEEDS_SOURCE_BINDING');
  requireTrue(contract.authority_boundary?.ledger_or_github_configuration_mutation === 'NOT_PERFORMED_BY_THIS_CHANGE', 'EXTERNAL_MUTATION_BOUNDARY');
  requireTrue(contract.authority_boundary?.runtime_activation === 'IMPLEMENTED_NOT_ACTIVATED', 'RUNTIME_IMPLEMENTED_NOT_ACTIVATED');
  requireTrue(contract.authority_boundary?.external_durable_ledger_deployed === false, 'EXTERNAL_LEDGER_NOT_CLAIMED_DEPLOYED');
  requireTrue(contract.authority_boundary?.repository_response_key_pin_provisioned === false, 'REPOSITORY_PIN_NOT_CLAIMED_PROVISIONED');
  requireTrue(contract.authority_boundary?.signed_exact_state_readback_verified === false, 'SIGNED_READBACK_NOT_CLAIMED');
  requireTrue(contract.authority_boundary?.post_landing_github_configuration_readback_verified === false, 'POST_LANDING_READBACK_NOT_CLAIMED');
  requireTrue(contract.authority_boundary?.postgresql_or_provider_connection === 'NOT_PERFORMED_BY_THIS_CHANGE', 'PROVIDER_CONNECTION_BOUNDARY');
  requireTrue(contract.authority_boundary?.public_release === 'HOLD', 'PUBLIC_HOLD');
  requireTrue(contract.authority_boundary?.production === 'HOLD', 'PRODUCTION_HOLD');
  requireTrue(contract.authority_boundary?.g5 === 'HOLD', 'G5_HOLD');
  return {
    id: 'kidults-postgres-external-one-shot-authorization-validation-v1',
    state: 'VERIFIED_PASS',
    operations_validated: 2,
    standing_activation_required_value: 'false',
    atomic_consume_required: true,
    provider_credentials_before_verified_consume: 0,
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  };
}

if (process.argv[1] && process.argv[1].endsWith('validate-postgres-external-one-shot-authorization-v1.mjs')) {
  const result = validateRepository({
    contract: JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8')),
    genericContract: JSON.parse(fs.readFileSync(GENERIC_CONTRACT_PATH, 'utf8')),
    sourceText: fs.readFileSync(SOURCE_WORKFLOW, 'utf8'),
    restoreText: fs.readFileSync(RESTORE_WORKFLOW, 'utf8'),
    helperText: fs.readFileSync(FRESHNESS_HELPER, 'utf8'),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
