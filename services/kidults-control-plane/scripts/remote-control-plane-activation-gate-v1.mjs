import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
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

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function evaluateRemoteActivation({ evidenceDir, manifestPath, expectedHeadSha }) {
  if (!evidenceDir || !manifestPath || !expectedHeadSha) return { ok: false, reason: 'REMOTE_EVIDENCE_CONFIGURATION_REQUIRED' };
  if (!/^[a-f0-9]{40}$/i.test(expectedHeadSha)) return { ok: false, reason: 'EXPECTED_HEAD_SHA_INVALID' };

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

  const root = path.resolve(evidenceDir);
  const entries = new Map(manifest.receipts.map((entry) => [entry?.id, entry]));
  const missing = [];
  const invalid = [];

  for (const [id, label] of REQUIRED_RECEIPTS) {
    const entry = entries.get(id);
    if (!entry) { missing.push(label); continue; }
    if (typeof entry.file !== 'string' || !/^[a-f0-9]{64}$/i.test(entry.sha256 || '')) {
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
      raw = readFileSync(resolved);
      receipt = JSON.parse(raw.toString('utf8'));
    } catch {
      invalid.push({ label, reason: 'RECEIPT_UNREADABLE' });
      continue;
    }
    if (sha256(raw) !== entry.sha256.toLowerCase()) { invalid.push({ label, reason: 'RECEIPT_DIGEST_MISMATCH' }); continue; }
    if (receipt.id !== id) { invalid.push({ label, reason: 'RECEIPT_ID_MISMATCH' }); continue; }
    if (receipt.status !== 'PASS') { invalid.push({ label, reason: 'RECEIPT_NOT_PASS' }); continue; }
    if (receipt.head_sha !== expectedHeadSha) { invalid.push({ label, reason: 'RECEIPT_STALE_HEAD' }); continue; }
    if (receipt.production === 'AUTHORIZED' || receipt.public_release === 'AUTHORIZED' || receipt.g5 === 'AUTHORIZED') {
      invalid.push({ label, reason: 'FORBIDDEN_PRODUCTION_AUTHORIZATION_IN_EVIDENCE' });
    }
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
