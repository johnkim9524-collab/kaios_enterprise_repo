import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const controlPath = path.join(root, 'coordination', 'kidults', 'kpmo', 'human-autonomy-authority-controls-v1.json');
const control = JSON.parse(fs.readFileSync(controlPath, 'utf8'));
let failed = false;
const fail = m => { console.error(`FAIL: ${m}`); failed = true; };
const req = (c, m) => { if (!c) fail(m); };

for (const p of ['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT']) req(control.operating_principles?.includes(p), `missing principle ${p}`);
const byId = new Map((control.controls || []).map(x => [x.id, x]));
for (const id of ['AUTOMATION_BIAS','AUTHORITY_AMBIGUITY','SILENT_ESCALATION_FAILURE','HUMAN_RUBBER_STAMPING','OVERRIDE_DRIFT','RESPONSIBILITY_DIFFUSION','OPERATOR_COGNITIVE_OVERLOAD']) req(byId.has(id), `missing control ${id}`);

req(byId.get('AUTOMATION_BIAS').rules.some(r => r.includes('COUNTEREVIDENCE')), 'automation-bias counterevidence surfacing missing');
req(byId.get('AUTHORITY_AMBIGUITY').rules.some(r => r.includes('G5_AND_PRODUCTION_AUTHORITY_REMAIN_EXPLICITLY_HUMAN')), 'human G5/Production authority boundary missing');
req(byId.get('SILENT_ESCALATION_FAILURE').rules.some(r => r.includes('UNACKNOWLEDGED_P0_ESCALATION_FAILS_CLOSED')), 'unacknowledged P0 escalation fail-close missing');
req(byId.get('HUMAN_RUBBER_STAMPING').rules.some(r => r.includes('APPROVAL_COUNT_NE_REVIEW_QUALITY')), 'approval-count truth rule missing');
req(byId.get('OVERRIDE_DRIFT').rules.some(r => r.includes('OVERRIDE_DEBT')), 'override debt control missing');
req(byId.get('RESPONSIBILITY_DIFFUSION').rules.some(r => r.includes('OWNER_UNKNOWN')), 'accountable owner fail-close missing');
req(byId.get('OPERATOR_COGNITIVE_OVERLOAD').rules.some(r => r.includes('DEDUPLICATED')), 'alert deduplication control missing');

req(control.activation_ceiling?.empirical_promotion === 'PROHIBITED_FROM_CONTROL_OR_SYNTHETIC_TESTS', 'empirical promotion ceiling missing');
req(control.activation_ceiling?.live_mutation === 'DISABLED_UNTIL_SEPARATE_ACTIVATION_GATE', 'live mutation ceiling missing');
req(control.activation_ceiling?.production === 'HOLD', 'Production HOLD missing');
req(control.activation_ceiling?.g5 === 'EXPLICIT_APPROVAL_REQUIRED', 'G5 approval boundary missing');

if (failed) process.exit(1);
console.log('PASS: human-autonomy authority and escalation controls validated');
