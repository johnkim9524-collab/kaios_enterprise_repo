import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {producerFixtures,zip,text} from './recovery-native-archive-fixture-v1.mjs';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {evaluateHealth} from '../../../scripts/kidults/kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs';
import {digest,readArchive} from '../../../scripts/kidults/kpmo/validate-sentinel-producer-content-v1.mjs';
import {observeInterruptedRecoveryNative} from '../../../scripts/kidults/kpmo/lib/interrupted-reservation-recovery-v1.mjs';
import {createInterruptedRecoveryNativeEvidence} from '../../../scripts/kidults/kpmo/lib/postmerge-recovery-exact-main-evidence-v1.mjs';
const repo='johnkim9524-collab/kaios_enterprise_repo',source='a'.repeat(40),now=Date.parse('2026-09-05T12:00:00Z');
const seal=x=>({...x,receipt_digest:sha256(canonicalJson(x))});
function fixture(){
 const policy=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/direct-owner-postmerge-push-suite-policy-v1.json'));
 const contract=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/whole-platform-operating-proof-v1.json'));
 const runs=new Map(),artifacts=new Map(),archives=new Map(),jobs=new Map(),producers=producerFixtures();
 const nativeRun=(id,path,event='workflow_run',name=path)=>({id,path,name,event,head_sha:source,head_branch:'main',run_attempt:1,status:'completed',conclusion:'success',created_at:'2026-09-05T11:00:00Z',run_started_at:'2026-09-05T11:00:00Z',repository:{full_name:repo,id:1281328888}});
 function add(run,name,bytes,id=run.id+10000){const artifact={id,name,expired:false,digest:digest(bytes),size_in_bytes:bytes.length,workflow_run:{id:run.id,head_sha:source},created_at:'2026-09-05T11:30:00Z',expires_at:'2026-12-01T00:00:00Z'};runs.set(run.id,run);artifacts.set(run.id,[artifact]);archives.set(id,bytes);return artifact;}
 for(const f of producers){f.run.repository.id=1281328888;runs.set(f.run.id,f.run);artifacts.set(f.run.id,[f.artifact]);archives.set(f.artifact.id,f.bytes);}
 const health=evaluateHealth({repository:repo,source_sha:source,observed_at:'2026-09-05T12:00:00Z',observer_run_id:900,observer_run_attempt:1,runs:Object.fromEntries(producers.map(f=>[f.spec.id,[f.run]])),artifacts_by_run:Object.fromEntries(producers.map(f=>[f.run.id,[f.artifact]])),archives_by_id:Object.fromEntries(producers.map(f=>[f.artifact.id,f.bytes]))});
 assert.equal(health.state,'VERIFIED_PASS');
 const sentinel=nativeRun(900,'.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml','workflow_run','KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1');
 const healthBytes=zip([['kpmo-continuous-assurance-sentinel-health-v1.json',text(health)]]),healthArtifact=add(sentinel,`kpmo-continuous-assurance-sentinel-health-v1-${source}-900-1`,healthBytes);
 const assurance=nativeRun(400,'.github/workflows/kidults-platform-continuous-assurance-v1.yml');
 const audit=seal({receipt_type:'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE',source:{sha:source,actual_sha:source,expected_sha:source,match:true},execution:{trigger:'workflow_run',workflow_run_id:'400',workflow_run_attempt:'1',upstream:{run_id:'900',run_attempt:'1',workflow_name:sentinel.name,workflow_path:sentinel.path,workflow_event:sentinel.event,repository:repo,head_branch:'main',conclusion:'success'}},states:{internal_control_state:'VERIFIED_PASS'}});
 const proof=seal({id:contract.id,source_sha:source,repository:repo,assurance_runtime_readiness_proven:false,assurance_runtime_readiness:{state:'VERIFIED_HOLD',required_domain_count:14,verified_domain_count:1},runtime_domain_registry:{state:'HOLD',required_domain_count:14,registered_domain_count:1},autonomous_runtime_readiness_proven:true,autonomous_runtime_readiness:{state:'VERIFIED_PASS',scope:'AUTONOMOUS_CONTROL_PLANE_NOT_WHOLE_PLATFORM',required_domain_count:1,verified_domain_count:1,domain_ids:['SECURITY_SUPPLY_CHAIN'],deferred_domain_ids:contract.value_chain_dimensions.filter(x=>x!=='SECURITY_SUPPLY_CHAIN')},value_chain:contract.value_chain_dimensions.map(id=>id==='SECURITY_SUPPLY_CHAIN'?{id,run_id:700,runtime_state:'VERIFIED_PASS',runtime_receipt_digest:sha256('synthetic-runtime')}:{id,runtime_state:'UNVERIFIED'}),whole_platform_runtime_proven:false,protected_evidence:[{workflow_path:sentinel.path,run_id:900,run_attempt:1,source_sha:source,artifact_id:healthArtifact.id,artifact_digest:healthArtifact.digest},{workflow_path:'.github/workflows/kidults-security-assurance-empirical-r1.yml',run_id:700,run_attempt:1,source_sha:source,artifact_id:800,artifact_digest:sha256('synthetic-runtime')}]});
 const assuranceEntries=[['audit-receipt.json',text(audit)],['whole-platform-operating-proof-v1.json',text(proof)]],assuranceBytes=zip(assuranceEntries),assuranceArtifact=add(assurance,`kidults-continuous-assurance-${source}-400-1`,assuranceBytes);
 const gate=nativeRun(901,'.github/workflows/kpmo-continuous-assurance-success-authority-gate-v1.yml');
 const gateCore={receipt_id:'kpmo-continuous-assurance-success-authority-gate-v1',state:'VERIFIED_PASS',repository:repo,current_protected_main_sha:source,coverage_scope:'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM',producer_health_run_id:900,producer_health_run_attempt:1,producer_health_event:sentinel.event,producer_health_state:'VERIFIED_PASS',producer_health_conclusion:'success',producer_health_receipt_digest:health.receipt_digest,producer_health_artifact_id:healthArtifact.id,producer_health_artifact_digest:healthArtifact.digest,assurance_artifact_id:assuranceArtifact.id,assurance_artifact_digest:assuranceArtifact.digest,assurance_audit_receipt_digest:audit.receipt_digest,assurance_runtime_proof_digest:proof.receipt_digest,whole_platform_authority:false,promotion_eligible:false,empirical_authority:false,provider_authority:false,database_authority:false,empirical_delta:0,production:'HOLD',public:'HOLD',g5:'HOLD',upstream_observation:{run_id:400,run_attempt:1,workflow_name:assurance.name,head_sha:source,event:assurance.event,conclusion:'success'}};
 const f={gateCore,health,proof,audit,runs,artifacts,archives,jobs};
 f.rebuildGate=(extra=[])=>{f.gateEntries=[['kpmo-continuous-assurance-success-authority-gate-v1.json',text(seal(gateCore))],['upstream-health.zip',healthBytes],['upstream-health-packet.json',text(readArchive(healthBytes,healthArtifact.digest))],['kpmo-continuous-assurance-sentinel-health-v1.json',text(health)],['assurance-packet.zip',assuranceBytes],['assurance-packet.json',text(readArchive(assuranceBytes,assuranceArtifact.digest))],...assuranceEntries,...extra];add(gate,`kpmo-continuous-assurance-success-authority-gate-${source}-400-1`,zip(f.gateEntries));};f.rebuildGate();
 jobs.set(400,{total_count:1,jobs:[{id:401,run_id:400,run_attempt:1,name:'audit',status:'completed',conclusion:'success'}]});jobs.set(901,{total_count:1,jobs:[{id:902,run_id:901,run_attempt:1,name:'success-authority-gate',status:'completed',conclusion:'success'}]});
 const pushRuns=policy.required_workflows.map((s,i)=>nativeRun(2000+i,s.path,'push',s.name));
 for(const r of pushRuns){runs.set(r.id,r);if(r.path.endsWith('/kidults-p0-control-plane-closure-v1.yml'))add(r,'kidults-p0-control-plane-closure-v1',zip([['kidults-p0-control-plane-closure-receipt-v1.json',text({id:'kidults-p0-control-plane-closure-receipt-v1',state:'VERIFIED_PASS',exact_source_sha:source,repository:repo,run_id:r.id,run_attempt:1})]]));}
 const request={id:'kidults-interrupted-reservation-postmerge-request-v1',version:'1.0.0',repository:repo,repository_id:'1281328888',pull_request:42,base_sha:'b'.repeat(40),head_sha:'c'.repeat(40),head_tree_sha:'d'.repeat(40),merge_sha:source,source_sha:source,original_run_id:'100',original_run_attempt:1,original_generation:'original-generation-42',nonce_digest:sha256('original-nonce'),issued_at:'2026-09-05T11:59:00Z',expires_at:'2026-09-05T12:29:00Z',production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
 f.get=async route=>{
  if(route==='branches/main')return {name:'main',protected:true,commit:{sha:source}};
  if(route==='pulls/42')return {number:42,state:'closed',merged:true,merged_at:'2026-09-05T10:30:00Z',merge_commit_sha:source,head:{sha:request.head_sha,repo:{full_name:repo}},base:{ref:'main',repo:{full_name:repo}}};
  if(route===`git/commits/${source}`)return {sha:source,tree:{sha:request.head_tree_sha},parents:[{sha:request.base_sha},{sha:request.head_sha}]};
  if(route===`commits/${source}`)return {sha:source,commit:{committer:{date:'2026-09-05T10:00:00Z'}}};
  if(route==='actions/runs/100')return {...nativeRun(100,'.github/workflows/kidults-autonomous-track-authorization-v1.yml','repository_dispatch'),head_sha:request.base_sha,conclusion:'failure'};
  const runMatch=route.match(/^actions\/runs\/(\d+)$/);if(runMatch)return runs.get(Number(runMatch[1]));
  const jobMatch=route.match(/^actions\/runs\/(\d+)\/attempts\/1\/jobs/);if(jobMatch)return jobs.get(Number(jobMatch[1]));
  const artMatch=route.match(/^actions\/runs\/(\d+)\/artifacts/);if(artMatch){const rows=artifacts.get(Number(artMatch[1]))||[];return {total_count:rows.length,artifacts:rows};}
  const listMatch=route.match(/^actions\/workflows\/([^/]+)\/runs/);if(listMatch){const rows=[...runs.values()].filter(r=>r.path.endsWith('/'+listMatch[1])&&(!route.includes('&event=')||r.event===route.match(/&event=([^&]+)/)[1]));return {total_count:rows.length,workflow_runs:rows};}
  throw Error('UNEXPECTED_NATIVE_GET '+route);
 };
 f.collect=async()=>{const native=await observeInterruptedRecoveryNative({request,get:f.get,now});return createInterruptedRecoveryNativeEvidence({policy,readJson:f.get,readBytes:async route=>archives.get(Number(route.split('/')[2])),now:()=>now}).verifyEvidence({request,native});};return f;
}
test('generic collector validates every original producer ZIP, nested Gate bytes, audit and actual authority',async()=>{const f=fixture(),result=await f.collect();assert.equal(result.checks.length,4);assert.ok(result.checks.every(c=>c.conclusion==='success'&&c.archive_digest.startsWith('sha256:')));assert.equal(f.proof.whole_platform_runtime_proven,false);});
for(const [name,mutate,code] of [
 ['different Assurance artifact',f=>{f.gateCore.assurance_artifact_id++;f.rebuildGate();},'GATE_ARCHIVE_BINDING'],
 ['different runtime proof',f=>{f.gateCore.assurance_runtime_proof_digest=sha256('forged');f.rebuildGate();},'GATE_ARCHIVE_BINDING'],
 ['skipped actual authority',f=>{f.jobs.get(901).jobs[0].conclusion='skipped';},'ACTUAL_AUTHORITY'],
 ['skipped actual audit',f=>{f.jobs.get(400).jobs[0].conclusion='skipped';},'ACTUAL_AUDIT'],
 ['producer archive bytes changed',f=>{const id=f.health.producers[0].artifact_id;f.archives.set(id,Buffer.from('tamper'));},'ARCHIVE'],
])test('full collector rejects '+name,async()=>{const f=fixture();mutate(f);await assert.rejects(f.collect(),new RegExp(code));});
test('nested Gate sidecar tamper is rejected even with a recomputed outer ZIP digest',async()=>{const f=fixture();const entries=f.gateEntries.map(([n,v])=>[n,n==='audit-receipt.json'?text({...f.audit,receipt_digest:sha256('forged')}):v]);const bytes=zip(entries),artifact=f.artifacts.get(901)[0];artifact.digest=digest(bytes);artifact.size_in_bytes=bytes.length;f.archives.set(artifact.id,bytes);await assert.rejects(f.collect(),/ARCHIVE/);});

test('newer pending producer cannot reuse an older Sentinel/Gate success',async()=>{const f=fixture(),old=f.runs.get(11);f.runs.set(999,{...old,id:999,created_at:'2026-09-05T11:59:00Z',status:'in_progress',conclusion:null});await assert.rejects(f.collect(),/NEWER_PRODUCER_INTERRUPTION/);});
