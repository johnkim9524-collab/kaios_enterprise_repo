// GET-only transport. HTTP throttling is never producer failure or approval.
import {randomBytes} from 'node:crypto';
import {githubHttpFailureDiagnostic} from './github-http-failure-diagnostic-v1.mjs';
const check=(ok,code)=>{if(!ok)throw Error('GITHUB_READ_'+code);};
const pools=new Map();
export function createReadBudget({maxCalls=240,maxConcurrent=2,minIntervalMs=100,now=()=>Date.now(),wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
  check(Number.isSafeInteger(minIntervalMs)&&minIntervalMs>=0&&minIntervalMs<=1000&&Number.isSafeInteger(maxCalls)&&maxCalls>0&&maxCalls<=1000&&Number.isSafeInteger(maxConcurrent)&&maxConcurrent>0&&maxConcurrent<=4,'BUDGET_CONFIG');
  let calls=0,active=0,nextAt=0,blockedUntil=0;const queue=[];
  async function acquire({deadline=Number.MAX_SAFE_INTEGER}={}){
    while(active>=maxConcurrent){
      check(now()<deadline,'BUDGET_DEADLINE');
      await new Promise((resolve,reject)=>{
        let timer;
        const wake=()=>{clearTimeout(timer);resolve();};
        queue.push(wake);
        timer=setTimeout(()=>{const index=queue.indexOf(wake);if(index>=0)queue.splice(index,1);reject(Error('GITHUB_READ_BUDGET_DEADLINE'));},Math.min(2147483647,deadline-now()));
      });
    }
    check(now()<deadline,'BUDGET_DEADLINE');
    if(calls>=maxCalls)throw Error('GITHUB_READ_INVOCATION_BUDGET_EXHAUSTED');
    active++;calls++;const at=Math.max(now(),nextAt);nextAt=at+minIntervalMs;
    try{if(at>now())await wait(at-now());return()=>{active--;queue.splice(0).forEach(resolve=>resolve());};}
    catch(error){active--;queue.splice(0).forEach(resolve=>resolve());throw error;}
  }
  return {acquire,blockUntil:at=>{blockedUntil=Math.max(blockedUntil,at);},blockedUntil:()=>blockedUntil,
    snapshot:()=>({scope:'INVOCATION_SHARED_NOT_CROSS_RUNNER',calls,active,max_calls:maxCalls,max_concurrent:maxConcurrent,blocked_until:blockedUntil})};
}
export function readResumeCheckpoint({binding,route,diagnostic,resumeAt,attempts,reason}){
  check(binding&&/^[a-f0-9]{40}$/.test(binding.source_sha||'')&&/^[1-9][0-9]*$/.test(String(binding.run_id||''))
    &&Number.isSafeInteger(binding.run_attempt)&&binding.run_attempt>=1&&binding.run_attempt<=100
    &&typeof binding.root_mission==='string'&&binding.root_mission.length<=128,'RESUME_BINDING');
  check(typeof route==='string'&&route.startsWith('/repos/')&&Number.isSafeInteger(resumeAt),'RESUME_ROUTE');
  return {id:'kidults-github-read-resume-checkpoint-v1',version:'1.0.0',state:'READ_DEFERRED_NOT_AUTHORITY',
    binding:Object.fromEntries(['root_mission','source_sha','run_id','run_attempt','original_run_id','original_artifact_id','original_artifact_digest','parent_run_id'].filter(k=>binding[k]!==undefined).map(k=>[k,binding[k]])),unfinished_operation:{method:'GET',route},reason,resume_at:new Date(resumeAt).toISOString(),
    attempts_used:attempts,http_diagnostic:diagnostic??null,original_reservation_preserved:true,
    reservation_write_performed:false,producer_failure_claimed:false,actual_authority_granted:false,
    promotion_eligible:false,mutation_retry_authorized:false};
}
export function createGithubRateAwareRead({token,fetchImpl=globalThis.fetch,binding,maxBytes=1048576,maxRetries=2,maxInlineWaitMs=55000,
  deadlineMs=120000,now=()=>Date.now(),wait=ms=>new Promise(r=>setTimeout(r,ms)),budget,onCheckpoint=()=>{}}){
  check(typeof token==='string'&&token.length>0&&Number.isSafeInteger(maxRetries)&&maxRetries>=0&&maxRetries<=3&&Number.isSafeInteger(maxInlineWaitMs)&&maxInlineWaitMs>=0&&maxInlineWaitMs<=55000
    &&Number.isSafeInteger(deadlineMs)&&deadlineMs>0&&deadlineMs<=1800000&&Number.isSafeInteger(maxBytes)&&maxBytes>0&&maxBytes<=1048576,'CONFIG');
  const rawNow=now;let lastTime=rawNow();
  check(Number.isSafeInteger(lastTime)&&lastTime>=0,'CLOCK');
  now=()=>{const value=rawNow();check(Number.isSafeInteger(value)&&value>=lastTime,'CLOCK_ROLLBACK');lastTime=value;return value;};
  budget??=pools.get(token);if(!budget){budget=createReadBudget({now,wait});pools.set(token,budget);}
  const started=now(),deadline=started+deadlineMs;
  const defer=async(route,diagnostic,resumeAt,attempts,reason)=>{
    const checkpoint=readResumeCheckpoint({binding,route,diagnostic,resumeAt,attempts,reason});await onCheckpoint(checkpoint);
    const error=Error('GITHUB_READ_DEFERRED');error.read_resume_checkpoint=checkpoint;throw error;
  };
  return async url=>{
    const target=new URL(url);check(target.origin==='https://api.github.com'&&!target.username&&!target.password&&!target.hash
      &&(target.pathname==='/repos/johnkim9524-collab/kaios_enterprise_repo'||target.pathname.startsWith('/repos/johnkim9524-collab/kaios_enterprise_repo/')),'ORIGIN');
    const route=target.pathname+target.search;
    for(let attempt=0;;attempt++){
      check(Number.isSafeInteger(now())&&now()>=started,'CLOCK_ROLLBACK');
      const blocked=budget.blockedUntil();
      if(blocked>now()){
        if(blocked-now()>maxInlineWaitMs||blocked>=deadline)return defer(route,null,blocked,attempt,'SHARED_BUDGET_RATE_WAIT');
        await wait(blocked-now());
      }
      if(now()>=deadline)return defer(route,null,now(),attempt,'INVOCATION_DEADLINE');
      let release;
      const operationBinding=budget.scope?{operation_id:randomBytes(32).toString('hex'),run_id:String(binding.run_id),run_attempt:binding.run_attempt,
        source_sha:binding.source_sha,route,method:'GET',issued_at:now()}:undefined;
      try{release=await (budget.acquireLease??budget.acquire)({deadline,binding:operationBinding});}catch(error){
        return defer(route,null,Number.isSafeInteger(error?.resume_at)?error.resume_at:now(),attempt,
          error?.resume_at?'SHARED_GITHUB_READ_BUDGET':'INVOCATION_CALL_BUDGET');}
      if(budget.blockedUntil()>now()){release();continue;}
      if(now()>=deadline){release();return defer(route,null,now(),attempt,'INVOCATION_DEADLINE');}
      let response,payload;
      try{
        response=await fetchImpl(target,{method:'GET',redirect:'error',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json',
          'X-GitHub-Api-Version':'2022-11-28','Cache-Control':'no-cache'},signal:AbortSignal.timeout(Math.max(1,Math.min(20000,deadline-now())))});
        check(!response.redirected,'REDIRECT');
        const reader=response.body?.getReader();check(reader,'BODY');const chunks=[];let total=0;
        try{for(;;){const {done,value}=await reader.read();check(now()<deadline,'BODY_DEADLINE');if(done)break;total+=value.byteLength;check(total<=maxBytes,'RESPONSE_BOUND');chunks.push(Buffer.from(value));}}
        catch(error){try{Promise.resolve(reader.cancel()).catch(()=>{});}catch{}throw error;}
        finally{reader.releaseLock();}
        check(now()<deadline,'BODY_DEADLINE');
        const bytes=Buffer.concat(chunks,total);
        try{payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{if(response.ok)throw Error('GITHUB_READ_INVALID_JSON');payload=null;}
      }finally{if(typeof release.finish==='function')await release.finish();release();}
      if(now()>=deadline)return defer(route,null,now(),attempt+1,'RESPONSE_POSTPROCESSING_DEADLINE');
      const diagnostic=githubHttpFailureDiagnostic({apiPath:route.replace(/^\/repos\/[^/]+\/[^/]+/,''),response,payload});
      if(response.ok){
        if(diagnostic.rate_remaining===0&&diagnostic.rate_reset_epoch!==null){const until=diagnostic.rate_reset_epoch*1000+1000;budget.blockUntil(until);if(budget.pauseUntil)await budget.pauseUntil(until);}
        return payload;
      }
      const throttled=[403,429].includes(response.status)&&['PRIMARY_RATE_LIMIT_EXHAUSTED','SECONDARY_RATE_LIMIT_REPORTED','HTTP_THROTTLED'].includes(diagnostic.classification);
      if(!throttled){const error=Error(`GITHUB_HTTP_${response.status}`);error.http_diagnostic=diagnostic;throw error;}
      if(diagnostic.rate_remaining===0&&(diagnostic.rate_reset_epoch===null||diagnostic.rate_reset_epoch*1000<=now()||diagnostic.rate_reset_epoch*1000-now()>86400000)){
        const error=Error('GITHUB_READ_INVALID_RATE_RESET');error.http_diagnostic=diagnostic;throw error;}
      const explicit=Math.max(diagnostic.retry_after_seconds===null?0:now()+diagnostic.retry_after_seconds*1000,
        diagnostic.rate_remaining===0&&diagnostic.rate_reset_epoch!==null?diagnostic.rate_reset_epoch*1000+1000:0);
      const backoff=explicit>now()?Math.min(55000,1000*2**attempt):Math.min(240000,60000*2**attempt);
      const resumeAt=Math.max(explicit,now()+backoff);budget.blockUntil(resumeAt);if(budget.pauseUntil)await budget.pauseUntil(resumeAt);
      if(attempt>=maxRetries||resumeAt-now()>maxInlineWaitMs||resumeAt>=deadline)
        return defer(route,diagnostic,resumeAt,attempt+1,'HTTP_RATE_LIMIT');
      await wait(resumeAt-now());
    }
  };
}
