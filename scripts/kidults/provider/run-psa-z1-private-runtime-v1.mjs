import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { access, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import {
  buildDeletionReceipt,
  buildPrivatePsaRecord,
  decryptPrivatePsaRecord,
  resolvePsaPrivateStoreRoot,
} from '../../../services/kidults-control-plane/src/psa-private-evaluation-store.mjs';
import { psaPrivateEvaluationInternals } from '../../../services/kidults-control-plane/src/psa-private-evaluation.mjs';

const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

function required(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name}_REQUIRED`);
  return value;
}

function certNumber(value) {
  const cert = String(required(value, 'PSA_Z1_CERT_NUMBER')).trim();
  if (!/^\d{4,16}$/.test(cert)) throw new Error('PSA_Z1_CERT_NUMBER_INVALID');
  return cert;
}

function assertRuntime() {
  if (process.env.PSA_PRIVATE_RUNTIME_MODE !== 'EPHEMERAL_ENCRYPTED_IMMEDIATE_DELETE') {
    throw new Error('PSA_PRIVATE_RUNTIME_MODE_INVALID');
  }
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('PSA_GOVERNED_ACTIONS_RUNTIME_REQUIRED');
  if (process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('PSA_MAIN_REF_REQUIRED');
  if (!/^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA || '')) throw new Error('PSA_MAIN_SHA_REQUIRED');
}

async function loadJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function fetchOfficialPayload({ token, cert, timeoutMs = 10_000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `https://api.psacard.com/publicapi/cert/GetByCertNumber/${encodeURIComponent(cert)}`,
      {
        method: 'GET',
        headers: { Authorization: `bearer ${token}`, Accept: 'application/json' },
        signal: controller.signal,
      },
    );
    const body = await response.text();
    if (response.status !== 200) throw new Error(`PSA_Z1_HTTP_REJECTED:${response.status}`);
    let payload;
    try { payload = JSON.parse(body); } catch { throw new Error('PSA_Z1_INVALID_JSON'); }
    return { payload, responseDigest: sha256(body), httpStatus: response.status };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  assertRuntime();
  const token = String(required(process.env.PSA_PUBLIC_API_TOKEN, 'PSA_PUBLIC_API_TOKEN'));
  if (token.length < 8) throw new Error('PSA_PUBLIC_API_TOKEN_INVALID');
  const cert = certNumber(process.env.PSA_Z1_CERT_NUMBER);
  const workspace = resolve(required(process.env.GITHUB_WORKSPACE, 'GITHUB_WORKSPACE'));
  const runnerTemp = resolve(required(process.env.RUNNER_TEMP, 'RUNNER_TEMP'));
  if (runnerTemp === workspace || runnerTemp.startsWith(`${workspace}${sep}`)) {
    throw new Error('PSA_RUNNER_TEMP_OVERLAPS_REPOSITORY');
  }

  const rootCandidate = resolve(runnerTemp, `kidults-psa-z1-${randomUUID()}`);
  const root = await resolvePsaPrivateStoreRoot({ rootDir: rootCandidate, forbiddenRoot: workspace });
  const encryptedPath = resolve(root, 'z1-private-record.json');
  const receiptPath = resolve(runnerTemp, 'psa-z1-private-runtime-receipt.json');
  const key = randomBytes(32);
  let encryptedRecordWritten = false;

  try {
    const [fieldMap, policy] = await Promise.all([
      loadJson(resolve(workspace, 'coordination/kidults/provider/psa-120-field-map-v1.json')),
      loadJson(resolve(workspace, 'coordination/kidults/provider/psa-cert-verification-connection-policy-v1.json')),
    ]);
    if (policy?.blocked?.public_display_raw !== true || policy?.blocked?.redistribution_raw !== true) {
      throw new Error('PSA_PRIVATE_BOUNDARY_POLICY_INVALID');
    }
    if (policy?.source_evidence?.acquisition_120_case_right !== 'CONFIRMED_FOR_BOUNDED_KNOWN_CERT_INTERNAL_EVALUATION_SUBJECT_TO_100_CALLS_PER_DAY_AND_NO_ENUMERATION') {
      throw new Error('PSA_BOUNDED_EVALUATION_RIGHT_NOT_BOUND');
    }

    const observedAt = new Date();
    const { payload, responseDigest, httpStatus } = await fetchOfficialPayload({ token, cert });
    const record = buildPrivatePsaRecord({ certNumber: cert, payload, key, observedAt });
    await writeFile(encryptedPath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    encryptedRecordWritten = true;

    const decrypted = decryptPrivatePsaRecord(record, key);
    const normalized = psaPrivateEvaluationInternals.normalize(decrypted, fieldMap);
    const normalizedDigest = sha256(stable(normalized));
    const normalizedFieldNames = Object.keys(normalized).sort();

    await unlink(encryptedPath);
    encryptedRecordWritten = false;
    let deletionVerified = false;
    try { await access(encryptedPath); } catch (error) {
      if (error?.code === 'ENOENT') deletionVerified = true;
      else throw error;
    }
    if (!deletionVerified) throw new Error('PSA_Z1_PRIVATE_RECORD_DELETE_NOT_VERIFIED');
    const deletionReceipt = buildDeletionReceipt(record, {
      deletedAt: new Date(),
      deletionSucceeded: true,
    });

    const receipt = {
      receipt_id: 'KIDULTS_PSA_Z1_PRIVATE_RUNTIME_RECEIPT_V1',
      state: 'VERIFIED_PASS',
      provider_id: 'psa-public-api',
      protected_main_sha: process.env.GITHUB_SHA,
      workflow_run_id: process.env.GITHUB_RUN_ID || null,
      runtime_mode: 'EPHEMERAL_ENCRYPTED_IMMEDIATE_DELETE',
      official_http_status: httpStatus,
      cert_reference_digest: sha256(cert),
      response_digest: responseDigest,
      normalized_digest: normalizedDigest,
      normalized_field_names: normalizedFieldNames,
      exact_field_map_id: fieldMap.field_map_id,
      private_store_encryption: 'AES-256-GCM',
      runtime_key_generated_in_memory: true,
      runtime_key_persisted: false,
      private_record_written: true,
      private_record_deleted: true,
      deletion_verified: deletionReceipt.deletion_verified,
      deletion_receipt_digest: sha256(stable(deletionReceipt)),
      raw_payload_in_receipt: false,
      raw_payload_artifact_uploaded: false,
      token_persisted: false,
      cert_value_persisted: false,
      product_pipeline_admission_increment: 0,
      acquisition_120_increment: 0,
      production: 'HOLD',
      public: 'HOLD',
      g5: 'EXPLICIT_APPROVAL_REQUIRED',
      next_gate: 'IMPORT_PROVENANCE_BOUND_LAWFUL_120_CERT_MANIFEST_THEN_EXECUTE_90_PLUS_30',
      executed_at: new Date().toISOString(),
    };
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'w' });
    process.stdout.write(`${JSON.stringify({
      receipt_id: receipt.receipt_id,
      state: receipt.state,
      protected_main_sha: receipt.protected_main_sha,
      private_record_deleted: receipt.private_record_deleted,
      deletion_verified: receipt.deletion_verified,
      acquisition_120_increment: receipt.acquisition_120_increment,
      product_pipeline_admission_increment: receipt.product_pipeline_admission_increment,
      next_gate: receipt.next_gate,
    })}\n`);
  } finally {
    key.fill(0);
    if (encryptedRecordWritten) await rm(encryptedPath, { force: true });
    await rm(root, { recursive: true, force: true });
  }
}

await main();
