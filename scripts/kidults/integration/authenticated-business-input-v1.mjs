import {createHash} from 'node:crypto';
import {authenticatedGithubRead,downloadArtifact} from '../kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs';
import {readArchive,checkTransport,REPOSITORY} from '../kpmo/validate-sentinel-producer-content-v1.mjs';
import {executeBoundBusinessInput} from '../runtime/execute-bound-business-input-v1.mjs';

const fail=code=>{throw new Error(`AUTHENTICATED_BUSINESS_INPUT_${code}`);};
const hash=bytes=>`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const positive=n=>Number.isSafeInteger(n)&&n>0;
const names={envelope:'envelope.json',receiptRegistry:'receipt-registry.json',purposeRights:'purpose-rights.json'};
const holds=['production','public','g5','provider_activation'];

// Registration comes from the protected checkout, never from the input artifact.
// A native artifact authenticates transport and content, not a legal decision,
// immutable storage, remote workload, or any of the 14 domain certificates.
export async function connectAuthenticatedBusinessInput({reference,contract,sourceSha,token,
  read=authenticatedGithubRead,download=downloadArtifact,now=new Date()}){
  if(contract?.id!=='kidults-authenticated-business-input-connection-v1'
    ||contract.repository!==REPOSITORY||holds.some(k=>contract[k]!=='HOLD')
    ||contract.domain_receipt_emission!==false||!Array.isArray(contract.producers)
    ||contract.producers.length>32||!Number.isSafeInteger(contract.maximum_age_seconds)
    ||contract.maximum_age_seconds<1||contract.maximum_age_seconds>7200)fail('CONTRACT');
  if(!/^[a-f0-9]{40}$/.test(sourceSha||'')||!(now instanceof Date)||!Number.isFinite(now.getTime()))fail('SOURCE_OR_TIME');
  if(!reference)return {state:'HOLD',blocker:'AUTHENTICATED_INPUT_REFERENCE_MISSING',
    native_domain_receipt_emitted:false,production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
  if(!positive(reference.run_id)||!positive(reference.artifact_id)||typeof reference.producer_id!=='string')fail('REFERENCE');
  const producers=contract.producers.filter(p=>p.id===reference.producer_id);
  if(producers.length!==1)return {state:'HOLD',blocker:'SOURCE_PRODUCER_NOT_REGISTERED',
    native_domain_receipt_emitted:false,production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
  const producer=producers[0];
  if(!/^kidults-[a-z0-9-]+\.yml$/.test(producer.workflow||'')
    ||!/^kidults-[a-z0-9-]+$/.test(producer.artifact_prefix||'')
    ||!Array.isArray(producer.source_ids)||!producer.source_ids.length
    ||new Set(producer.source_ids).size!==producer.source_ids.length
    ||producer.source_ids.some(id=>typeof id!=='string'||!id))fail('PRODUCER');
  const base=`https://api.github.com/repos/${REPOSITORY}`;
  const get=path=>read(`${base}/${path}`,token);
  const main=await get('branches/main');
  if(main.commit?.sha!==sourceSha)fail('EXACT_MAIN');
  const run=await get(`actions/runs/${reference.run_id}`);
  if(run?.id!==reference.run_id||run.path!==`.github/workflows/${producer.workflow}`||run.run_attempt!==1
    ||!['push','schedule','workflow_run','repository_dispatch'].includes(run.event))fail('NATIVE_PRODUCER');
  const created=Date.parse(run.created_at);
  if(!Number.isFinite(created)||created>now.getTime()||now.getTime()-created>contract.maximum_age_seconds*1000)fail('STALE');
  const index=await get(`actions/runs/${run.id}/artifacts?per_page=100`);
  if(!Array.isArray(index.artifacts)||index.total_count!==index.artifacts.length||index.artifacts.length>100)fail('ARTIFACT_INDEX');
  const expectedName=`${producer.artifact_prefix}-${sourceSha}-${run.id}-1`;
  const matches=index.artifacts.filter(a=>a.name===expectedName);
  if(matches.length!==1||matches[0].id!==reference.artifact_id)fail('ARTIFACT_CARDINALITY');
  const artifact=matches[0];
  checkTransport(run,artifact,sourceSha,now.toISOString());
  const packet=readArchive(await download(REPOSITORY,artifact,token),artifact.digest);
  const required=['business-input-binding.json',...Object.values(names)];
  if(packet.members.length!==required.length
    ||required.some(name=>packet.members.filter(m=>m.name===name).length!==1)
    ||packet.members.some(m=>m.encoding!=='utf-8'))fail('EXACT_MEMBER_SET');
  const bytes=name=>Buffer.from(packet.members.find(m=>m.name===name).text,'utf8');
  const binding=JSON.parse(bytes('business-input-binding.json').toString('utf8'));
  const files=Object.fromEntries(Object.entries(names).map(([key,name])=>[key,bytes(name)]));
  // The parser executes only pinned repository code. Artifact bytes are data.
  const stage=executeBoundBusinessInput({files,binding,sourceSha,runId:String(run.id),now});
  if(stage.rights_decisions.some(row=>!producer.source_ids.includes(row.source_id))
    ||stage.rights_decisions.length===0)fail('SOURCE_ADMISSION_SCOPE');
  const fresh=await get(`actions/runs/${run.id}`),freshArtifact=await get(`actions/artifacts/${artifact.id}`);
  for(const key of ['id','path','head_sha','head_branch','run_attempt','event','status','conclusion']){
    if(fresh[key]!==run[key])fail('RUN_CHANGED');
  }
  if(fresh.repository?.full_name!==REPOSITORY)fail('RUN_CHANGED');
  checkTransport(fresh,freshArtifact,sourceSha,now.toISOString());
  if(freshArtifact.id!==artifact.id||freshArtifact.id!==reference.artifact_id
    ||freshArtifact.name!==artifact.name||freshArtifact.digest!==artifact.digest)fail('ARTIFACT_CHANGED');
  if((await get('branches/main')).commit?.sha!==sourceSha)fail('MAIN_CHANGED');
  return {id:'kidults-authenticated-business-input-result-v1',state:'INPUT_TRANSPORT_AND_CONTENT_VERIFIED',
    evidence_scope:'AUTHENTICATED_NATIVE_ARTIFACT_AND_CONTENT_ONLY_NOT_DOMAIN_PROOF',
    source_sha:sourceSha,producer_id:producer.id,run_id:run.id,run_attempt:1,
    artifact_id:artifact.id,artifact_digest:artifact.digest,binding_digest:hash(bytes('business-input-binding.json')),
    file_digests:binding.file_digests,source_ids:stage.rights_decisions.map(row=>row.source_id).sort(),
    input_processing:stage,binding_transport_authenticated:true,
    legal_admission_independently_verified:false,immutable_pair_created:false,
    remote_workload_verified:false,native_domain_receipt_emitted:false,
    production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
}
