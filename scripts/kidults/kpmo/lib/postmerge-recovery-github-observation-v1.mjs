// Authenticated, read-only GitHub observation component. No token broker,
// approval, dispatch, repository write, or complete evidence-chain claim.
import {POSTMERGE_RECOVERY_INCIDENT as I,validatePostmergeRecoveryRequest,validatePostmergeRecoveryObservation} from './autonomous-postmerge-recovery-v1.mjs';

const assert=(ok,code)=>{if(!ok)throw new Error(code);};
export function createRecoveryGitHubObservation({token,fetchImpl=globalThis.fetch,maxBytes=1048576,now=()=>Date.now()}){
  assert(typeof token==='string'&&token.length>0,'RECOVERY_GITHUB_TOKEN_REQUIRED');
  assert(typeof fetchImpl==='function'&&Number.isSafeInteger(maxBytes)&&maxBytes>0&&maxBytes<=1048576,'RECOVERY_GITHUB_CLIENT_CONFIG');
  const get=async route=>{
    // Routes below consist solely of fixed incident IDs and validated SHAs.
    const response=await fetchImpl(`https://api.github.com/repos/${I.repository}${route?`/${route}`:''}`,{
      method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{
        Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json',
        'X-GitHub-Api-Version':'2022-11-28','Cache-Control':'no-cache',
      },
    });
    assert(response.ok,`RECOVERY_GITHUB_HTTP_${response.status}`);
    assert(!response.redirected,'RECOVERY_GITHUB_REDIRECT');
    const size=response.headers.get('content-length');
    if(size!==null)assert(/^\d+$/.test(size)&&Number(size)<=maxBytes,'RECOVERY_GITHUB_RESPONSE_BOUND');
    const reader=response.body?.getReader();assert(reader,'RECOVERY_GITHUB_RESPONSE_BODY');
    const chunks=[];let total=0;
    try{
      for(;;){const {value,done}=await reader.read();if(done)break;
        total+=value.byteLength;assert(total<=maxBytes,'RECOVERY_GITHUB_RESPONSE_BOUND');chunks.push(Buffer.from(value));}
    }finally{await reader.cancel();}
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
    catch{throw new Error('RECOVERY_GITHUB_INVALID_JSON');}
  };
  const compare=async(base,head)=>{
    // Ancestry uses comparison metadata only. Page two omits first-page file
    // patches and bounds commit expansion without increasing the byte ceiling.
    const result=await get(`compare/${base}...${head}?per_page=1&page=2`);
    // GitHub's compare response has no head_sha field. Bind it to the exact
    // requested HTTPS route; main is read again after all observations.
    return {...result,head_sha:head};
  };
  const observe=async(request,reservation)=>{
    const consumed=reservation?.state==='CONSUMED';
    validatePostmergeRecoveryRequest(request,{now:now(),requireFresh:!consumed});
    const [repository,branch,original_run,pull_request,merge_commit]=await Promise.all([
      get(''),get('branches/main'),get(`actions/runs/${I.original_run_id}`),get(`pulls/${I.pull_request}`),get(`git/commits/${I.original_merge_sha}`),
    ]);
    assert(repository.full_name===I.repository&&String(repository.id)===I.repository_id,'RECOVERY_REPOSITORY');
    const main_sha=branch.commit?.sha;
    assert(typeof main_sha==='string'&&/^[0-9a-f]{40}$/.test(main_sha)&&branch.name==='main'&&branch.protected===true,'RECOVERY_MAIN_IDENTITY');
    assert(original_run.repository?.full_name===I.repository&&String(original_run.repository?.id)===I.repository_id,'RECOVERY_ORIGINAL_RUN_REPOSITORY');
    assert(pull_request.base?.repo?.full_name===I.repository&&String(pull_request.base?.repo?.id)===I.repository_id
      &&pull_request.head?.repo?.full_name===I.repository&&String(pull_request.head?.repo?.id)===I.repository_id,'RECOVERY_PR_REPOSITORY');
    const original_merge_to_main=await compare(I.original_merge_sha,main_sha);
    const recovery_source_to_main=consumed&&main_sha!==request.source_sha?await compare(request.source_sha,main_sha):undefined;
    const reread=await get('branches/main');
    assert(reread.name==='main'&&reread.protected===true&&reread.commit?.sha===main_sha,'RECOVERY_MAIN_CHANGED_DURING_OBSERVATION');
    const observed={repository:repository.full_name,repository_id:String(repository.id),main_sha,
      original_run,pull_request,merge_commit,original_merge_to_main,reservation,
      ...(recovery_source_to_main?{recovery_source_to_main}:{})};
    validatePostmergeRecoveryObservation(observed,request,{consumed});
    return observed;
  };
  return {observe};
}
