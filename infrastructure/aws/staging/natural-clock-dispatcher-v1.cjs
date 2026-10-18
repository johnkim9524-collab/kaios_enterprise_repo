'use strict';
// Read-resume delivery is allowlisted only with exact-main and immutable-receipt checks.

const {createHash, createSign, randomBytes} = require('node:crypto');

const deny = code => { throw new Error(`NATURAL_CLOCK_${code}`); };
const b64url = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const canonical = value => Array.isArray(value)?`[${value.map(canonical).join(',')}]`
  :value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
const validSlot = value => ['POOLING','P0B','RESERVE','SENTINEL','ASSURANCE','READ_RESUME'].includes(value);
const validResume = event => {
  const binding=event?.resume_binding;
  const exactBinding=binding&&Object.keys(binding).sort().join(',')==='artifact_digest,artifact_id,producer_conclusion,producer_event,run_attempt,run_id,source_sha';
  const checkpointList=Array.isArray(event.checkpoint_digests)&&event.checkpoint_digests.length>=1&&event.checkpoint_digests.length<=8
    &&event.checkpoint_digests.every(value=>/^[a-f0-9]{64}$/.test(value))
    &&new Set(event.checkpoint_digests).size===event.checkpoint_digests.length
    &&event.checkpoint_digests.join(',')===[...event.checkpoint_digests].sort().join(',');
  const resumeAt=Date.parse(event.resume_at);
  const scheduleDigest=binding&&checkpointList&&Number.isFinite(resumeAt)
    ?createHash('sha256').update(canonical({repo:'johnkim9524-collab/kaios_enterprise_repo',binding,
      checkpoint_digests:event.checkpoint_digests,scheduled_at:resumeAt})).digest('hex'):'';
  return event?.slot==='READ_RESUME'&&Object.keys(event).sort().join(',')==='checkpoint_digests,resume_at,resume_binding,schedule_id,slot,source'
    &&exactBinding
    &&binding&&/^[1-9][0-9]{0,19}$/.test(String(binding.run_id))&&Number.isSafeInteger(binding.run_attempt)
    &&binding.run_attempt>=1&&binding.run_attempt<=100&&/^[a-f0-9]{40}$/.test(binding.source_sha||'')
    &&Number.isSafeInteger(binding.artifact_id)&&binding.artifact_id>0&&/^sha256:[a-f0-9]{64}$/.test(binding.artifact_digest||'')
    &&['push','workflow_run','repository_dispatch'].includes(binding.producer_event)
    &&['failure','success'].includes(binding.producer_conclusion)&&Array.isArray(event.checkpoint_digests)
    &&event.checkpoint_digests.length>=1&&event.checkpoint_digests.length<=8
    &&event.checkpoint_digests.every(value=>/^[a-f0-9]{64}$/.test(value))
    &&new Set(event.checkpoint_digests).size===event.checkpoint_digests.length
    &&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(event.resume_at||'')
    &&Number.isFinite(resumeAt)&&/^kidults-read-resume-[a-f0-9]{40}$/.test(event.schedule_id)
    &&event.schedule_id===`kidults-read-resume-${scheduleDigest.slice(0,40)}`;
};

