#!/usr/bin/env node
import { createHash } from 'node:crypto';

const certNumber = String(process.env.PSA_CERT_NUMBER || '').trim();
const lawfulSourceRef = String(process.env.PSA_LAWFUL_SOURCE_REF || '').trim();
const observedAtRaw = String(process.env.PSA_SOURCE_OBSERVED_AT || '').trim();
const admissionPurpose = String(process.env.PSA_ADMISSION_PURPOSE || 'PRIVATE_ER_EVALUATION_ONLY').trim();
const enumerationUsed = String(process.env.PSA_ENUMERATION_USED || 'false').trim().toLowerCase();

function fail(code) {
  console.error(code);
  process.exit(1);
}

if (!/^\d{4,16}$/.test(certNumber)) fail('PSA_CERT_NUMBER_INVALID');
if (lawfulSourceRef.length < 6) fail('PSA_LAWFUL_SOURCE_REF_REQUIRED');
if (!observedAtRaw || Number.isNaN(Date.parse(observedAtRaw))) fail('PSA_SOURCE_OBSERVED_AT_INVALID');
if (admissionPurpose !== 'PRIVATE_ER_EVALUATION_ONLY') fail('PSA_ADMISSION_PURPOSE_INVALID');
if (enumerationUsed !== 'false') fail('PSA_ENUMERATION_OR_DISCOVERY_PROHIBITED');

const entry = {
  cert_reference_digest: `sha256:${createHash('sha256').update(certNumber, 'utf8').digest('hex')}`,
  lawful_source_ref: lawfulSourceRef,
  source_observed_at: new Date(observedAtRaw).toISOString(),
  admission_purpose: admissionPurpose,
  enumeration_used: false,
  raw_cert_value_in_repository: false
};

const serialized = JSON.stringify(entry, null, 2);
if (serialized.includes(certNumber)) fail('PSA_RAW_CERT_LEAK_DETECTED');
process.stdout.write(`${serialized}\n`);
