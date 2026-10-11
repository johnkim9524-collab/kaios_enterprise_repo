import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateOperationQuarantine,quarantinedOperation} from '../../../scripts/kidults/kpmo/lib/autonomous-operation-quarantine-v1.mjs';
import {discover} from '../../../scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs';

const manifest=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/autonomous-operation-quarantine-v1.json'));
const repository=manifest.repository,sha=c=>c.repeat(40);
const pr={number:1677,state:'open',merged:false,draft:true,
  base:{ref:'main',sha:sha('a'),repo:{id:1281328888,full_name:repository}},
  head:{sha:sha('b'),repo:{full_name:repository}}};
const copy=()=>structuredClone(manifest);
test('original UNKNOWN operation key is recomputed and containment never grants authority',()=>{
  assert.equal(validateOperationQuarantine(manifest,repository),manifest);
  const r=quarantinedOperation(pr,manifest);
  assert.equal(r.state,'QUARANTINED_UNKNOWN_OPERATION');
  assert.equal(r.original_operation_key,manifest.entries[0].operation_key);
  for(const k of ['repository_mutation_performed','broker_invocation_authorized','autonomous_eligible','landing_authorization_created','merge_authorized'])assert.equal(r[k],false);
  for(const k of ['production','public','g5'])assert.equal(r[k],'HOLD');
});
for(const change of [p=>({...p,base:{...p.base,sha:sha('c')}}),p=>({...p,head:{...p.head,sha:sha('d')}}),p=>({...p,draft:false})])
  test('main/head/Ready drift cannot release the original ambiguous PR: '+JSON.stringify(change(pr)),()=>{
    assert.equal(quarantinedOperation(change(pr),manifest).state,'QUARANTINED_UNKNOWN_OPERATION');
  });
test('unrelated PR is not quarantined; same number in another repository fails closed',()=>{
  assert.equal(quarantinedOperation({...pr,number:42},manifest),null);
  assert.throws(()=>quarantinedOperation({...pr,base:{...pr.base,repo:{full_name:'other/repo'}}},manifest),/QUARANTINE_INVALID/);
});
for(const [label,mutate] of [
  ['released',m=>m.entries[0].state='SUCCESS'],['key',m=>m.entries[0].operation_key='sha256:'+sha('a')+'a'.repeat(24)],
  ['payload',m=>m.entries[0].binding.payload_sha256='sha256:'+'0'.repeat(64)],
  ['target',m=>m.entries[0].binding.exact_target=m.entries[0].binding.exact_target.replace('1677:','42:')],
  ['repository',m=>m.repository='other/repo'],['duplicate',m=>m.entries.push(structuredClone(m.entries[0]))],
  ['release-policy',m=>m.release_requires_authenticated_original_operation_reconciliation=false],
  ['archive',m=>m.entries[0].evidence.archive_sha256='invalid'],['attempt',m=>m.entries[0].evidence.run_attempt=2],
  ['member',m=>m.entries[0].evidence.member='../injected.json'],['extra-authority',m=>m.entries[0].allow_retry=true],
  ['production',m=>m.production='PASS']])
  test('malformed quarantine fails before any network read: '+label,async()=>{
    const m=copy();mutate(m);let reads=0;
    await assert.rejects(discover({repository,token:'offline',policy:{},operationQuarantine:m,fetchImpl:async()=>{reads++;}}),/QUARANTINE_INVALID/);
    assert.equal(reads,0);
  });

