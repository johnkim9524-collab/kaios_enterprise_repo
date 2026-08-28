import fs from 'node:fs';
import { runClassicResponseIntakeValidation } from './validate-classic-bundle3-provider-response-intake-v1.mjs';
import { runAlternateCurrentSoldProviderPreflightValidation } from './validate-alternate-current-sold-provider-preflight-v1.mjs';

const gate = JSON.parse(fs.readFileSync('coordination/kidults/market/provider-rights-decision-gate-v1.json','utf8'));
const classic = JSON.parse(fs.readFileSync('coordination/kidults/market/classic-private-activation-contract-r1.json','utf8'));

const errs = [];
let classicIntakeReceipt;
let alternateCurrentSoldReceipt;
try {
  classicIntakeReceipt = runClassicResponseIntakeValidation();
} catch (error) {
  errs.push(`CLASSIC.COM response intake invalid: ${error.message}`);
}
try {
  alternateCurrentSoldReceipt = runAlternateCurrentSoldProviderPreflightValidation();
} catch (error) {
  errs.push(`alternate Current-SOLD provider preflight invalid: ${error.message}`);
}
if (gate.parent_issue !== 769) errs.push('parent issue must be #769');
if (gate.version !== '1.2.0') errs.push('provider rights gate version must be 1.2.0');
if (!Array.isArray(gate.required_dimensions) || gate.required_dimensions.length !== 11) errs.push('11 field-purpose dimensions required');
if (!Array.isArray(gate.required_event_fields) || gate.required_event_fields.length !== 5) errs.push('5 event fields required');
for (const d of classic.required_rights_dimensions || []) if (!gate.required_dimensions.includes(d)) errs.push(`missing classic rights dimension ${d}`);
for (const f of classic.required_event_fields || []) if (!gate.required_event_fields.includes(f)) errs.push(`missing classic event field ${f}`);
const expectedProviders = ['CLASSIC.COM','ALT/FNDATA','DISCOGS','CARDMARKET','EBAY_MARKETPLACE_INSIGHTS'];
if (JSON.stringify(gate.providers) !== JSON.stringify(expectedProviders)) errs.push('provider universe must remain exact and ordered');
for (const p of expectedProviders) {
  const s = gate.current_provider_state?.[p];
  if (!s) errs.push(`missing provider state ${p}`);
  else {
    if (!['PASS','NO_GO','NEEDS_CLARIFICATION'].includes(s.decision)) errs.push(`invalid decision ${p}`);
    if (s.decision !== 'PASS' && s.activation !== 'DISABLED') errs.push(`${p} must remain disabled without PASS`);
  }
}
if (gate.current_provider_state?.['CLASSIC.COM']?.decision !== 'NEEDS_CLARIFICATION') errs.push('CLASSIC.COM must remain NEEDS_CLARIFICATION on current evidence');
const alt = gate.current_provider_state?.['ALT/FNDATA'];
if (alt?.decision !== 'NO_GO') errs.push('ALT/FNDATA must remain NO_GO after provider competitor-conflict rejection');
if (alt?.written_response !== 'DECLINED_COMPETITOR_CONFLICT') errs.push('ALT/FNDATA rejection evidence state drift');
if (alt?.activation !== 'DISABLED') errs.push('ALT/FNDATA activation must remain disabled');
for (const provider of ['DISCOGS','CARDMARKET','EBAY_MARKETPLACE_INSIGHTS']) {
  const state = gate.current_provider_state?.[provider];
  if (state?.decision !== 'NEEDS_CLARIFICATION') errs.push(`${provider} must remain NEEDS_CLARIFICATION on current evidence`);
  if (state?.preflight_ref !== 'coordination/kidults/market/alternate-current-sold-provider-preflight-v1.json') errs.push(`${provider} alternate Current-SOLD preflight binding drift`);
  if (state?.written_response !== 'NOT_REQUESTED_CONTACT_NOT_AUTHORIZED') errs.push(`${provider} contact/response truth drift`);
  if (state?.activation !== 'DISABLED') errs.push(`${provider} activation must remain disabled`);
}
if (gate.non_bypass?.credential_activation !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('credential approval boundary drift');
if (gate.non_bypass?.external_spend !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('spend approval boundary drift');
if (gate.non_bypass?.production !== 'HOLD' || gate.non_bypass?.g5 !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('release boundary drift');
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log(JSON.stringify({
  suite:'KIDULTS_PROVIDER_RIGHTS_DECISION_GATE_V1',
  result:'PASS',
  required_dimensions:gate.required_dimensions.length,
  required_event_fields:gate.required_event_fields.length,
  classic_decision:gate.current_provider_state['CLASSIC.COM'].decision,
  classic_response_intake:classicIntakeReceipt?.state || 'INVALID',
  classic_response_intake_mutations:classicIntakeReceipt?.mutation_tests || 0,
  alt_fndata_decision:gate.current_provider_state['ALT/FNDATA'].decision,
  alternate_current_sold_preflight:alternateCurrentSoldReceipt?.result || 'INVALID',
  alternate_current_sold_providers:alternateCurrentSoldReceipt?.provider_order?.length || 0,
  alternate_current_sold_mutations:alternateCurrentSoldReceipt?.mutation_tests || 0,
  rights_clear_current_sold_providers:alternateCurrentSoldReceipt?.rights_clear_current_sold_providers ?? null,
  complete_current_sold_providers:alternateCurrentSoldReceipt?.complete_current_sold_providers ?? null,
  activation:'DISABLED_PENDING_SOURCE_SPECIFIC_PASS',
  production:'HOLD',
  g5:'EXPLICIT_APPROVAL_REQUIRED'
},null,2));
