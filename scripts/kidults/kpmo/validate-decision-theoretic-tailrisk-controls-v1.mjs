import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const control = JSON.parse(fs.readFileSync(path.join(root, 'coordination', 'kidults', 'kpmo', 'decision-theoretic-tailrisk-controls-v1.json'), 'utf8'));
let failed = false;
const fail = m => { console.error(`FAIL: ${m}`); failed = true; };
const req = (c, m) => { if (!c) fail(m); };

for (const p of ['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT']) req(control.operating_principles?.includes(p), `missing principle ${p}`);
const byId = new Map((control.controls || []).map(x => [x.id, x]));
for (const id of ['PROBABILITY_VS_DECISION_UTILITY','ASYMMETRIC_ERROR_COST','TAIL_RISK_AND_FAT_TAIL_SENSITIVITY','UNCERTAINTY_AWARE_ABSTENTION','SCENARIO_AND_MODEL_DISAGREEMENT_ROBUSTNESS','VALUE_OF_INFORMATION_AND_DELAY','REVERSIBILITY_AND_IRREVERSIBILITY_ASYMMETRY']) req(byId.has(id), `missing control ${id}`);
req(byId.get('PROBABILITY_VS_DECISION_UTILITY').rules.includes('CALIBRATED_PROBABILITY_NE_OPTIMAL_ACTION'), 'probability/utility separation missing');
for (const c of ['FALSE_POSITIVE','FALSE_NEGATIVE','DELAY','REVERSAL','OPPORTUNITY_COST']) req(byId.get('ASYMMETRIC_ERROR_COST').required_costs.includes(c), `missing asymmetric cost ${c}`);
req(byId.get('TAIL_RISK_AND_FAT_TAIL_SENSITIVITY').rules.some(r => r.includes('WORST_PLAUSIBLE_CASE')), 'tail stress missing');
for (const s of ['ACT','HOLD','ABSTAIN','SEEK_MORE_EVIDENCE']) req(byId.get('UNCERTAINTY_AWARE_ABSTENTION').states.includes(s), `missing abstention state ${s}`);
req(byId.get('SCENARIO_AND_MODEL_DISAGREEMENT_ROBUSTNESS').rules.some(r => r.includes('RANK_REVERSAL')), 'scenario rank-reversal gate missing');
req(byId.get('VALUE_OF_INFORMATION_AND_DELAY').rules.some(r => r.includes('EXPECTED_VALUE_OF_ADDITIONAL_INFORMATION')), 'value-of-information control missing');
req(byId.get('REVERSIBILITY_AND_IRREVERSIBILITY_ASYMMETRY').rules.some(r => r.includes('STRONGER_EVIDENCE')), 'irreversibility evidence asymmetry missing');
req(control.truth_ceiling?.synthetic_or_control_evidence === 'NON_PROMOTABLE_TO_EMPIRICAL_PASS', 'synthetic promotion ceiling missing');
req(control.truth_ceiling?.live_mutation === 'DISABLED_UNTIL_SEPARATE_ACTIVATION_GATE', 'live mutation ceiling missing');
req(control.truth_ceiling?.production === 'HOLD', 'Production HOLD missing');
req(control.truth_ceiling?.g5 === 'EXPLICIT_APPROVAL_REQUIRED', 'G5 gate missing');
if (failed) process.exit(1);
console.log('PASS: decision-theoretic utility and tail-risk controls validated');
