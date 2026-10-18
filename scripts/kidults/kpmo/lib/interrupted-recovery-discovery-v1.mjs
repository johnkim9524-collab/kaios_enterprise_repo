// Native failure artifact discovery is a hint; only signed original-row reads
// and the independently verified native graph can admit recovery.
import {readArchive} from '../validate-sentinel-producer-content-v1.mjs';
import {validateInterruptedRecoveryRequest,observeInterruptedRecoveryNative} from './interrupted-reservation-recovery-v1.mjs';
const repo='johnkim9524-collab/kaios_enterprise_repo',id='1281328888';
const check=(ok,code)=>{if(!ok)throw Error('INTERRUPTED_DISCOVERY_'+code);};
export async function discoverInterruptedRecoveryCandidates({sourceSha,upstream,failureParent=upstream?.recovery_parent,get,readBytes,archiveReader=readArchive,now=()=>Date.now(),maxPages=10}){
  check(/^[a-f0-9]{40}$/.test(sourceSha)&&Number.isSafeInteger(maxPages)&&maxPages>0&&maxPages<=10,'CONFIG');
  const candidates=[];let unrecoverable=0;const unresolved=[];
  const roles=['track','kpmo','independent-verification'];
  const identity=run=>check(Number.isSafeInteger(run.id)&&run.id>0
    &&roles.some(role=>run.path===`.github/workflows/kidults-autonomous-${role}-authorization-v1.yml`)
    &&run.event==='repository_dispatch'&&run.head_branch==='main'
    &&run.repository?.full_name===repo&&String(run.repository?.id)===id,'RUN_IDENTITY');
  async function consume(run,exactArtifact=null){
        // Conservative no-active-token window. Actual broker drain remains a
        // mandatory authenticated prerequisite immediately before finalization.
        const ended=Date.parse(run.updated_at);check(Number.isFinite(ended),'RUN_TIME');
        if(now()<ended+3900000)return;
        let artifact=exactArtifact;
        if(!artifact){
        const listA=await get(`actions/runs/${run.id}/artifacts?per_page=100`);
        check(Array.isArray(listA.artifacts)&&listA.total_count===listA.artifacts.length&&listA.total_count<=100,'ARTIFACT_PAGINATION');
        const matches=listA.artifacts.filter(a=>a.name===`kidults-autonomous-internal-landing-finalizer-${run.id}-1`);
        if(!matches.length){unrecoverable++;return;}check(matches.length===1,'ARTIFACT_CARDINALITY');
        artifact=matches[0];
        }
        check(Number.isSafeInteger(artifact.id)&&artifact.id>0&&typeof artifact.expired==='boolean'&&/^sha256:[a-f0-9]{64}$/.test(artifact.digest||'')
          &&artifact.workflow_run?.id===run.id&&artifact.workflow_run.head_sha===run.head_sha
          &&Number.isSafeInteger(artifact.size_in_bytes)&&artifact.size_in_bytes>0&&artifact.size_in_bytes<=8*1024*1024
          &&Number.isFinite(Date.parse(artifact.expires_at))
          &&Number.isFinite(Date.parse(artifact.created_at))&&Date.parse(artifact.created_at)<=now()
          &&Number.isFinite(Date.parse(run.run_started_at))&&Date.parse(artifact.created_at)>=Date.parse(run.run_started_at),'FAILURE_ARTIFACT_TRANSPORT');
        if(artifact.expired||Date.parse(artifact.expires_at)<=now()){
          unrecoverable++;unresolved.push({run_id:run.id,artifact_id:artifact.id,state:'EXPIRED_ORIGINAL_ARTIFACT_READ_ONLY_UNRESOLVED'});return;
        }
        const bytes=await readBytes(`actions/artifacts/${artifact.id}/zip`);check(Buffer.isBuffer(bytes)&&bytes.length===artifact.size_in_bytes,'ARCHIVE_SIZE');
        const packet=archiveReader(bytes,artifact.digest),members=packet.members.filter(m=>m.encoding==='utf-8'&&m.name.split('/').at(-1)==='receipt.json');
        check(members.length===1,'RECEIPT_CARDINALITY');const receipt=JSON.parse(members[0].text),o=receipt.original_reservation;
        if(!o){check(!failureParent,'EXACT_ORIGINAL_MISSING');unrecoverable++;return;}
        check(!failureParent||o.pull_request===2655,'EXACT_ORIGINAL_PR');
        if([1677,2214].includes(o.pull_request))return;
        check(receipt.id==='kidults-autonomous-internal-landing-terminal-receipt-v1'&&receipt.state==='QUARANTINED'
          &&receipt.authorization_generation===o.original_generation&&o.original_run_id===String(run.id)&&o.original_run_attempt===1
          &&o.base_sha===run.head_sha&&receipt.merge_performed===true&&receipt.terminal_evidence===null
          &&receipt.retry_without_reconciliation===false&&['production','public','g5'].every(k=>receipt[k]==='HOLD'),'ORIGINAL_RECEIPT');
        const pr=await get(`pulls/${o.pull_request}`);if(!pr.merged||pr.state!=='closed'){check(!failureParent,'EXACT_ORIGINAL_UNMERGED');return;}
        // Every role observes the same authenticated upstream terminal.
        // Reuse its immutable update timestamp so all roles derive one request digest.
        const issuedAt=Date.parse(upstream?.updated_at||upstream?.created_at||'');
        check(Number.isFinite(issuedAt)&&issuedAt<=now()&&now()<issuedAt+1800000,'SHARED_REQUEST_WINDOW');
        const issued=new Date(issuedAt).toISOString(),request={id:'kidults-interrupted-reservation-postmerge-request-v1',version:'1.0.0',repository:repo,repository_id:id,
          ...o,merge_sha:pr.merge_commit_sha,source_sha:sourceSha,issued_at:issued,expires_at:new Date(Date.parse(issued)+1800000).toISOString(),
          production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
        validateInterruptedRecoveryRequest(request,{now:now()});await observeInterruptedRecoveryNative({request,get,now:now()});
        candidates.push({request,original_archive_digest:artifact.digest,original_artifact_id:artifact.id,
          ...(failureParent?{failure_parent:failureParent}: {})});
  }
  if(failureParent!=null){
    // The caller authenticates this parent first. Its exact pointer remains only
    // a discovery hint: archive, original tuple and native graph are rechecked.
    // A bad/missing pointer must never widen into a historical search.
    const refs=failureParent.terminal_check_evidence_refs;
    check(failureParent.kind==='TERMINAL_NULL_ASSURANCE_FAILURE_V1'
      &&failureParent.source_sha===sourceSha
      &&failureParent.terminal_check_id==='FINALIZER_RESERVATION_AND_IMMUTABLE_TERMINAL'
      &&failureParent.terminal_check_reason==='ORIGINAL_RESERVATION_AND_IMMUTABLE_TERMINAL_UNAVAILABLE'
      &&Array.isArray(refs)&&refs.length===3
      &&(typeof refs[0]==='string'||Number.isSafeInteger(refs[0]))
      &&/^[1-9][0-9]{0,15}$/.test(String(refs[0]))&&Number.isSafeInteger(Number(refs[0]))
      &&Number.isSafeInteger(refs[1])&&refs[1]>0
      &&typeof refs[2]==='string'&&/^sha256:[a-f0-9]{64}$/.test(refs[2]),'EXACT_PARENT_POINTER');
    const run=await get(`actions/runs/${refs[0]}`);identity(run);
    check(run.id===Number(refs[0])&&run.run_attempt===1&&run.status==='completed'
      &&['failure','cancelled','timed_out'].includes(run.conclusion),'EXACT_RUN');
    const ended=Date.parse(run.updated_at);check(Number.isFinite(ended),'RUN_TIME');
    if(now()>=ended+3900000){
      const artifact=await get(`actions/artifacts/${refs[1]}`);
      check(artifact.id===refs[1]&&artifact.digest===refs[2]
        &&artifact.name===`kidults-autonomous-internal-landing-finalizer-${run.id}-1`,'EXACT_ARTIFACT');
      await consume(run,artifact);
    }
  }else{
  for(const role of roles){
    const file=`kidults-autonomous-${role}-authorization-v1.yml`;
    for(const conclusion of ['failure','cancelled','timed_out']){let count=0,total;
    for(let page=1;page<=maxPages;page++){
      const list=await get(`actions/workflows/${file}/runs?branch=main&event=repository_dispatch&status=${conclusion}&per_page=100&page=${page}`);
      check(Array.isArray(list.workflow_runs)&&Number.isSafeInteger(list.total_count)&&list.total_count>=0&&list.total_count<=maxPages*100,'PAGINATION');
      total??=list.total_count;check(total===list.total_count,'PAGINATION_DRIFT');count+=list.workflow_runs.length;
      for(const run of list.workflow_runs){
        identity(run);check(run.path===`.github/workflows/${file}`,'RUN_IDENTITY');
        if(run.run_attempt!==1||run.status!=='completed'||!['failure','cancelled','timed_out'].includes(run.conclusion))continue;
        await consume(run);
      }
      if(count===total)break;
      check(count<total&&list.workflow_runs.length===100&&page<maxPages,'PAGINATION_INCOMPLETE');
    }
    }
  }
  }
  check(candidates.length<=20,'CANDIDATE_BUDGET');
  const keys=candidates.map(c=>c.request.original_generation+':'+c.request.nonce_digest);
  check(new Set(keys).size===keys.length,'DUPLICATE_ORIGINAL_RESERVATION');
  return {candidates,unrecoverable_legacy_or_missing_artifacts:unrecoverable,unresolved};
}