function createHandler({getPrivateKey, request, putOnce, getLedger, markDispatchState, claimRejectedRetry,
  config, now=()=>Date.now(), nonce=()=>randomBytes(24).toString('base64url')}) {
  return async event => {
    const slot=event?.slot;
    const resume=slot==='READ_RESUME';
    if (event?.source!=='aws.scheduler' || !validSlot(slot)
      || (resume?!validResume(event):Object.keys(event).sort().join(',')!=='slot,source')) deny('EVENT_DENIED');
    let issuedAt=new Date(now()).toISOString();
    const key=await getPrivateKey();
    if(typeof key!=='string'||!/-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(key)) deny('KEY_INVALID');
    const issued=Math.floor(now()/1000);
    const unsigned=`${b64url({alg:'RS256',typ:'JWT'})}.${b64url({iat:issued-30,exp:issued+540,iss:String(config.appId)})}`;
    const signer=createSign('RSA-SHA256'); signer.update(unsigned); signer.end();
    const jwt=`${unsigned}.${signer.sign(key).toString('base64url')}`;
    const call=async (url, options={}) => {
      const {require204=false,...requestOptions}=options;
      const response=await request(url,{...requestOptions,redirect:'error',headers:{Accept:'application/vnd.github+json',
        Authorization:`Bearer ${options.bearer||jwt}`,'X-GitHub-Api-Version':'2022-11-28',
        'User-Agent':'kidults-natural-clock-dispatcher-v1',...(options.headers||{})}});
      if(require204&&response.status!==204)deny(`DISPATCH_HTTP_${response.status}`);
      if(!response.ok) deny(`GITHUB_${response.status}`);
      return response.status===204 ? null : response.json();
    };
    const installation=await call(`https://api.github.com/app/installations/${config.installationId}/access_tokens`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({repository_ids:[Number(config.repositoryId)],permissions:{contents:'write'}})});
    if(typeof installation?.token!=='string'||installation.token.length<20||installation.repository_selection!=='selected'
      || installation.repositories?.length!==1||Number(installation.repositories[0]?.id)!==Number(config.repositoryId)
      || installation.permissions?.contents!=='write'||Object.keys(installation.permissions||{}).some(x=>!['contents','metadata'].includes(x))) deny('TOKEN_SCOPE_INVALID');
    const repository=await call(`https://api.github.com/repos/${config.repository}`,{bearer:installation.token});
    if(String(repository?.id)!==String(config.repositoryId)||repository?.full_name!==config.repository||repository?.default_branch!=='main') deny('REPOSITORY_INVALID');
    const branch=await call(`https://api.github.com/repos/${config.repository}/branches/main`,{bearer:installation.token});
    let exactMainSha=branch?.commit?.sha;
    if(typeof exactMainSha!=='string'||!/^[0-9a-f]{40}$/.test(exactMainSha)||branch?.protected!==true) deny('MAIN_INVALID');
    const nonceValue=resume?null:nonce();
    if(!resume&&(typeof nonceValue!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(nonceValue))) deny('NONCE_INVALID');
    const dispatchId=resume?event.schedule_id:`kidults-natural-clock-v1:${slot}:${exactMainSha}:${nonceValue}`;
    const makePayload=()=>resume?{dispatch_id:dispatchId,exact_main_sha:exactMainSha,issued_at:issuedAt,slot,
      source:'AWS_EVENTBRIDGE_SCHEDULER',resume_binding:event.resume_binding,checkpoint_digests:event.checkpoint_digests,
      resume_at:event.resume_at,schedule_id:event.schedule_id}
      :{dispatch_id:dispatchId,exact_main_sha:exactMainSha,issued_at:issuedAt,nonce:nonceValue,slot,source:'AWS_EVENTBRIDGE_SCHEDULER'};
    let payload=makePayload();
    let digest=`sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
    try{await putOnce({dispatchId,slot,exactMainSha,issuedAt,digest,expiresAt:Math.floor(now()/1000)+86400});}
    catch(error){
      if(!resume||error?.name!=='ConditionalCheckFailedException'||typeof getLedger!=='function')throw error;
      const existing=await getLedger(dispatchId);
      if(existing?.receipt_digest!==digest){
        if(!existing?.exact_main_sha||!/^[a-f0-9]{40}$/.test(existing.exact_main_sha)||!existing?.issued_at)deny('REPLAY_BINDING');
        exactMainSha=existing.exact_main_sha;issuedAt=existing.issued_at;payload=makePayload();
        digest=`sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
        if(existing.receipt_digest!==digest)deny('REPLAY_BINDING');
      }
      // A confirmed, pending, or ambiguous delivery is never replayed. Only
      // a recorded definitive GitHub rejection can claim one serialized retry.
      if(existing?.dispatch_state!=='DEFINITIVELY_REJECTED'||typeof claimRejectedRetry!=='function')
        return {ok:false,state:'VERIFIED_HOLD_DUPLICATE_NOT_REDISPATCHED',exact_main_sha:exactMainSha,slot};
      try{await claimRejectedRetry({dispatchId,digest});}
      catch(error){if(error?.name==='ConditionalCheckFailedException')
        return {ok:false,state:'VERIFIED_HOLD_DUPLICATE_NOT_REDISPATCHED',exact_main_sha:exactMainSha,slot};throw error;}
    }
    try{
      await call(`https://api.github.com/repos/${config.repository}/dispatches`,{bearer:installation.token,method:'POST',require204:true,
        headers:{'Content-Type':'application/json'},body:JSON.stringify({event_type:resume?'kidults.github.read.resume.v1':`kidults.natural.clock.${slot.toLowerCase()}.v1`,client_payload:payload})});
      await markDispatchState?.({dispatchId,digest,state:'ACCEPTED'});
    }catch(error){
      const rejected=/NATURAL_CLOCK_DISPATCH_HTTP_4\d\d$/.test(error?.message||'');
      try{await markDispatchState?.({dispatchId,digest,state:rejected?'DEFINITIVELY_REJECTED':'OUTCOME_UNKNOWN'});}catch{}
      throw error;
    }
    return {ok:true,state:resume?'VERIFIED_READ_RESUME_DISPATCHED':'VERIFIED_DISPATCHED',dispatch_id:dispatchId,
      exact_main_sha:exactMainSha,slot,receipt_digest:digest};
  };
}

