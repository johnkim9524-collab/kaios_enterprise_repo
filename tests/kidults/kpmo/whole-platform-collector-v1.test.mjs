import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {digest,readArchive} from '../../../scripts/kidults/kpmo/validate-sentinel-producer-content-v1.mjs';
import {SPECS} from '../../../scripts/kidults/kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs';
import {buildAutonomousOperatingCompletion,collectWholePlatform} from '../../../scripts/kidults/kpmo/collect-whole-platform-operating-proof-v1.mjs';
const contract=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/whole-platform-operating-proof-v1.json'));
const scorecard=JSON.parse(fs.readFileSync(contract.value_chain_source));
const repository=contract.repository,source='a'.repeat(40),base='b'.repeat(40);
function fixture({active=false,foreign=false,duplicate=false,mainDrift=false}={}){
  let branches=0,downloads=0,reads=[];
  const latest={id:10,run_attempt:1,repository:{full_name:foreign?'foreign/repo':repository},
    path:'.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml',head_sha:source,head_branch:'main',event:'repository_dispatch',
    status:active?'in_progress':'completed',conclusion:active?null:'success',created_at:'2026-10-04T12:00:00Z'};
  const artifact={id:100,name:`kpmo-continuous-assurance-sentinel-health-v1-${source}-10-1`,expired:false,
    workflow_run:{id:10,head_sha:source},expires_at:'2026-11-01T00:00:00Z',digest:'sha256:'+'0'.repeat(64)};
  const read=async url=>{
    reads.push(url);assert.ok(url.startsWith(`https://api.github.com/repos/${repository}/`));
    if(url.endsWith('/branches/main'))return {commit:{sha:mainDrift&&++branches>1?'c'.repeat(40):source}};
    if(url.endsWith(`/git/commits/${source}`))return {sha:source,tree:{sha:'d'.repeat(40)},parents:[{sha:base},{sha:'e'.repeat(40)}]};
    if(url.endsWith('/actions/runs/38132692877'))return null;
    if(url.includes('/pulls?'))return [];
    if(url.includes('/artifacts?'))return {total_count:duplicate?2:1,artifacts:duplicate?[artifact,artifact]:[artifact]};
    throw Error('unexpected GET');
  };
  return {run:()=>collectWholePlatform({sourceSha:source,contract,scorecard,observedAt:'2026-10-04T12:30:00Z',read,
    listRuns:async(_,s)=>s.id==='SENTINEL'?[latest]:[],download:async()=>{downloads++;return Buffer.from('invalid archive');}}),
    counts:()=>({downloads,reads})};
}
test('latest in-flight generation holds instead of choosing an older green or causing a dispatch',async()=>{
  const f=fixture({active:true}),r=await f.run();assert.equal(r.state,'VERIFIED_INCOMPLETE');
  assert.equal(r.operating_checks.find(c=>c.id==='CORE_FOUR_CONTENT').state,'VERIFIED_HOLD');
  assert.equal(f.counts().downloads,0);assert.equal(r.whole_platform_runtime_proven,false);
  assert.ok(r.operating_checks.every(c=>c.retry_authorized===false));assert.equal(r.value_chain.length,14);assert.equal(r.runtime_domain_registry.state,'FUTURE_EXPANSION');assert.equal(r.runtime_domain_registry.required_domain_count,14);assert.equal(r.runtime_domain_registry.registered_domain_count,contract.runtime_domain_sources.length);
  assert.equal(r.runtime_evidence_demand.demands.length,14);
  assert.equal(r.runtime_evidence_demand.dispatch_authority,false);
  assert.equal(r.runtime_evidence_demand.verified_domain_count,0);
  assert.equal(r.autonomous_operating_completion.state,'VERIFIED_HOLD');
  assert.equal(r.autonomous_operating_completion.scope,'AUTONOMOUS_CONTROL_PLANE_NOT_WHOLE_PLATFORM');
  assert.equal(r.autonomous_operating_completion.required_runtime_domain_count,1);
  assert.deepEqual(r.autonomous_operating_completion.future_expansion_runtime_domain_ids,[...contract.autonomous_operating_readiness.future_expansion_domains].sort());
  assert.equal(r.runtime_evidence_demand.demands.filter(d=>d.state==='FUTURE_EXPANSION').length,13);
  assert.equal(r.autonomous_operating_completion.whole_platform_runtime_proven,false);
});
test('foreign producer metadata and duplicate artifacts never become partial PASS',async()=>{
  for(const options of [{foreign:true},{duplicate:true}]){
    const f=fixture(options),r=await f.run();assert.equal(r.state,'VERIFIED_FAIL');assert.equal(f.counts().downloads,0);
  }
});
test('artifact bytes must match the protected GitHub digest',async()=>{
  const f=fixture(),r=await f.run();assert.equal(r.state,'VERIFIED_FAIL');
  assert.match(r.operating_checks.find(c=>c.id==='CORE_FOUR_CONTENT').reason,/ARCHIVE_DIGEST/);assert.equal(f.counts().downloads,1);
});
test('main drift during collection prevents publication of an older certificate',async()=>{
  await assert.rejects(fixture({active:true,mainDrift:true}).run(),/MAIN_CHANGED/);
});
test('default observer queries bounded exact-SHA time windows and never dispatches',async()=>{
  const queries=[];
  const read=async (url,_token,options)=>{
    if(url.endsWith('/branches/main'))return {commit:{sha:source}};
    if(url.endsWith(`/git/commits/${source}`))return {sha:source,tree:{sha:'d'.repeat(40)},parents:[{sha:base},{sha:'e'.repeat(40)}],committer:{date:'2026-10-04T11:28:35Z'}};
    if(url.endsWith('/actions/runs/38132692877'))return null;
    if(url.includes('/pulls?'))return [];
    if(url.includes('/runs?')){const query=new URL(url).searchParams;queries.push(query);assert.equal(options.maxBytes,4*1024*1024);return {total_count:0,workflow_runs:[]};}
    throw Error('unexpected GET');
  };
  const result=await collectWholePlatform({sourceSha:source,contract,scorecard,read,observedAt:'2026-10-04T12:30:00Z'});
  assert.equal(result.state,'VERIFIED_INCOMPLETE');assert.equal(queries.length,3+contract.runtime_domain_sources.length);
  for(const q of queries){assert.equal(q.get('branch'),'main');assert.equal(q.get('per_page'),'25');assert.equal(q.get('page'),'1');
    const [after,before]=q.get('created').split('..');const duration=Date.parse(before)-Date.parse(after);
    assert.equal(duration,q.get('head_sha')===source?contract.maximum_evidence_age_seconds*1000:7200000);
    assert.ok([source,base].includes(q.get('head_sha')));
  }
});

