import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const workflow='kidults-asi-owned-source-intelligence-graph-v2.yml';
const repository='johnkim9524-collab/kaios_enterprise_repo';
const fail=code=>{throw new Error(code)};
export async function waitExactP2({sha,read,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),record=()=>{},budgetMs=600000}) {
  if(!/^[a-f0-9]{40}$/.test(sha)||!Number.isInteger(budgetMs)||budgetMs<1||budgetMs>600000)fail('INVALID_CONTEXT');
  const deadline=now()+budgetMs;
  const emit=(state,code,runId=null)=>record({id:'kidults-exact-p2-upstream-wait-v1',source_sha:sha,state,code,selected_run_id:runId,authority_granted:false,production:'HOLD',public_release:'HOLD'});
  emit('WAITING','BEFORE_NATIVE_READ');
  try {
    while(now()<deadline) {
      const main=await read(`/repos/${repository}/branches/main`,deadline);
      if(main.name!=='main'||main.commit?.sha!==sha)fail('CURRENT_MAIN_CHANGED');
      let runs=[],total;
      for(let page=1;page<=10;page++) {
        const body=await read(`/repos/${repository}/actions/workflows/${workflow}/runs?branch=main&head_sha=${sha}&per_page=100&page=${page}`,deadline);
        if(!Number.isSafeInteger(body.total_count)||body.total_count<0||!Array.isArray(body.workflow_runs))fail('RUN_INDEX_INVALID');
        if(total!==undefined&&body.total_count!==total)fail('RUN_INDEX_CHANGED_DURING_PAGINATION');
        total=body.total_count;if(total>1000)fail('RUN_INDEX_LIMIT_EXCEEDED');runs.push(...body.workflow_runs);
        if(runs.length>=total)break;
        if(body.workflow_runs.length!==100)fail('RUN_INDEX_TRUNCATED');
      }
      if(runs.length!==total||new Set(runs.map(r=>r.id)).size!==runs.length)fail('RUN_INDEX_INCOMPLETE');
      if(runs.some(r=>!Number.isSafeInteger(r.id)||r.id<1||r.path!==`.github/workflows/${workflow}`||r.head_sha!==sha||r.head_branch!=='main'||r.repository?.full_name!==repository))fail('RUN_BINDING_INVALID');
      const successes=runs.filter(r=>r.status==='completed'&&r.conclusion==='success').sort((a,b)=>b.id-a.id);
      if(successes.length) {
        const selected=successes[0];
        const age=now()-Date.parse(selected.completed_at||selected.updated_at||'');
        if(!Number.isFinite(age)||age<0||age>86400000)fail('SUCCESSFUL_P2_STALE');
        if(now()>=deadline)fail('WAIT_DEADLINE_EXHAUSTED');
        emit('SELECTED','EXACT_MAIN_SUCCESSFUL_P2',String(selected.id));return String(selected.id);
      }
      const pending=runs.some(r=>['queued','in_progress','waiting','pending','requested'].includes(r.status));
      if(runs.length&&!pending)fail('P2_TERMINAL_WITHOUT_SUCCESS');
      emit('WAITING',pending?'EXACT_MAIN_P2_PENDING':'EXACT_MAIN_P2_MISSING');
      await sleep(Math.min(15000,Math.max(0,deadline-now())));
    }
    fail('WAIT_DEADLINE_EXHAUSTED');
  } catch(error) {
    const allowed=['CURRENT_MAIN_CHANGED','RUN_INDEX_INVALID','RUN_INDEX_CHANGED_DURING_PAGINATION','RUN_INDEX_LIMIT_EXCEEDED','RUN_INDEX_TRUNCATED','RUN_INDEX_INCOMPLETE','RUN_BINDING_INVALID','SUCCESSFUL_P2_STALE','WAIT_DEADLINE_EXHAUSTED','P2_TERMINAL_WITHOUT_SUCCESS'];
    const code=allowed.includes(error.message)?error.message:'NATIVE_READ_FAILED';emit('HOLD',code);throw new Error(code);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const receipt='/tmp/kidults-exact-p2-upstream-wait-v1.json';
  fs.writeFileSync(receipt,JSON.stringify({id:'kidults-exact-p2-upstream-wait-v1',state:'HOLD',code:'INVALID_CONTEXT',authority_granted:false,production:'HOLD',public_release:'HOLD'})+'\n');
  try {
    if(process.env.GITHUB_REPOSITORY!==repository)fail('INVALID_CONTEXT');
    const id=await waitExactP2({sha:process.env.GITHUB_SHA,record:value=>fs.writeFileSync(receipt,JSON.stringify(value,null,2)+'\n'),read:(endpoint,deadline)=>JSON.parse(execFileSync('gh',['api','-H','Accept: application/vnd.github+json',endpoint],{encoding:'utf8',timeout:Math.max(1,Math.min(30000,deadline-Date.now())),maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']}))});
    process.stdout.write(id);
  }catch(error){process.stderr.write(`P2_UPSTREAM_HOLD:${/^[A-Z_]+$/.test(error.message)?error.message:'NATIVE_READ_FAILED'}\n`);process.exitCode=2;}
}
