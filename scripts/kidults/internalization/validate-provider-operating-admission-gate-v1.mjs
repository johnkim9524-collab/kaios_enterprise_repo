import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p,'utf8'));
const gate = read('coordination/kidults/internalization/provider-operating-admission-gate-v1.json');
const rights = read('coordination/kidults/internalization/rights-intelligence-policy-v1.json');
const matrix = read('coordination/kidults/internalization/provider-internalization-matrix-v1.json');
const removal = read('coordination/kidults/internalization/provider-removal-simulation-contract-v1.json');
const legacy = read('coordination/kidults/market/provider-rights-decision-gate-v1.json');
const errs = [];

for (const id of [1171,1166,1153,952,894,769]) if (!gate.parent_issues?.includes(id)) errs.push(`missing parent #${id}`);
for (const s of ['PASS_FOR_BOUNDED_PILOT','HOLD','NO_GO','INTERNALIZE_FIRST']) if (!gate.decision_states?.includes(s)) errs.push(`missing state ${s}`);
if (gate.laws?.unknown_or_incomplete_material_rights !== 'HOLD') errs.push('unknown rights must HOLD');
if (gate.laws?.prohibited_dependency_present !== 'NO_GO') errs.push('prohibited dependency must NO_GO');
if (gate.laws?.internalize_now_function_requested_as_external_core !== 'INTERNALIZE_FIRST') errs.push('internalize-now external-core request must INTERNALIZE_FIRST');
if (gate.activation_requirements?.core_capture_count_must_equal !== 0) errs.push('core capture floor must be zero');
if (gate.activation_requirements?.prohibited_dependency_count_must_equal !== 0) errs.push('prohibited dependency floor must be zero');
if (rights.fail_closed_rules?.unknown_required_right !== 'HOLD') errs.push('rights policy semantic drift');
if (!removal.required_continuity_invariants?.includes('canonical_identity_continuity')) errs.push('removal identity continuity missing');
if (!removal.required_continuity_invariants?.includes('downstream_contract_continuity')) errs.push('removal downstream continuity missing');

const providers = matrix.providers?.map(p=>p.provider_id) || [];
for (const p of ['PSA','GEMRATE','CGC_CCG','ALT_FNDATA','CLASSIC_COM','LIVEART','HAGERTY']) {
  if (!providers.includes(p)) errs.push(`provider missing from matrix ${p}`);
  if (gate.provider_baseline?.[p] !== 'HOLD') errs.push(`${p} baseline must HOLD until joint gate evidence exists`);
}
for (const p of ['CLASSIC.COM','ALT/FNDATA']) {
  const s = legacy.current_provider_state?.[p];
  if (!s) errs.push(`legacy rights state missing ${p}`);
  else if (s.decision !== 'PASS' && s.activation !== 'DISABLED') errs.push(`${p} legacy activation must remain disabled`);
}
for (const k of ['contract_acceptance','external_spend','credential_activation']) if (gate.non_bypass?.[k] !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push(`${k} boundary drift`);
if (gate.non_bypass?.production !== 'HOLD' || gate.non_bypass?.public_intelligence !== 'HOLD') errs.push('release boundary drift');

if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log(JSON.stringify({suite:'KIDULTS_PROVIDER_OPERATING_ADMISSION_GATE_V1',result:'PASS',providers:providers.length,legacy_market_providers:Object.keys(legacy.current_provider_state||{}).length,baseline:'ALL_HOLD',production:'HOLD'},null,2));
