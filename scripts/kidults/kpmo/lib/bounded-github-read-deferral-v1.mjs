// Retries only a rate-aware GET checkpoint, within the current runner's
// absolute deadline. This is an in-process continuation, not workflow fanout.
const REPO='johnkim9524-collab/kaios_enterprise_repo';
const RESUME_ID='kidults-github-read-resume-checkpoint-v1';
const check=(ok,code)=>{if(!ok)throw Error(`BOUNDED_GITHUB_READ_${code}`);};

function validateDeferral({checkpoint,route,expectedBinding,now,deadline}){
  check(checkpoint?.id===RESUME_ID&&checkpoint.version==='1.0.0'
    &&checkpoint.state==='READ_DEFERRED_NOT_AUTHORITY','CHECKPOINT');
  const b=checkpoint.binding;
  check(b?.root_mission==='AUTONOMOUS_NORMAL_OPERATIONS_CLOSURE_MISSION'
    &&b.run_id===String(expectedBinding.run_id)&&b.run_attempt===expectedBinding.run_attempt
    &&b.source_sha===expectedBinding.source_sha,'BINDING');
  check(checkpoint.original_reservation_preserved===true&&checkpoint.reservation_write_performed===false
    &&checkpoint.producer_failure_claimed===false&&checkpoint.actual_authority_granted===false
    &&checkpoint.promotion_eligible===false&&checkpoint.mutation_retry_authorized===false,'SCOPE');
  check(checkpoint.unfinished_operation?.method==='GET'
    &&checkpoint.unfinished_operation.route===`/repos/${REPO}/${route}`,'ROUTE');
  check(['HTTP_RATE_LIMIT','SHARED_BUDGET_RATE_WAIT','SHARED_GITHUB_READ_BUDGET',
    'INVOCATION_CALL_BUDGET','INVOCATION_DEADLINE','TRANSIENT_NETWORK'].includes(checkpoint.reason),'REASON');
  const due=Date.parse(checkpoint.resume_at);
  check(Number.isFinite(due)&&new Date(due).toISOString()===checkpoint.resume_at&&due<=deadline,'DEADLINE');
  check(now()<deadline,'DEADLINE');
  return due;
}

export async function readWithBoundedGithubDeferrals({route,read,expectedBinding,deadline,
  maxDeferrals=2,now=()=>Date.now(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),onDeferral=()=>{}}={}){
  const routes=[
    /^actions\/runs\/[1-9][0-9]{0,15}$/,
    /^actions\/runs\/[1-9][0-9]{0,15}\/attempts\/(?:[1-9]|[1-9][0-9]|100)\/jobs\?per_page=100$/,
    /^actions\/runs\/[1-9][0-9]{0,15}\/artifacts\?per_page=100$/,
    /^actions\/artifacts\/[1-9][0-9]{0,15}(?:\/zip)?$/,
    /^pulls\/[1-9][0-9]{0,5}$/,
    /^branches\/main$/,
    /^git\/commits\/[a-f0-9]{40}$/,
    /^compare\/[a-f0-9]{40}\.\.\.[a-f0-9]{40}(?:\?per_page=1&page=2)?$/,
    /^actions\/workflows\/kidults-autonomous-(?:track|kpmo|independent-verification)-authorization-v1\.yml\/runs\?branch=main&event=repository_dispatch&status=(?:failure|cancelled|timed_out)&per_page=100&page=[1-9][0-9]{0,2}$/,
  ];
  const sentinel=/^actions\/workflows\/kpmo-continuous-assurance-sentinel-health-v1\.yml\/runs\?head_sha=([a-f0-9]{40})&created=([^&]+)&per_page=100&page=([1-9][0-9]{0,2})$/;
  let sentinelRange=null;
  if(typeof route==='string'){
    const match=sentinel.exec(route);
    if(match){
      let decoded='';try{decoded=decodeURIComponent(match[2]);}catch{decoded='';}
      const range=/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)\.\.(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)$/.exec(decoded);
      if(range){
        const start=Date.parse(range[1]),end=Date.parse(range[2]);
        if(match[1]===expectedBinding?.source_sha&&Number.isFinite(start)&&Number.isFinite(end)
          &&start<=end&&end-start<=24*60*60*1000&&end<=now())sentinelRange={start,end};
      }
    }
  }
  check(typeof route==='string'&&route.length<=512&&!route.includes('#')
    &&(routes.some(pattern=>pattern.test(route))||sentinelRange!==null),'ROUTE');
  check(typeof read==='function'&&typeof expectedBinding==='object'&&expectedBinding
    &&/^[1-9][0-9]{0,15}$/.test(String(expectedBinding.run_id))&&Number.isSafeInteger(expectedBinding.run_attempt)
    &&expectedBinding.run_attempt>=1&&expectedBinding.run_attempt<=100&&/^[a-f0-9]{40}$/.test(expectedBinding.source_sha)
    &&Number.isSafeInteger(deadline)&&Number.isSafeInteger(maxDeferrals)&&maxDeferrals>=0&&maxDeferrals<=2,'CONFIG');
  let deferrals=0;
  for(;;){
    check(now()<deadline,'DEADLINE');
    try{return {value:await read(),deferrals};}
    catch(error){
      const checkpoint=error?.read_resume_checkpoint;
      if(!checkpoint||deferrals>=maxDeferrals)throw error;
      const due=validateDeferral({checkpoint,route,expectedBinding,now,deadline});
      // A valid checkpoint clamped to the runner's exact end cannot be resumed
      // here, but the original deferred error carries the durable HOLD evidence.
      if(due>=deadline)throw error;
      onDeferral({index:deferrals+1,resume_at:checkpoint.resume_at,reason:checkpoint.reason});
      if(due>now())await wait(due-now());
      check(now()<deadline,'DEADLINE');
      deferrals++;
    }
  }
}
