'use strict';
const {createSign} = require('node:crypto');

const fail = () => { throw new Error('EVENT_TOKEN_BROKER_DENIED'); };
const sha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const b64url = value => Buffer.from(JSON.stringify(value)).toString('base64url');

function createHandler({getPrivateKey, request, config, now = () => Date.now()}) {
  return async event => {
    const {repository, repository_id, pull_request, base_sha, head_sha, authorization_generation,
      allow_draft_recovery} = event || {};
    if (event?.action !== 'MINT_INSTALLATION_TOKEN'
      || repository !== config.repository || String(repository_id) !== String(config.repositoryId)
      || !Number.isSafeInteger(Number(pull_request)) || Number(pull_request) < 1
      || !sha(base_sha) || !sha(head_sha) || base_sha === head_sha
      || ![undefined,false,true].includes(allow_draft_recovery)
      || typeof authorization_generation !== 'string'
      || !/^[A-Za-z0-9_.:-]{12,160}$/.test(authorization_generation)) fail();
    const issued = Math.floor(now()/1000);
    const key = await getPrivateKey();
    if (typeof key !== 'string' || !/-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(key)) fail();
    const unsigned = `${b64url({alg:'RS256',typ:'JWT'})}.${b64url({iat:issued-30,exp:issued+540,iss:String(config.appId)})}`;
    const signer=createSign('RSA-SHA256'); signer.update(unsigned); signer.end();
    const jwt=`${unsigned}.${signer.sign(key).toString('base64url')}`;
    const api = async (endpoint, bearer, options={}) => {
      const response=await request(`https://api.github.com${endpoint}`,{
        ...options,redirect:'error',headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${bearer}`,
          'X-GitHub-Api-Version':'2022-11-28','User-Agent':'kidults-autonomous-event-broker-v1',...(options.headers||{})},
      });
      if (!response.ok) fail();
      return response.json();
    };
    const mint = permissions => api(`/app/installations/${config.installationId}/access_tokens`,jwt,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({repository_ids:[Number(config.repositoryId)],permissions}),
    });
    const validScope = (minted, permissions) => typeof minted.token==='string' && minted.token.length>=20
      && Number.isFinite(Date.parse(minted.expires_at)) && Date.parse(minted.expires_at)>=now()+15*60*1000
      && minted.permissions?.contents===permissions.contents
      && minted.permissions?.pull_requests===permissions.pull_requests
      && [undefined,'read'].includes(minted.permissions?.metadata)
      && Object.keys(minted.permissions).every(x=>['contents','pull_requests','metadata'].includes(x))
      && minted.repository_selection==='selected' && minted.repositories?.length===1
      && Number(minted.repositories[0]?.id)===Number(config.repositoryId)
      && minted.repositories[0]?.full_name===repository;
    const readPermissions={contents:'read',pull_requests:'read'};
    const readonly=await mint(readPermissions);
    if (!validScope(readonly,readPermissions)) fail();
    const [pr,main]=await Promise.all([
      api(`/repos/${repository}/pulls/${pull_request}`,readonly.token),
      api(`/repos/${repository}/branches/main`,readonly.token),
    ]);
    if (pr.number!==Number(pull_request) || pr.state!=='open'
      || (pr.draft!==false && !(allow_draft_recovery===true && pr.draft===true))
      || pr.merged===true || pr.head?.sha!==head_sha || pr.base?.sha!==base_sha
      || pr.base?.ref!=='main' || pr.head?.repo?.full_name!==repository
      || main.commit?.sha!==base_sha) fail();
    const writePermissions={contents:'write',pull_requests:'write'};
    const minted=await mint(writePermissions);
    if (!validScope(minted,writePermissions)) fail();
    return {ok:true,token_type:'GITHUB_APP_INSTALLATION',repository,repository_id:String(repository_id),
      permissions:['contents:write','pull_requests:write','metadata:read'],expires_at:minted.expires_at,token:minted.token};
  };
}

exports.createHandler=createHandler;
exports.handler=async event => {
  const {SecretsManagerClient,GetSecretValueCommand}=require('@aws-sdk/client-secrets-manager');
  const client=new SecretsManagerClient({region:process.env.AWS_REGION});
  const getPrivateKey=async () => {
    const value=await client.send(new GetSecretValueCommand({SecretId:process.env.GITHUB_APP_PRIVATE_KEY_SECRET_ARN}));
    return value.SecretString;
  };
  return createHandler({getPrivateKey,config:{repository:process.env.GITHUB_REPOSITORY,
    repositoryId:process.env.GITHUB_REPOSITORY_ID,appId:process.env.GITHUB_APP_ID,
    installationId:process.env.GITHUB_APP_INSTALLATION_ID},
    request:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(10000)})})(event);
};
