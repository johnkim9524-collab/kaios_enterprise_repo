import {createHash} from 'node:crypto';
import {authenticatedGithubRead,downloadArtifact} from '../kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs';
import {readArchive,checkTransport,REPOSITORY} from '../kpmo/validate-sentinel-producer-content-v1.mjs';
import {verifyValueChainDomainReceipt} from '../kpmo/lib/whole-platform-runtime-evidence-v1.mjs';
import {consumeRuntimeDomainOutput} from '../runtime/runtime-domain-output-consumers-v1.mjs';
import {orderedRuntimeDomains} from '../runtime/runtime-domain-workloads-v1.mjs';

const fail=code=>{throw new Error(`AUTHENTICATED_DOMAIN_OUTPUT_${code}`);};
const hash=bytes=>`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const positive=value=>Number.isSafeInteger(value)&&value>0;

// Reads an already-completed registered producer. Does not acquire data, write
// storage, execute downloaded code, dispatch a workload, or mint a certificate.
export async function authenticateRuntimeDomainOutput({reference,domainId,contract,sourceSha,
  token,inputDigest,sourceIds,dependencyOutputs={},dependencyReceiptDigests={},requiredDependencyIds=[],
  read=authenticatedGithubRead,download=downloadArtifact,now=new Date()}){
  if(contract?.id!=='kidults-whole-platform-operating-proof-v1'||contract.repository!==REPOSITORY
    ||!Array.isArray(contract.runtime_domain_sources)||contract.runtime_domain_sources.length>14
    ||['production','public','g5','provider_activation'].some(k=>contract[k]!=='HOLD'))fail('CONTRACT');
  if(!/^[a-f0-9]{40}$/.test(sourceSha||'')||!(now instanceof Date)||!Number.isFinite(now.getTime()))fail('CONTEXT');
  const registrations=contract.runtime_domain_sources.filter(row=>row.domain_id===domainId);
  if(registrations.length===0)return {domain_id:domainId,state:'HOLD',blocker:'NATIVE_DOMAIN_PRODUCER_NOT_REGISTERED'};
  if(registrations.length!==1)fail('REGISTRATION_CARDINALITY');
  if(!reference)return {domain_id:domainId,state:'HOLD',blocker:'NATIVE_DOMAIN_OUTPUT_REFERENCE_MISSING'};
  if(!positive(reference.run_id)||!positive(reference.artifact_id))fail('REFERENCE');
  const producer=registrations[0];
  if(!/^kidults-[a-z0-9-]+\.yml$/.test(producer.workflow||'')
    ||!/^kidults-[a-z0-9-]+$/.test(producer.artifact_prefix||''))fail('PRODUCER');
  if(!token)return {domain_id:domainId,state:'HOLD',blocker:'NATIVE_ARTIFACT_READ_AUTHORITY_MISSING'};
  const base=`https://api.github.com/repos/${REPOSITORY}`;
  const get=path=>read(`${base}/${path}`,token);
  if((await get('branches/main')).commit?.sha!==sourceSha)fail('MAIN');
  const run=await get(`actions/runs/${reference.run_id}`);
  if(run.id!==reference.run_id||run.path!==`.github/workflows/${producer.workflow}`
    ||run.run_attempt!==1||!['push','schedule','workflow_run','repository_dispatch'].includes(run.event))fail('RUN');
  const maximumAge=Math.min(contract.maximum_evidence_age_seconds||0,7200),created=Date.parse(run.created_at);
  if(!Number.isSafeInteger(maximumAge)||maximumAge<1||!Number.isFinite(created)
    ||created>now.getTime()||now.getTime()-created>maximumAge*1000)fail('FRESHNESS');
  const index=await get(`actions/runs/${run.id}/artifacts?per_page=100`);
  if(!Array.isArray(index.artifacts)||index.artifacts.length>100||index.total_count!==index.artifacts.length)fail('ARTIFACT_INDEX');
  const name=`${producer.artifact_prefix}-${sourceSha}-${run.id}-1`;
  const matches=index.artifacts.filter(a=>a.name===name);
  if(matches.length!==1||matches[0].id!==reference.artifact_id)fail('ARTIFACT_CARDINALITY');
  const artifact=matches[0];checkTransport(run,artifact,sourceSha,now.toISOString());
  const packet=readArchive(await download(REPOSITORY,artifact,token),artifact.digest);
  const member=filename=>{
    const values=packet.members.filter(row=>row.name===filename&&row.encoding==='utf-8');
    if(values.length!==1)fail('MEMBER');return values[0].text;
  };
  const receipt=verifyValueChainDomainReceipt(JSON.parse(member('runtime-domain-receipt.json')),domainId,run,sourceSha);
  if(receipt.workflow_path!==run.path)fail('RECEIPT_WORKFLOW');
  const sourcePrefix=`https://github.com/${REPOSITORY}/actions/runs/${run.id}#artifact/`;
  if(receipt.primary_evidence.some(row=>row.protected_source_ref!==sourcePrefix+row.name))fail('PRIMARY_SOURCE_REF');
  let output=null,semantic=null;
  if(domainId==='SECURITY_SUPPLY_CHAIN'){
    // Every referenced primary byte digest must exist in this exact archive.
    for(const evidence of receipt.primary_evidence){
      if(!evidence.name||hash(Buffer.from(member(evidence.name),'utf8'))!==evidence.digest)fail('SECURITY_EVIDENCE_DIGEST');
    }
  }else{
    if(packet.members.length!==2||packet.members.some(row=>!['runtime-domain-receipt.json','domain-output.json'].includes(row.name)))fail('EXACT_MEMBER_SET');
    const text=member('domain-output.json'),outputHash=hash(Buffer.from(text,'utf8'));
    if(receipt.primary_evidence.length!==1||receipt.primary_evidence[0].name!=='domain-output.json'
      ||receipt.primary_evidence[0].digest!==outputHash)fail('PRIMARY_OUTPUT_DIGEST');
    output=JSON.parse(text);
    const joins=output.dependency_receipt_digests;
    if(!joins||Array.isArray(joins)||typeof joins!=='object'
      ||JSON.stringify(Object.keys(joins).sort())!==JSON.stringify([...requiredDependencyIds].sort())
      ||requiredDependencyIds.some(id=>!/^sha256:[a-f0-9]{64}$/.test(joins[id]||'')
        ||joins[id]!==dependencyReceiptDigests[id]))fail('DEPENDENCY_RECEIPT_JOIN');
    semantic=consumeRuntimeDomainOutput({domainId,output,sourceSha,inputDigest,sourceIds,
      dependencyOutputs,dependencyReceiptDigests,now});
  }
  const fresh=await get(`actions/runs/${run.id}`),freshArtifact=await get(`actions/artifacts/${artifact.id}`);
  for(const key of ['id','path','head_sha','head_branch','run_attempt','event','status','conclusion','created_at','run_started_at']){
    if(fresh[key]!==run[key])fail('RUN_CHANGED');
  }
  if(fresh.repository?.full_name!==REPOSITORY)fail('RUN_CHANGED');
  checkTransport(fresh,freshArtifact,sourceSha,now.toISOString());
  if(['id','digest','name','size_in_bytes','created_at','expires_at'].some(key=>freshArtifact[key]!==artifact[key]))fail('ARTIFACT_CHANGED');
  if((await get('branches/main')).commit?.sha!==sourceSha)fail('MAIN_CHANGED');
  return {domain_id:domainId,state:'AUTHENTICATED_NATIVE_OUTPUT_CONTENT_VERIFIED',
    source_sha:sourceSha,run_id:run.id,run_attempt:1,artifact_id:artifact.id,artifact_digest:artifact.digest,
    imported_receipt_digest:receipt.receipt_digest,semantic_result:semantic,
    output,receipt,native_domain_receipt_emitted:false,dispatch_authorized:false};
}

