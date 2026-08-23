import fs from 'node:fs';

const gate = JSON.parse(fs.readFileSync('coordination/kidults/internalization/provider-owned-core-admission-gate-v1.json','utf8'));
const ledger = JSON.parse(fs.readFileSync('coordination/kidults/internalization/provider-commercial-rights-ledger-v1.json','utf8'));
const matrix = JSON.parse(fs.readFileSync('coordination/kidults/internalization/provider-internalization-matrix-v1.json','utf8'));
const removal = JSON.parse(fs.readFileSync('coordination/kidults/internalization/provider-removal-simulation-contract-v1.json','utf8'));
const errs = [];

const requiredHardNoGo = [
  'provider_native_id_as_canonical','provider_taxonomy_as_canonical_ontology','provider_score_as_kidults_score',
  'provider_direct_to_portal','provider_direct_to_index','single_provider_global_truth','provider_removal_requires_platform_rewrite'
];
for (const x of requiredHardNoGo) if (!gate.hard_no_go?.includes(x)) errs.push(`missing hard no-go ${x}`);
if (gate.stages?.BOUNDED_PILOT?.unknown_rights !== 'HOLD') errs.push('bounded pilot must HOLD on unknown rights');
if (gate.stages?.LONG_TERM_PARTNERSHIP?.unknown_rights !== 'HOLD') errs.push('long-term must HOLD on unknown rights');
if (gate.stages?.PRODUCTION?.default !== 'HOLD') errs.push('production must HOLD');
if (gate.current_policy?.internalization_analysis_precedes_negotiation !== true) errs.push('internalization must precede negotiation');

const matrixIds = new Set((matrix.providers || []).map(x => x.provider_id));
const decisions = [];
for (const p of ledger.providers || []) {
  if (!matrixIds.has(p.provider_id)) errs.push(`ledger provider absent from matrix: ${p.provider_id}`);
  const pending = Array.isArray(p.rights_pending) && p.rights_pending.length > 0;
  const pilot = pending ? 'HOLD_RIGHTS_PENDING' : 'RIGHTS_RESOLVED_REQUIRES_OWNER_GATES';
  decisions.push({provider_id:p.provider_id, negotiation:'ALLOWED_WRITTEN_ONLY', bounded_pilot:pilot, long_term:'HOLD_REMOVAL_AND_ECONOMICS_PROOF'});
  if (pending && !String(p.activation_state || '').startsWith('HOLD')) errs.push(`${p.provider_id} has pending rights but is not HOLD`);
}

for (const x of ['canonical_identity_continuity','methodology_continuity','confidence_provenance_continuity','historical_learning_continuity','downstream_contract_continuity','provider_adapter_replaceability']) {
  if (!removal.required_continuity_invariants?.includes(x)) errs.push(`removal contract missing ${x}`);
}
for (const [k,v] of Object.entries({contract_acceptance:'EXPLICIT_APPROVAL_REQUIRED',external_spend:'EXPLICIT_APPROVAL_REQUIRED',credential_activation:'EXPLICIT_APPROVAL_REQUIRED',production:'HOLD',g5:'EXPLICIT_APPROVAL_REQUIRED'})) {
  if (gate.non_bypass?.[k] !== v) errs.push(`boundary drift ${k}`);
}

if (errs.length) { console.error(JSON.stringify({suite:'KIDULTS_PROVIDER_OWNED_CORE_ADMISSION_GATE_V1',result:'FAIL',errs,decisions},null,2)); process.exit(1); }
console.log(JSON.stringify({suite:'KIDULTS_PROVIDER_OWNED_CORE_ADMISSION_GATE_V1',result:'PASS',providers:decisions.length,decisions,production:gate.non_bypass.production,g5:gate.non_bypass.g5},null,2));
