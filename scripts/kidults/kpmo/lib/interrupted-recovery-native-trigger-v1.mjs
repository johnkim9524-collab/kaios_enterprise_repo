// Read-only authentication of the existing Gate workflow_run trigger.
import fs from 'node:fs';
import {readArchive,checkTransport} from '../validate-sentinel-producer-content-v1.mjs';
import {execFileSync} from 'node:child_process';
const repository='johnkim9524-collab/kaios_enterprise_repo';
const check=(ok,code)=>{if(!ok)throw new Error('INTERRUPTED_TRIGGER_'+code);};
export const recoveryNativeGet=route=>JSON.parse(execFileSync('gh',['api',`repos/${repository}/${route}`],
  {encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']}));
const nativeBytes=route=>execFileSync('gh',['api',`repos/${repository}/${route}`],{timeout:30000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});
export async function verifyInterruptedRecoveryNativeTrigger({env=process.env,event,get=recoveryNativeGet,readBytes=nativeBytes}){
  check(env.GITHUB_EVENT_NAME==='workflow_run'&&env.GITHUB_RUN_ATTEMPT==='1'&&env.GITHUB_REF==='refs/heads/main'
    &&env.GITHUB_REPOSITORY===repository&&env.GITHUB_REPOSITORY_ID==='1281328888'
    &&/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')&&env.GITHUB_WORKFLOW_SHA===env.GITHUB_SHA,'CONTEXT');
  event??=JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
  let upstream=event.workflow_run;
  if(upstream?.name==='KIDULTS Autonomous Independent Verification V1'){
    check(event.action==='completed'&&upstream.path==='.github/workflows/kidults-autonomous-independent-verification-authorization-v1.yml'
      &&upstream.event==='workflow_run'&&upstream.status==='completed'&&upstream.conclusion==='success'
      &&upstream.run_attempt===1&&upstream.head_branch==='main'&&upstream.head_sha===env.GITHUB_SHA
      &&upstream.repository?.full_name===repository&&String(upstream.repository?.id)==='1281328888','VERIFIER_TRIGGER');
    const role=await get(`actions/runs/${upstream.id}`);
    check(['id','name','path','event','head_sha','head_branch','run_attempt','status','conclusion'].every(k=>role[k]===upstream[k]),'VERIFIER_READBACK');
    const roleJobs=await get(`actions/runs/${role.id}/attempts/1/jobs?per_page=100`);
    check(Array.isArray(roleJobs.jobs)&&roleJobs.total_count===roleJobs.jobs.length&&roleJobs.total_count<=100
      &&new Set(roleJobs.jobs.map(j=>j.id)).size===roleJobs.jobs.length,'VERIFIER_JOBS');
    const recovery=roleJobs.jobs.filter(j=>j.name==='Bounded original reservation terminal recovery INDEPENDENT_VERIFIER');
    check(recovery.length===1&&recovery[0].run_id===role.id&&(recovery[0].run_attempt===undefined||recovery[0].run_attempt===1)
      &&recovery[0].status==='completed'&&recovery[0].conclusion==='success'
      &&recovery[0].steps?.filter(s=>s.name==='Run bounded signed terminal recovery workload'&&s.status==='completed'&&s.conclusion==='success').length===1,'VERIFIER_ACTUAL_RECOVERY');
    const artifacts=await get(`actions/runs/${role.id}/artifacts?per_page=100`);
    check(Array.isArray(artifacts.artifacts)&&artifacts.total_count===artifacts.artifacts.length&&artifacts.total_count<=100,'VERIFIER_ARTIFACT_LIST');
    const selected=artifacts.artifacts.filter(a=>a.name===`kidults-postmerge-terminal-recovery-independent_verifier-${role.id}-1`);
    check(selected.length===1,'VERIFIER_ARTIFACT');checkTransport(role,selected[0],env.GITHUB_SHA,new Date().toISOString());
    const bytes=await readBytes(`actions/artifacts/${selected[0].id}/zip`);check(Buffer.isBuffer(bytes)&&bytes.length===selected[0].size_in_bytes,'VERIFIER_ARCHIVE');
    const packet=readArchive(bytes,selected[0].digest),members=packet.members.filter(m=>m.encoding==='utf-8'&&m.name.split('/').at(-1)==='interrupted-INDEPENDENT_VERIFIER.json');
    check(members.length===1,'VERIFIER_RECEIPT');const receipt=JSON.parse(members[0].text);
    check(receipt.source_sha===env.GITHUB_SHA&&Number.isSafeInteger(receipt.gate_run_id)&&receipt.gate_run_id>0
      &&receipt.role_run_id===String(role.id)&&receipt.actual_candidates>0,'VERIFIER_GATE_LINEAGE');
    upstream=await get(`actions/runs/${receipt.gate_run_id}`);
  }

  check(event.action==='completed'&&Number.isSafeInteger(upstream?.id)&&upstream.id>0
    &&upstream.name==='KPMO Continuous Assurance Success Authority Gate V1'
    &&upstream.path==='.github/workflows/kpmo-continuous-assurance-success-authority-gate-v1.yml'
    &&upstream.event==='workflow_run'&&upstream.status==='completed'&&upstream.conclusion==='success'
    &&upstream.run_attempt===1&&upstream.head_sha===env.GITHUB_SHA&&upstream.head_branch==='main'
    &&upstream.repository?.full_name===repository&&String(upstream.repository?.id)==='1281328888','UPSTREAM');
  const live=await get(`actions/runs/${upstream.id}`);
  check(['id','name','path','event','head_sha','head_branch','run_attempt','status','conclusion'].every(k=>live[k]===upstream[k])
    &&live.repository?.full_name===repository&&String(live.repository?.id)==='1281328888','UPSTREAM_READBACK');
  const jobs=await get(`actions/runs/${live.id}/attempts/1/jobs?per_page=100`);
  check(Array.isArray(jobs.jobs)&&jobs.total_count===jobs.jobs.length&&jobs.total_count<=100
    &&new Set(jobs.jobs.map(j=>j.id)).size===jobs.jobs.length,'JOBS');
  const authority=jobs.jobs.filter(j=>j.name==='success-authority-gate');
  check(authority.length===1&&authority[0].run_id===live.id&&(authority[0].run_attempt===undefined||authority[0].run_attempt===1)
    &&authority[0].status==='completed'&&authority[0].conclusion==='success','ACTUAL_AUTHORITY');
  const branch=await get('branches/main');check(branch.name==='main'&&branch.protected===true&&branch.commit?.sha===env.GITHUB_SHA,'MAIN');
  return live;
}
