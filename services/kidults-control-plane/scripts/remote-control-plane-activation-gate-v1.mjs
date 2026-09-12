import { createHash, verify } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/**
 * Fail-closed remote activation gate.
 * Environment booleans are not proof: eligibility comes only from a
 * digest-bound evidence manifest and exact-head PASS receipts.
 */
const REQUIRED_RECEIPTS = [
  ['remote-postgres-provisioning', 'REMOTE_POSTGRESQL_PROVISIONING'],
  ['remote-postgres-rls-concurrency', 'REMOTE_POSTGRESQL_RLS_AND_CONCURRENCY'],
  ['remote-postgres-pitr', 'REMOTE_POSTGRESQL_PITR'],
  ['governed-d1-projector-deployment', 'GOVERNED_D1_PROJECTOR_DEPLOYMENT'],
  ['legacy-d1-writer-cutover', 'LEGACY_D1_WRITER_CUTOVER'],
  ['remote-rollback', 'REMOTE_ROLLBACK_RECEIPT'],
  ['exact-head-checks', 'EXACT_HEAD_AUTOMATED_CHECKS'],
  ['post-merge-main-revalidation', 'POST_MERGE_MAIN_REVALIDATION'],
];
const RECEIPT_IDS = new Set(REQUIRED_RECEIPTS.map(([id]) => id));
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const HEAD_SHA = /^[0-9a-f]{40}$/i;
const WORKFLOW_PATH = /^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/;

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('CANONICAL_JSON_VALUE_INVALID');
  }
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function hasExactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\n') === [...expected].sort().join('\n');
}

function receiptShapeValid(receipt, id, expectedHeadSha) {
  const keys = [
    'id', 'receipt_type', 'schema_version', 'status', 'head_sha', 'observed_at',
    'producer_workflow_path', 'producer_run_id', 'artifact_digest',
    'authority', 'authority_receipt_digest', 'production', 'public_release', 'g5',
  ];
  return hasExactKeys(receipt, keys)
    && receipt.id === id
    && receipt.receipt_type === id
    && receipt.schema_version === '1.0.0'
    && receipt.status === 'PASS'
    && HEAD_SHA.test(receipt.head_sha)
    && receipt.head_sha === expectedHeadSha
    && Number.isFinite(Date.parse(receipt.observed_at))
    && WORKFLOW_PATH.test(receipt.producer_workflow_path)
    && Number.isSafeInteger(receipt.producer_run_id) && receipt.producer_run_id > 0
    && DIGEST.test(receipt.artifact_digest)
    && receipt.authority === 'POSTGRESQL_SYSTEM_OF_RECORD'
    && DIGEST.test(receipt.authority_receipt_digest)
    && receipt.production === 'HOLD'
    && receipt.public_release === 'HOLD'
    && receipt.g5 === 'HOLD';
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function evaluateRemoteActivation({ evidenceDir, manifestPath, expectedHeadSha, trustedPublicKeyPem }) {
  if (!evidenceDir || !manifestPath || !expectedHeadSha || !trustedPublicKeyPem) return { ok: false, reason: 'REMOTE_EVIDENCE_CONFIGURATION_REQUIRED' };
  if (!HEAD_SHA.test(expectedHeadSha)) return { ok: false, reason: 'EXPECTED_HEAD_SHA_INVALID' };

  let manifestRaw;
  let manifest;
  try {
    manifestRaw = readFileSync(manifestPath);
    manifest = JSON.parse(manifestRaw.toString('utf8'));
  } catch {
    return { ok: false, reason: 'REMOTE_EVIDENCE_MANIFEST_UNREADABLE' };
  }
  if (manifest.version !== 'remote-control-plane-evidence-manifest-v1') return { ok: false, reason: 'REMOTE_EVIDENCE_MANIFEST_VERSION_INVALID' };
  if (manifest.head_sha !== expectedHeadSha) return { ok: false, reason: 'REMOTE_EVIDENCE_MANIFEST_STALE_HEAD' };
  if (!Array.isArray(manifest.receipts)) return { ok: false, reason: 'REMOTE_EVIDENCE_MANIFEST_RECEIPTS_INVALID' };
  if (!hasExactKeys(manifest, ['version', 'head_sha', 'receipts', 'signature_algorithm', 'signature'])) {
    return { ok: false, reason: 'REMOTE_EVIDENCE_MANIFEST_SHAPE_INVALID' };
  }
  if (manifest.signature_algorithm !== 'Ed25519' || typeof manifest.signature !== 'string') {
    return { ok: false, reason: 'REMOTE_EVIDENCE_MANIFEST_SIGNATURE_INVALID' };
  }
  const signedManifest = { version: manifest.version, head_sha: manifest.head_sha, receipts: manifest.receipts };
  try {
    if (!verify(null, Buffer.from(canonicalJson(signedManifest)), trustedPublicKeyPem, Buffer.from(manifest.signature, 'base64'))) {
      return { ok: false, reason: 'REMOTE_EVIDENCE_MANIFEST_SIGNATURE_INVALID' };
    }
  } catch {
    return { ok: false, reason: 'REMOTE_EVIDENCE_MANIFEST_SIGNATURE_INVALID' };
  }

  let root;
  try {
    const rootStat = lstatSync(evidenceDir);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return { ok: false, reason: 'REMOTE_EVIDENCE_ROOT_INVALID' };
    root = realpathSync(evidenceDir);
  } catch {
    return { ok: false, reason: 'REMOTE_EVIDENCE_ROOT_INVALID' };
  }
  const receiptIds = manifest.receipts.map((entry) => entry?.id);
  if (manifest.receipts.length !== REQUIRED_RECEIPTS.length
      || new Set(receiptIds).size !== receiptIds.length
      || receiptIds.some((id) => !RECEIPT_IDS.has(id))) {
    return { ok: false, reason: 'REMOTE_EVIDENCE_MANIFEST_RECEIPT_SET_INVALID' };
  }
  const entries = new Map(manifest.receipts.map((entry) => [entry.id, entry]));
  const missing = [];
  const invalid = [];

  for (const [id, label] of REQUIRED_RECEIPTS) {
    const entry = entries.get(id);
    if (!entry) { missing.push(label); continue; }
    if (!hasExactKeys(entry, ['id', 'file', 'sha256']) || typeof entry.file !== 'string' || !/^[a-f0-9]{64}$/i.test(entry.sha256 || '')) {
      invalid.push({ label, reason: 'MANIFEST_ENTRY_INVALID' });
      continue;
    }
    const resolved = path.resolve(root, entry.file);
    if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
      invalid.push({ label, reason: 'RECEIPT_PATH_ESCAPE' });
      continue;
    }

    let raw;
    let receipt;
    try {
      const stat = lstatSync(resolved);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('RECEIPT_NOT_REGULAR_FILE');
      const real = realpathSync(resolved);
      if (real === root || !real.startsWith(`${root}${path.sep}`)) {
        invalid.push({ label, reason: 'RECEIPT_REALPATH_ESCAPE' });
        continue;
      }
      raw = readFileSync(real);
      receipt = JSON.parse(raw.toString('utf8'));
    } catch {
      invalid.push({ label, reason: 'RECEIPT_UNREADABLE' });
      continue;
    }
    if (sha256(raw) !== entry.sha256.toLowerCase()) { invalid.push({ label, reason: 'RECEIPT_DIGEST_MISMATCH' }); continue; }
    if (!receiptShapeValid(receipt, id, expectedHeadSha)) { invalid.push({ label, reason: 'RECEIPT_SCHEMA_OR_AUTHORITY_INVALID' }); continue; }
  }

  if (missing.length || invalid.length) return { ok: false, reason: 'REMOTE_EVIDENCE_INCOMPLETE_OR_INVALID', missing, invalid };
  return { ok: true, manifest_sha256: sha256(manifestRaw), verified_receipts: REQUIRED_RECEIPTS.map(([, label]) => label) };
}

