#!/usr/bin/env node
import crypto from 'node:crypto';
import { constants as C } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$/;
const AUTH_ID = /^CSRA-[A-Za-z0-9._:-]{8,120}$/;
const NONCE = /^[a-f0-9]{32,128}$/;
const PURPOSE = 'PRIVATE_CURRENT_SOLD';
const AUTHORITY = 'GOVERNED_EXTERNAL_ED25519_KEYRING';
const MAX_LIFETIME_MS = 86_400_000;
const MAX_FUTURE_SKEW_MS = 300_000;

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}
function assert(value, code, detail = '') { if (!value) fail(code, detail); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}
export function canonicalAuthorityPayloadBytes(value) {
  return Buffer.from(JSON.stringify(stable(value)), 'utf8');
}
export function canonicalAuthorityDigest(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalAuthorityPayloadBytes(value)).digest('hex')}`;
}
function textDigest(value) {
  return `sha256:${crypto.createHash('sha256').update(String(value), 'utf8').digest('hex')}`;
}
function exact(value, pattern, code) {
  assert(typeof value === 'string' && value && value.trim() === value, code);
  if (pattern) assert(pattern.test(value), code);
  return value;
}
function time(value, code) {
  const raw = exact(value, null, code);
  const parsed = new Date(raw);
  assert(!Number.isNaN(parsed.getTime()) && parsed.toISOString() === raw, code);
  return parsed;
}
function exactKeys(value, keys, code) {
  assert(value && typeof value === 'object' && !Array.isArray(value), code);
  assert(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()), code);
}
function sorted(rows) { return [...rows].map(stable).sort((a, b) => a.receipt_id.localeCompare(b.receipt_id)); }

function verifyRegistry(registry, sourceSha, runId, now) {
  exactKeys(registry, ['schema_version', 'acquisitions', 'rights'], 'CSRA_REGISTRY_KEYS');
  assert(registry.schema_version === 'current-sold-receipt-registry-v1', 'CSRA_REGISTRY_SCHEMA');
  assert(Array.isArray(registry.acquisitions) && registry.acquisitions.length > 0, 'CSRA_ACQUISITIONS_REQUIRED');
  assert(Array.isArray(registry.rights) && registry.rights.length > 0, 'CSRA_RIGHTS_REQUIRED');
  const ids = new Set();
  const acquisitionSources = new Set();
  const rightsSources = new Set();

  for (const row of registry.acquisitions) {
    exactKeys(row, ['receipt_id','receipt_type','status','source_id','source_event_id','source_url','provenance_digest','content_digest','source_sha','canonical_run_id'], 'CSRA_ACQUISITION_KEYS');
    exact(row.receipt_id, TOKEN, 'CSRA_ACQUISITION_ID');
    assert(!ids.has(row.receipt_id), 'CSRA_DUPLICATE_RECEIPT_ID'); ids.add(row.receipt_id);
    assert(row.receipt_type === 'ACQUISITION' && row.status === 'PASS', 'CSRA_ACQUISITION_NOT_PASS');
    exact(row.source_id, TOKEN, 'CSRA_SOURCE_ID'); exact(row.source_event_id, TOKEN, 'CSRA_SOURCE_EVENT_ID');
    let url; try { url = new URL(row.source_url); } catch { fail('CSRA_SOURCE_URL'); }
    assert(url.protocol === 'https:' && url.hostname && !url.username && !url.password, 'CSRA_SOURCE_URL');
    exact(row.provenance_digest, SHA256, 'CSRA_PROVENANCE_DIGEST');
    exact(row.content_digest, SHA256, 'CSRA_CONTENT_DIGEST');
    assert(row.source_sha === sourceSha, 'CSRA_ACQUISITION_SOURCE_SHA');
    assert(row.canonical_run_id === runId, 'CSRA_ACQUISITION_RUN');
    acquisitionSources.add(row.source_id);
  }

  for (const row of registry.rights) {
    exactKeys(row, ['receipt_id','receipt_type','status','source_id','decision','purpose','source_sha','canonical_run_id','valid_from','valid_until'], 'CSRA_RIGHTS_KEYS');
    exact(row.receipt_id, TOKEN, 'CSRA_RIGHTS_ID');
    assert(!ids.has(row.receipt_id), 'CSRA_DUPLICATE_RECEIPT_ID'); ids.add(row.receipt_id);
    assert(row.receipt_type === 'RIGHTS' && row.status === 'PASS', 'CSRA_RIGHTS_NOT_PASS');
    exact(row.source_id, TOKEN, 'CSRA_RIGHTS_SOURCE_ID');
    assert(row.decision === 'ALLOW_PRIVATE_CURRENT_SOLD' && row.purpose === PURPOSE, 'CSRA_RIGHTS_NOT_ALLOWED');
    assert(row.source_sha === sourceSha && row.canonical_run_id === runId, 'CSRA_RIGHTS_BINDING');
    const from = time(row.valid_from, 'CSRA_RIGHTS_VALID_FROM');
    const until = time(row.valid_until, 'CSRA_RIGHTS_VALID_UNTIL');
    assert(from < until && now >= from && now <= until, 'CSRA_RIGHTS_WINDOW');
    rightsSources.add(row.source_id);
  }

  assert(JSON.stringify([...acquisitionSources].sort()) === JSON.stringify([...rightsSources].sort()), 'CSRA_RIGHTS_SOURCE_SET');
  return {
    acquisitionSetDigest: canonicalAuthorityDigest(sorted(registry.acquisitions)),
    rightsSetDigest: canonicalAuthorityDigest(sorted(registry.rights)),
    recordCount: registry.acquisitions.length,
    rightsSourceCount: rightsSources.size,
  };
}

function verifyKeyring(keyring, expectedDigest, payload, now, issuedAt) {
  exact(expectedDigest, SHA256, 'CSRA_EXPECTED_KEYRING_DIGEST');
  assert(canonicalAuthorityDigest(keyring) === expectedDigest, 'CSRA_KEYRING_DIGEST_MISMATCH');
  exactKeys(keyring, ['schema_version','authority_class','keys'], 'CSRA_KEYRING_KEYS');
  assert(keyring.schema_version === 'current-sold-governed-receipt-trusted-keyring-v1' && keyring.authority_class === AUTHORITY, 'CSRA_KEYRING_SCHEMA');
  const matches = Array.isArray(keyring.keys) ? keyring.keys.filter(key => key?.key_id === payload.key_id) : [];
  assert(matches.length === 1, 'CSRA_KEY_CARDINALITY');
  const key = matches[0];
  exactKeys(key, ['key_id','issuer_id','algorithm','status','public_key_pem','valid_from','valid_until'], 'CSRA_KEY_KEYS');
  assert(key.issuer_id === payload.issuer_id && key.algorithm === 'Ed25519' && key.status === 'ACTIVE', 'CSRA_KEY_AUTHORITY');
  const from = time(key.valid_from, 'CSRA_KEY_VALID_FROM');
  const until = time(key.valid_until, 'CSRA_KEY_VALID_UNTIL');
  assert(from < until && issuedAt >= from && issuedAt <= until && now >= from && now <= until, 'CSRA_KEY_WINDOW');
  let publicKey;
  try { publicKey = crypto.createPublicKey(key.public_key_pem); } catch { fail('CSRA_PUBLIC_KEY'); }
  assert(publicKey.type === 'public' && publicKey.asymmetricKeyType === 'ed25519', 'CSRA_PUBLIC_KEY');
  return publicKey;
}

export function verifyGovernedReceiptRegistryAuthority({
  authorityEnvelope,
  receiptRegistry,
  trustedKeyring,
  expectedTrustedKeyringDigest,
  expectedReceiptRegistryDigest,
  expectedRepository,
  expectedSourceSha,
  expectedCanonicalRunId,
  expectedPurpose = PURPOSE,
  now = new Date(),
} = {}) {
  assert(now instanceof Date && !Number.isNaN(now.getTime()), 'CSRA_NOW');
  exact(expectedRepository, /^[^/\s]+\/[^/\s]+$/, 'CSRA_EXPECTED_REPOSITORY');
  exact(expectedSourceSha, SHA, 'CSRA_EXPECTED_SOURCE_SHA');
  exact(expectedCanonicalRunId, TOKEN, 'CSRA_EXPECTED_RUN');
  exact(expectedReceiptRegistryDigest, SHA256, 'CSRA_EXPECTED_REGISTRY_DIGEST');
  assert(expectedPurpose === PURPOSE, 'CSRA_EXPECTED_PURPOSE');
  exactKeys(authorityEnvelope, ['schema_version','algorithm','payload','signature'], 'CSRA_ENVELOPE_KEYS');
  assert(authorityEnvelope.schema_version === 'current-sold-governed-receipt-authority-envelope-v1' && authorityEnvelope.algorithm === 'Ed25519', 'CSRA_ENVELOPE_SCHEMA');
  const payload = authorityEnvelope.payload;
  exactKeys(payload, ['schema_version','authority_class','authorization_id','issuer_id','key_id','repository','source_sha','canonical_run_id','purpose','receipt_registry_digest','acquisition_receipt_set_digest','rights_receipt_set_digest','authorized_record_count','issued_at','not_before','expires_at','nonce'], 'CSRA_PAYLOAD_KEYS');
  assert(payload.schema_version === 'current-sold-governed-receipt-authority-payload-v1' && payload.authority_class === AUTHORITY, 'CSRA_PAYLOAD_SCHEMA');
  exact(payload.authorization_id, AUTH_ID, 'CSRA_AUTHORIZATION_ID'); exact(payload.issuer_id, TOKEN, 'CSRA_ISSUER'); exact(payload.key_id, TOKEN, 'CSRA_KEY_ID'); exact(payload.nonce, NONCE, 'CSRA_NONCE');
  assert(payload.repository === expectedRepository && payload.source_sha === expectedSourceSha && payload.canonical_run_id === expectedCanonicalRunId && payload.purpose === expectedPurpose, 'CSRA_EXACT_BINDING');
  const issued = time(payload.issued_at, 'CSRA_ISSUED_AT');
  const notBefore = time(payload.not_before, 'CSRA_NOT_BEFORE');
  const expires = time(payload.expires_at, 'CSRA_EXPIRES_AT');
  assert(issued.getTime() <= now.getTime() + MAX_FUTURE_SKEW_MS, 'CSRA_ISSUED_IN_FUTURE');
  assert(notBefore >= issued && expires > notBefore && expires.getTime() - issued.getTime() <= MAX_LIFETIME_MS, 'CSRA_AUTHORITY_WINDOW');
  assert(now >= notBefore && now <= expires, 'CSRA_AUTHORITY_NOT_ACTIVE');

  const registryDigest = canonicalAuthorityDigest(receiptRegistry);
  assert(registryDigest === expectedReceiptRegistryDigest && payload.receipt_registry_digest === registryDigest, 'CSRA_REGISTRY_DIGEST_MISMATCH');
  const registry = verifyRegistry(receiptRegistry, expectedSourceSha, expectedCanonicalRunId, now);
  assert(payload.acquisition_receipt_set_digest === registry.acquisitionSetDigest, 'CSRA_ACQUISITION_SET_DIGEST');
  assert(payload.rights_receipt_set_digest === registry.rightsSetDigest, 'CSRA_RIGHTS_SET_DIGEST');
  assert(payload.authorized_record_count === registry.recordCount, 'CSRA_RECORD_COUNT');
  const publicKey = verifyKeyring(trustedKeyring, expectedTrustedKeyringDigest, payload, now, issued);
  let signature;
  try { signature = Buffer.from(authorityEnvelope.signature, 'base64'); } catch { fail('CSRA_SIGNATURE_ENCODING'); }
  assert(signature.length === 64 && crypto.verify(null, canonicalAuthorityPayloadBytes(payload), publicKey, signature), 'CSRA_SIGNATURE_INVALID');

  const binding = {
    authority_class: AUTHORITY,
    repository: expectedRepository,
    source_sha: expectedSourceSha,
    canonical_run_id: expectedCanonicalRunId,
    purpose: expectedPurpose,
    receipt_registry_digest: registryDigest,
    acquisition_receipt_set_digest: registry.acquisitionSetDigest,
    rights_receipt_set_digest: registry.rightsSetDigest,
    authorized_record_count: registry.recordCount,
    expires_at: expires.toISOString(),
    nonce_digest: textDigest(payload.nonce),
  };
  const authorityBindingDigest = canonicalAuthorityDigest(binding);
  return {
    schema_version: 'current-sold-governed-receipt-authority-verification-receipt-v1',
    receipt_id: `csra_${authorityBindingDigest.slice(7, 31)}`,
    status: 'PASS', authority_class: AUTHORITY,
    evaluated_at: now.toISOString(), expires_at: expires.toISOString(),
    repository: expectedRepository, source_sha: expectedSourceSha,
    canonical_run_id_digest: textDigest(expectedCanonicalRunId), purpose: expectedPurpose,
    receipt_registry_digest: registryDigest,
    acquisition_receipt_set_digest: registry.acquisitionSetDigest,
    rights_receipt_set_digest: registry.rightsSetDigest,
    authorized_record_count: registry.recordCount,
    rights_source_count: registry.rightsSourceCount,
    authority_binding_digest: authorityBindingDigest,
    authorization_id_digest: textDigest(payload.authorization_id),
    issuer_id_digest: textDigest(payload.issuer_id), key_id_digest: textDigest(payload.key_id),
    nonce_digest: textDigest(payload.nonce),
    authority: { signature_verified: true, trusted_keyring_digest_exact: true, registry_digest_exact: true, receipt_set_digests_exact: true, source_sha_and_run_exact: true, purpose_exact: true, validity_window_exact: true, authorized_record_count_exact: true, one_use_consumption_required: true, one_use_consumed: false, lawful_empirical_admission_authorized_by_this_receipt_alone: false },
    privacy: { raw_registry_emitted: false, raw_authority_payload_emitted: false, raw_signature_emitted: false, raw_nonce_emitted: false, raw_key_emitted: false, issuer_key_authorization_and_nonce_digest_only: true },
    claim_boundary: { claim_ceiling: 'PRIVATE_AUTHORITY_PRECONDITION_ONLY', requires_atomic_current_sold_admission: true, requires_separate_append_only_ledger_gate: true, requires_exact_track_a_candidate_evidence_pair: true, public: 'HOLD', production: 'HOLD', g5: 'HOLD' },
  };
}

export async function consumeGovernedReceiptRegistryAuthority(receipt, { nonceDirectory, now = new Date() } = {}) {
  assert(receipt?.status === 'PASS' && receipt.authority?.signature_verified === true, 'CSRA_VERIFICATION_RECEIPT_INVALID');
  const expires = time(receipt.expires_at, 'CSRA_CONSUME_EXPIRES_AT');
  assert(now instanceof Date && !Number.isNaN(now.getTime()) && now <= expires, 'CSRA_CONSUME_EXPIRED');
  exact(receipt.nonce_digest, SHA256, 'CSRA_NONCE_DIGEST'); exact(receipt.authority_binding_digest, SHA256, 'CSRA_BINDING_DIGEST');
  assert(path.isAbsolute(nonceDirectory || ''), 'CSRA_NONCE_DIRECTORY_ABSOLUTE');
  const directory = path.resolve(nonceDirectory);
  const stats = await fs.lstat(directory).catch(() => null);
  assert(stats?.isDirectory() && !stats.isSymbolicLink() && (stats.mode & 0o777) === 0o700, 'CSRA_NONCE_DIRECTORY_INVALID');
  assert(await fs.realpath(directory) === directory, 'CSRA_NONCE_DIRECTORY_REALPATH');
  const output = path.join(directory, `nonce-${receipt.nonce_digest.slice(7)}.json`);
  const consumption = { schema_version: 'current-sold-governed-receipt-authority-consumption-receipt-v1', status: 'CONSUMED', consumed_at: now.toISOString(), expires_at: expires.toISOString(), nonce_digest: receipt.nonce_digest, authority_binding_digest: receipt.authority_binding_digest, authorization_id_digest: receipt.authorization_id_digest, receipt_registry_digest: receipt.receipt_registry_digest, authority_precondition_satisfied: true, lawful_empirical_admission_authorized_by_this_receipt_alone: false, public: 'HOLD', production: 'HOLD', g5: 'HOLD' };
  let handle;
  try {
    handle = await fs.open(output, C.O_WRONLY | C.O_CREAT | C.O_EXCL | (C.O_NOFOLLOW ?? 0), 0o600);
    await handle.writeFile(`${JSON.stringify(consumption, null, 2)}\n`, 'utf8'); await handle.sync(); await handle.chmod(0o600);
    const written = await handle.stat(); assert(written.isFile() && written.nlink === 1 && (written.mode & 0o777) === 0o600, 'CSRA_CONSUMPTION_FILE');
  } catch (error) {
    if (error?.code === 'EEXIST') fail('CSRA_NONCE_REPLAY');
    if (String(error?.message || '').startsWith('CSRA_')) throw error;
    fail('CSRA_CONSUMPTION_WRITE', error?.code || error?.name || 'UNKNOWN');
  } finally { await handle?.close().catch(() => {}); }
  return { ...consumption, receipt_path: output };
}
