import fs from 'node:fs';
import { runAlternateCurrentSoldProviderPreflightValidation } from '../market/validate-alternate-current-sold-provider-preflight-v1.mjs';

const read = p => JSON.parse(fs.readFileSync(p,'utf8'));
const gate = read('coordination/kidults/internalization/provider-operating-admission-gate-v1.json');
const rights = read('coordination/kidults/internalization/rights-intelligence-policy-v1.json');
const matrix = read('coordination/kidults/internalization/provider-internalization-matrix-v1.json');
const removal = read('coordination/kidults/internalization/provider-removal-simulation-contract-v1.json');
const legacy = read('coordination/kidults/market/provider-rights-decision-gate-v1.json');
const errs = [];
let alternateCurrentSoldReceipt;
try {
  alternateCurrentSoldReceipt = runAlternateCurrentSoldProviderPreflightValidation();
} catch (error) {
  errs.push(`alternate Current-SOLD provider preflight invalid: ${error.message}`);
}

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
  const expected = p === 'ALT_FNDATA' ? 'NO_GO' : 'HOLD';
  if (gate.provider_baseline?.[p] !== expected) errs.push(`${p} baseline must remain ${expected}`);
}
const altTerminal = gate.terminal_decisions?.ALT_FNDATA;
if (altTerminal?.basis !== 'PROVIDER_DECLINED_COMPETITOR_CONFLICT') errs.push('ALT_FNDATA terminal basis drift');
if (altTerminal?.external_contact !== 'PROHIBITED') errs.push('ALT_FNDATA external contact must remain prohibited');
if (altTerminal?.fallback_or_redundancy !== 'EXCLUDED') errs.push('ALT_FNDATA fallback/redundancy exclusion missing');
const expectedLegacyProviders = ['CLASSIC.COM','ALT/FNDATA','DISCOGS','CARDMARKET','EBAY_MARKETPLACE_INSIGHTS'];
if (JSON.stringify(legacy.providers) !== JSON.stringify(expectedLegacyProviders)) errs.push('legacy provider-rights universe must remain exact and ordered');
for (const p of expectedLegacyProviders) {
  const s = legacy.current_provider_state?.[p];
  if (!s) errs.push(`legacy rights state missing ${p}`);
  else if (s.decision !== 'PASS' && s.activation !== 'DISABLED') errs.push(`${p} legacy activation must remain disabled`);
}
for (const p of ['DISCOGS','CARDMARKET','EBAY_MARKETPLACE_INSIGHTS']) {
  const s = legacy.current_provider_state?.[p];
  if (s?.decision !== 'NEEDS_CLARIFICATION') errs.push(`${p} must remain NEEDS_CLARIFICATION on current evidence`);
}
for (const k of ['contract_acceptance','external_spend','credential_activation']) if (gate.non_bypass?.[k] !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push(`${k} boundary drift`);
if (gate.non_bypass?.production !== 'HOLD' || gate.non_bypass?.public_intelligence !== 'HOLD') errs.push('release boundary drift');

if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log(JSON.stringify({suite:'KIDULTS_PROVIDER_OPERATING_ADMISSION_GATE_V1',result:'PASS',providers:providers.length,legacy_market_providers:Object.keys(legacy.current_provider_state||{}).length,alternate_current_sold_preflight:alternateCurrentSoldReceipt?.result||'INVALID',alternate_current_sold_mutations:alternateCurrentSoldReceipt?.mutation_tests||0,rights_clear_current_sold_providers:alternateCurrentSoldReceipt?.rights_clear_current_sold_providers??null,baseline:'SIX_HOLD_ONE_TERMINAL_NO_GO',production:'HOLD'},null,2));
