import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync('coordination/kidults/internalization/provider-removal-readiness-ledger-v1.json','utf8'));
const errs=[];
const ids=['PSA','GEMRATE','CGC_CCG','ALT_FNDATA','CLASSIC_COM','LIVEART','HAGERTY'];
const by=new Map((d.providers||[]).map(x=>[x.provider_id,x]));
for (const id of ids){const p=by.get(id); if(!p){errs.push(`missing ${id}`);continue;} if(p.simulation_state!=='NOT_RUN') errs.push(`${id} must remain NOT_RUN until empirical approved binding exists`); if(!Array.isArray(p.required_before_long_term)||p.required_before_long_term.length===0) errs.push(`${id} missing long-term prerequisites`);}
if(d.rules?.not_run_may_be_promoted_to_pass!==false) errs.push('NOT_RUN promotion must be prohibited');
if(d.rules?.provider_marketing_may_substitute_for_simulation!==false) errs.push('marketing substitution must be prohibited');
if(d.rules?.platform_rewrite_required!=='FAIL') errs.push('platform rewrite must FAIL');
if(d.rules?.raw_provider_payload_required_for_kidults_core_continuity!=='FAIL') errs.push('raw-provider dependency must FAIL');
if(d.rules?.long_term_partnership_without_removal_pass!=='HOLD') errs.push('long-term without removal PASS must HOLD');
for(const [k,v] of Object.entries({contract:'EXPLICIT_APPROVAL_REQUIRED',spend:'EXPLICIT_APPROVAL_REQUIRED',credential_activation:'EXPLICIT_APPROVAL_REQUIRED',production:'HOLD',g5:'EXPLICIT_APPROVAL_REQUIRED'})) if(d.non_bypass?.[k]!==v) errs.push(`boundary drift ${k}`);
if(errs.length){console.error(JSON.stringify({suite:'KIDULTS_PROVIDER_REMOVAL_READINESS_LEDGER_V1',result:'FAIL',errs},null,2));process.exit(1);}
console.log(JSON.stringify({suite:'KIDULTS_PROVIDER_REMOVAL_READINESS_LEDGER_V1',result:'PASS',providers:ids.length,simulations_not_run:ids.length,production:d.non_bypass.production},null,2));
