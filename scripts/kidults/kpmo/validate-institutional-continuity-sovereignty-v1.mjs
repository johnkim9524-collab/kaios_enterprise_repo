import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const controlPath = path.join(root, 'coordination', 'kidults', 'kpmo', 'institutional-continuity-sovereignty-controls-v1.json');
const leadershipPath = path.join(root, 'coordination', 'kidults', 'kpmo', 'global-leadership-risk-controls-v1.json');
const control = JSON.parse(fs.readFileSync(controlPath, 'utf8'));
const leadership = JSON.parse(fs.readFileSync(leadershipPath, 'utf8'));

let failed = false;
const fail = message => { console.error(`FAIL: ${message}`); failed = true; };
const requireValue = (condition, message) => { if (!condition) fail(message); };

for (const principle of ['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT']) {
  requireValue(control.operating_principles?.includes(principle), `missing operating principle ${principle}`);
}

const byId = new Map((control.controls || []).map(item => [item.id, item]));
const required = [
  'KEY_PERSON_DEPENDENCY',
  'CRYPTOGRAPHIC_KEY_AND_CREDENTIAL_CONTINUITY',
  'REGISTRY_SOVEREIGNTY',
  'CLOUD_AND_REGION_SOVEREIGNTY',
  'LEGAL_ENTITY_AND_ACCOUNT_OWNERSHIP_CONTINUITY',
  'ARCHIVAL_INDEPENDENCE',
  'INSTITUTIONAL_MEMORY_LOSS'
];
for (const id of required) requireValue(byId.has(id), `missing continuity control ${id}`);

requireValue(byId.get('KEY_PERSON_DEPENDENCY').rules.some(r => r.includes('ONE_PERSON_ONLY')), 'key-person single point prohibition missing');
requireValue(byId.get('CRYPTOGRAPHIC_KEY_AND_CREDENTIAL_CONTINUITY').rules.some(r => r.includes('KEY_LOSS_AND_KEY_COMPROMISE')), 'key loss/compromise split recovery missing');
requireValue(byId.get('REGISTRY_SOVEREIGNTY').rules.some(r => r.includes('PORTABLE_VERSIONED_EXPORT')), 'registry portability missing');
requireValue(byId.get('CLOUD_AND_REGION_SOVEREIGNTY').rules.some(r => r.includes('FAILED_PRIMARY_REGION')), 'independent regional recovery path missing');
requireValue(byId.get('LEGAL_ENTITY_AND_ACCOUNT_OWNERSHIP_CONTINUITY').rules.some(r => r.includes('INSTITUTIONAL_OWNER_STATE')), 'institutional asset ownership state missing');
requireValue(byId.get('ARCHIVAL_INDEPENDENCE').rules.includes('BACKUP_NE_ARCHIVE_AND_ARCHIVE_NE_LIVE_REPLICA'), 'backup/archive/replica separation missing');
requireValue(byId.get('INSTITUTIONAL_MEMORY_LOSS').rules.some(r => r.includes('WHY_AS_WELL_AS_WHAT')), 'institutional memory why+what reconstruction missing');

requireValue(control.truth_ceiling?.synthetic_or_control_evidence === 'NON_PROMOTABLE_TO_EMPIRICAL_PASS', 'synthetic promotion ceiling missing');
requireValue(control.truth_ceiling?.production === 'HOLD', 'Production HOLD missing');
requireValue(control.truth_ceiling?.g5 === 'EXPLICIT_APPROVAL_REQUIRED', 'G5 explicit approval missing');
requireValue(leadership.risk_control_bindings?.institutional_continuity_sovereignty === 'institutional-continuity-sovereignty-controls-v1.json', 'global leadership binding missing');

if (failed) process.exit(1);
console.log('PASS: institutional continuity and sovereignty controls validated');
