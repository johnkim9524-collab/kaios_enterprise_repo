import fs from 'node:fs';
import { parseRfc3339Millis } from '../audit/rfc3339-v1.mjs';

const file = process.argv[2];
if (!file) throw new Error('usage: node validate-source-admission-record-v1.mjs <record.json> [as-of-rfc3339]');
const r = JSON.parse(fs.readFileSync(file, 'utf8'));
const validationAsOf = process.argv[3] || new Date().toISOString();

const purposes = ['discover','collect','store','derive','display_internal','display_public'];
const allowed = new Set(['ALLOW','CONDITIONAL','DENY','UNKNOWN']);
const states = new Set(['ADMITTED','CONDITIONAL','DISCOVERY_ONLY','BLOCKED']);
const technical = new Set(['PASS','CONDITIONAL','FAIL','UNKNOWN']);
const evidence = new Set(['SUFFICIENT','LIMITED','INSUFFICIENT','UNKNOWN']);

if (typeof r.source_id !== 'string' || r.source_id.length === 0) throw new Error('source_id required');
if (!states.has(r.state)) throw new Error('invalid state');
if (!technical.has(r.technical_validity)) throw new Error('invalid technical_validity');
if (!evidence.has(r.evidence_validity)) throw new Error('invalid evidence_validity');

for (const p of purposes) {
  if (!r.rights || !allowed.has(r.rights[p])) throw new Error(`invalid rights.${p}`);
}

const asOfMs = parseRfc3339Millis(validationAsOf, 'validation_as_of');
const assessedMs = parseRfc3339Millis(r.assessed_at, 'assessed_at');
if (assessedMs > asOfMs) throw new Error('assessed_at cannot be in the future relative to validation_as_of');

let expiresMs = null;
if (r.expires_at !== null && r.expires_at !== undefined) {
  expiresMs = parseRfc3339Millis(r.expires_at, 'expires_at');
}

const hardFail = ['collect','store','derive'].some((p) => ['DENY','UNKNOWN'].includes(r.rights[p]));
if (hardFail && r.state === 'ADMITTED') throw new Error('fail-closed violation: ADMITTED with DENY/UNKNOWN collect/store/derive');
if (r.state === 'ADMITTED' && r.technical_validity !== 'PASS') throw new Error('ADMITTED requires technical_validity PASS');
if (r.state === 'ADMITTED' && !['SUFFICIENT','LIMITED'].includes(r.evidence_validity)) throw new Error('ADMITTED requires non-UNKNOWN evidence validity');
if (r.state === 'ADMITTED' && expiresMs !== null && expiresMs <= asOfMs) throw new Error('ADMITTED requires unexpired rights at validation_as_of');
if (r.rights.display_public !== 'ALLOW' && r.publication_eligible === true) throw new Error('publication requires display_public ALLOW');

console.log(JSON.stringify({
  source_id:r.source_id,
  state:r.state,
  validation:'PASS',
  validation_as_of: validationAsOf,
  rights_expiry_checked: expiresMs === null ? 'NO_EXPIRY_DECLARED' : 'PASS_AND_NOT_EXPIRED_FOR_STATE',
  production:'HOLD'
}));
