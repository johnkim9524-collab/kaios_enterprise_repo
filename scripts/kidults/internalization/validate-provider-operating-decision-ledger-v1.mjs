import fs from 'node:fs';

const d = JSON.parse(fs.readFileSync('coordination/kidults/internalization/provider-operating-decision-ledger-v1.json','utf8'));
const ledger = JSON.parse(fs.readFileSync('coordination/kidults/internalization/provider-commercial-rights-ledger-v1.json','utf8'));
const matrix = JSON.parse(fs.readFileSync('coordination/kidults/internalization/provider-internalization-matrix-v1.json','utf8'));
const errs = [];
const expected = ['PSA','GEMRATE','CGC_CCG','ALT_FNDATA','CLASSIC_COM','LIVEART','HAGERTY'];
const decisions = new Map((d.providers || []).map(x=>[x.provider_id,x]));
const rights = new Map((ledger.providers || []).map(x=>[x.provider_id,x]));
const matrixIds = new Set((matrix.providers || []).map(x=>x.provider_id));
for (const id of expected) {
  const x=decisions.get(id); const r=rights.get(id);
  if (!x) { errs.push(`missing decision ${id}`); continue; }
  if (!r) errs.push(`missing rights ledger ${id}`);
  if (!matrixIds.has(id)) errs.push(`missing matrix ${id}`);
  if (!String(x.pilot).startsWith('HOLD')) errs.push(`${id} pilot must remain HOLD on current evidence`);
  if (!String(x.long_term).startsWith('HOLD')) errs.push(`${id} long-term must remain HOLD on current evidence`);
  if (r?.rights_pending?.length > 0 && !String(x.pilot).includes('HOLD')) errs.push(`${id} pending rights cannot pilot`);
}
if (d.policy?.substantive_inbound_requires_analysis_first !== true) errs.push('analysis-first rule missing');
if (d.policy?.spend_without_owner_approval !== 'PROHIBITED') errs.push('spend rule drift');
const t=d.empirical_truth_non_promotion || {};
if (t.graded_population !== '0/120' || t.human_reviews !== 0 || t.lawful_collector_market_dated_sold_cells !== 0 || t.market_claim !== 'NONE' || t.candidate_evidence_pair !== 'NONE' || t.track_b !== 'NOT_STARTED') errs.push('empirical truth inflation detected');
for (const [k,v] of Object.entries({contract:'EXPLICIT_APPROVAL_REQUIRED',spend:'EXPLICIT_APPROVAL_REQUIRED',credential_activation:'EXPLICIT_APPROVAL_REQUIRED',production:'HOLD',g5:'EXPLICIT_APPROVAL_REQUIRED'})) if (d.non_bypass?.[k] !== v) errs.push(`boundary drift ${k}`);
if (errs.length) { console.error(JSON.stringify({suite:'KIDULTS_PROVIDER_OPERATING_DECISION_LEDGER_V1',result:'FAIL',errs},null,2)); process.exit(1); }
console.log(JSON.stringify({suite:'KIDULTS_PROVIDER_OPERATING_DECISION_LEDGER_V1',result:'PASS',providers:expected.length,pilots_held:expected.length,long_term_held:expected.length,production:d.non_bypass.production},null,2));
