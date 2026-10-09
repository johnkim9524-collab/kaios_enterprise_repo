'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {generateKeyPairSync}=require('node:crypto');
const fs=require('node:fs');
const {createHandler}=require('../../../infrastructure/aws/staging/autonomous-event-token-broker-v1.cjs');
const privateKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
const base='a'.repeat(40),head='b'.repeat(40),repo='johnkim9524-collab/kaios_enterprise_repo';
const event={action:'MINT_INSTALLATION_TOKEN',repository:repo,repository_id:'123',pull_request:42,
  base_sha:base,head_sha:head,authorization_generation:'generation-00001'};
const config={repository:repo,repositoryId:'123',appId:'55',installationId:'66'};
test('template embeds reviewed source and limits secret and invoke scopes',async()=>{
  const template=JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-event-token-broker-v1.json'));
  const {buildBrokerCode}=await import('../../../scripts/governance/build-resume-broker-template-v1.mjs');
  assert.equal(template.Resources.BrokerFunction.Properties.Code.ZipFile,buildBrokerCode());
  const secret=template.Resources.BrokerRole.Properties.Policies[0].PolicyDocument.Statement;
  assert.deepEqual(secret,[{Effect:'Allow',Action:['secretsmanager:GetSecretValue'],Resource:{Ref:'GitHubPrivateKeySecretArn'}}]);
  const invoker=template.Resources.EventBrokerInvokerRole.Properties;
  const invoke=invoker.Policies[0].PolicyDocument.Statement;
  assert.deepEqual(invoke,[{Effect:'Allow',Action:['lambda:InvokeFunction'],Resource:{'Fn::GetAtt':['BrokerFunction','Arn']}}]);
  const subjects=invoker.AssumeRolePolicyDocument.Statement[0].Condition.StringEquals['token.actions.githubusercontent.com:sub'];
  assert.equal(subjects.length,4);
  assert.equal(subjects.some(x=>JSON.stringify(x).includes('DispatcherWorkflowRef')),true);
  assert.equal(subjects.some(x=>JSON.stringify(x).includes('CanaryWorkflowRef')),false);
  assert.equal(JSON.stringify(template).includes('FinalizerBrokerInvoke'),false);
});
const stamp=Date.parse('2026-09-24T00:00:00Z');
function setup({prHead=head, prBase=base, mainBase=base, draft=false, permission='write', readPermission='read',
  permissionProfile='AUTONOMOUS_EVENT_DISPATCH', workflowPermission='write', extraPermissions={},
  repositories=[{id:123,full_name:repo}]}={}) {
  const calls=[];
  const request=async (url,options) => {
    calls.push({url,method:options.method||'GET',permissions:options.body&&JSON.parse(options.body).permissions});
    let value;
    if(url.endsWith('/access_tokens')) {
      const body=JSON.parse(options.body);
      assert.deepEqual(body.repository_ids,[123]);
      assert.deepEqual(body.permissions,
        calls.filter(x=>x.url.endsWith('/access_tokens')).length===1
          ? {contents:'read',pull_requests:'read'}
          : permissionProfile==='AUTONOMOUS_STALE_BASE_CONVERGENCE'
            ? {contents:'write',pull_requests:'write',workflows:'write'}
          : permissionProfile==='AUTONOMOUS_EVENT_DISPATCH'
            ? {contents:'write',pull_requests:'write'}
            : {pull_requests:'write'});
      value={token:'installation-token-1234567890',expires_at:new Date(stamp+3600000).toISOString(),
        permissions:{...(Object.hasOwn(body.permissions,'contents')
          ? {contents:body.permissions.contents==='read'?readPermission:permission}
          : {}),pull_requests:body.permissions.pull_requests,
          ...(body.permissions.workflows ? {workflows:workflowPermission} : {}),...extraPermissions},
        repository_selection:'selected',repositories};
    } else if(url.endsWith('/pulls/42')) value={number:42,state:'open',draft,merged:false,
      head:{sha:prHead,repo:{full_name:repo}},base:{ref:'main',sha:prBase,repo:{full_name:repo}}};
    else if(url.endsWith('/branches/main')) value={commit:{sha:mainBase}};
    else throw Error('unexpected request');
    return {ok:true,json:async()=>value};
  };
  return {calls,handler:createHandler({config,request,getPrivateKey:async()=>privateKey,now:()=>stamp})};
}
test('mints one repository scoped token after exact live tuple',async()=>{
  const {handler,calls}=setup(); const result=await handler(event);
  assert.equal(result.ok,true);assert.equal(result.token_type,'GITHUB_APP_INSTALLATION');
  assert.equal(result.permission_profile,'AUTONOMOUS_EVENT_DISPATCH');
  assert.deepEqual(calls.map(x=>x.url.split('/').slice(-2).join('/')),
    ['66/access_tokens','pulls/42','branches/main','66/access_tokens']);
});
test('mints exact stale-base convergence token with contents and workflow write scope',async()=>{
  const current='c'.repeat(40);
  const permissionProfile='AUTONOMOUS_STALE_BASE_CONVERGENCE';
  const {handler,calls}=setup({prBase:base,mainBase:current,permissionProfile});
  const result=await handler({...event,current_main_sha:current,permission_profile:permissionProfile});
  assert.equal(result.permission_profile,permissionProfile);
  assert.deepEqual(result.permissions,['contents:write','pull_requests:write','metadata:read','workflows:write']);
  const contract=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/stale-convergence-permission-contract-v1.json'));
  assert.deepEqual([...result.permissions].sort(),[...contract.permissions].sort());
  assert.equal(contract.permission_expansion_activation,'EXPLICIT_OWNER_ACTION_TIME_CONFIRMATION_REQUIRED');
  assert.deepEqual(calls.filter(x=>x.url.endsWith('/access_tokens')).at(-1).permissions,{contents:'write',pull_requests:'write',workflows:'write'});
});
test('mints exact redundant-PR hygiene token with pull-request-only write scope',async()=>{
  const current='c'.repeat(40);
  const permissionProfile='AUTONOMOUS_REDUNDANT_PR_HYGIENE';
  const {handler,calls}=setup({prBase:base,mainBase:current,permissionProfile});
  const result=await handler({...event,current_main_sha:current,permission_profile:permissionProfile});
  assert.equal(result.permission_profile,permissionProfile);
  assert.deepEqual(result.permissions,['pull_requests:write','metadata:read']);
  assert.deepEqual(calls.filter(x=>x.url.endsWith('/access_tokens')).at(-1).permissions,{pull_requests:'write'});
});
test('stale profiles fail closed when current main is absent or equals old base',async()=>{
  const {handler,calls}=setup();
  await assert.rejects(handler({...event,permission_profile:'AUTONOMOUS_STALE_BASE_CONVERGENCE'}),/DENIED/);
  await assert.rejects(handler({...event,current_main_sha:base,permission_profile:'AUTONOMOUS_REDUNDANT_PR_HYGIENE'}),/DENIED/);
  assert.equal(calls.length,0);
});
test('allows exact open Draft for internal event dispatch without lifecycle authority',async()=>{
  const {handler}=setup({draft:true});
  const result=await handler(event);
  assert.equal(result.ok,true);
  assert.deepEqual(result.permissions,['contents:write','pull_requests:write','metadata:read']);
});
test('retired draft-ready permission profile is rejected before requesting any token',async()=>{
  const {handler,calls}=setup({draft:true});
  await assert.rejects(handler({...event,permission_profile:'DRAFT_READY_TRANSITION'}),/DENIED/);
  assert.equal(calls.length,0);
});
test('retired draft recovery declaration is rejected before requesting any token',async()=>{
  const {handler,calls}=setup({draft:true});
  await assert.rejects(handler({...event,allow_draft_recovery:true}),/DENIED/);
  assert.equal(calls.length,0);
});
test('rejects wrong repository before mint',async()=>{
  const {handler,calls}=setup();await assert.rejects(handler({...event,repository_id:'999'}),/DENIED/);
  assert.equal(calls.length,0);
});
for(const [name,variation,reason] of [['head drift',{prHead:'c'.repeat(40)},'LIVE_TUPLE'],['main drift',{mainBase:'c'.repeat(40)},'LIVE_TUPLE'],
  ['base drift',{prBase:'c'.repeat(40)},'LIVE_TUPLE'],
  ['read permission downgrade',{readPermission:'none'},'READ_SCOPE'],
  ['broader repository scope',{repositories:[{id:123,full_name:repo},{id:456}]},'READ_SCOPE']]) {
  test(`rejects ${name} without minting write token`,async()=>{
    const {handler,calls}=setup(variation);
    await assert.rejects(handler(event),new RegExp(`DENIED:${reason}`));
    assert.equal(calls.filter(x=>x.permissions?.contents==='write').length,0);
  });
}
test('rejects invalid authorization generation before requesting any token',async()=>{
  const {handler,calls}=setup();
  await assert.rejects(handler({...event,authorization_generation:'short'}),/DENIED/);
  assert.equal(calls.length,0);
});
test('rejects write permission downgrade after one authorized write mint',async()=>{
  const {handler,calls}=setup({permission:'read'});
  await assert.rejects(handler(event),/DENIED:WRITE_SCOPE/);
  assert.equal(calls.filter(x=>x.permissions?.contents==='write').length,1);
});
test('rejects unsupported permission profile before requesting any token',async()=>{
  const {handler,calls}=setup();
  await assert.rejects(handler({...event,permission_profile:'INVALID'}),/DENIED/);
  assert.equal(calls.length,0);
});

