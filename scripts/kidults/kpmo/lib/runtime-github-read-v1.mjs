import fs from 'node:fs';
import {createGithubRateAwareRead} from './github-rate-aware-read-v1.mjs';
import {createSharedGithubReadBudget} from './shared-github-read-budget-v1.mjs';
import {createProtectedDynamoDbGithubReadBudgetStore} from './shared-github-read-budget-dynamodb-v1.mjs';
const clients=new Map();
export function runtimeGithubRead(token,{sharedBudget}={}){
  const env=process.env;
  if(!sharedBudget&&env.KIDULTS_GITHUB_READ_BUDGET_MODE==='SHARED_REQUIRED'){
    const scope={repository:'johnkim9524-collab/kaios_enterprise_repo',resource:'core',quota_owner_id:env.KIDULTS_GITHUB_READ_QUOTA_OWNER_ID};
    const store=createProtectedDynamoDbGithubReadBudgetStore({scope});
    sharedBudget=createSharedGithubReadBudget({store,scope});
  }
  if(env.KIDULTS_GITHUB_READ_BUDGET_MODE==='SHARED_REQUIRED'&&!sharedBudget)
    throw Error('GITHUB_READ_CROSS_RUNNER_BUDGET_REQUIRED');
  const cacheKey=`${token}:${sharedBudget?'cross-runner':'process-local'}`;
  if(clients.has(cacheKey))return clients.get(cacheKey);
  const binding={root_mission:'AUTONOMOUS_NORMAL_OPERATIONS_CLOSURE_MISSION',source_sha:env.GITHUB_SHA,
    run_id:env.GITHUB_RUN_ID,run_attempt:Number(env.GITHUB_RUN_ATTEMPT),original_run_id:38132692877,
    original_artifact_id:11700046124,original_artifact_digest:'sha256:b29d657aabd33895864a838dd84b836579a3febd9a4bd1299437580578f07ab4'};
  const read=createGithubRateAwareRead({token,binding,deadlineMs:900000,budget:sharedBudget,onCheckpoint:checkpoint=>{
    const directory='out/github-read-resume-v1';fs.mkdirSync(directory,{recursive:true,mode:0o700});
    fs.appendFileSync(`${directory}/checkpoints.jsonl`,JSON.stringify(checkpoint)+'\n',{mode:0o600});
  }});
  clients.set(cacheKey,read);return read;
}
