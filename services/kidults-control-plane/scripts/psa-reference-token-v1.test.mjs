import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  PSA_REFERENCE_DOMAINS,
  canonicalizePsaReferenceValue,
  createPsaCertReferenceToken,
  createPsaHmacToken,
  equalPsaReferenceTokens,
  sha256PsaCanonical,
} from '../src/psa-reference-token.mjs';

const key = Buffer.alloc(32, 0x41);
const keyBase64 = key.toString('base64');
const syntheticCert = '0'.repeat(8);

test('PSA cert reference uses the exact v1 domain-separated HMAC wire format', () => {
  const expected = `hmac-sha256:v1:${createHmac('sha256', key)
    .update(`KIDULTS_PSA_CERT_REFERENCE_V1\0${syntheticCert}`, 'utf8')
    .digest('hex')}`;
  const actual = createPsaCertReferenceToken({ keyBase64, certNumber: syntheticCert });
  assert.equal(actual, expected);
  assert(!actual.includes(syntheticCert));
  assert(equalPsaReferenceTokens(actual, expected));
});

test('reference keys are strict canonical 32-byte base64 and domains cannot be invented', () => {
  assert.throws(() => createPsaCertReferenceToken({ keyBase64: Buffer.alloc(31).toString('base64'), certNumber: syntheticCert }), /REFERENCE_KEY_INVALID/);
  assert.throws(() => createPsaCertReferenceToken({ keyBase64: `${keyBase64}\n`, certNumber: syntheticCert }), /REFERENCE_KEY_INVALID/);
  assert.throws(() => createPsaHmacToken({ keyBase64, domain: 'CALLER_DEFINED_DOMAIN', value: syntheticCert }), /REFERENCE_DOMAIN_INVALID/);
});

test('canonical digests are object-order independent and domains are distinct', () => {
  assert.equal(canonicalizePsaReferenceValue({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.equal(sha256PsaCanonical({ b: 2, a: 1 }), sha256PsaCanonical({ a: 1, b: 2 }));
  const certToken = createPsaHmacToken({ keyBase64, domain: PSA_REFERENCE_DOMAINS.CERT_REFERENCE, value: syntheticCert });
  const recordToken = createPsaHmacToken({ keyBase64, domain: PSA_REFERENCE_DOMAINS.SOURCE_RECORD, value: syntheticCert });
  assert.notEqual(certToken, recordToken);
  assert.equal(equalPsaReferenceTokens(certToken, 'sha256:'.padEnd(71, '0')), false);
});
