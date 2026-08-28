#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const script = 'scripts/kidults/provider/build-psa-lawful-manifest-entry-v1.mjs';
const fixtureCert = '08178895';

function run(extra = {}) {
  return spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PSA_CERT_NUMBER: fixtureCert,
      PSA_LAWFUL_SOURCE_REF: 'source:lawful-fixture:1',
      PSA_SOURCE_OBSERVED_AT: '2026-08-28T00:00:00.000Z',
      PSA_ADMISSION_PURPOSE: 'PRIVATE_ER_EVALUATION_ONLY',
      PSA_ENUMERATION_USED: 'false',
      ...extra
    }
  });
}

const ok = run();
if (ok.status !== 0) throw new Error(`PSA_INTAKE_POSITIVE_FAILED:${ok.stderr}`);
const entry = JSON.parse(ok.stdout);
if (!/^sha256:[0-9a-f]{64}$/.test(entry.cert_reference_digest || '')) throw new Error('PSA_INTAKE_DIGEST_INVALID');
if (entry.lawful_source_ref !== 'source:lawful-fixture:1') throw new Error('PSA_INTAKE_SOURCE_BINDING_INVALID');
if (entry.source_observed_at !== '2026-08-28T00:00:00.000Z') throw new Error('PSA_INTAKE_TIMESTAMP_INVALID');
if (entry.admission_purpose !== 'PRIVATE_ER_EVALUATION_ONLY' || entry.enumeration_used !== false) throw new Error('PSA_INTAKE_PURPOSE_INVALID');
if (entry.raw_cert_value_in_repository !== false) throw new Error('PSA_INTAKE_RAW_BOUNDARY_INVALID');
if (ok.stdout.includes(fixtureCert)) throw new Error('PSA_INTAKE_RAW_CERT_LEAK');

const negatives = [
  ['MISSING_SOURCE', { PSA_LAWFUL_SOURCE_REF: '' }],
  ['INVALID_TIMESTAMP', { PSA_SOURCE_OBSERVED_AT: 'not-a-time' }],
  ['ENUMERATION', { PSA_ENUMERATION_USED: 'true' }],
  ['WRONG_PURPOSE', { PSA_ADMISSION_PURPOSE: 'PUBLIC_DISPLAY' }],
  ['INVALID_CERT', { PSA_CERT_NUMBER: 'guess-me' }]
];
for (const [name, env] of negatives) {
  const result = run(env);
  if (result.status === 0) throw new Error(`PSA_INTAKE_NEGATIVE_FALSE_GREEN:${name}`);
  if (result.stdout.includes(fixtureCert) || result.stderr.includes(fixtureCert)) throw new Error(`PSA_INTAKE_NEGATIVE_RAW_LEAK:${name}`);
}

console.log(JSON.stringify({
  validator: 'KIDULTS_PSA_LAWFUL_MANIFEST_INTAKE_V1',
  state: 'VERIFIED_PASS',
  raw_cert_persistence: false,
  lawful_source_required: true,
  source_timestamp_required: true,
  enumeration_rejected: true,
  negative_mutations_rejected: negatives.length,
  live_provider_call: false,
  promotion_eligible: false,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD'
}, null, 2));
