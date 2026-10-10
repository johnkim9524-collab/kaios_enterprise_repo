import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {authenticatedGithubRead,downloadArtifact,selectProducerGeneration,SPECS} from './resolve-continuous-assurance-sentinel-health-v1.mjs';
import {readArchive,REPOSITORY} from './validate-sentinel-producer-content-v1.mjs';
import {inventoryWholePlatform} from './lib/whole-platform-operating-proof-v1.mjs';
import {verifyHealthReceipt,distinctNaturalGenerations,verifyMissionTerminal,verifyValueChainDomainReceipt,verifyNaturalChainTerminal} from './lib/whole-platform-runtime-evidence-v1.mjs';
import {verifyNativeResumeReuse} from './lib/native-resume-reuse-proof-v1.mjs';
import {canonicalJson,sha256} from './lib/canonical-json-v1.mjs';
import {buildRuntimeEvidenceDemand} from './lib/runtime-domain-evidence-demand-v1.mjs';
const requireEvidence=(ok,code)=>{if(!ok)throw new Error(`WHOLE_RUNTIME_${code}`);};
const spec=(id,workflow,events)=>({id,workflow,path:`.github/workflows/${workflow}`,events});
const sentinel=spec('SENTINEL','kpmo-continuous-assurance-sentinel-health-v1.yml',['push','workflow_run','repository_dispatch']);
const gateSpec=spec('SUCCESS_GATE','kpmo-continuous-assurance-success-authority-gate-v1.yml',['workflow_run']);
const canary=spec('IMMUTABILITY','kidults-autonomous-object-lock-canary-v1.yml',['push','schedule','workflow_dispatch']);
const dispatcher=spec('DISPATCHER','kidults-autonomous-dispatcher-v1.yml',['workflow_run','schedule','workflow_dispatch']);
const finalizers=['track','kpmo','independent-verification'].map(role=>spec(`FINALIZER_${role}`,`kidults-autonomous-${role}-authorization-v1.yml`,['repository_dispatch','workflow_run']));
const rootUrl=`https://api.github.com/repos/${REPOSITORY}`;
const member=(packet,basename)=>{
  const values=packet.members.filter(m=>path.posix.basename(m.name)===basename);
  requireEvidence(values.length===1,'MEMBER_CARDINALITY');return JSON.parse(values[0].text);
};
export async function collectWholePlatform({sourceSha,contract,scorecard,token,read=authenticatedGithubRead,download=downloadArtifact,
  demandDefinition=JSON.parse(fs.readFileSync(contract.runtime_evidence_demand_definition,'utf8')),
  listRuns=null,observedAt=new Date().toISOString()}){
  const out=inventoryWholePlatform(contract,scorecard,sourceSha);
  out.observed_at=observedAt;out.repository=REPOSITORY;out.protected_evidence=[];
  const get=p=>read(`${rootUrl}/${p}`,token);
  const main=await get('branches/main');requireEvidence(main.commit?.sha===sourceSha,'EXACT_MAIN');
  const commit=await get(`git/commits/${sourceSha}`);
  requireEvidence(commit.sha===sourceSha,'COMMIT');
  const check=id=>out.operating_checks.find(c=>c.id===id);
  const mark=(id,state,reason,refs=[])=>Object.assign(check(id),{state,reason,evidence_refs:refs});
  const attempt=async(ids,work)=>{try{await work();}catch(error){for(const id of ids)mark(id,'VERIFIED_FAIL',String(error.message).split(':')[0]);}};
  const runs=async(s,sha=sourceSha)=>{
    let values;
    if(listRuns)values=await listRuns(REPOSITORY,s,sha,token);
    else{
      const before=sha===sourceSha?Date.parse(observedAt):Date.parse(commit.committer?.date);
      requireEvidence(Number.isFinite(before),'RUN_WINDOW_TIME');
      const after=before-(sha===sourceSha?contract.maximum_evidence_age_seconds:7200)*1000;
      values=[];let count;
      for(let page=1;page<=10;page++){
        const query=new URLSearchParams({branch:'main',head_sha:sha,created:`${new Date(after).toISOString()}..${new Date(before).toISOString()}`,per_page:'100',page:String(page)});
        const index=await get(`actions/workflows/${s.workflow}/runs?${query}`);
        requireEvidence(Array.isArray(index.workflow_runs)&&index.workflow_runs.length<=100&&Number.isSafeInteger(index.total_count)&&index.total_count>=0&&index.total_count<=1000,'RUN_WINDOW_INDEX');
        if(count===undefined)count=index.total_count;requireEvidence(count===index.total_count,'RUN_WINDOW_CHANGED');
        values.push(...index.workflow_runs);requireEvidence(values.length<=count,'RUN_WINDOW_CARDINALITY');
        if(values.length===count)break;
        requireEvidence(index.workflow_runs.length===100&&page<10,'RUN_WINDOW_TRUNCATED');
      }
    }
    return selectProducerGeneration(values,s,sha,observedAt).candidates.reverse();
  };
  const packet=async(run,name)=>{
    requireEvidence(run.status==='completed'&&run.run_attempt===1,'RUN_TERMINAL_ATTEMPT');
    const index=await get(`actions/runs/${run.id}/artifacts?per_page=100`);
    requireEvidence(Array.isArray(index.artifacts)&&index.total_count===index.artifacts.length,'ARTIFACT_INDEX');
    const values=index.artifacts.filter(a=>a.name===name);
    if(!values.length)return null;
    requireEvidence(values.length===1,'ARTIFACT_CARDINALITY');const artifact=values[0];
    requireEvidence(artifact.expired===false&&artifact.workflow_run?.id===run.id&&artifact.workflow_run.head_sha===run.head_sha&&Date.parse(artifact.expires_at)>Date.parse(observedAt),'ARTIFACT_BINDING');
    const bytes=await download(REPOSITORY,artifact,token);
    const parsed=readArchive(bytes,artifact.digest);
    const fresh=await get(`actions/runs/${run.id}`);
    requireEvidence(fresh.status===run.status&&fresh.conclusion===run.conclusion&&fresh.run_attempt===run.run_attempt&&fresh.head_sha===run.head_sha&&fresh.path===run.path,'RUN_CHANGED');
    out.protected_evidence.push({workflow_path:run.path,run_id:run.id,run_attempt:run.run_attempt,
      source_sha:run.head_sha,artifact_id:artifact.id,artifact_digest:artifact.digest});return parsed;
  };
  let gateCandidates;
  const gatePackets=new Map();
  const chainTerminal=async health=>{
    gateCandidates??=await runs(gateSpec);
    for(const run of gateCandidates.slice(0,contract.maximum_observation_history)){
      if(run.status!=='completed'||run.conclusion!=='success')continue;
      if(!gatePackets.has(run.id)){
        const index=await get(`actions/runs/${run.id}/artifacts?per_page=100`);
        requireEvidence(Array.isArray(index.artifacts)&&index.total_count===index.artifacts.length,'GATE_ARTIFACT_INDEX');
        const artifacts=index.artifacts.filter(a=>a.name.startsWith(`kpmo-continuous-assurance-success-authority-gate-${sourceSha}-`));
        requireEvidence(artifacts.length<=1,'GATE_ARTIFACT_CARDINALITY');
        const p=artifacts.length?await packet(run,artifacts[0].name):null;
        gatePackets.set(run.id,p?member(p,'kpmo-continuous-assurance-success-authority-gate-v1.json'):null);
      }
      const receipt=gatePackets.get(run.id);
      if(!receipt||receipt.producer_health_run_id!==health.observer_run_id)continue;
      const assurance=await get(`actions/runs/${receipt.upstream_assurance?.run_id}`);
      const p=await packet(assurance,`kidults-continuous-assurance-${sourceSha}-${assurance.id}-${assurance.run_attempt}`);
      requireEvidence(p,'CHAIN_ASSURANCE_ARTIFACT');
      verifyNaturalChainTerminal(receipt,run,assurance,member(p,'audit-receipt.json'),health,sourceSha);
      return {sentinel_run_id:health.observer_run_id,assurance_run_id:assurance.id,gate_run_id:run.id,
        sentinel_receipt_digest:health.receipt_digest,gate_receipt_digest:receipt.receipt_digest};
    }
    return null;
  };
  const age=run=>requireEvidence(Date.parse(observedAt)>=Date.parse(run.created_at)&&Date.parse(observedAt)-Date.parse(run.created_at)<=contract.maximum_evidence_age_seconds*1000,'EVIDENCE_STALE');
  let verifiedHealths=[];
  await attempt(['CORE_FOUR_CONTENT','DISTINCT_NATURAL_GENERATIONS'],async()=>{
    requireEvidence(Number.isSafeInteger(contract.maximum_observation_history)&&contract.maximum_observation_history>=2&&contract.maximum_observation_history<=24,'OBSERVATION_HISTORY_BOUND');
    const candidates=await runs(sentinel),selected=[],healths=[];
    let archivesRead=0;
    if(!candidates.length)return;
    for(const run of candidates){
      if(run.status!=='completed'||run.conclusion!=='success'){
        if(!healths.length)mark('CORE_FOUR_CONTENT','VERIFIED_HOLD','LATEST_SENTINEL_NOT_SUCCESS');
        break; // A red/nonterminal observation interrupts consecutiveness.
      }
      if(healths.length&&Date.parse(observedAt)-Date.parse(run.created_at)>contract.maximum_evidence_age_seconds*1000)break;
      if(archivesRead>=contract.maximum_observation_history)break;
      age(run);
      if(!healths.length)requireEvidence(Date.parse(observedAt)-Date.parse(run.created_at)<=contract.maximum_observer_age_seconds*1000,'LATEST_OBSERVER_STALE');
      const p=await packet(run,`kpmo-continuous-assurance-sentinel-health-v1-${sourceSha}-${run.id}-${run.run_attempt}`);
      if(!p)return;
      const h=verifyHealthReceipt(member(p,'kpmo-continuous-assurance-sentinel-health-v1.json'),run,sourceSha);
      archivesRead++;
      if(healths.length&&!distinctNaturalGenerations([healths[0],h]))continue;
      for(const producer of h.producers){
        const native=await get(`actions/runs/${producer.selected_run_id}`),s=SPECS.find(s=>s.id===producer.id);
        requireEvidence(native.path===s.path&&native.repository?.full_name===REPOSITORY&&native.head_sha===sourceSha&&native.head_branch==='main'&&native.run_attempt===producer.selected_run_attempt&&native.status==='completed'&&native.conclusion==='success'
          &&native.event===producer.selected_event&&native.created_at===producer.selected_created_at,'PRODUCER_NATIVE_BINDING');
        const artifact=await get(`actions/artifacts/${producer.artifact_id}`);
        requireEvidence(artifact.digest===producer.artifact_digest&&artifact.workflow_run?.id===native.id&&artifact.workflow_run.head_sha===sourceSha&&artifact.expired===false,'PRODUCER_ARTIFACT_BINDING');
      }
      healths.push(h);
      selected.push(run);
      mark('CORE_FOUR_CONTENT','VERIFIED_PASS','PROTECTED_SEMANTIC_RECEIPTS_RECONCILED',selected.map(r=>r.id));
      mark('DISTINCT_NATURAL_GENERATIONS','VERIFIED_HOLD','TWO_DISTINCT_COMPLETE_PRODUCER_TUPLES_REQUIRED',selected.map(r=>r.id));
      if(healths.length===2)break;
    }
    verifiedHealths=healths;
    if(healths.length)mark('DISTINCT_NATURAL_GENERATIONS',distinctNaturalGenerations(healths)?'VERIFIED_PASS':'VERIFIED_HOLD','TWO_DISTINCT_COMPLETE_PRODUCER_TUPLES_REQUIRED',selected.map(r=>r.id));
  });
  await attempt(['NATURAL_CHAIN_TERMINALS'],async()=>{
    if(!verifiedHealths.length)return;
    const terminals=[];
    for(const health of verifiedHealths){const terminal=await chainTerminal(health);if(terminal)terminals.push(terminal);}
    out.natural_chain_terminals=terminals;
    mark('NATURAL_CHAIN_TERMINALS',terminals.length===2?'VERIFIED_PASS':'VERIFIED_HOLD',
      'TWO_EXACT_SENTINEL_ASSURANCE_GATE_CHAINS_REQUIRED',terminals);
  });
  await attempt(['PROTECTED_LANDING'],async()=>{
    const prs=await get(`commits/${sourceSha}/pulls?per_page=100`);
    requireEvidence(Array.isArray(prs)&&prs.length<100,'MERGED_PR_INDEX');
    const exact=prs.filter(p=>p.merged_at&&p.merge_commit_sha===sourceSha&&p.base.ref==='main'&&p.head.repo?.full_name===REPOSITORY);
    if(exact.length!==1)return;
    const p=exact[0];requireEvidence(commit.parents.length===2&&commit.parents[0].sha===p.base.sha&&commit.parents[1].sha===p.head.sha,'LANDING_PARENTS');
    mark('PROTECTED_LANDING','VERIFIED_PASS','EXACT_MERGE_GRAPH_RECONCILED',[p.number,sourceSha]);
  });
  await attempt(['AWS_CONFIGURATION_AND_IMMUTABILITY'],async()=>{
    const run=(await runs(canary))[0];if(!run||run.status!=='completed'||run.conclusion!=='success')return;age(run);
    const p=await packet(run,`kidults-object-lock-assurance-${sourceSha}-${run.id}`);if(!p)return;
    const r=member(p,'terminal-receipt.json');
    requireEvidence(r.id==='kidults-autonomous-object-lock-canary-terminal-receipt-v1'&&r.state==='VERIFIED_PASS'&&r.exact_sha===sourceSha&&String(r.run_id)===String(run.id),'CANARY_BINDING');
    requireEvidence(r.continuous_assurance?.environment_binding==='PASS'&&r.continuous_assurance.finalizer_iam_oidc_readback==='PASS'&&r.continuous_assurance.cloudformation_drift==='IN_SYNC'&&r.positive_canary==='PASS'&&r.negative_canary==='PASS'&&r.object_lock_mode==='COMPLIANCE','CANARY_CONTENT');
    requireEvidence(['production','public','g5'].every(k=>r[k]==='HOLD'),'CANARY_HOLD');
    mark('AWS_CONFIGURATION_AND_IMMUTABILITY','VERIFIED_PASS','CANARY_IS_CONFIGURATION_PROOF_ONLY',[run.id]);
  });
  await attempt(['NATIVE_DISPATCH','NATIVE_RESUME_REUSE'],async()=>{
    const base=commit.parents?.[0]?.sha;if(!base)return;
    for(const run of (await runs(dispatcher,base)).slice(0,contract.maximum_observation_history)){
      if(run.status!=='completed'||run.conclusion!=='success')continue;
      const p=await packet(run,`kidults-autonomous-dispatcher-${run.id}`);if(!p)continue;
      for(const m of p.members.filter(m=>/^pr-\d+-protected-resume.json$/.test(path.posix.basename(m.name)))){
        const first=JSON.parse(m.text),binding=first.receipt?.receipt?.binding;
        if(binding?.base_sha!==base||binding?.head_sha!==commit.parents[1]?.sha||binding?.head_tree_sha!==commit.tree.sha)continue;
        requireEvidence(first.ok===true&&['EXECUTED_VERIFIED','REUSED_SUCCESS'].includes(first.state)&&first.receipt.receipt.state==='DISPATCH_ACCEPTED','DISPATCH_STATE');
        mark('NATIVE_DISPATCH','VERIFIED_PASS','ORIGINAL_TRANSPORT_CONSUMED',[run.id,first.key]);
        const reuse=p.members.find(x=>x.name===m.name.replace('-protected-resume.json','-protected-reuse.json'));
        if(!reuse)continue;
        const proof=verifyNativeResumeReuse(first,JSON.parse(reuse.text));
        mark('NATIVE_RESUME_REUSE','VERIFIED_PASS','SAME_OPERATION_DURABLE_RECEIPT_REUSED',[run.id,proof.operation_key]);
      }
      if(check('NATIVE_RESUME_REUSE').state==='VERIFIED_PASS')break;
    }
  });
  await attempt(['FINALIZER_RESERVATION_AND_IMMUTABLE_TERMINAL'],async()=>{
    const base=commit.parents?.[0]?.sha;if(!base)return;
    for(const s of finalizers){
      for(const run of (await runs(s,base)).slice(0,contract.maximum_observation_history)){
        if(run.status!=='completed')continue;
        const p=await packet(run,`kidults-autonomous-internal-landing-finalizer-${run.id}-${run.run_attempt}`);if(!p)continue;
        const outer=member(p,'receipt.json'),r=outer.terminal_evidence||outer;
        if(r.merge?.merge_sha!==sourceSha)continue;
        verifyMissionTerminal(r,sourceSha,commit);
        mark('FINALIZER_RESERVATION_AND_IMMUTABLE_TERMINAL','VERIFIED_PASS','ORIGINAL_RESERVATION_AND_IMMUTABLE_VERSION_CONSUMED',[run.id,r.receipt_digest]);
        return;
      }
    }
  });
  await attempt(['WHOLE_VALUE_CHAIN_RUNTIME'],async()=>{
    const sources=contract.runtime_domain_sources||[],ids=new Set();
    const requiredDomainCount=Number(contract.runtime_domain_registry_required_count);
    requireEvidence(Number.isSafeInteger(requiredDomainCount)&&requiredDomainCount===14,'DOMAIN_REGISTRY_REQUIRED_COUNT');
    requireEvidence(Array.isArray(sources)&&sources.length<=requiredDomainCount,'DOMAIN_REGISTRY');
    out.runtime_domain_registry={state:sources.length===requiredDomainCount?'VERIFIED_PASS':'HOLD',required_domain_count:requiredDomainCount,registered_domain_count:sources.length,reason:sources.length===requiredDomainCount?'EXACT_REGISTERED_RUNTIME_DOMAIN_SET':'AUTHENTICATED_EXACT_MAIN_RUNTIME_RECEIPT_REQUIRED'};
    for(const source of sources){
      requireEvidence(contract.value_chain_dimensions.includes(source.domain_id)&&!ids.has(source.domain_id),'DOMAIN_REGISTRY_COVERAGE');ids.add(source.domain_id);
      requireEvidence(/^kidults-[a-z0-9-]+\.yml$/.test(source.workflow||'')&&/^kidults-[a-z0-9-]+$/.test(source.artifact_prefix||''),'DOMAIN_PRODUCER_REGISTRATION');
      const s=spec(source.domain_id,source.workflow,['push','schedule','workflow_run','repository_dispatch']);
      const run=(await runs(s))[0];if(!run||run.status!=='completed'||run.conclusion!=='success')continue;age(run);
      const p=await packet(run,`${source.artifact_prefix}-${sourceSha}-${run.id}-${run.run_attempt}`);if(!p)continue;
      const r=verifyValueChainDomainReceipt(member(p,'runtime-domain-receipt.json'),source.domain_id,run,sourceSha);
      const domain=out.value_chain.find(d=>d.id===source.domain_id);
      Object.assign(domain,{runtime_state:'VERIFIED_PASS',reason:'REGISTERED_PROTECTED_LIVE_RUNTIME_PRODUCER_RECEIPT',runtime_receipt_digest:r.receipt_digest,run_id:run.id});
    }
    const complete=out.value_chain.every(d=>d.runtime_state==='VERIFIED_PASS');
    mark('WHOLE_VALUE_CHAIN_RUNTIME',complete?'VERIFIED_PASS':'VERIFIED_HOLD',complete?'ALL_REGISTERED_DOMAIN_RUNTIME_RECEIPTS_VERIFIED':'ADMITTED_IMMUTABLE_PAIR_TRACK_B_WORKLOAD_AND_HUMAN_ACCEPTANCE_RECEIPTS_REQUIRED');
  });
  if((await get('branches/main')).commit?.sha!==sourceSha)throw new Error('WHOLE_RUNTIME_MAIN_CHANGED');
  const verifiedDomains=out.value_chain.filter(d=>d.runtime_state==='VERIFIED_PASS'&&/^sha256:[a-f0-9]{64}$/.test(d.runtime_receipt_digest||''));
  const assuranceRuntimeReady=out.runtime_domain_registry?.state==='VERIFIED_PASS'&&out.runtime_domain_registry.registered_domain_count===14&&out.value_chain.length===14&&verifiedDomains.length===14&&new Set(verifiedDomains.map(d=>d.id)).size===14;
  out.assurance_runtime_readiness={state:assuranceRuntimeReady?'VERIFIED_PASS':'VERIFIED_HOLD',verified_domain_count:verifiedDomains.length,required_domain_count:14,registered_domain_count:out.runtime_domain_registry?.registered_domain_count??0,domain_ids:verifiedDomains.map(d=>d.id).sort()};
  out.assurance_runtime_readiness_proven=assuranceRuntimeReady;
  const autonomyPolicy=contract.autonomous_operating_readiness;
  const connected=(contract.runtime_domain_sources||[]).map(x=>x.domain_id);
  const autonomyReady=autonomyPolicy?.scope==='AUTONOMOUS_CONTROL_PLANE_NOT_WHOLE_PLATFORM'
    &&autonomyPolicy.connected_registered_domains_required===true
    &&Array.isArray(autonomyPolicy.mandatory_runtime_domains)
    &&autonomyPolicy.mandatory_runtime_domains.includes('SECURITY_SUPPLY_CHAIN')
    &&autonomyPolicy.mandatory_runtime_domains.every(id=>connected.includes(id))
    &&connected.length>0&&new Set(connected).size===connected.length
    &&connected.every(id=>verifiedDomains.some(d=>d.id===id));
  out.autonomous_runtime_readiness={state:autonomyReady?'VERIFIED_PASS':'VERIFIED_HOLD',
    scope:'AUTONOMOUS_CONTROL_PLANE_NOT_WHOLE_PLATFORM',required_domain_count:connected.length,
    verified_domain_count:verifiedDomains.filter(d=>connected.includes(d.id)).length,
    domain_ids:verifiedDomains.filter(d=>connected.includes(d.id)).map(d=>d.id).sort(),
    deferred_domain_ids:contract.value_chain_dimensions.filter(id=>!connected.includes(id)).sort()};
  out.autonomous_runtime_readiness_proven=autonomyReady;
  out.autonomous_operating_proven=autonomyReady&&Array.isArray(autonomyPolicy.required_operating_checks)
    &&JSON.stringify([...autonomyPolicy.required_operating_checks].sort())===JSON.stringify([
      'CORE_FOUR_CONTENT','DISTINCT_NATURAL_GENERATIONS','NATURAL_CHAIN_TERMINALS','PROTECTED_LANDING',
      'AWS_CONFIGURATION_AND_IMMUTABILITY','NATIVE_DISPATCH','NATIVE_RESUME_REUSE','FINALIZER_RESERVATION_AND_IMMUTABLE_TERMINAL'].sort())
    &&autonomyPolicy.required_operating_checks.every(id=>out.operating_checks.some(c=>c.id===id&&c.state==='VERIFIED_PASS'));
  out.runtime_evidence_demand=buildRuntimeEvidenceDemand({definition:demandDefinition,contract,proof:out});
  out.whole_platform_runtime_proven=out.operating_checks.every(c=>c.state==='VERIFIED_PASS')&&out.value_chain.every(c=>c.runtime_state==='VERIFIED_PASS');
  out.state=out.operating_checks.some(c=>c.state==='VERIFIED_FAIL')?'VERIFIED_FAIL':out.whole_platform_runtime_proven?'VERIFIED_PASS':'VERIFIED_INCOMPLETE';
  out.receipt_digest=sha256(canonicalJson(out));return out;
}
async function main(){
  const index=process.argv.indexOf('--output'),output=index>=0?process.argv[index+1]:null;
  if(!output)throw new Error('WHOLE_RUNTIME_OUTPUT_REQUIRED');
  const sourceSha=process.env.KPMO_SOURCE_SHA,contract=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/whole-platform-operating-proof-v1.json')),
    scorecard=JSON.parse(fs.readFileSync(contract.value_chain_source));
  try{
    requireEvidence(process.env.GITHUB_REPOSITORY===REPOSITORY&&process.env.GITHUB_REF==='refs/heads/main'&&execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()===sourceSha,'EXECUTION_SOURCE');
    const token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN;requireEvidence(!!token,'TOKEN');
    const result=await collectWholePlatform({sourceSha,contract,scorecard,token});
    fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({state:result.state,whole_platform_runtime_proven:result.whole_platform_runtime_proven}));
    if(result.state==='VERIFIED_FAIL')process.exitCode=1;
  }catch(error){
    const failure={id:contract.id,source_sha:sourceSha,state:'VERIFIED_FAIL',failure_class:String(error.message).split(':')[0],
      whole_platform_runtime_proven:false,retry_authorized:false,production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
    fs.mkdirSync(path.dirname(output),{recursive:true});if(!fs.existsSync(output))fs.writeFileSync(output,JSON.stringify(failure)+'\n',{flag:'wx',mode:0o600});
    console.error(failure.failure_class);process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