export async function reconcileRuntimeDomainOutputs({references={},definition,connection,contract,sourceSha,token,
  read=authenticatedGithubRead,download=downloadArtifact,now=new Date()}){
  orderedRuntimeDomains(definition);
  if(!references||Array.isArray(references)||typeof references!=='object'
    ||Object.keys(references).some(id=>!definition.domains.some(row=>row.id===id)))fail('REFERENCE_SET');
  const outputs={},receiptDigests={},results=[],pending=new Map(definition.domains.map(row=>[row.id,
    row.id==='RUNTIME_RELIABILITY'?{...row,requires:[...new Set([...row.requires,'IMMUTABLE_CANDIDATE'])]}:row]));
  const seen=new Set();
  while(pending.size){
    const ready=[...pending.values()].filter(row=>row.requires.every(id=>seen.has(id)));
    if(!ready.length)fail('DEPENDENCY_CYCLE');
    for(const row of ready){
      pending.delete(row.id);seen.add(row.id);
      const missing=row.requires.filter(id=>!receiptDigests[id]);
      let result;
      if(row.id!=='SECURITY_SUPPLY_CHAIN'&&connection?.state!=='INPUT_TRANSPORT_AND_CONTENT_VERIFIED'){
        result={domain_id:row.id,state:'HOLD',blocker:connection?.blocker||'AUTHENTICATED_INPUT_REFERENCE_MISSING'};
      }else if(missing.length){result={domain_id:row.id,state:'HOLD',blocker:'AUTHENTICATED_NATIVE_DEPENDENCY_MISSING',unmet_dependencies:missing};}
      else result=await authenticateRuntimeDomainOutput({reference:references[row.id],domainId:row.id,contract,sourceSha,token,
        inputDigest:connection?.input_processing?.content_digest,sourceIds:connection?.source_ids,
        dependencyOutputs:outputs,dependencyReceiptDigests:receiptDigests,requiredDependencyIds:row.requires,read,download,now});
      if(result.state==='AUTHENTICATED_NATIVE_OUTPUT_CONTENT_VERIFIED'){
        if(result.output)outputs[row.id]=result.output;
        receiptDigests[row.id]=result.imported_receipt_digest;
        // Do not copy private native output data into the public observation.
        const {output,receipt,...summary}=result;results.push(summary);
      }else results.push(result);
    }
  }
  return {id:'kidults-runtime-domain-output-connections-v1',source_sha:sourceSha,
    state:results.every(row=>row.state==='AUTHENTICATED_NATIVE_OUTPUT_CONTENT_VERIFIED')?'OUTPUT_CONNECTIONS_VERIFIED':'VERIFIED_INCOMPLETE',
    authenticated_output_count:Object.keys(receiptDigests).length,required_output_count:14,
    domains:results,native_domain_receipt_emitted:false,whole_platform_runtime_proven:false,
    dispatch_authorized:false,external_writes:0,production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
}
