'use strict';
const {createSign} = require('node:crypto');

const fail = code => { throw new Error(`EVENT_TOKEN_BROKER_DENIED:${code || 'UNCLASSIFIED'}`); };
const sha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const b64url = value => Buffer.from(JSON.stringify(value)).toString('base64url');

function createHandler({getPrivateKey, request, config, now = () => Date.now(), includeReadToken=false, readOnly=false}) {
  return async event => {
    if (Object.hasOwn(event || {}, 'allow_draft_recovery')) fail('INPUT');
    const {repository, repository_id, pull_request, base_sha, head_sha, current_main_sha, authorization_generation,
      permission_profile='AUTONOMOUS_EVENT_DISPATCH'} = event || {};
    const supportedProfiles=new Set(['AUTONOMOUS_EVENT_DISPATCH','AUTONOMOUS_STALE_BASE_CONVERGENCE','AUTONOMOUS_REDUNDANT_PR_HYGIENE']);
    if (event?.action !== 'MINT_INSTALLATION_TOKEN'
      || repository !== config.repository || String(repository_id) !== String(config.repositoryId)
      || !Number.isSafeInteger(Number(pull_request)) || Number(pull_request) < 1
      || !sha(base_sha) || !sha(head_sha) || base_sha === head_sha
      || !supportedProfiles.has(permission_profile)
      || (permission_profile!=='AUTONOMOUS_EVENT_DISPATCH' && !sha(current_main_sha))
      || (permission_profile==='AUTONOMOUS_STALE_BASE_CONVERGENCE' && current_main_sha===base_sha)
      || typeof authorization_generation !== 'string'
      || !/^[A-Za-z0-9_.:-]{12,160}$/.test(authorization_generation)) fail('INPUT');
    const issued = Math.floor(now()/1000);
    const key = await getPrivateKey();
    if (typeof key !== 'string' || !/-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(key)) fail('PRIVATE_KEY');
    const unsigned = `${b64url({alg:'RS256',typ:'JWT'})}.${b64url({iat:issued-30,exp:issued+540,iss:String(config.appId)})}`;
    const signer=createSign('RSA-SHA256'); signer.update(unsigned); signer.end();
    const jwt=`${unsigned}.${signer.sign(key).toString('base64url')}`;
    const api = async (endpoint, bearer, options={}, failureCode='GITHUB_API_HTTP') => {
      const response=await request(`https://api.github.com${endpoint}`,{
        ...options,redirect:'error',headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${bearer}`,
          'X-GitHub-Api-Version':'2022-11-28','User-Agent':'kidults-autonomous-event-broker-v1',...(options.headers||{})},
      });
      if (!response.ok) fail(failureCode);
      return response.json();
    };
    const mint = (permissions, phase) => api(`/app/installations/${config.installationId}/access_tokens`,jwt,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({repository_ids:[Number(config.repositoryId)],permissions}),
    },`MINT_${phase}_HTTP`);
    const validScope = (minted, permissions) => typeof minted.token==='string' && minted.token.length>=20
      && Number.isFinite(Date.parse(minted.expires_at)) && Date.parse(minted.expires_at)>=now()+15*60*1000 && Date.parse(minted.expires_at)<=now()+3660000
      && ((permissions.contents===undefined && minted.permissions?.contents===undefined) || minted.permissions?.contents===permissions.contents)
      && minted.permissions?.pull_requests===permissions.pull_requests
      && minted.permissions?.workflows===permissions.workflows
      && [undefined,'read'].includes(minted.permissions?.metadata)
      && Object.keys(minted.permissions).every(x=>['contents','pull_requests','metadata',...(permissions.workflows ? ['workflows'] : [])].includes(x))
      && minted.repository_selection==='selected' && minted.repositories?.length===1
      && Number(minted.repositories[0]?.id)===Number(config.repositoryId)
      && minted.repositories[0]?.full_name===repository;
    const readPermissions={contents:'read',pull_requests:'read'};
    const readonly=await mint(readPermissions,'READ');
    if (!validScope(readonly,readPermissions)) fail('READ_SCOPE');
    if(readOnly)return {ok:true,token:readonly.token};
    const [pr,main]=await Promise.all([
      api(`/repos/${repository}/pulls/${pull_request}`,readonly.token,{},'PR_READ_HTTP'),
      api(`/repos/${repository}/branches/main`,readonly.token,{},'MAIN_READ_HTTP'),
    ]);
    const expectedMain=permission_profile==='AUTONOMOUS_EVENT_DISPATCH'?base_sha:current_main_sha;
    if (pr.number!==Number(pull_request) || pr.state!=='open'
      || pr.merged===true || pr.head?.sha!==head_sha || pr.base?.sha!==base_sha
      || pr.base?.ref!=='main' || pr.head?.repo?.full_name!==repository
      || pr.base?.repo?.full_name!==repository || main.commit?.sha!==expectedMain) fail('LIVE_TUPLE');
    if (permission_profile==='AUTONOMOUS_REDUNDANT_PR_HYGIENE' && base_sha===current_main_sha) {
      const [headCommit,mainCommit]=await Promise.all([
        api(`/repos/${repository}/git/commits/${head_sha}`,readonly.token,{},'HYGIENE_HEAD_READ_HTTP'),
        api(`/repos/${repository}/git/commits/${current_main_sha}`,readonly.token,{},'HYGIENE_MAIN_READ_HTTP'),
      ]);
      if(headCommit?.sha!==head_sha || mainCommit?.sha!==current_main_sha
        || !sha(headCommit?.tree?.sha) || headCommit.tree.sha!==mainCommit?.tree?.sha)
        fail('HYGIENE_TREE');
    }
    // GitHub App update-branch requires contents:write on the head repository.
    // Hygiene closes PR metadata only and must retain its narrower scope.
    const needsContentsWrite=permission_profile==='AUTONOMOUS_EVENT_DISPATCH'
      || permission_profile==='AUTONOMOUS_STALE_BASE_CONVERGENCE';
    const writePermissions=needsContentsWrite
      ? {contents:'write',pull_requests:'write'}
      : {pull_requests:'write'};
    // Updating a PR branch can import workflow files from protected main even
    // when the PR's own changed-path list contains no workflow. This permission
    // belongs only to exact-tuple stale convergence, never dispatch or hygiene.
    if (permission_profile==='AUTONOMOUS_STALE_BASE_CONVERGENCE') writePermissions.workflows='write';
    const minted=await mint(writePermissions,'WRITE');
    if (!validScope(minted,writePermissions)) fail('WRITE_SCOPE');
    const grantedPermissions=needsContentsWrite
      ? ['contents:write','pull_requests:write','metadata:read']
      : ['pull_requests:write','metadata:read'];
    if (writePermissions.workflows) grantedPermissions.push('workflows:write');
    return {ok:true,token_type:'GITHUB_APP_INSTALLATION',repository,repository_id:String(repository_id),
      app_id:String(config.appId),installation_id:String(config.installationId),permission_profile,
      permissions:grantedPermissions,
      expires_at:minted.expires_at,token:minted.token,...(includeReadToken?{read_token:readonly.token}:{})};
  };
}

exports.createHandler=createHandler;
exports.assertPublicMintBoundary=event=>{
  if(event?.action==='MINT_INSTALLATION_TOKEN'&&((event.permission_profile&&event.permission_profile!=='AUTONOMOUS_EVENT_DISPATCH')||typeof event.caller_oidc_token!=='string'))fail('LIFECYCLE_LEDGER_REQUIRED');
};
exports.handler=async (event,context) => {
  exports.assertPublicMintBoundary(event);
  const request=(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(10000)});
  const {SecretsManagerClient,GetSecretValueCommand}=require('@aws-sdk/client-secrets-manager');
  const client=new SecretsManagerClient({region:process.env.AWS_REGION});
  const getPrivateKey=async () => {
    const value=await client.send(new GetSecretValueCommand({SecretId:process.env.GITHUB_APP_PRIVATE_KEY_SECRET_ARN}));
    return value.SecretString;
  };
  const identityConfig={repository:process.env.GITHUB_REPOSITORY,repositoryId:process.env.GITHUB_REPOSITORY_ID,
    appId:process.env.GITHUB_APP_ID,installationId:process.env.GITHUB_APP_INSTALLATION_ID};
  if(['MINT_INSTALLATION_TOKEN','OBSERVE_LIFECYCLE_CUTOVER','RESUME_AUTHORIZATION_DISPATCH','RESUME_LIFECYCLE_OPERATION'].includes(event?.action)){
    const name='scripts/kidults/staging-operations/lib/broker-caller-identity-v1.mjs';
    const identity=typeof __resumeLoad==='function'?await __resumeLoad(name):await import(`../../../${name}`);
    // Only a signature- and claim-validated identity reaches this read-only
    // callback. Native run reads use the existing narrow App read scope.
    const candidate=event.envelope||event.binding||event;
    const nativeRequest=async(url,options)=>{
      const reader=createHandler({getPrivateKey,request,config:identityConfig,readOnly:true});
      const read=await reader({action:'MINT_INSTALLATION_TOKEN',repository:identityConfig.repository,repository_id:identityConfig.repositoryId,
        pull_request:candidate.pull_request,base_sha:candidate.base_sha||candidate.old_base_sha,head_sha:candidate.head_sha||candidate.expected_head_sha,
        authorization_generation:'broker-native-identity-read'});
      return request(url,{...options,headers:{...options.headers,Authorization:`Bearer ${read.token}`,'X-GitHub-Api-Version':'2022-11-28'}});
    };
    await identity.verifyBrokerCallerIdentity({token:event.caller_oidc_token,repository:process.env.GITHUB_REPOSITORY,
      repositoryId:process.env.GITHUB_REPOSITORY_ID,sourceSha:event.base_sha||event.envelope?.base_sha||event.binding?.current_main_sha,
      callerClass:['MINT_INSTALLATION_TOKEN','OBSERVE_LIFECYCLE_CUTOVER'].includes(event.action)?'FINALIZER':'DISPATCHER',runId:event.run_id,request,nativeRequest});
    const {caller_oidc_token,...operationEvent}=event;event=operationEvent;
  }
  if(['RESUME_AUTHORIZATION_DISPATCH','RESUME_LIFECYCLE_OPERATION','MINT_INSTALLATION_TOKEN','OBSERVE_LIFECYCLE_CUTOVER'].includes(event?.action)) {
    const modulePath=event.action==='RESUME_AUTHORIZATION_DISPATCH'?'scripts/kidults/staging-operations/lib/broker-resume-dispatch-v1.mjs':'scripts/kidults/staging-operations/lib/broker-resume-lifecycle-v1.mjs';
    const load=typeof __resumeLoad==='function' ? __resumeLoad : async name => import(`../../../${name}`);
    const loaded=await load(modulePath);
    const resume=event.action==='RESUME_AUTHORIZATION_DISPATCH'?loaded.brokerResumeDispatchWithCutover:event.action==='MINT_INSTALLATION_TOKEN'?loaded.brokerMintFinalizer:event.action==='OBSERVE_LIFECYCLE_CUTOVER'?loaded.observeLifecycleCutover:loaded.brokerResumeLifecycle;
    const {DynamoDBClient}=require('@aws-sdk/client-dynamodb');
    const {DynamoDBDocumentClient,GetCommand,PutCommand,UpdateCommand}=require('@aws-sdk/lib-dynamodb');
    const db=DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION,maxAttempts:1}));
    const commands={Get:GetCommand,Put:PutCommand,Update:UpdateCommand};
    const config={repository:process.env.GITHUB_REPOSITORY,repositoryId:process.env.GITHUB_REPOSITORY_ID,
      appId:process.env.GITHUB_APP_ID,installationId:process.env.GITHUB_APP_INSTALLATION_ID,
      operationTable:process.env.RESUME_OPERATION_TABLE,activationRunFloor:process.env.RESUME_ACTIVATION_RUN_FLOOR};
    return resume({event,config,getPrivateKey,request,owner:context?.awsRequestId,
      ledgerRequest:(operation,params)=>db.send(new commands[operation](params)),
      mint:createHandler({getPrivateKey,request,config,includeReadToken:event.action==='RESUME_LIFECYCLE_OPERATION'})});
  }
  return createHandler({getPrivateKey,config:{repository:process.env.GITHUB_REPOSITORY,
    repositoryId:process.env.GITHUB_REPOSITORY_ID,appId:process.env.GITHUB_APP_ID,
    installationId:process.env.GITHUB_APP_INSTALLATION_ID},
    request:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(10000)})})(event);
};
