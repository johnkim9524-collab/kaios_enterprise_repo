// The runners use the existing protected ledger writer for shared-budget CAS.
// Their AWS roles retain only the already-configured Lambda/KMS capabilities;
// DynamoDB mutations stay inside the signature-validating writer.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const check=(ok,code)=>{if(!ok)throw Error('SHARED_GITHUB_READ_LAMBDA_'+code);};
const repo='johnkim9524-collab/kaios_enterprise_repo';
const repoId='1281328888';
const region='ap-northeast-2';
const functionName='kidults-autonomous-ledger-writer-staging';
const contract='kidults-shared-github-read-budget-v1';
const roleByArn=/^arn:aws:sts::528314240275:assumed-role\/(kidults-autonomous-(track|kpmo|verifier)-staging-role|kidults-github-read-resume-staging-role)\/[^/]+$/;
const roleName={'kidults-autonomous-track-staging-role':'ACCOUNTABLE_TRACK_AGENT','kidults-autonomous-kpmo-staging-role':'KPMO','kidults-autonomous-verifier-staging-role':'INDEPENDENT_VERIFIER','kidults-github-read-resume-staging-role':'READ_RESUME'};
const canonical=x=>Array.isArray(x)?`[${x.map(canonical).join(',')}]`:x&&typeof x==='object'?`{${Object.keys(x).sort().map(k=>`${JSON.stringify(k)}:${canonical(x[k])}`).join(',')}}`:JSON.stringify(x);
const digest=x=>createHash('sha256').update(canonical(x)).digest('hex');
const defaultConfiguration=scope=>({scope,capacity:480,windowMs:3600000,maxConcurrent:2,leaseMs:30000});

