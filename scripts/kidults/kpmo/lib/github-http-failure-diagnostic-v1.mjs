// Diagnostic facts only. This module never issues, retries or authorizes a request.
const endpoints=[
  [/^\/actions\/runs\/[1-9][0-9]*$/, 'ACTION_RUN_READBACK'],
  [/^\/pulls\/[1-9][0-9]*$/, 'PULL_REQUEST'],
  [/^\/pulls\/[1-9][0-9]*\/files$/, 'PULL_REQUEST_FILES'],
  [/^\/issues\/[1-9][0-9]*\/comments$/, 'ISSUE_COMMENTS'],
  [/^\/issues\/[1-9][0-9]*\/timeline$/, 'ISSUE_TIMELINE'],
  [/^\/branches\/main$/, 'PROTECTED_MAIN'],
  [/^\/commits\/[a-f0-9]{40}\/check-runs$/, 'CHECK_RUNS'],
  [/^\/commits\/[a-f0-9]{40}\/status$/, 'COMMIT_STATUS'],
  [/^\/commits\/[a-f0-9]{40}$/, 'COMMIT'],
  [/^\/statuses\/[a-f0-9]{40}$/, 'PUBLISH_STATUS'],
  [/^\/rulesets(?:\/[1-9][0-9]*)?$/, 'RULESETS'],
];
const integer=(value,max)=>typeof value==='string'&&/^(0|[1-9][0-9]{0,11})$/.test(value)&&Number(value)<=max?Number(value):null;
export function githubHttpFailureDiagnostic({apiPath,method='GET',response,payload}){
  const get=name=>{try{return response.headers?.get(name)??null;}catch{return null;}};
  const remaining=integer(get('x-ratelimit-remaining'),10000000000);
  const reset=integer(get('x-ratelimit-reset'),253402300799);
  const retry=get('retry-after'),requestId=get('x-github-request-id'),resource=get('x-ratelimit-resource');
  const status=Number.isInteger(response.status)&&response.status>=100&&response.status<=599?response.status:null;
  let classification='HTTP_FAILURE_CAUSE_UNVERIFIED';
  if([403,429].includes(status)&&remaining===0)classification='PRIMARY_RATE_LIMIT_EXHAUSTED';
  else if([403,429].includes(status)&&typeof payload?.message==='string'&&payload.message.startsWith('You have exceeded a secondary rate limit.'))classification='SECONDARY_RATE_LIMIT_REPORTED';
  else if(status===403&&payload?.message==='Resource not accessible by integration')classification='INTEGRATION_ACCESS_DENIED_REPORTED';
  else if(status===429)classification='HTTP_THROTTLED';
  return {id:'kidults-github-http-failure-diagnostic-v1',version:'1.0.0',
    endpoint:endpoints.find(([pattern])=>pattern.test(String(apiPath).split('?')[0]))?.[1]??'OTHER_REPOSITORY_API',
    method:['GET','POST','PATCH','PUT','DELETE'].includes(method)?method:'UNKNOWN',http_status:status,classification,
    rate_limit:integer(get('x-ratelimit-limit'),10000000000),rate_remaining:remaining,
    rate_reset_epoch:reset,rate_reset_at:reset===null?null:new Date(reset*1000).toISOString(),
    rate_resource:['core','search','graphql','integration_manifest','code_search','actions_runner_registration'].includes(resource)?resource:null,
    retry_after_seconds:integer(retry,86400),
    request_id:typeof requestId==='string'&&requestId.length<=128&&/^[a-f0-9]{4}(?::[a-f0-9]+){3,4}$/i.test(requestId)?requestId:null,
    retry_authorized:false,actual_authority_granted:false,promotion_eligible:false};
}
export function githubHttpFailureError(input){
  const diagnostic=githubHttpFailureDiagnostic(input);
  const code=`DIRECT_OWNER_HANDOFF_GITHUB_API_${diagnostic.http_status??'UNKNOWN'}`;
  const error=new Error(code);error.code=code;error.http_diagnostic=diagnostic;return error;
}
