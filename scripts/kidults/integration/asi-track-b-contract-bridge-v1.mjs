#!/usr/bin/env node
import crypto from 'node:crypto';

const canonical = value => Array.isArray(value)
  ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const sha = value => `sha256:${crypto.createHash('sha256').update(canonical(value)).digest('hex')}`;

/**
 * Explicit bridge between ASI purpose admission and the exact Track B pair.
 * It never fabricates a Candidate or Evidence Package.  Until a real,
 * purpose-admitted CURRENT_SOLD event arrives, it returns BLOCKED and names
 * the missing contract inputs.
 */
export function buildTrackBBridgeInput({ admission, marketEvent, snapshotCandidate, evidencePackage } = {}) {
  const failures = [];
  if (!admission || admission.decision !== 'RIGHTS_CLEAR_FOR_PURPOSE') failures.push('PURPOSE_RIGHTS_ADMISSION_REQUIRED');
  if (admission?.purpose !== 'CURRENT_SOLD_TRANSACTION') failures.push('CURRENT_SOLD_PURPOSE_REQUIRED');
  if (!marketEvent || marketEvent.event_state !== 'SOLD') failures.push('ADMITTED_SOLD_MARKET_EVENT_REQUIRED');
  if (!snapshotCandidate) failures.push('SNAPSHOT_CANDIDATE_REQUIRED');
  if (!evidencePackage) failures.push('EVIDENCE_PACKAGE_REQUIRED');
  if (marketEvent && marketEvent.rights?.admitted !== true) failures.push('MARKET_EVENT_RIGHTS_NOT_ADMITTED');
  if (evidencePackage && evidencePackage.rights_status !== 'PASS') failures.push('EVIDENCE_PACKAGE_RIGHTS_NOT_PASS');
  if (failures.length) return { state: 'BLOCKED', accepted: false, failures: [...new Set(failures)].sort() };
  const candidateDigest = sha(snapshotCandidate);
  const evidenceDigest = sha(evidencePackage);
  return {
    state: 'READY_FOR_TRACK_B',
    accepted: true,
    input_pair: {
      snapshot_candidate: snapshotCandidate,
      evidence_package: evidencePackage,
      candidate_digest: candidateDigest,
      evidence_digest: evidenceDigest,
      pair_digest: sha({ candidate_digest: candidateDigest, evidence_digest: evidenceDigest })
    }
  };
}

if (process.argv[1]?.endsWith('asi-track-b-contract-bridge-v1.mjs')) {
  const payload = process.argv[2] ? JSON.parse(process.argv[2]) : {};
  console.log(JSON.stringify(buildTrackBBridgeInput(payload), null, 2));
}
