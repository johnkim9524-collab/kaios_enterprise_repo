'use strict';

const {createHash, createSign, randomBytes} = require('node:crypto');

const deny = code => { throw new Error(`NATURAL_CLOCK_${code}`); };
const b64url = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const validSlot = value => ['POOLING','P0B','RESERVE','SENTINEL','ASSURANCE'].includes(value);

function createHandler({getPrivateKey, request, putOnce, config, now=()=>Date.now(), nonce=()=>randomBytes(24).toString('base64url')}) {
  return async event => {
    const slot=event?.slot;
    if (event?.source!=='aws.scheduler' || !validSlot(slot) || Object.keys(event).sort().join(',')!=='slot,source') deny('EVENT_DENIED');
    const issuedAt=new Date(now()).toISOString();
    const key=await getPrivateKey();
    if(typeof key!=='string'||!/-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(key)) deny('KEY_INVALID');
    const issued=Math.floor(now()/1000);
    const unsigned=`${b64url({alg:'RS256',typ:'JWT'})}.${b64url({iat:issued-30,exp:issued+540,iss:String(config.appId)})}`;
    const signer=createSign('RSA-SHA256'); signer.update(unsigned); signer.end();
    const jwt=`${unsigned}.${signer.sign(key).toString('base64url')}`;
    const call=async (url, options={}) => {
      const response=await request(url,{...options,redirect:'error',headers:{Accept:'application/vnd.github+json',
        Authorization:`Bearer ${options.bearer||jwt}`,'X-GitHub-Api-Version':'2022-11-28',
        'User-Agent':'kidults-natural-clock-dispatcher-v1',...(options.headers||{})}});
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
    const exactMainSha=branch?.commit?.sha;
    if(typeof exactMainSha!=='string'||!/^[0-9a-f]{40}$/.test(exactMainSha)||branch?.protected!==true) deny('MAIN_INVALID');
    const nonceValue=nonce();
    if(typeof nonceValue!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(nonceValue)) deny('NONCE_INVALID');
    const dispatchId=`kidults-natural-clock-v1:${slot}:${exactMainSha}:${nonceValue}`;
    const payload={dispatch_id:dispatchId,exact_main_sha:exactMainSha,issued_at:issuedAt,nonce:nonceValue,slot,source:'AWS_EVENTBRIDGE_SCHEDULER'};
    const digest=`sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
    await putOnce({dispatchId,slot,exactMainSha,issuedAt,digest,expiresAt:Math.floor(now()/1000)+86400});
    await call(`https://api.github.com/repos/${config.repository}/dispatches`,{bearer:installation.token,method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({event_type:`kidults.natural.clock.${slot.toLowerCase()}.v1`,client_payload:payload})});
    return {ok:true,state:'VERIFIED_DISPATCHED',dispatch_id:dispatchId,exact_main_sha:exactMainSha,slot,receipt_digest:digest};
  };
}

exports.createHandler=createHandler;
exports.handler=async event => {
  const {SecretsManagerClient,GetSecretValueCommand}=require('@aws-sdk/client-secrets-manager');
  const {DynamoDBClient,PutItemCommand}=require('@aws-sdk/client-dynamodb');
  const secrets=new SecretsManagerClient({});
  const dynamo=new DynamoDBClient({});
  return createHandler({
    getPrivateKey:async()=> (await secrets.send(new GetSecretValueCommand({SecretId:process.env.GITHUB_APP_PRIVATE_KEY_SECRET_ARN}))).SecretString,
    request:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(10000)}),
    putOnce:async item=>dynamo.send(new PutItemCommand({TableName:process.env.NATURAL_CLOCK_LEDGER_TABLE,
      Item:{dispatch_id:{S:item.dispatchId},slot:{S:item.slot},exact_main_sha:{S:item.exactMainSha},issued_at:{S:item.issuedAt},receipt_digest:{S:item.digest},expires_at:{N:String(item.expiresAt)}},
      ConditionExpression:'attribute_not_exists(dispatch_id)'})),
    config:{repository:process.env.GITHUB_REPOSITORY,repositoryId:process.env.GITHUB_REPOSITORY_ID,
      appId:process.env.GITHUB_APP_ID,installationId:process.env.GITHUB_APP_INSTALLATION_ID},
  })(event);
};
