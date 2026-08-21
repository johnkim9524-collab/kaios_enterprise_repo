import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const controlPath = path.join(root, 'coordination', 'kidults', 'kpmo', 'institutional-trust-risk-controls-v1.json');
const globalPath = path.join(root, 'coordination', 'kidults', 'kpmo', 'global-leadership-risk-controls-v1.json');
const control = JSON.parse(fs.readFileSync(controlPath, 'utf8'));
const global = JSON.parse(fs.readFileSync(globalPath, 'utf8'));

let failed = false;
const req = (condition, message) => { if (!condition) { console.error(`FAIL: ${message}`); failed = true; } };

for (const p of ['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT']) req(control.operating_principles?.includes(p), `missing principle ${p}`);
const byId = new Map((control.controls || []).map(x => [x.id, x]));
for (const id of ['BENCHMARK_CAPTURE','METHODOLOGY_CAPTURE','GOVERNANCE_CAPTURE','INSIDER_COLLUSION','AUDIT_EVIDENCE_FORGERY','SELECTIVE_DISCLOSURE','STRATEGIC_DISCLOSURE_TIMING']) req(byId.has(id), `missing control ${id}`);

req(byId.get('BENCHMARK_CAPTURE').rules.some(r => r.includes('NO_SINGLE_BENCHMARK')), 'single benchmark capture protection missing');
req(byId.get('METHODOLOGY_CAPTURE').rules.some(r => r.includes('RETROACTIVELY_REWRITE')), 'methodology historical truth immutability missing');
req(byId.get('GOVERNANCE_CAPTURE').rules.some(r => r.includes('NO_SINGLE_ROLE')), 'separation of duties missing');
req(byId.get('INSIDER_COLLUSION').rules.some(r => r.includes('BEFORE_AFTER_DIGEST')), 'manual adjustment digest audit missing');
for (const f of ['CONTENT_DIGEST','LINEAGE_DIGEST','METHOD_VERSION','RIGHTS_STATE','TIME_STATE','PREVIOUS_RECORD_HASH']) req(byId.get('AUDIT_EVIDENCE_FORGERY').required_bindings.includes(f), `audit binding missing ${f}`);
req(byId.get('AUDIT_EVIDENCE_FORGERY').rules.some(r => r.includes('TAMPER_EVIDENT_AND_CHAIN_BOUND')), 'tamper-evident chain missing');
req(byId.get('SELECTIVE_DISCLOSURE').rules.some(r => r.includes('CONTRADICTORY_EVIDENCE')), 'counterevidence disclosure protection missing');
req(byId.get('SELECTIVE_DISCLOSURE').rules.some(r => r.includes('UNKNOWN_OR_NOT_VERIFIED')), 'unknown hiding protection missing');
req(byId.get('STRATEGIC_DISCLOSURE_TIMING').rules.some(r => r.includes('KNOWN_MATERIAL_CORRECTION')), 'correction timing protection missing');
req(control.trust_ceiling?.control_or_synthetic_evidence === 'NON_PROMOTABLE_TO_EMPIRICAL_PASS', 'synthetic promotion ceiling missing');
req(control.trust_ceiling?.production === 'HOLD', 'Production HOLD missing');
req(control.trust_ceiling?.g5 === 'EXPLICIT_APPROVAL_REQUIRED', 'G5 gate missing');
req(global.risk_control_bindings?.institutional_trust === 'institutional-trust-risk-controls-v1.json', 'global control binding missing');

if (failed) process.exit(1);
console.log('PASS: institutional-grade trust attack controls validated');
