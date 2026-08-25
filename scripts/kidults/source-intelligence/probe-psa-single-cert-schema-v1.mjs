import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  assertPsaSuccessEnvelope,
  collectSchemaFingerprint,
  fieldPresenceFromSchema
} from './psa-schema-fingerprint-v1-lib.mjs';

const [contractPath, outPath = '/tmp/psa-single-cert-schema-v1.json'] = process.argv.slice(2);
if (!contractPath) throw new Error('Usage: node probe-psa-single-cert-schema-v1.mjs <contract.json> [output.json]');
const contract = JSON.parse(await fs.readFile(contractPath, 'utf8'));
if (contract.provider_id !== 'psa-public-api' || contract.production !== 'HOLD' || contract.publication !== 'HOLD') throw new Error('BOUNDARY');
if (process.env.KAIOS_PSA_PROVISIONING_CONFIRMED !== '1') throw new Error('PSA_PROVIDER_PROVISIONING_CONFIRMATION_REQUIRED');
if (process.env.KAIOS_PSA_ACCOUNT_AUTHORIZED !== '1' || process.env.KAIOS_PSA_EULA_COMPATIBLE !== '1') throw new Error('ACCOUNT_EULA_HANDOFF_REQUIRED');
const token = process.env.KAIOS_PSA_API_TOKEN;
if (!token) throw new Error('PSA_TOKEN_SECRET_REQUIRED');
const certs = String(process.env.KAIOS_PSA_PROBE_CERTS || '').split(',').map(value => value.trim()).filter(Boolean);
if (certs.length < 1 || certs.length > contract.max_schema_probe_calls || certs.some(value => !/^\d{5,12}$/.test(value))) {
  throw new Error('ONE_TO_THREE_VALID_CERTS_REQUIRED');
}

const sha = value => `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
const endpoint = cert => contract.documented_transport.endpoint_template.replace('{cert_number}', encodeURIComponent(cert));
const maxResponseBytes = contract.max_response_bytes || 1048576;
const results = [];
for (const cert of certs) {
  const response = await fetch(endpoint(cert), {
    method: 'GET',
    headers: { accept: 'application/json', authorization: `bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(30000)
  });
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > maxResponseBytes) throw new Error('PSA_RESPONSE_TOO_LARGE');
  const text = await response.text();
  const responseBytes = Buffer.byteLength(text);
  if (responseBytes > maxResponseBytes) throw new Error('PSA_RESPONSE_TOO_LARGE');

  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error('PSA_RESPONSE_NOT_JSON'); }
  assertPsaSuccessEnvelope(payload, response.status);
  const schema = collectSchemaFingerprint(payload, {
    maxDepth: contract.schema_limits?.max_depth,
    maxNodes: contract.schema_limits?.max_nodes
  });
  const schemaJson = JSON.stringify(schema);
  if (schemaJson.includes(cert) || schemaJson.includes(token)) throw new Error('PSA_PROVIDER_VALUE_LEAK_DETECTED');
  results.push({
    cert_number_sha256: sha(cert),
    http_status: response.status,
    response_sha256: sha(text),
    response_bytes: responseBytes,
    schema_sha256: sha(schemaJson),
    recursive_schema: schema,
    field_presence: fieldPresenceFromSchema(schema),
    raw_payload_emitted: false
  });
}
const artifact = {
  id: 'psa-single-cert-schema-observation-v1',
  provider_id: 'psa-public-api',
  state: 'VERIFIED_PASS',
  environment: 'DEV_SHADOW_BOUNDED_SCHEMA_ONLY',
  probe_count: results.length,
  results,
  raw_provider_payload_retained: false,
  token_retained: false,
  plaintext_cert_number_retained: false,
  reviewer_material_increment: 0,
  rights_state: 'BOUNDED_PRIVATE_CERT_VERIFICATION_SCHEMA_EVALUATION_ONLY',
  production: 'HOLD',
  publication: 'HOLD',
  truth_boundary: 'This artifact contains recursive path/type/nullability schema fingerprints, response digests and transport metadata from at most three approved PSA single-cert calls. It contains no provider field values, admits no 120-case dataset, creates no reviewer material, and authorizes neither publication nor Production.'
};
await fs.writeFile(outPath, JSON.stringify(artifact, null, 2) + '\n');
console.log(JSON.stringify({ state: artifact.state, probe_count: artifact.probe_count, field_presence: results.map(result => result.field_presence), raw_provider_payload_retained: false, reviewer_material_increment: 0, production: 'HOLD' }, null, 2));
