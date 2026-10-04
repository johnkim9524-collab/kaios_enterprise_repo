import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {PostgresOperationLedger,OPERATION_LEDGER_DDL,resumeOperation} from '../../../scripts/kidults/staging-operations/lib/resume-operation-v1.mjs';

// This workload may access only the disposable loopback CI service.
const container=process.env.KIDULTS_RESUME_TEST_CONTAINER;
assert.match(container||'',/^[a-f0-9]{12,64}$/,'ISOLATED_CI_CONTAINER_REQUIRED');
const run=promisify(execFile);
const quote=v=>`'${String(v).replaceAll("'","''")}'`;
async function query(sql,params=[]){
  const bound=sql.replace(/\$(\d+)/g,(_,n)=>quote(params[Number(n)-1]));
  let statement=bound;
  if(/^(INSERT|UPDATE)/i.test(bound.trim())) statement=`WITH result AS (${bound}) SELECT row_to_json(result) FROM result`;
  else if(/^SELECT/i.test(bound.trim())) statement=`SELECT row_to_json(result) FROM (${bound}) result`;
  const {stdout}=await run('docker',['exec',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','kaios','-c',statement],{timeout:15000,maxBuffer:1024*1024});
  return {rows:stdout.trim()?stdout.trim().split('\n').map(s=>JSON.parse(s)):[]};
}
await query(OPERATION_LEDGER_DDL);
const ledger=new PostgresOperationLedger(query);
const root=crypto.randomUUID();
const binding={repository:'ci/disposable',root_mission_id:root,stage_id:'race',operation_kind:'TEST',exact_target:'loopback',payload_sha256:`sha256:${'a'.repeat(64)}`};
let effects=0;
const args={binding,ledger,readExternal:async()=>({state:'ABSENT'}),verifyReceipt:async r=>r?.verified===true,authorize:async()=>true,execute:async()=>{effects++;return {verified:true};}};
const race=await Promise.all(Array.from({length:12},(_,i)=>resumeOperation({...args,owner:`writer-${i}`})));
assert.equal(effects,1);
assert.equal(race.filter(x=>x.state==='EXECUTED_VERIFIED').length,1);
const lost={...args,binding:{...binding,stage_id:'response-loss'},owner:'original',execute:async()=>{effects++;throw new Error('RESPONSE_LOST');}};
await assert.rejects(resumeOperation(lost),/RESPONSE_LOST/);
assert.equal((await resumeOperation({...lost,owner:'replacement'})).state,'OBSERVE_EXISTING');
const before=effects;
const reused=await resumeOperation({...lost,owner:'replacement',readExternal:async()=>({state:'SUCCESS',receipt:{verified:true}})});
assert.equal(reused.state,'REUSED_SUCCESS');assert.equal(effects,before);
const rows=await query('SELECT owner,state FROM kidults_resume_operation WHERE binding->>\'root_mission_id\'=$1 AND binding->>\'stage_id\'=$2',[root,'response-loss']);
assert.equal(rows.rows[0].owner,'original');assert.equal(rows.rows[0].state,'SUCCESS');
console.log(JSON.stringify({state:'VERIFIED_PASS',scope:'DISPOSABLE_POSTGRESQL_OPERATION_ADAPTER_ONLY',concurrent_sessions:12,side_effects_in_race:1,lost_response_reconciled:true,original_owner_preserved:true,production:'HOLD',public:'HOLD',g5:'HOLD'}));
