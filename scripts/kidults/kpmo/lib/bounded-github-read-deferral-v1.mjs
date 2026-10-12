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
    'INVOCATION_CALL_BUDGET','INVOCATION_DEADLINE'].includes(checkpoint.reason),'REASON');
  const due=Date.parse(checkpoint.resume_at);
  check(Number.isFinite(due)&&new Date(due).toISOString()===checkpoint.resume_at&&due<=deadline,'DEADLINE');
  check(now()<=deadline,'DEADLINE');
  return due;
}

export async function readWithBoundedGithubDeferrals({route,read,expectedBinding,deadline,
  maxDeferrals=2,now=()=>Date.now(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),onDeferral=()=>{}}={}){
  check(typeof route==='string'&&/^(?:actions\/runs\/[1-9][0-9]{0,15}(?:\/artifacts\?per_page=100|\/attempts\/[1-9][0-9]{0,2}\/jobs\?per_page=100)?|actions\/artifacts\/[1-9][0-9]{0,15}(?:\/zip)?)$/.test(route),'ROUTE');
  check(typeof read==='function'&&typeof expectedBinding==='object'&&expectedBinding
    &&/^[1-9][0-9]{0,15}$/.test(String(expectedBinding.run_id))&&Number.isSafeInteger(expectedBinding.run_attempt)
    &&expectedBinding.run_attempt>=1&&expectedBinding.run_attempt<=100&&/^[a-f0-9]{40}$/.test(expectedBinding.source_sha)
    &&Number.isSafeInteger(deadline)&&Number.isSafeInteger(maxDeferrals)&&maxDeferrals>=0&&maxDeferrals<=2,'CONFIG');
  let deferrals=0;
  for(;;){
    check(now()<=deadline,'DEADLINE');
    try{return {value:await read(),deferrals};}
    catch(error){
      const checkpoint=error?.read_resume_checkpoint;
      if(!checkpoint||deferrals>=maxDeferrals)throw error;
      const due=validateDeferral({checkpoint,route,expectedBinding,now,deadline});
      onDeferral({index:deferrals+1,resume_at:checkpoint.resume_at,reason:checkpoint.reason});
      if(due>now())await wait(due-now());
      check(now()<=deadline,'DEADLINE');
      deferrals++;
    }
  }
}
