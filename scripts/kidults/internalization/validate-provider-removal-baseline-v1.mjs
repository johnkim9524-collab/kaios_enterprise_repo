import fs from 'node:fs';
const b=JSON.parse(fs.readFileSync('coordination/kidults/internalization/provider-removal-baseline-v1.json','utf8'));
const errs=[];
const ids=['PSA','GEMRATE','CGC_CCG','ALT_FNDATA','CLASSIC_COM','LIVEART','HAGERTY'];
if (b.evidence_policy !== 'NO_EMPIRICAL_PASS_WITHOUT_EXECUTED_PROVIDER_OFF_PROOF') errs.push('evidence policy drift');
for (const id of ids) {
  const r=b.providers?.find(x=>x.provider_id===id);
  if(!r) { errs.push(`missing ${id}`); continue; }
  if(r.removal_test_state!=='NOT_MEASURED') errs.push(`${id} must remain NOT_MEASURED before empirical provider-off proof`);
  if(!r.replacement_path || r.replacement_path==='UNKNOWN') errs.push(`${id} replacement path required`);
  if(r.decision!=='HOLD_FOR_EMPIRICAL_REMOVAL_PROOF') errs.push(`${id} must HOLD before empirical proof`);
}
if(b.summary?.providers!==7 || b.summary?.empirical_pass!==0 || b.summary?.not_measured!==7) errs.push('summary truth drift');
if(b.production!=='HOLD') errs.push('production boundary drift');
if(errs.length){console.error(errs.join('\n'));process.exit(1);}
console.log(JSON.stringify({suite:'KIDULTS_PROVIDER_REMOVAL_BASELINE_V1',result:'PASS',providers:7,empirical_pass:0,not_measured:7,production:'HOLD'},null,2));
