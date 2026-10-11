// Native failure artifact discovery is a hint; only signed original-row reads
// and the independently verified native graph can admit recovery.
import {readArchive} from '../validate-sentinel-producer-content-v1.mjs';
import {validateInterruptedRecoveryRequest,observeInterruptedRecoveryNative} from './interrupted-reservation-recovery-v1.mjs';
const repo='johnkim9524-collab/kaios_enterprise_repo',id='1281328888';
const check=(ok,code)=>{if(!ok)throw Error('INTERRUPTED_DISCOVERY_'+code);};
export async function discoverInterruptedRecoveryCandidates({sourceSha,upstream,get,readBytes,now=()=>Date.now(),maxPages=10}){
  check(/^[a-f0-9]{40}$/.test(sourceSha)&&Number.isSafeInteger(maxPages)&&maxPages>0&&maxPages<=10,'CONFIG');
  const candidates=[];let unrecoverable=0;const unresolved=[];
  for(const role of ['track','kpmo','independent-verification']){
    const file=`kidults-autonomous-${role}-authorization-v1.yml`;
    for(const conclusion of ['failure','cancelled','timed_out']){let count=0,total;
    for(let page=1;page<=maxPages;page++){
      const list=await get(`actions/workflows/${file}/runs?branch=main&event=repository_dispatch&status=${conclusion}&per_page=100&page=${page}`);
      check(Array.isArray(list.workflow_runs)&&Number.isSafeInteger(list.total_count)&&list.total_count>=0&&list.total_count<=maxPages*100,'PAGINATION');
      total??=list.total_count;check(total===list.total_count,'PAGINATION_DRIFT');count+=list.workflow_runs.length;
      for(const run of list.workflow_runs){
        check(run.path===`.github/workflows/${file}`&&run.event==='repository_dispatch'&&run.head_branch==='main'
          &&run.repository?.full_name===repo&&String(run.repository?.id)===id,'RUN_IDENTITY');
        if(run.run_attempt!==1||run.status!=='completed'||!['failure','cancelled','timed_out'].includes(run.conclusion))continue;
        // Conservative no-active-token window. Actual broker drain remains a
        // mandatory authenticated prerequisite immediately before finalization.
        const ended=Date.parse(run.updated_at);check(Number.isFinite(ended),'RUN_TIME');
        if(now()<ended+3900000)continue;
        const listA=await get(`actions/runs/${run.id}/artifacts?per_page=100`);
        check(Array.isArray(listA.artifacts)&&listA.total_count===listA.artifacts.length&&listA.total_count<=100,'ARTIFACT_PAGINATION');
        const matches=listA.artifacts.filter(a=>a.name===`kidults-autonomous-internal-landing-finalizer-${run.id}-1`);
        if(!matches.length){unrecoverable++;continue;}check(matches.length===1,'ARTIFACT_CARDINALITY');
        const artifact=matches[0];
        check(Number.isSafeInteger(artifact.id)&&artifact.id>0&&typeof artifact.expired==='boolean'&&/^sha256:[a-f0-9]{64}$/.test(artifact.digest||'')
          &&artifact.workflow_run?.id===run.id&&artifact.workflow_run.head_sha===run.head_sha
          &&Number.isSafeInteger(artifact.size_in_bytes)&&artifact.size_in_bytes>0&&artifact.size_in_bytes<=8*1024*1024
          &&Number.isFinite(Date.parse(artifact.expires_at))
          &&Number.isFinite(Date.parse(artifact.created_at))&&Date.parse(artifact.created_at)<=now()
          &&Number.isFinite(Date.parse(run.run_started_at))&&Date.parse(artifact.created_at)>=Date.parse(run.run_started_at),'FAILURE_ARTIFACT_TRANSPORT');
        if(artifact.expired||Date.parse(artifact.expires_at)<=now()){
          unrecoverable++;unresolved.push({run_id:run.id,artifact_id:artifact.id,state:'EXPIRED_ORIGINAL_ARTIFACT_READ_ONLY_UNRESOLVED'});continue;
        }
        const bytes=await readBytes(`actions/artifacts/${artifact.id}/zip`);check(Buffer.isBuffer(bytes)&&bytes.length===artifact.size_in_bytes,'ARCHIVE_SIZE');
        const packet=readArchive(bytes,artifact.digest),members=packet.members.filter(m=>m.encoding==='utf-8'&&m.name.split('/').at(-1)==='receipt.json');
        check(members.length===1,'RECEIPT_CARDINALITY');const receipt=JSON.parse(members[0].text),o=receipt.original_reservation;
        if(!o){unrecoverable++;continue;}
        if(o.pull_request===1677)continue;
        check(receipt.id==='kidults-autonomous-internal-landing-terminal-receipt-v1'&&receipt.state==='QUARANTINED'
          &&receipt.authorization_generation===o.original_generation&&o.original_run_id===String(run.id)&&o.original_run_attempt===1
          &&o.base_sha===run.head_sha&&['production','public','g5'].every(k=>receipt[k]==='HOLD'),'ORIGINAL_RECEIPT');
        const pr=await get(`pulls/${o.pull_request}`);if(!pr.merged||pr.state!=='closed')continue;
        const issued=upstream.created_at,request={id:'kidults-interrupted-reservation-postmerge-request-v1',version:'1.0.0',repository:repo,repository_id:id,
          ...o,merge_sha:pr.merge_commit_sha,source_sha:sourceSha,issued_at:issued,expires_at:new Date(Date.parse(issued)+1800000).toISOString(),
          production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
        validateInterruptedRecoveryRequest(request,{now:now()});await observeInterruptedRecoveryNative({request,get,now:now()});
        candidates.push({request,original_archive_digest:artifact.digest,original_artifact_id:artifact.id});
      }
      if(count===total)break;
      check(count<total&&list.workflow_runs.length===100&&page<maxPages,'PAGINATION_INCOMPLETE');
    }
  }
  }
  check(candidates.length<=20,'CANDIDATE_BUDGET');
  const keys=candidates.map(c=>c.request.original_generation+':'+c.request.nonce_digest);
  check(new Set(keys).size===keys.length,'DUPLICATE_ORIGINAL_RESERVATION');
  return {candidates,unrecoverable_legacy_or_missing_artifacts:unrecoverable,unresolved};
}