test('UNKNOWN is excluded before candidate/source reads and a separate eligible PR survives the scan',async()=>{
  const policy=JSON.parse(fs.readFileSync('coordination/kidults/governance/autonomous-internal-landing-policy-v1.json'));
  const other={...pr,number:42,draft:false,base:{...pr.base,sha:sha('a')},head:{...pr.head,sha:sha('e')}};
  const paths=[];
  const result=await discover({repository,token:'offline',policy,generationSeed:'1',operationQuarantine:manifest,
    fetchImpl:async url=>{
      const u=new URL(url),p=u.pathname;paths.push(p);
      let payload;
      if(p.endsWith('/branches/main'))payload={commit:{sha:sha('a')}};
      else if(p.endsWith('/rulesets'))payload=[{id:1,name:'KAIOS Solo Owner Preflight',enforcement:'active'}];
      else if(p.endsWith('/rulesets/1'))payload={bypass_actors:[],rules:[{type:'required_status_checks',parameters:{strict_required_status_checks_policy:true,required_status_checks:[{context:'unit',integration_id:7}]}}]};
      else if(p.endsWith('/pulls'))payload=[pr,other];
      else if(p.endsWith('/pulls/42/files'))payload=[{filename:'src/a.js',status:'modified',patch:'@@ -1 +1 @@\n-const x=1;\n+const x=2;'}];
      else if(p.includes('/git/commits/'))payload={tree:{sha:sha('f')}};
      else if(p.endsWith('/status'))payload={statuses:[]};
      else if(p.endsWith('/check-runs'))payload={check_runs:[{id:1,name:'unit',head_sha:other.head.sha,app:{id:7},status:'completed',conclusion:'success',external_id:'unit-1'}]};
      else if(p.includes('/contents/'))payload={type:'file',encoding:'base64',content:Buffer.from(u.searchParams.get('ref')===sha('a')?'const x=1;':'const x=2;').toString('base64')};
      else throw Error('Unexpected candidate read '+p);
      return {ok:true,status:200,headers:{get:()=>null},json:async()=>payload};
    }});
  assert.equal(result[0].state,'QUARANTINED_UNKNOWN_OPERATION');
  assert.equal(result[1].state,'ELIGIBLE');
  assert.equal(result[1].envelope.pull_request,42);
  assert.ok(!paths.some(p=>p.includes('/pulls/1677/')));
  assert.ok(!paths.some(p=>p.includes('/git/commits/'+pr.head.sha)));
});
test('native CLI mandatorily loads the committed quarantine; workflow filters do not consume it',()=>{
  const cli=fs.readFileSync('scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs','utf8');
  assert.match(cli,/const operationQuarantine=JSON.parse\(fs.readFileSync\('coordination\/kidults\/kpmo\/autonomous-operation-quarantine-v1.json','utf8'\)\)/);
  assert.match(cli,/generationSeed:process.env.GITHUB_RUN_ID,sourceTransport,operationQuarantine/);
  const workflow=fs.readFileSync('.github/workflows/kidults-autonomous-dispatcher-v1.yml','utf8');
  assert.doesNotMatch(workflow,/select\(\.state=="QUARANTINED_UNKNOWN_OPERATION"\)/);
});

test('quarantined-only source-transport scan opens no candidate files or Git pack',async()=>{
  const paths=[];
  const result=await discover({repository,token:'offline',policy:{},generationSeed:'1',operationQuarantine:manifest,sourceTransport:true,
    fetchImpl:async url=>{
      const p=new URL(url).pathname;paths.push(p);let payload;
      if(p.endsWith('/branches/main'))payload={commit:{sha:sha('a')}};
      else if(p.endsWith('/rulesets'))payload=[{id:1,name:'KAIOS Solo Owner Preflight',enforcement:'active'}];
      else if(p.endsWith('/rulesets/1'))payload={bypass_actors:[],rules:[{type:'required_status_checks',parameters:{strict_required_status_checks_policy:true,required_status_checks:[{context:'unit',integration_id:7}]}}]};
      else if(p.endsWith('/pulls'))payload=[pr];
      else throw Error('Unexpected quarantined source read '+p);
      return {ok:true,status:200,headers:{get:()=>null},json:async()=>payload};
    }});
  assert.equal(result.length,1);assert.equal(result[0].state,'QUARANTINED_UNKNOWN_OPERATION');
  assert.equal(paths.length,4);assert.ok(!paths.some(p=>p.includes('/files')||p.includes('.git/')));
});
