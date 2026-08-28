import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  createPsaCertReferenceToken as createSharedPsaCertReferenceToken,
  decodePsaReferenceKey,
} from '../../../services/kidults-control-plane/src/psa-reference-token.mjs';
import { createPsaProviderQuotaLease } from '../../../services/kidults-control-plane/src/psa-provider-quota-lease.mjs';

const MAX_RETRIES_PER_CERT = 2;
const MAX_RESPONSE_BYTES = 1_048_576;
const MAX_SCHEMA_NODES = 4_096;
const MAX_SCHEMA_DEPTH = 16;
const CERT_PATTERN = /^\d{5,12}$/;
const SAFE_SCHEMA_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

const responseDigest = value => `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
const sleepDefault = delay => new Promise(resolve => setTimeout(resolve, delay));
const retryableStatus = status => status === 429 || status >= 500;

function fixedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function validatePsaCertNumber(value) {
  const cert = String(value ?? '').trim();
  if (!CERT_PATTERN.test(cert)) throw fixedError('PSA_CERT_NUMBER_INVALID');
  return cert;
}

export function decodePsaCertReferenceKey(value) {
  return decodePsaReferenceKey(String(value ?? ''));
}

export function createPsaCertReferenceToken(certNumber, encodedKey) {
  const cert = validatePsaCertNumber(certNumber);
  return createSharedPsaCertReferenceToken({ keyBase64: String(encodedKey ?? ''), certNumber: cert });
}

function assertSchemaKeySafe(key, sensitiveValues) {
  if (!SAFE_SCHEMA_KEY_PATTERN.test(key)) throw fixedError('PSA_PROVIDER_SCHEMA_KEY_DYNAMIC_OR_INVALID');
  if (/\d{5,16}/.test(key) || sensitiveValues.some(value => value && key.includes(value))) {
    throw fixedError('PSA_PROVIDER_SCHEMA_KEY_RAW_IDENTIFIER_REJECTED');
  }
}

export function assertProviderSchemaKeysSafe(payload, sensitiveValues = []) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw fixedError('PSA_PROVIDER_RESPONSE_SHAPE_INVALID');
  }
  let nodes = 0;
  const visit = (value, depth) => {
    if (depth > MAX_SCHEMA_DEPTH) throw fixedError('PSA_PROVIDER_SCHEMA_DEPTH_EXCEEDED');
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const member of value) visit(member, depth + 1);
      return;
    }
    for (const [key, member] of Object.entries(value)) {
      nodes += 1;
      if (nodes > MAX_SCHEMA_NODES) throw fixedError('PSA_PROVIDER_SCHEMA_NODE_LIMIT_EXCEEDED');
      assertSchemaKeySafe(key, sensitiveValues);
      visit(member, depth + 1);
    }
  };
  visit(payload, 0);
  return Object.keys(payload).sort();
}

export function assertObservedSchemaKeyPathsSafe(paths, sensitiveValues = []) {
  if (!Array.isArray(paths) || paths.length > MAX_SCHEMA_NODES) {
    throw fixedError('PSA_PROVIDER_SCHEMA_PATHS_INVALID');
  }
  for (const path of paths) {
    if (typeof path !== 'string' || path.length < 1 || path.length > 512) {
      throw fixedError('PSA_PROVIDER_SCHEMA_PATHS_INVALID');
    }
    for (const segment of path.split('.')) {
      const key = segment.endsWith('[]') ? segment.slice(0, -2) : segment;
      if (!key) throw fixedError('PSA_PROVIDER_SCHEMA_KEY_DYNAMIC_OR_INVALID');
      assertSchemaKeySafe(key, sensitiveValues);
    }
  }
  return paths;
}

function normalizeCertList(certNumbers, callBudget) {
  if (!Array.isArray(certNumbers)) throw fixedError('ONE_TO_THREE_VALID_CERTS_REQUIRED');
  const certs = certNumbers.map(validatePsaCertNumber);
  if (certs.length < 1 || certs.length > callBudget) throw fixedError('ONE_TO_THREE_VALID_CERTS_REQUIRED');
  if (new Set(certs).size !== certs.length) throw fixedError('PSA_CERT_NUMBER_DUPLICATE');
  return certs;
}

function fieldPresence(keys) {
  const normalized = keys.map(key => key.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const has = fragments => normalized.some(key => fragments.some(fragment => key.includes(fragment)));
  return {
    certification_identifier: has(['cert', 'certno', 'certnumber', 'certification']),
    grade: has(['grade']),
    item_identity_or_reference: has(['subject', 'spec', 'card', 'item', 'brand', 'year', 'category', 'variety', 'description']),
    population_context: has(['population', 'pophigher', 'pop']),
    alternate_identifier: has(['barcode', 'reversecert', 'alternate', 'altid']),
  };
}

function endpointFor(contract, cert) {
  return contract.documented_transport.endpoint_template.replace('{cert_number}', encodeURIComponent(cert));
}

function assertContract(contract) {
  if (contract.provider_id !== 'psa-public-api' || contract.production !== 'HOLD' || contract.publication !== 'HOLD') {
    throw fixedError('BOUNDARY');
  }
  if (!Number.isInteger(contract.max_schema_probe_calls) || contract.max_schema_probe_calls < 1 || contract.max_schema_probe_calls > 3) {
    throw fixedError('PSA_PROVIDER_CALL_BUDGET_INVALID');
  }
  if (typeof contract.documented_transport?.endpoint_template !== 'string' ||
      !contract.documented_transport.endpoint_template.includes('{cert_number}')) {
    throw fixedError('PSA_DOCUMENTED_ENDPOINT_INVALID');
  }
}

function assertArtifactHasNoSensitiveValues(artifact, sensitiveValues) {
  const serialized = JSON.stringify(artifact);
  for (const value of sensitiveValues) {
    if (value && serialized.includes(value)) throw fixedError('PSA_SENSITIVE_VALUE_IN_ARTIFACT');
  }
  return serialized;
}

export async function runPsaSchemaProbe({
  contract,
  certNumbers,
  accessToken,
  certReferenceKey,
  fetchImpl = fetch,
  executeProviderAttempt,
  sleep = sleepDefault,
  timeoutMs = 30_000,
}) {
  assertContract(contract);
  if (typeof fetchImpl !== 'function') throw fixedError('PSA_FETCH_IMPLEMENTATION_REQUIRED');
  if (typeof executeProviderAttempt !== 'function') throw fixedError('PSA_QUOTA_BOUND_PROVIDER_ATTEMPT_REQUIRED');
  if (typeof accessToken !== 'string' || accessToken.length < 8) throw fixedError('PSA_TOKEN_SECRET_REQUIRED');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) throw fixedError('PSA_TIMEOUT_OUT_OF_BOUNDS');
  const validatedReferenceKey = decodePsaCertReferenceKey(certReferenceKey);
  validatedReferenceKey.fill(0);
  const callBudget = contract.max_schema_probe_calls;
  const certs = normalizeCertList(certNumbers, callBudget);
  const references = new Map(certs.map(cert => [cert, createPsaCertReferenceToken(cert, certReferenceKey)]));
  const results = [];
  const attemptReceipts = [];
  let providerCalls = 0;
  let policyViolationCount = 0;

  for (let certIndex = 0; certIndex < certs.length; certIndex += 1) {
    const cert = certs[certIndex];
    const certReferenceToken = references.get(cert);
    let providerCallAttempts = 0;
    let terminal = null;
    let shouldRetry = false;

    do {
      shouldRetry = false;
      let attemptReceipt;
      let providerRequestStarted = false;
      const nextAttemptOrdinal = providerCallAttempts + 1;
      try {
        const response = await executeProviderAttempt({
          certReferenceDigest: certReferenceToken,
          certIndex,
          attemptOrdinal: nextAttemptOrdinal,
          request: async () => {
            if (providerRequestStarted) throw fixedError('PSA_PROVIDER_REQUEST_REPLAY_BLOCKED');
            providerRequestStarted = true;
            providerCalls += 1;
            providerCallAttempts += 1;
            return fetchImpl(endpointFor(contract, cert), {
              method: 'GET',
              headers: { accept: 'application/json', authorization: `bearer ${accessToken}` },
              redirect: 'error',
              signal: AbortSignal.timeout(timeoutMs),
            });
          },
        });
        if (!providerRequestStarted) throw fixedError('PSA_QUOTA_PROVIDER_REQUEST_NOT_EXECUTED');
        const text = await response.text();
        const bytes = Buffer.byteLength(text);
        const base = {
          cert_reference_token: certReferenceToken,
          attempt_ordinal: providerCallAttempts,
          http_status: Number(response.status),
          response_sha256: responseDigest(text),
          response_bytes: bytes,
          raw_payload_emitted: false,
        };
        if (bytes > MAX_RESPONSE_BYTES) {
          attemptReceipt = { ...base, outcome: 'FAILED', failure_class: 'PSA_RESPONSE_TOO_LARGE' };
        } else if (!response.ok) {
          attemptReceipt = {
            ...base,
            outcome: 'FAILED',
            failure_class: response.status === 429 ? 'PSA_RATE_LIMIT' : response.status >= 500 ? 'PSA_PROVIDER_5XX' : 'PSA_HTTP_REJECTED',
          };
          shouldRetry = retryableStatus(response.status);
        } else {
          let payload;
          try {
            payload = JSON.parse(text);
          } catch {
            attemptReceipt = { ...base, outcome: 'FAILED', failure_class: 'PSA_RESPONSE_NOT_JSON' };
          }
          if (payload !== undefined) {
            try {
              const keys = assertProviderSchemaKeysSafe(payload, certs);
              attemptReceipt = {
                ...base,
                outcome: 'SCHEMA_OBSERVED',
                top_level_schema_keys: keys,
                field_presence: fieldPresence(keys),
              };
            } catch (error) {
              if (!String(error?.code || '').startsWith('PSA_PROVIDER_')) throw error;
              policyViolationCount += 1;
              attemptReceipt = { ...base, outcome: 'FAILED', failure_class: error.code };
            }
          }
        }
      } catch (error) {
        if (!providerRequestStarted || String(error?.code || '').startsWith('PSA_QUOTA_') || error?.code === 'PSA_PROVIDER_REQUEST_REPLAY_BLOCKED') {
          throw error;
        }
        attemptReceipt = {
          cert_reference_token: certReferenceToken,
          attempt_ordinal: providerCallAttempts,
          http_status: null,
          response_sha256: null,
          response_bytes: null,
          raw_payload_emitted: false,
          outcome: 'FAILED',
          failure_class: error?.name === 'TimeoutError' ? 'PSA_TIMEOUT' : 'PSA_TRANSPORT_ERROR',
        };
        shouldRetry = true;
      }

      attemptReceipts.push(attemptReceipt);
      terminal = attemptReceipt;
      const remainingCerts = certs.length - certIndex - 1;
      const callsAfterAnotherAttempt = callBudget - providerCalls - 1;
      const canRetry = shouldRetry && providerCallAttempts <= MAX_RETRIES_PER_CERT && callsAfterAnotherAttempt >= remainingCerts;
      if (canRetry) await sleep(250 * providerCallAttempts);
      shouldRetry = canRetry;
    } while (shouldRetry);

    results.push({
      cert_reference_token: certReferenceToken,
      provider_call_attempts: providerCallAttempts,
      http_status: terminal.http_status,
      outcome: terminal.outcome,
      failure_class: terminal.failure_class ?? null,
      response_sha256: terminal.response_sha256,
      response_bytes: terminal.response_bytes,
      top_level_schema_keys: terminal.top_level_schema_keys ?? [],
      field_presence: terminal.field_presence ?? null,
      raw_payload_emitted: false,
    });
  }

  const successfulProbeCount = results.filter(result => result.outcome === 'SCHEMA_OBSERVED').length;
  const artifact = {
    id: 'psa-single-cert-schema-observation-v1',
    provider_id: 'psa-public-api',
    state: successfulProbeCount === certs.length && policyViolationCount === 0 ? 'VERIFIED_PASS' : 'VERIFIED_FAIL',
    environment: 'DEV_SHADOW_BOUNDED_SCHEMA_ONLY',
    probe_count: results.length,
    successful_probe_count: successfulProbeCount,
    failure_receipt_count: results.length - successfulProbeCount,
    provider_calls: providerCalls,
    provider_call_budget: callBudget,
    provider_call_attempts: attemptReceipts,
    policy_violation_count: policyViolationCount,
    results,
    raw_provider_payload_retained: false,
    token_retained: false,
    cert_reference_key_retained: false,
    reviewer_material_increment: 0,
    rights_state: 'PENDING_ACTUAL_API_EULA_TERMINALIZATION',
    production: 'HOLD',
    publication: 'HOLD',
    truth_boundary: `This artifact records sanitized schema-key presence, response digests and every transport attempt within one global ${callBudget}-call budget. It does not admit provider data, authorize 120-case acquisition, create reviewer material, labels, empirical PASS, publication or Production.`,
  };
  assertArtifactHasNoSensitiveValues(artifact, [...certs, accessToken, String(certReferenceKey)]);
  return artifact;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const [contractPath, outPath = '/tmp/psa-single-cert-schema-v1.json'] = argv;
  if (!contractPath) throw fixedError('Usage: node probe-psa-single-cert-schema-v1.mjs <contract.json> [output.json]');
  const contract = JSON.parse(await fs.readFile(contractPath, 'utf8'));
  if (env.KAIOS_PSA_ACCOUNT_AUTHORIZED !== '1' || env.KAIOS_PSA_EULA_COMPATIBLE !== '1') {
    throw fixedError('ACCOUNT_EULA_HANDOFF_REQUIRED');
  }
  if (env.KAIOS_PSA_PRIVATE_RUNTIME_VERIFIED !== '1') throw fixedError('PSA_PRIVATE_RUNTIME_NOT_VERIFIED');
  if (!/^\d+$/.test(String(env.GITHUB_RUN_ID || '')) || !/^\d+$/.test(String(env.GITHUB_RUN_ATTEMPT || ''))) {
    throw fixedError('PSA_GITHUB_RUN_IDENTITY_INVALID');
  }
  if (!env.PSA_PRIVATE_RUNTIME_ROOT) throw fixedError('PSA_PRIVATE_RUNTIME_ROOT_REQUIRED');
  if (!env.GITHUB_WORKSPACE) throw fixedError('PSA_REPOSITORY_WORKSPACE_REQUIRED');
  const quotaLease = createPsaProviderQuotaLease({
    privateRoot: env.PSA_PRIVATE_RUNTIME_ROOT,
    forbiddenRoot: env.GITHUB_WORKSPACE,
    approvedDailyBudget: 100,
    perRunCap: 90,
  });
  const quotaRunId = `github-run-${env.GITHUB_RUN_ID}`;
  const quotaDispatchId = `github-run-${env.GITHUB_RUN_ID}-attempt-${env.GITHUB_RUN_ATTEMPT}-bounded`;
  const executeProviderAttempt = async ({ certReferenceDigest, certIndex, attemptOrdinal, request }) => {
    const attemptId = `cert-${certIndex + 1}-attempt-${attemptOrdinal}`;
    const execution = await quotaLease.executeAttempt({
      runId: quotaRunId,
      dispatchId: quotaDispatchId,
      attemptId,
      idempotencyKey: `${quotaDispatchId}-${attemptId}`,
      requestReferenceDigest: certReferenceDigest,
    }, async () => request());
    return execution.provider_result;
  };
  const certNumbers = String(env.KAIOS_PSA_PROBE_CERTS || '').split(',').map(value => value.trim()).filter(Boolean);
  const artifact = await runPsaSchemaProbe({
    contract,
    certNumbers,
    accessToken: env.KAIOS_PSA_API_TOKEN,
    certReferenceKey: env.PSA_CERT_REFERENCE_KEY_B64,
    executeProviderAttempt,
  });
  artifact.quota_lease = {
    state: 'ENFORCED_DURABLE_PRIVATE_ROOT_PRE_FETCH',
    approved_daily_budget: 100,
    per_run_cap: 90,
    provider_attempts_reserved: artifact.provider_calls,
    private_state_persisted_outside_repository: true,
    shared_across_eligible_runners_verified: false,
  };
  await fs.writeFile(outPath, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({
    status: artifact.state,
    probe_count: artifact.probe_count,
    provider_calls: artifact.provider_calls,
    provider_call_budget: artifact.provider_call_budget,
    raw_provider_payload_retained: false,
    reviewer_material_increment: 0,
    production: 'HOLD',
  }, null, 2));
  if (artifact.state !== 'VERIFIED_PASS') throw fixedError('PSA_SCHEMA_PROBE_NOT_VERIFIED');
  return artifact;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  main().catch(error => {
    console.error(error?.code || error?.message || 'PSA_SCHEMA_PROBE_FAILED');
    process.exitCode = 1;
  });
}