test('one authenticated Security domain completes Autonomous Control Plane while 13 domains remain future expansion',()=>{
  const policy=contract.autonomous_operating_readiness,checks=contract.required_operating_checks.map(id=>({id,state:'VERIFIED_PASS'}));
  const runtimeReadiness={state:'VERIFIED_PASS',scope:policy.scope,required_domain_count:1,verified_domain_count:1,
    domain_ids:['SECURITY_SUPPLY_CHAIN'],future_expansion_domain_ids:policy.future_expansion_domains};
  const result=buildAutonomousOperatingCompletion({policy,runtimeReadiness,operatingChecks:checks,normalTerminalProven:true});
  assert.equal(result.proven,true);assert.equal(result.completion.state,'VERIFIED_PASS');
  assert.equal(result.completion.required_runtime_domain_count,1);assert.equal(result.completion.verified_runtime_domain_count,1);
  assert.deepEqual(result.completion.future_expansion_runtime_domain_ids,[...policy.future_expansion_domains].sort());
  assert.equal(result.completion.whole_platform_runtime_proven,false);
  assert.deepEqual([result.completion.production,result.completion.public,result.completion.g5,result.completion.provider_activation],['HOLD','HOLD','HOLD','HOLD']);
});
test('missing Security receipt, operating check, or normal terminal keeps Autonomous Control Plane on HOLD',()=>{
  const policy=contract.autonomous_operating_readiness,checks=contract.required_operating_checks.map(id=>({id,state:'VERIFIED_PASS'}));
  const runtimeReadiness={state:'VERIFIED_PASS',scope:policy.scope,required_domain_count:1,verified_domain_count:1,
    domain_ids:['SECURITY_SUPPLY_CHAIN'],future_expansion_domain_ids:[]};
  for(const options of [
    {runtimeReadiness:{...runtimeReadiness,state:'VERIFIED_HOLD',verified_domain_count:0,domain_ids:[]}},
    {operatingChecks:checks.map(c=>c.id==='NATIVE_RESUME_REUSE'?{...c,state:'UNVERIFIED'}:c)},
    {normalTerminalProven:false}
  ]){
    const result=buildAutonomousOperatingCompletion({policy,runtimeReadiness,operatingChecks:checks,normalTerminalProven:true,...options});
    assert.equal(result.proven,false);assert.equal(result.completion.state,'VERIFIED_HOLD');
  }
});