for(const [label,variation] of [
  ['head drift',{prHead:'d'.repeat(40)}],
  ['old base drift',{prBase:'d'.repeat(40)}],
  ['current main drift',{mainBase:'d'.repeat(40)}],
]) test(`stale convergence refuses ${label} before minting contents write`,async()=>{
  const permissionProfile='AUTONOMOUS_STALE_BASE_CONVERGENCE';
  const {handler,calls}=setup({mainBase:'c'.repeat(40),permissionProfile,...variation});
  await assert.rejects(handler({...event,current_main_sha:'c'.repeat(40),permission_profile:permissionProfile}),/DENIED:LIVE_TUPLE/);
  assert.equal(calls.filter(x=>x.permissions?.contents==='write').length,0);
});
test('stale convergence refuses a granted contents downgrade',async()=>{
  const permissionProfile='AUTONOMOUS_STALE_BASE_CONVERGENCE';
  const {handler}=setup({mainBase:'c'.repeat(40),permissionProfile,permission:'read'});
  await assert.rejects(handler({...event,current_main_sha:'c'.repeat(40),permission_profile:permissionProfile}),/DENIED:WRITE_SCOPE/);
});

for (const workflowPermission of ['read',undefined,null]) test(`stale convergence rejects workflow permission ${workflowPermission}`,async()=>{
  const permissionProfile='AUTONOMOUS_STALE_BASE_CONVERGENCE';
  const {handler}=setup({mainBase:'c'.repeat(40),permissionProfile,workflowPermission:workflowPermission===undefined?'absent':workflowPermission});
  await assert.rejects(handler({...event,current_main_sha:'c'.repeat(40),permission_profile:permissionProfile}),/DENIED:WRITE_SCOPE/);
});
for (const permissionProfile of ['AUTONOMOUS_EVENT_DISPATCH','AUTONOMOUS_REDUNDANT_PR_HYGIENE']) test(`${permissionProfile} never requests workflow write`,async()=>{
  const current=permissionProfile==='AUTONOMOUS_EVENT_DISPATCH'?base:'c'.repeat(40);
  const {handler,calls}=setup({mainBase:current,permissionProfile});
  const result=await handler({...event,current_main_sha:current,permission_profile:permissionProfile});
  assert.equal(calls.some(x=>x.permissions?.workflows),false);
  assert.equal(result.permissions.includes('workflows:write'),false);
});
test('unexpected workflows permission in the read token is rejected before write mint',async()=>{
  const {handler,calls}=setup({extraPermissions:{workflows:'write'}});
  await assert.rejects(handler(event),/DENIED:READ_SCOPE/);
  assert.equal(calls.filter(x=>x.permissions?.contents==='write').length,0);
});
