import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [contractPath, outPath='/tmp/psa-single-cert-schema-v1.json'] = process.argv.slice(2);
if (!contractPath) throw new Error('Usage: node probe-psa-single-cert-schema-v1.mjs <contract.json> [output.json]');
const x = JSON.parse(await fs.readFile(contractPath, 'utf8'));
if (x.provider_id !== 'psa-public-api' || x.production !== 'HOLD' || x.publication !== 'HOLD') throw new Error('BOUNDARY');
if (process.env.KAIOS_PSA_ACCOUNT_AUTHORIZED !== '1' || process.env.KAIOS_PSA_EULA_COMPATIBLE !== '1') throw new Error('ACCOUNT_EULA_HANDOFF_REQUIRED');
const token = process.env.KAIOS_PSA_API_TOKEN;
if (!token) throw new Error('PSA_TOKEN_SECRET_REQUIRED');
const certs = String(process.env.KAIOS_PSA_PROBE_CERTS || '').split(',').map(v=>v.trim()).filter(Boolean);
if (certs.length < 1 || certs.length > x.max_schema_probe_calls || certs.some(v=>!/^\d{5,12}$/.test(v))) throw new Error('ONE_TO_THREE_VALID_CERTS_REQUIRED');

const sha = s => `sha256:${createHash('sha256').update(String(s)).digest('hex')}`;
const normKey = k => String(k).toLowerCase().replace(/[^a-z0-9]/g,'');
const hasKey = (keys, fragments) => keys.some(k => fragments.some(f => normKey(k).includes(f)));
const endpoint = cert => x.documented_transport.endpoint_template.replace('{cert_number}', encodeURIComponent(cert));
const results = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const retryable = status => status === 429 || status >= 500;
for (const cert of certs) {
  let lastFailure = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(endpoint(cert), {
        method: 'GET',
        headers: { accept: 'application/json', authorization: `bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(30000)
      });
      const text = await response.text();
      if (!response.ok) {
        lastFailure = `PSA_HTTP_${response.status}`;
        if (retryable(response.status) && attempt < 3) {
          const retryAfter = Math.min(5000, Math.max(0, Number(response.headers.get('retry-after') || 0) * 1000));
          await sleep(retryAfter || attempt * 250);
          continue;
        }
        break;
      }
      let payload;
      try { payload = JSON.parse(text); } catch { lastFailure = 'PSA_RESPONSE_NOT_JSON'; break; }
      const keys = payload && typeof payload === 'object' && !Array.isArray(payload) ? Object.keys(payload).sort() : [];
      results.push({
        cert_number_sha256: sha(cert),
        http_status: response.status,
        attempts: attempt,
        response_sha256: sha(text),
        response_bytes: Buffer.byteLength(text),
        top_level_schema_keys: keys,
        field_presence: {
          certification_identifier: hasKey(keys,['cert','certno','certnumber','certification']),
          grade: hasKey(keys,['grade']),
          item_identity_or_reference: hasKey(keys,['subject','spec','card','item','brand','year','category','variety','description']),
          population_context: hasKey(keys,['population','pophigher','pop']),
          alternate_identifier: hasKey(keys,['barcode','reversecert','alternate','altid'])
        },
        raw_payload_emitted: false
      });
      lastFailure = null;
      break;
    } catch (error) {
      lastFailure = error?.name === 'TimeoutError' ? 'PSA_TIMEOUT' : 'PSA_TRANSPORT_ERROR';
      if (attempt < 3) { await sleep(attempt * 250); continue; }
    }
  }
  if (lastFailure) results.push({ cert_number_sha256: sha(cert), attempts: 3, failure_class: lastFailure, raw_payload_emitted: false });
}
const artifact = {
  id: 'psa-single-cert-schema-observation-v1',
  provider_id: 'psa-public-api',
  environment: 'DEV_SHADOW_BOUNDED_SCHEMA_ONLY',
  probe_count: results.length,
  successful_probe_count: results.filter(r => r.http_status === 200).length,
  failure_receipt_count: results.filter(r => r.failure_class).length,
  results,
  raw_provider_payload_retained: false,
  token_retained: false,
  reviewer_material_increment: 0,
  rights_state: 'PENDING_ACTUAL_API_EULA_TERMINALIZATION',
  production: 'HOLD',
  publication: 'HOLD',
  truth_boundary: 'This artifact records only schema-key presence, response digests and transport status from at most three Founder-approved PSA single-cert calls. It does not admit provider data, authorize 120-case acquisition, create reviewer material, labels, empirical PASS, publication or Production.'
};
await fs.writeFile(outPath, JSON.stringify(artifact, null, 2) + '\n');
console.log(JSON.stringify({status:'SCHEMA_ONLY_OBSERVED',probe_count:artifact.probe_count,field_presence:results.map(r=>r.field_presence),raw_provider_payload_retained:false,reviewer_material_increment:0,production:'HOLD'}, null, 2));