function outputHold(reason, detail = {}) {
  console.log(JSON.stringify({
    id: 'kidults-remote-control-plane-activation-gate-v1', governance_mode: 'SOLO_OWNER_AUTOMATED_EVIDENCE', required_human_reviewers: 0,
    state: 'HOLD', reason, ...detail, mutation_performed: false, credentials_used: false,
    production: 'HOLD', public_release: 'HOLD', g5: 'HOLD'
  }, null, 2));
  process.exitCode = 1;
}

function main() {
  const result = evaluateRemoteActivation({
    evidenceDir: process.env.KPMO_REMOTE_EVIDENCE_DIR,
    manifestPath: process.env.KPMO_REMOTE_EVIDENCE_MANIFEST,
    expectedHeadSha: process.env.KPMO_EXPECTED_HEAD_SHA,
    trustedPublicKeyPem: process.env.KPMO_REMOTE_EVIDENCE_PUBLIC_KEY_PEM,
  });
  if (!result.ok) {
    outputHold(result.reason, { missing: result.missing ?? [], invalid: result.invalid ?? [] });
    return;
  }
  console.log(JSON.stringify({
    id: 'kidults-remote-control-plane-activation-gate-v1', governance_mode: 'SOLO_OWNER_AUTOMATED_EVIDENCE', required_human_reviewers: 0,
    state: 'ELIGIBLE_FOR_GOVERNED_CANARY', exact_head_sha: process.env.KPMO_EXPECTED_HEAD_SHA,
    manifest_sha256: result.manifest_sha256, verified_receipts: result.verified_receipts,
    mutation_performed: false, credentials_used: false, production: 'HOLD', public_release: 'HOLD', g5: 'HOLD'
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
