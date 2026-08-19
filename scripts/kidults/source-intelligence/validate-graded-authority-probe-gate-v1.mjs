import fs from 'node:fs/promises';

const [contractPath, outputPath='/tmp/graded-authority-probe-gate-v1.json'] = process.argv.slice(2);
if (!contractPath) throw new Error('Usage: node validate-graded-authority-probe-gate-v1.mjs <contract.json> [output.json]');
const x=JSON.parse(await fs.readFile(contractPath,'utf8'));
if(x.production!=='HOLD'||x.publication!=='HOLD') throw new Error('FAIL_CLOSED_BOUNDARY_REQUIRED');
if(x.founder_approval?.issue!==569||x.founder_approval?.status!=='APPROVED'||x.founder_approval?.decision!=='APPROVE_PCGS_BOUNDED_API_EVALUATION') throw new Error('FOUNDER_APPROVAL_569_BINDING_REQUIRED');
if(!Array.isArray(x.providers)||x.providers.length<2) throw new Error('OFFICIAL_PROVIDER_LANES_REQUIRED');
const pcgs=x.providers.find(p=>p.provider_id==='pcgs-public-api');
if(!pcgs||pcgs.priority!==1||pcgs.state!=='FOUNDER_APPROVED_FOR_BOUNDED_EVALUATION_NO_DATA_ADMITTED') throw new Error('PCGS_PRIMARY_APPROVED_EVALUATION_LANE_REQUIRED');
for(const p of x.providers){
  if(!p.secret_env) throw new Error(`SECRET_ENV_REQUIRED:${p.provider_id}`);
  for(const required of ['TOKEN_LOGGING','PRODUCTION_USE']) if(!(p.prohibited||[]).includes(required)) throw new Error(`PROHIBITED_GUARD_MISSING:${p.provider_id}:${required}`);
}
const pcgsTokenPresent=Boolean(process.env[pcgs.secret_env]);
const eulaCompatible=process.env.KAIOS_PCGS_EULA_COMPATIBLE==='1';
const accountAuthorized=process.env.KAIOS_PCGS_ACCOUNT_AUTHORIZED==='1';
const blockers=[];
if(!accountAuthorized) blockers.push('AUTHORIZED_PCGS_ACCOUNT_HANDOFF_REQUIRED');
if(!eulaCompatible) blockers.push('PCGS_API_EULA_COMPATIBILITY_TERMINALIZATION_REQUIRED');
if(!pcgsTokenPresent) blockers.push('PCGS_TOKEN_SECRET_HANDOFF_REQUIRED');
const state=blockers.length===0?'PCGS_LIVE_SINGLE_RECORD_PROBE_PERMITTED_BY_PREFLIGHT':'BLOCKED';
const out={
  id:'graded-authority-probe-gate-v1',
  founder_approval_issue:569,
  founder_approval_satisfied:true,
  state,
  blockers,
  provider_priority:x.providers.map(p=>({provider_id:p.provider_id,priority:p.priority,state:p.state})),
  secret_material_observed:false,
  production:'HOLD',
  publication:'HOLD',
  truth_boundary:state==='BLOCKED'
    ? 'Founder approval is satisfied. Remaining blockers are operational account/EULA/token handoff only; no PCGS data is admitted and no live probe may run yet.'
    : 'Preflight permits only Founder-approved minimal PCGS DEV/SHADOW single-record probes. Field-purpose rights admission remains separate and fail-closed.'
};
await fs.writeFile(outputPath,JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
if(process.env.KAIOS_REQUIRE_PROBE_ALLOWED==='1' && state!=='PCGS_LIVE_SINGLE_RECORD_PROBE_PERMITTED_BY_PREFLIGHT') process.exit(3);