export function createProtectedDynamoDbGithubReadBudgetStore({scope,configuration,aws=execFileSync,identity,env=process.env,tempRoot=env.RUNNER_TEMP||os.tmpdir()}={}){
  check(scope?.repository===repo&&scope.resource==='core'&&/^[A-Za-z0-9_-]{1,80}$/.test(scope.quota_owner_id||''),'SCOPE');
  configuration??=defaultConfiguration(scope);
  check(configuration?.scope?.repository===repo&&configuration.scope.resource==='core'
    &&configuration.scope.quota_owner_id===scope.quota_owner_id,'CONFIG_SCOPE');
  const caller=identity??JSON.parse(aws('aws',['sts','get-caller-identity','--region',region,'--output','json'],
    {encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}));
  check(caller?.Account==='528314240275','ACCOUNT');
  const match=roleByArn.exec(caller.Arn||'');
  check(match,'IDENTITY');
  const role=roleName[match[1]];
  const readResume=role==='READ_RESUME';
  const signingKeyArn=env[readResume?'KIDULTS_READ_RESUME_SIGNING_KEY_ARN':'KIDULTS_AUTONOMOUS_SIGNING_KEY_ARN'];
  const workloadId=env[readResume?'KIDULTS_READ_RESUME_WORKLOAD_ID':'KIDULTS_AUTONOMOUS_WORKLOAD_ID'];
  const environment=readResume?'KIDULTS-AUTONOMOUS-READ-RESUME':`KIDULTS-AUTONOMOUS-${role==='ACCOUNTABLE_TRACK_AGENT'?'TRACK':role==='INDEPENDENT_VERIFIER'?'VERIFIER':'KPMO'}`;
  check(typeof signingKeyArn==='string'&&/^arn:aws:kms:ap-northeast-2:528314240275:key\/[A-Za-z0-9-]+$/.test(signingKeyArn),'SIGNING_KEY');
  check(typeof workloadId==='string'&&/^[A-Za-z0-9._:-]{1,160}$/.test(workloadId),'WORKLOAD_ID');
  const workflowRef=env.GITHUB_WORKFLOW_REF;
  const sourceSha=env.GITHUB_SHA;
  const runId=env.GITHUB_RUN_ID;
  const runAttempt=Number(env.GITHUB_RUN_ATTEMPT);
  check(typeof workflowRef==='string'&&workflowRef.startsWith(`${repo}/.github/workflows/`),'WORKFLOW_REF');
  if(readResume)check(workflowRef===`${repo}/.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml@refs/heads/main`,'WORKFLOW_ROLE_BINDING');
  check(typeof sourceSha==='string'&&/^[a-f0-9]{40}$/.test(sourceSha),'SOURCE_SHA');
  check(typeof runId==='string'&&/^[1-9][0-9]{0,15}$/.test(runId)&&Number.isSafeInteger(runAttempt)&&runAttempt>=1&&runAttempt<=100,'RUN_BINDING');
  const workload={workload_id:workloadId,signing_key_arn:signingKeyArn,environment};
  const key=`GITHUB_READ_BUDGET#${digest(scope)}`;

  const awsCall=(args,options={})=>aws('aws',['--region',region,'--output','json','--cli-connect-timeout','5','--cli-read-timeout','10',...args],
    {encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe'],env:{...env,AWS_MAX_ATTEMPTS:'1',AWS_RETRY_MODE:'standard'},...options});
  const invoke=async(action,extra={})=>{
    const envelope={action,contract,repository:repo,repository_id:repoId,scope,configuration,key,role,workload,
      run_id:runId,run_attempt:runAttempt,source_sha:sourceSha,workflow_ref:workflowRef,...extra};
    const privateDir=fs.mkdtempSync(path.join(tempRoot,'kidults-shared-budget-'));
    try{
      fs.chmodSync(privateDir,0o700);
      const messagePath=path.join(privateDir,'message.bin');
      const outputPath=path.join(privateDir,'response.json');
      fs.writeFileSync(messagePath,Buffer.from(digest(envelope),'hex'),{flag:'wx',mode:0o600});
      const signature=JSON.parse(awsCall(['kms','sign','--key-id',signingKeyArn,'--message',`fileb://${messagePath}`,
        '--message-type','DIGEST','--signing-algorithm','ECDSA_SHA_256']));
      check(signature.KeyId===signingKeyArn&&signature.SigningAlgorithm==='ECDSA_SHA_256'
        &&typeof signature.Signature==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(signature.Signature),'SIGNATURE');
      const event={envelope,signature_b64:signature.Signature};
      const metadata=JSON.parse(awsCall(['lambda','invoke','--function-name',functionName,'--cli-binary-format','raw-in-base64-out',
        '--payload',JSON.stringify(event),outputPath]));
      if(metadata.FunctionError)throw Error('SHARED_GITHUB_READ_LAMBDA_FUNCTION_ERROR');
      const stat=fs.lstatSync(outputPath);
      check(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=131072,'OUTPUT');
      const response=JSON.parse(fs.readFileSync(outputPath,'utf8'));
      check(response?.ok===true&&response.action===action&&response.key===key,'RESPONSE_BINDING');
      return response;
    }finally{fs.rmSync(privateDir,{recursive:true,force:true});}
  };

  return Object.freeze({authority:'PROTECTED_ATOMIC_CAS',key,
    read:async requested=>{
      check(requested===key,'KEY');
      const response=await invoke('READ');
      check(response.row===null||response.row&&typeof response.row==='object','ROW');
      return response.row;
    },
    compareAndSwap:async(requested,expectedVersion,next)=>{
      check(requested===key&&Number.isSafeInteger(expectedVersion)&&expectedVersion>=0,'CAS_BINDING');
      try{
        const response=await invoke('COMPARE_AND_SWAP',{expected_version:expectedVersion,next});
        check(response.state==='COMMITTED'||response.state==='CONFLICT','CAS_RESPONSE');
        return response.state;
      }catch{
        // The invocation can have committed before transport/response failure.
        // The coordinator must stop and reconcile; never replay this write.
        return 'UNKNOWN';
      }
    }});
}
