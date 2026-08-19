import fs from 'node:fs/promises';

const [contractPath, outputPath='/tmp/graded-authority-probe-gate-v1.json'] = process.argv.slice(2);
if (!contractPath) throw new Error('Usage: node validate-graded-authority-probe-gate-v1.mjs <contract.json> [output.json]');
const x=JSON.parse(await fs.readFile(contractPath,'utf8'));
if(x.production!=='HOLD'||x.publication!=='HOLD'||x.external_action_default!=='DENY') throw new Error('FAIL_CLOSED_BOUNDARY_REQUIRED');
if(!Array.isArray(x.providers)||x.providers.length<2) throw new Error('OFFICIAL_PROVIDER_LANES_REQUIRED');
for(const p of x.providers){
  if(!String(p.state||'').startsWith('CONDITIONAL_OFFICIAL_API')) throw new Error(`PROVIDER_NOT_CONDITIONAL:${p.provider_id}`);
  if(!p.secret_env||!p.approval_env) throw new Error(`SECRET_AND_APPROVAL_ENV_REQUIRED:${p.provider_id}`);
  for(const required of ['TOKEN_LOGGING','PUBLICATION','PRODUCTION_USE']) if(!(p.prohibited||[]).includes(required)) throw new Error(`PROHIBITED_GUARD_MISSING:${p.provider_id}:${required}`);
}
const explicitApproved=process.env.KAIOS_EXTERNAL_CREDENTIAL_ACTION_APPROVED==='1';
const secretPresent=x.providers.some(p=>Boolean(process.env[p.secret_env]));
const blockers=[];
if(!explicitApproved) blockers.push('EXPLICIT_EXTERNAL_CREDENTIAL_ACTION_APPROVAL_REQUIRED');
if(!secretPresent) blockers.push('AUTHORIZED_PROVIDER_TOKEN_SECRET_REQUIRED');
const state=blockers.length===0?'LIVE_SINGLE_RECORD_PROBE_PERMITTED_BY_PREFLIGHT':'BLOCKED';
const out={
  id:'graded-authority-probe-gate-v1',
  state,
  blockers,
  provider_priority:x.providers.map(p=>({provider_id:p.provider_id,priority:p.priority,state:p.state})),
  secret_material_observed:false,
  production:'HOLD',
  publication:'HOLD',
  truth_boundary:state==='BLOCKED'
    ? 'No external credential action or live provider probe is authorized. Approval and a secret-stored authorized token are both required.'
    : 'Preflight permits only the documented DEV/SHADOW single-record probe. Field-purpose rights admission remains separate and fail-closed.'
};
await fs.writeFile(outputPath,JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
if(process.env.KAIOS_REQUIRE_PROBE_ALLOWED==='1' && state!=='LIVE_SINGLE_RECORD_PROBE_PERMITTED_BY_PREFLIGHT') process.exit(3);
