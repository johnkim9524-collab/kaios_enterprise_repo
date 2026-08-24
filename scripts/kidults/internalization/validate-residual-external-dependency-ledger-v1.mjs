import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const ledger=read('coordination/kidults/internalization/residual-external-dependency-ledger-v1.json');
const matrix=read('coordination/kidults/internalization/provider-internalization-matrix-v1.json');
const operating=read('coordination/kidults/internalization/provider-operating-admission-gate-v1.json');
const errs=[];
const allowed=new Set(ledger.allowed_classes||[]);
if(ledger.policy!=='EXTERNAL_DEPENDENCY_ALLOWED_ONLY_FOR_NON_INTERNALIZABLE_FACT_AUTHORITY_OR_LEGAL_PERMISSION') errs.push('dependency policy drift');
if(!Array.isArray(ledger.prohibited_external_core_classes)||ledger.prohibited_external_core_classes.length<10) errs.push('owned core prohibited-external classes incomplete');
const matrixIds=new Set((matrix.providers||[]).map(x=>x.provider_id));
for(const p of ledger.providers||[]){
  if(!matrixIds.has(p.provider_id)) errs.push(`ledger provider not in matrix ${p.provider_id}`);
  for(const d of p.residual_external||[]) if(!allowed.has(d)) errs.push(`${p.provider_id} unapproved residual class ${d}`);
  if((p.internalize_now_remaining||[]).length!==0) errs.push(`${p.provider_id} immediate internalization remains`);
  if((p.prohibited_dependency_remaining||[]).length!==0) errs.push(`${p.provider_id} prohibited dependency remains`);
  if(p.structural_core_state!=='OWNED_CORE_BOUNDARY_PRESENT') errs.push(`${p.provider_id} structural core boundary missing`);
  if(operating.provider_baseline?.[p.provider_id]!=='HOLD') errs.push(`${p.provider_id} must remain HOLD before joint gate pass`);
}
if(ledger.summary?.providers!==7) errs.push('provider count drift');
if(ledger.summary?.internalize_now_remaining!==0) errs.push('internalize-now summary must be zero');
if(ledger.summary?.prohibited_dependency_remaining!==0) errs.push('prohibited dependency summary must be zero');
if(ledger.summary?.active_provider_count!==0) errs.push('active provider truth drift');
if(ledger.summary?.structural_provider_independence!=='PASS') errs.push('structural independence must PASS');
if(ledger.summary?.empirical_active_provider_removal!=='NOT_APPLICABLE_UNTIL_PROVIDER_ACTIVATION') errs.push('empirical removal truth boundary drift');
if(ledger.non_bypass?.production!=='HOLD') errs.push('production boundary drift');
if(errs.length){console.error(errs.join('\n'));process.exit(1);}
console.log(JSON.stringify({suite:'KIDULTS_RESIDUAL_EXTERNAL_DEPENDENCY_LEDGER_V1',result:'PASS',providers:7,internalize_now_remaining:0,prohibited_dependency_remaining:0,active_provider_count:0,structural_provider_independence:'PASS',production:'HOLD'},null,2));
