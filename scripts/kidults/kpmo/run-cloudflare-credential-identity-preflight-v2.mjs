#!/usr/bin/env node
import fs from 'node:fs';

const fail = (code) => { throw new Error(`CLOUDFLARE_CREDENTIAL_PREFLIGHT_V2_PROBE_FAIL:${code}`); };
const ok = (condition, code) => { if (!condition) fail(code); };
const receiptPath = process.argv[2];
ok(receiptPath, 'RECEIPT_PATH_REQUIRED');
ok(process.env.GITHUB_EVENT_NAME === 'workflow_dispatch', 'EVENT');
ok(process.env.GITHUB_REF === 'refs/heads/main', 'REF');
ok(process.env.GITHUB_RUN_ATTEMPT === '1', 'RUN_ATTEMPT');

const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '');
const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || '');
ok(/^[0-9a-fA-F]{32}$/.test(accountId), 'ACCOUNT_ID_SHAPE');
ok(apiToken.length > 0, 'API_TOKEN_REQUIRED');

const readReceipt = () => JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
const writeReceipt = (receipt) => {
  const temporary = `${receiptPath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`);
  fs.renameSync(temporary, receiptPath);
};
const errorCodes = (payload) => (
  Array.isArray(payload?.errors)
    ? payload.errors.map((item) => item?.code).filter((code) => Number.isInteger(code))
    : []
);
const mergeCodes = (...sets) => [...new Set(sets.flat())].sort((a, b) => a - b);

let receipt = readReceipt();
ok(receipt.authorization_consumed === true, 'AUTHORIZATION_NOT_CONSUMED');
ok(receipt.root_approval_verified === true, 'ROOT_APPROVAL_NOT_VERIFIED');
ok(receipt.post_landing_binding_verified === true, 'BINDING_NOT_VERIFIED');
ok(receipt.unique_first_dispatch_verified === true, 'DISPATCH_NOT_VERIFIED');
ok(receipt.external_read_request_count === 0, 'REQUEST_COUNT_NOT_ZERO');
ok(receipt.worker_mutation_count === 0
  && receipt.pages_mutation_count === 0
  && receipt.route_mutation_count === 0
  && receipt.domain_mutation_count === 0, 'MUTATION_PRESTATE');

receipt = {
  ...receipt,
  account_id_shape_valid: true,
  state: 'ACCOUNT_ID_SHAPE_VERIFIED_TOKEN_READ_PENDING',
};
writeReceipt(receipt);

const headers = {
  Authorization: `Bearer ${apiToken}`,
  Accept: 'application/json',
};

async function boundedJsonGet(url, requestNumber) {
  receipt = {
    ...readReceipt(),
    external_read_request_count: requestNumber,
    state: requestNumber === 1
      ? 'TOKEN_VERIFY_REQUEST_ATTEMPTED'
      : 'WORKERS_ACCOUNT_SCOPE_REQUEST_ATTEMPTED',
  };
  writeReceipt(receipt);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return { httpStatus: response.status, payload };
  } catch {
    return { httpStatus: 0, payload: null };
  }
}

const tokenResult = await boundedJsonGet(
  'https://api.cloudflare.com/client/v4/user/tokens/verify',
  1,
);
const tokenCodes = errorCodes(tokenResult.payload);
const tokenActive = tokenResult.httpStatus >= 200
  && tokenResult.httpStatus < 300
  && tokenResult.payload?.success === true
  && tokenResult.payload?.result?.status === 'active';

receipt = {
  ...readReceipt(),
  token_verify_http_status: tokenResult.httpStatus,
  token_active: tokenActive,
  cloudflare_error_codes: mergeCodes(tokenCodes),
  state: tokenActive ? 'TOKEN_ACTIVE_WORKERS_SCOPE_READ_PENDING' : 'TOKEN_VERIFY_FAILED',
};
writeReceipt(receipt);
if (!tokenActive) fail('TOKEN_NOT_ACTIVE_OR_UNREADABLE');

const workersResult = await boundedJsonGet(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`,
  2,
);
const workersCodes = errorCodes(workersResult.payload);
const combinedCodes = mergeCodes(tokenCodes, workersCodes);
const workersReadable = workersResult.httpStatus >= 200
  && workersResult.httpStatus < 300
  && workersResult.payload?.success === true
  && !combinedCodes.includes(7003);

receipt = {
  ...readReceipt(),
  workers_list_http_status: workersResult.httpStatus,
  workers_account_scope_readable: workersReadable,
  cloudflare_error_codes: combinedCodes,
  cloudflare_error_7003_observed: combinedCodes.includes(7003),
  state: workersReadable
    ? 'VERIFIED_PASS_CLOUDFLARE_CREDENTIAL_IDENTITY'
    : 'WORKERS_ACCOUNT_SCOPE_READ_FAILED',
  provider_response_handling: 'IN_MEMORY_SANITIZED_FIELDS_ONLY',
  raw_provider_responses_persisted: false,
  raw_provider_responses_uploaded: false,
  authorization_header_persisted: false,
  secret_values_logged: false,
  secret_values_persisted: false,
  worker_mutation_count: 0,
  pages_mutation_count: 0,
  route_mutation_count: 0,
  domain_mutation_count: 0,
};
writeReceipt(receipt);

ok(receipt.state === 'VERIFIED_PASS_CLOUDFLARE_CREDENTIAL_IDENTITY', 'WORKERS_SCOPE_UNREADABLE');
ok(receipt.external_read_request_count === 2, 'REQUEST_COUNT');
ok(receipt.token_active === true, 'TOKEN_ACTIVE');
ok(receipt.workers_account_scope_readable === true, 'WORKERS_SCOPE');
ok(receipt.cloudflare_error_7003_observed === false, 'ERROR_7003');
ok(receipt.raw_provider_responses_persisted === false, 'RAW_RESPONSE_PERSISTED');
ok(receipt.raw_provider_responses_uploaded === false, 'RAW_RESPONSE_UPLOADED');
ok(receipt.worker_mutation_count === 0
  && receipt.pages_mutation_count === 0
  && receipt.route_mutation_count === 0
  && receipt.domain_mutation_count === 0, 'MUTATION_COUNT');

console.log(JSON.stringify({
  state: receipt.state,
  external_read_request_count: receipt.external_read_request_count,
  token_active: receipt.token_active,
  workers_account_scope_readable: receipt.workers_account_scope_readable,
  cloudflare_error_codes: receipt.cloudflare_error_codes,
  worker_pages_route_domain_mutation_count: 0,
}, null, 2));
