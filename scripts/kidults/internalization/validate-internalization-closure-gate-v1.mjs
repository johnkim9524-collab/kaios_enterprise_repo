import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const g=read('coordination/kidults/internalization/internalization-closure-gate-v1.json');
const l=read('coordination/kidults/internalization/residual-external-dependency-ledger-v1.json');
const n=read('coordination/kidults/internalization/minimum-external-dependency-negotiation-contract-v1.json');
const errs=[];
if(g.closure_rules?.internalize_now_remaining_must_equal!==0) errs.push('internalize-now closure rule drift');
if(g.closure_rules?.prohibited_dependency_remaining_must_equal!==0) errs.push('prohibited-dependency closure rule drift');
if(l.summary?.internalize_now_remaining!==0 || l.summary?.prohibited_dependency_remaining!==0) errs.push('residual ledger not closed');
if(g.current_state!=='STRUCTURAL_INTERNALIZATION_COMPLETE') errs.push('structural state not complete');
if(g.truth_boundary?.active_provider_count!==0) errs.push('active provider count truth drift');
if(g.truth_boundary?.empirical_provider_off_proof!=='NOT_APPLICABLE_UNTIL_ACTIVATION') errs.push('empirical proof truth drift');
if(n.objective!=='NEGOTIATE_ONLY_NON_INTERNALIZABLE_FACTS_AND_REQUIRED_RIGHTS') errs.push('negotiation objective drift');
if(!g.reopen_conditions?.includes('new_provider_product_introduces_internalizable_dependency')) errs.push('reopen condition missing');
if(g.truth_boundary?.production!=='HOLD') errs.push('production boundary drift');
if(errs.length){console.error(errs.join('\n'));process.exit(1);}
console.log(JSON.stringify({suite:'KIDULTS_INTERNALIZATION_CLOSURE_GATE_V1',result:'PASS',state:g.current_state,active_provider_count:0,internalize_now_remaining:0,prohibited_dependency_remaining:0,production:'HOLD'},null,2));