exports.createHandler=createHandler;
exports.handler=async event => {
  const {SecretsManagerClient,GetSecretValueCommand}=require('@aws-sdk/client-secrets-manager');
  const {DynamoDBClient,PutItemCommand,GetItemCommand,UpdateItemCommand}=require('@aws-sdk/client-dynamodb');
  const secrets=new SecretsManagerClient({});
  const dynamo=new DynamoDBClient({});
  return createHandler({
    getPrivateKey:async()=> (await secrets.send(new GetSecretValueCommand({SecretId:process.env.GITHUB_APP_PRIVATE_KEY_SECRET_ARN}))).SecretString,
    request:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(10000)}),
    putOnce:async item=>dynamo.send(new PutItemCommand({TableName:process.env.NATURAL_CLOCK_LEDGER_TABLE,
      Item:{dispatch_id:{S:item.dispatchId},slot:{S:item.slot},exact_main_sha:{S:item.exactMainSha},issued_at:{S:item.issuedAt},receipt_digest:{S:item.digest},dispatch_state:{S:'PENDING'},expires_at:{N:String(item.expiresAt)}},
      ConditionExpression:'attribute_not_exists(dispatch_id)'})),
    getLedger:async dispatchId=>{const out=await dynamo.send(new GetItemCommand({TableName:process.env.NATURAL_CLOCK_LEDGER_TABLE,
      Key:{dispatch_id:{S:dispatchId}},ConsistentRead:true}));return out.Item?{receipt_digest:out.Item.receipt_digest?.S,
        dispatch_state:out.Item.dispatch_state?.S,
        exact_main_sha:out.Item.exact_main_sha?.S,issued_at:out.Item.issued_at?.S}:null;},
    markDispatchState:async ({dispatchId,digest,state})=>dynamo.send(new UpdateItemCommand({
      TableName:process.env.NATURAL_CLOCK_LEDGER_TABLE,Key:{dispatch_id:{S:dispatchId}},
      UpdateExpression:'SET dispatch_state = :state',ConditionExpression:'receipt_digest = :digest AND dispatch_state = :pending',
      ExpressionAttributeValues:{':state':{S:state},':digest':{S:digest},':pending':{S:'PENDING'}}})),
    claimRejectedRetry:async ({dispatchId,digest})=>dynamo.send(new UpdateItemCommand({
      TableName:process.env.NATURAL_CLOCK_LEDGER_TABLE,Key:{dispatch_id:{S:dispatchId}},
      UpdateExpression:'SET dispatch_state = :pending ADD rejected_retry_count :one',
      ConditionExpression:'receipt_digest = :digest AND dispatch_state = :rejected AND (attribute_not_exists(rejected_retry_count) OR rejected_retry_count < :max)',
      ExpressionAttributeValues:{':pending':{S:'PENDING'},':rejected':{S:'DEFINITIVELY_REJECTED'},':digest':{S:digest},':one':{N:'1'},':max':{N:'2'}}})),
    config:{repository:process.env.GITHUB_REPOSITORY,repositoryId:process.env.GITHUB_REPOSITORY_ID,
      appId:process.env.GITHUB_APP_ID,installationId:process.env.GITHUB_APP_INSTALLATION_ID},
  })(event);
};
