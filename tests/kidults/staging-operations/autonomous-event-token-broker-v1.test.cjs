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
test('template embeds reviewed source and limits secret and invoke scopes',()=>{
  const template=JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-event-token-broker-v1.json'));
  assert.equal(template.Resources.BrokerFunction.Properties.Code.ZipFile,
    fs.readFileSync('infrastructure/aws/staging/autonomous-event-token-broker-v1.cjs','utf8'));
  const secret=template.Resources.BrokerRole.Properties.Policies[0].PolicyDocument.Statement;
  assert.deepEqual(secret,[{Effect:'Allow',Action:['secretsmanager:GetSecretValue'],Resource:{Ref:'GitHubPrivateKeySecretArn'}}]);
  const invoke=template.Resources.FinalizerBrokerInvoke.Properties.PolicyDocument.Statement;
  assert.deepEqual(invoke,[{Effect:'Allow',Action:['lambda:InvokeFunction'],Resource:{'Fn::GetAtt':['BrokerFunction','Arn']}}]);
});
const stamp=Date.parse('2026-09-24T00:00:00Z');
function setup({prHead=head, mainBase=base, permission='write', repositories=[{id:123,full_name:repo}]}={}) {
  const calls=[];
  const request=async (url,options) => {
    calls.push({url,method:options.method||'GET'});
    let value;
    if(url.endsWith('/access_tokens')) {
      const body=JSON.parse(options.body);
      assert.deepEqual(body,{repository_ids:[123],permissions:{contents:'write',pull_requests:'write'}});
      value={token:'installation-token-1234567890',expires_at:new Date(stamp+3600000).toISOString(),
        permissions:{contents:permission,pull_requests:'write'},repository_selection:'selected',repositories};
    } else if(url.endsWith('/pulls/42')) value={number:42,state:'open',draft:false,merged:false,
      head:{sha:prHead,repo:{full_name:repo}},base:{ref:'main',sha:base}};
    else if(url.endsWith('/branches/main')) value={commit:{sha:mainBase}};
    else throw Error('unexpected request');
    return {ok:true,json:async()=>value};
  };
  return {calls,handler:createHandler({config,request,getPrivateKey:async()=>privateKey,now:()=>stamp})};
}
test('mints one repository scoped token after exact live tuple',async()=>{
  const {handler,calls}=setup(); const result=await handler(event);
  assert.equal(result.ok,true);assert.equal(result.token_type,'GITHUB_APP_INSTALLATION');
  assert.equal(calls.length,3);
});
test('rejects wrong repository before mint',async()=>{
  const {handler,calls}=setup();await assert.rejects(handler({...event,repository_id:'999'}),/DENIED/);
  assert.equal(calls.length,0);
});
for(const [name,variation] of [['head drift',{prHead:'c'.repeat(40)}],['main drift',{mainBase:'c'.repeat(40)}],
  ['permission downgrade',{permission:'read'}],['broader repository scope',{repositories:[{id:123,full_name:repo},{id:456}]}]]) {
  test(`rejects ${name}`,async()=>assert.rejects(setup(variation).handler(event),/DENIED/));
}
