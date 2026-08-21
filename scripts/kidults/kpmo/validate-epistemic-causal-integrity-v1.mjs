import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const controlPath = path.join(root, 'coordination', 'kidults', 'kpmo', 'epistemic-causal-integrity-controls-v1.json');
const control = JSON.parse(fs.readFileSync(controlPath, 'utf8'));
let failed = false;
const fail = message => { console.error(`FAIL: ${message}`); failed = true; };
const req = (condition, message) => { if (!condition) fail(message); };

for (const principle of ['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT']) req(control.operating_principles?.includes(principle), `missing operating principle ${principle}`);
const byId = new Map((control.controls || []).map(item => [item.id, item]));
for (const id of ['CORRELATION_CAUSATION_SEPARATION','CONFOUNDER_AND_MEDIATOR_CONTROL','SELECTION_AND_SURVIVORSHIP_BIAS','POST_HOC_NARRATIVE_AND_HYPOTHESIS_DRIFT','MULTIPLE_TESTING_AND_FALSE_DISCOVERY','CAUSAL_TRANSPORTABILITY_AND_GLOBAL_GENERALIZATION','COUNTERFACTUAL_AND_INTERVENTION_SAFETY']) req(byId.has(id), `missing epistemic control ${id}`);

const causal = byId.get('CORRELATION_CAUSATION_SEPARATION');
for (const rule of ['CORRELATION_NE_CAUSATION','LEAD_LAG_NE_CAUSAL_DIRECTION','PREDICTIVE_ACCURACY_NE_CAUSAL_MECHANISM']) req(causal.rules.includes(rule), `missing causal-separation rule ${rule}`);
req(causal.rules.some(rule => rule.includes('IDENTIFICATION_STRATEGY')), 'causal identification strategy requirement missing');

const conf = byId.get('CONFOUNDER_AND_MEDIATOR_CONTROL');
for (const item of ['KNOWN_CONFOUNDERS','MEDIATORS','COLLIDERS','CATEGORY_GEOGRAPHY_TIME']) req(conf.required_checks.includes(item), `missing confounder check ${item}`);
req(conf.rules.some(rule => rule.includes('UNKNOWN_CONFOUNDING_CANNOT_BE_SERIALIZED_AS_ZERO')), 'unknown confounding zero-conversion prohibition missing');

const selection = byId.get('SELECTION_AND_SURVIVORSHIP_BIAS');
req(selection.rules.includes('OBSERVED_SAMPLE_NE_TARGET_POPULATION'), 'sample/population separation missing');
req(selection.rules.some(rule => rule.includes('FAILED_WITHDRAWN_DELISTED_OR_UNOBSERVED')), 'failed/withdrawn/unobserved outcome treatment missing');

const posthoc = byId.get('POST_HOC_NARRATIVE_AND_HYPOTHESIS_DRIFT');
req(posthoc.rules.includes('POST_HOC_EXPLANATION_NE_PRE_REGISTERED_HYPOTHESIS'), 'post-hoc vs pre-registered hypothesis distinction missing');
req(posthoc.rules.some(rule => rule.includes('REJECTED_EXPLANATIONS')), 'rejected explanation auditability missing');

const multiple = byId.get('MULTIPLE_TESTING_AND_FALSE_DISCOVERY');
req(multiple.rules.some(rule => rule.includes('FALSE_DISCOVERY_CONTROL')), 'false-discovery guard missing');
req(multiple.rules.includes('BEST_OF_MANY_BACKTESTS_NE_OUT_OF_SAMPLE_VALIDATION'), 'best-backtest/out-of-sample separation missing');

const transport = byId.get('CAUSAL_TRANSPORTABILITY_AND_GLOBAL_GENERALIZATION');
req(transport.rules.includes('LOCAL_EFFECT_NE_GLOBAL_EFFECT'), 'local/global effect separation missing');
req(transport.rules.some(rule => rule.includes('HETEROGENEITY')), 'heterogeneity reporting missing');

const intervention = byId.get('COUNTERFACTUAL_AND_INTERVENTION_SAFETY');
req(intervention.rules.includes('OBSERVATIONAL_MODEL_NE_INTERVENTION_MODEL'), 'observational/intervention separation missing');
req(intervention.rules.some(rule => rule.includes('SHADOW_ONLY_OR_HOLD')), 'unsafe intervention recommendation hold missing');

req(control.epistemic_truth_ceiling?.causal_claim_without_identification === 'PROHIBITED', 'unidentified causal claims must be prohibited');
req(control.epistemic_truth_ceiling?.synthetic_or_control_evidence === 'NON_PROMOTABLE_TO_EMPIRICAL_PASS', 'synthetic empirical-promotion ceiling missing');
req(control.epistemic_truth_ceiling?.production === 'HOLD', 'Production HOLD missing');
req(control.epistemic_truth_ceiling?.g5 === 'EXPLICIT_APPROVAL_REQUIRED', 'G5 approval gate missing');

if (failed) process.exit(1);
console.log('PASS: epistemic integrity and causal inference controls validated');
