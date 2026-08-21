import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const controlPath = path.join(root, 'coordination', 'kidults', 'kpmo', 'reflexivity-self-influence-risk-controls-v1.json');
const control = JSON.parse(fs.readFileSync(controlPath, 'utf8'));
let failed = false;
const requireValue = (condition, message) => { if (!condition) { console.error(`FAIL: ${message}`); failed = true; } };

for (const principle of ['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT']) {
  requireValue(control.operating_principles?.includes(principle), `missing principle ${principle}`);
}
const byId = new Map((control.controls || []).map(item => [item.id, item]));
const required = ['OWN_OUTPUT_REINGESTION','PUBLICATION_INDUCED_MARKET_BEHAVIOR','INDEX_BENCHMARK_REFLEXIVITY','CUSTOMER_BEHAVIOR_ENDOGENEITY','SELF_FULFILLING_CONFIDENCE_LOOP','DECISION_IMPACT_FEEDBACK_CONTAMINATION','REFLEXIVITY_DISCLOSURE_AND_REPLAY'];
for (const id of required) requireValue(byId.has(id), `missing control ${id}`);

requireValue(byId.get('OWN_OUTPUT_REINGESTION').rules.some(r => r.includes('CANNOT_REENTER_AS_INDEPENDENT_EXTERNAL_EVIDENCE')), 'self-output reingestion prohibition missing');
requireValue(byId.get('PUBLICATION_INDUCED_MARKET_BEHAVIOR').rules.some(r => r.includes('REFLEXIVITY_WINDOW')), 'reflexivity window missing');
requireValue(byId.get('INDEX_BENCHMARK_REFLEXIVITY').rules.some(r => r.includes('ITS_OWN_CORRECTNESS')), 'index self-validation prohibition missing');
requireValue(byId.get('CUSTOMER_BEHAVIOR_ENDOGENEITY').rules.some(r => r.includes('EXPOSURE_STATE')), 'customer exposure-state requirement missing');
requireValue(byId.get('SELF_FULFILLING_CONFIDENCE_LOOP').rules.some(r => r.includes('NEW_INDEPENDENT_INFORMATION')), 'confidence independent-information rule missing');
requireValue(byId.get('DECISION_IMPACT_FEEDBACK_CONTAMINATION').rules.some(r => r.includes('PREDICTIVE_VALUE_FROM_INFLUENCE_VALUE')), 'prediction/influence separation missing');
requireValue(byId.get('REFLEXIVITY_DISCLOSURE_AND_REPLAY').rules.some(r => r.includes('PRE_PUBLICATION_AND_POST_PUBLICATION')), 'pre/post publication replay separation missing');
requireValue(control.activation_ceiling?.self_origin_evidence === 'NON_INDEPENDENT', 'self-origin independence ceiling missing');
requireValue(control.activation_ceiling?.synthetic_or_control_evidence === 'NON_PROMOTABLE_TO_EMPIRICAL_PASS', 'synthetic promotion ceiling missing');
requireValue(control.activation_ceiling?.production === 'HOLD', 'Production HOLD missing');
requireValue(control.activation_ceiling?.g5 === 'EXPLICIT_APPROVAL_REQUIRED', 'G5 gate missing');

if (failed) process.exit(1);
console.log('PASS: reflexivity/self-influence Red-Team controls validated');