function completeChainFixture({missingGate=false,manual=false,clock=false,gateSkipped=false,intakeSkipped=false,clockDigestMismatch=false,clockStale=false,nestedMismatch=false,sidecarMismatch=false,gateParentMismatch=false,assuranceMismatch=false,assuranceSidecarMismatch=false,auditSidecarMismatch=false,unknownZip=false,missingAssuranceZip=false}={}){
  const native=new Map(),artifacts=new Map(),archives=new Map(),healths=[],gates=[];
  const seal=b=>({...b,receipt_digest:sha256(canonicalJson(b))});
  const run=(id,path,event,time)=>({id,run_attempt:1,path,event,created_at:time,head_sha:source,head_branch:'main',repository:{full_name:repository},status:'completed',conclusion:'success',updated_at:time});
  const attach=(r,name,basename,body,extra={})=>{
    let members={[basename]:JSON.stringify(body),...extra};
    if(basename==='kpmo-continuous-assurance-success-authority-gate-v1.json'){
      const parent=body.producer_health_run_id;
      const parentArtifact=artifacts.get(parent)[0],healthBytes=archives.get(parentArtifact.id);
      const healthPacket=readArchive(healthBytes,parentArtifact.digest);
      members['upstream-health.zip']={base64:healthBytes.toString('base64')};
      if(nestedMismatch)members['upstream-health.zip']={base64:archives.get(artifacts.get(parent===10?20:10)?.[0]?.id||parentArtifact.id).toString('base64')};
      members['upstream-health-packet.json']=JSON.stringify(sidecarMismatch?{...healthPacket,archive_digest:'sha256:'+'0'.repeat(64)}:healthPacket);
      members['kpmo-continuous-assurance-sentinel-health-v1.json']=healthPacket.members[0].text+'\n';
      const assuranceArtifact=artifacts.get(r.id-1)[0],assuranceBytes=archives.get(assuranceArtifact.id);
      const assurancePacket=readArchive(assuranceBytes,assuranceArtifact.digest);
      members['assurance-packet.zip']={base64:(assuranceMismatch?healthBytes:assuranceBytes).toString('base64')};
      members['assurance-packet.json']=JSON.stringify(assuranceSidecarMismatch?{...assurancePacket,archive_digest:'sha256:'+'0'.repeat(64)}:assurancePacket);
      members['audit-receipt.json']=assurancePacket.members.find(m=>m.name==='audit-receipt.json').text+'\n';
      const clockProof=assurancePacket.members.find(m=>m.name==='whole-platform-operating-proof-v1.json');
      if(clockProof)members['whole-platform-operating-proof-v1.json']=clockProof.text+'\n';
      if(auditSidecarMismatch)members['audit-receipt.json']='{}';
      if(unknownZip)members['unbound.zip']={base64:healthBytes.toString('base64')};
      if(missingAssuranceZip)delete members['assurance-packet.zip'];
    }
    const bytes=execFileSync('python3',['-c','import io,json,sys,zipfile,base64; b=io.BytesIO(); z=zipfile.ZipFile(b,"w"); [(z.writestr(k,base64.b64decode(v["base64"]) if isinstance(v,dict) else v)) for k,v in json.load(sys.stdin).items()]; z.close(); sys.stdout.buffer.write(b.getvalue())'],{input:JSON.stringify(members)});
    const a={id:r.id+10000,name,digest:digest(bytes),size_in_bytes:bytes.length,expired:false,expires_at:'2026-11-01T00:00:00Z',workflow_run:{id:r.id,head_sha:source}};
    artifacts.set(r.id,[a]);archives.set(a.id,bytes);native.set(r.id,r);return a;
  };
  for(let generation=0;generation<2;generation++){
    const observer=run(10+generation*10,'.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml','repository_dispatch',generation?'2026-10-04T12:20:00Z':'2026-10-04T12:00:00Z');
    const producers=SPECS.map((spec,i)=>{
      const r=run(200+generation*100+i,spec.path,spec.id==='SHADOW'?'push':spec.id==='RESERVE'?'repository_dispatch':'workflow_run',generation?'2026-10-04T11:55:00Z':'2026-10-04T11:00:00Z');
      const a=attach(r,'producer','producer.json',{});
      return {id:spec.id,state:'VERIFIED_PASS',artifact_content_validated:true,artifact_transport_verified:true,selected_run_id:r.id,selected_run_attempt:1,selected_event:r.event,selected_created_at:r.created_at,artifact_id:a.id,artifact_digest:a.digest};
    });
    const health=seal({receipt_id:'kpmo-continuous-assurance-sentinel-health-v1',source_sha:source,repository,observer_run_id:observer.id,observer_run_attempt:1,state:'VERIFIED_PASS',semantic_content_verified:true,coverage_scope:'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM',producers,production:'HOLD',public:'HOLD',g5:'HOLD',promotion_eligible:false});
    attach(observer,`kpmo-continuous-assurance-sentinel-health-v1-${source}-${observer.id}-1`,'kpmo-continuous-assurance-sentinel-health-v1.json',health);healths.push(observer);
    const assurance=run(400+generation*100,'.github/workflows/kidults-platform-continuous-assurance-v1.yml',manual?'workflow_dispatch':clock?'repository_dispatch':'workflow_run',observer.created_at);
    let audit=seal({source:{sha:source,match:true},states:{internal_control_state:'VERIFIED_PASS'},execution:{trigger:'workflow_run',workflow_run_id:String(assurance.id),workflow_run_attempt:'1',upstream:{run_id:String(observer.id),run_attempt:'1',workflow_path:observer.path,repository,conclusion:'success'}}});
    const extra={};
    if(clock){
      audit=seal({source:{sha:source,match:true,kind:'PROTECTED_MAIN_EXTERNAL_NATURAL_CLOCK',actual_sha:source,expected_sha:source},states:{internal_control_state:'VERIFIED_PASS'},execution:{trigger:'repository_dispatch',workflow_run_id:String(assurance.id),workflow_run_attempt:'1',upstream:null,canonical_identity:{alias:false,canonical_run_id:assurance.id,canonical_run_attempt:1,source_sha:source,upstream_class:'ASSURANCE_EXTERNAL_NATURAL_CLOCK',generation_discriminator:`assurance-external-clock:kidults-natural-clock-v1:ASSURANCE:${source}:${'x'.repeat(32)}:slot:2026-10-04T12:00:00.000Z`}}});
      const protected_evidence=healths.map(r=>({workflow_path:r.path,run_id:r.id,run_attempt:1,source_sha:source,artifact_id:artifacts.get(r.id)[0].id,artifact_digest:clockDigestMismatch?'sha256:'+'0'.repeat(64):artifacts.get(r.id)[0].digest}));
      if(clockStale&&generation)protected_evidence.pop();
      const observed_at=observer.created_at;
      assurance.created_at=new Date(Date.parse(observer.created_at)-60000).toISOString();
      extra['whole-platform-operating-proof-v1.json']=JSON.stringify(seal({source_sha:source,repository,observed_at,protected_evidence}));
    }
    attach(assurance,`kidults-continuous-assurance-${source}-${assurance.id}-1`,'audit-receipt.json',audit,extra);
    const gateRun=run(assurance.id+1,'.github/workflows/kpmo-continuous-assurance-success-authority-gate-v1.yml','workflow_run',observer.created_at);
    const gate=seal({receipt_id:'kpmo-continuous-assurance-success-authority-gate-v1',state:'VERIFIED_PASS',repository,current_protected_main_sha:source,upstream_assurance:{run_id:gateParentMismatch?assurance.id+2:assurance.id,run_attempt:1,head_sha:source,event:assurance.event,conclusion:'success'},producer_health_run_id:observer.id,producer_health_run_attempt:1,producer_health_receipt_digest:health.receipt_digest,producer_health_state:'VERIFIED_PASS',producer_health_conclusion:'success',coverage_scope:health.coverage_scope,whole_platform_authority:false,promotion_eligible:false,empirical_authority:false,provider_authority:false,database_authority:false,empirical_delta:0,production:'HOLD',public:'HOLD',g5:'HOLD'});
    attach(gateRun,`kpmo-continuous-assurance-success-authority-gate-${source}-${assurance.id}-1`,'kpmo-continuous-assurance-success-authority-gate-v1.json',gate);
    if(!missingGate||generation===1)gates.push(gateRun);
  }
  const read=async url=>{
    const route=new URL(url).pathname;
    if(route.endsWith('/branches/main'))return {commit:{sha:source}};
    if(route.endsWith(`/git/commits/${source}`))return {sha:source,tree:{sha:'d'.repeat(40)},parents:[{sha:base},{sha:'e'.repeat(40)}]};
    if(route.endsWith('/pulls'))return [];
    const jobsMatch=route.match(/\/actions\/runs\/(\d+)\/attempts\/1\/jobs$/);
    if(jobsMatch){const id=Number(jobsMatch[1]),isGate=id%100===1;return {total_count:1,jobs:[{id:id+5000,run_id:id,run_attempt:1,name:isGate?'success-authority-gate':'classify-canonical-identity',status:'completed',conclusion:isGate&&gateSkipped?'skipped':'success',steps:[{name:'Verify independent natural-clock receipt',status:'completed',conclusion:intakeSkipped?'skipped':'success'}]}]};}
    const runMatch=route.match(/\/actions\/runs\/(\d+)(\/artifacts)?$/);
    if(runMatch){const id=Number(runMatch[1]);return runMatch[2]?{total_count:(artifacts.get(id)||[]).length,artifacts:artifacts.get(id)||[]}:native.get(id);}
    const artifactMatch=route.match(/\/actions\/artifacts\/(\d+)$/);
    if(artifactMatch)return [...artifacts.values()].flat().find(a=>a.id===Number(artifactMatch[1]));
    throw new Error(`unexpected GET ${route}`);
  };
  return collectWholePlatform({sourceSha:source,contract,scorecard,observedAt:'2026-10-04T12:30:00Z',read,
    listRuns:async(_,s)=>s.id==='SENTINEL'?healths:s.id==='SUCCESS_GATE'?gates:[],download:async(_,a)=>archives.get(a.id)});
}
test('overlapping genuine generations retain older evidence and require both downstream terminals',async()=>{
  const r=await completeChainFixture();
  for(const id of ['CORE_FOUR_CONTENT','DISTINCT_NATURAL_GENERATIONS','NATURAL_CHAIN_TERMINALS'])assert.equal(r.operating_checks.find(c=>c.id===id).state,'VERIFIED_PASS',JSON.stringify(r.operating_checks));
  assert.equal(r.natural_chain_terminals.length,2);assert.equal(r.state,'VERIFIED_INCOMPLETE');assert.equal(r.whole_platform_runtime_proven,false);assert.equal(r.assurance_runtime_readiness_proven,false);assert.equal(r.autonomous_runtime_readiness_proven,false);assert.equal(r.autonomous_operating_proven,false);assert.deepEqual(r.autonomous_runtime_readiness.future_expansion_domain_ids,[...contract.autonomous_operating_readiness.future_expansion_domains].sort());assert.equal(r.assurance_runtime_readiness.verified_domain_count,0);
  assert.equal(r.autonomous_operating_completion.state,'VERIFIED_HOLD');
  assert.equal(r.autonomous_operating_completion.required_runtime_domain_count,1);
  assert.deepEqual(r.autonomous_operating_completion.future_expansion_runtime_domain_ids,[...contract.autonomous_operating_readiness.future_expansion_domains].sort());
});
test('missing Gate or manual Assurance cannot complete natural terminal proof',async()=>{
  for(const options of [{missingGate:true},{manual:true}]){
    const r=await completeChainFixture(options);
    assert.notEqual(r.operating_checks.find(c=>c.id==='NATURAL_CHAIN_TERMINALS').state,'VERIFIED_PASS');
    assert.equal(r.operating_checks.find(c=>c.id==='CORE_FOUR_CONTENT').state,'VERIFIED_PASS');
  }
});
test('native Gate nested health is exact-digest bound and sidecars and causal parent cannot drift',async()=>{
  for(const options of [{nestedMismatch:true},{sidecarMismatch:true},{gateParentMismatch:true},{assuranceMismatch:true},{assuranceSidecarMismatch:true},{auditSidecarMismatch:true},{unknownZip:true},{missingAssuranceZip:true}]){
    const r=await completeChainFixture(options);
    assert.equal(r.operating_checks.find(c=>c.id==='NATURAL_CHAIN_TERMINALS').state,'VERIFIED_FAIL');
    assert.equal(r.autonomous_operating_proven,false);
  }
});

test('authenticated external clock retains both historical native Sentinel bindings without claiming whole-platform health',async()=>{
  const r=await completeChainFixture({clock:true});
  assert.equal(r.operating_checks.find(c=>c.id==='NATURAL_CHAIN_TERMINALS').state,'VERIFIED_PASS',JSON.stringify(r.operating_checks));
  assert.equal(r.natural_chain_terminals.length,2);assert.equal(r.whole_platform_runtime_proven,false);assert.equal(r.production,'HOLD');
});
test('workflow success cannot replace actual authority execution or authenticated clock intake and latest artifact tuple',async()=>{
  for(const options of [{gateSkipped:true},{clock:true,gateSkipped:true},{clock:true,intakeSkipped:true},{clock:true,clockDigestMismatch:true},{clock:true,clockStale:true}]){
    const r=await completeChainFixture(options);
    assert.notEqual(r.operating_checks.find(c=>c.id==='NATURAL_CHAIN_TERMINALS').state,'VERIFIED_PASS',JSON.stringify(options));
    assert.equal(r.autonomous_operating_proven,false);
  }
});
