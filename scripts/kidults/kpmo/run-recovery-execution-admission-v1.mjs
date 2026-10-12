import fs from 'node:fs';
import {recoveryExecutionAdmission} from './lib/recovery-execution-admission-v1.mjs';
import {runtimeGithubRead} from './lib/runtime-github-read-v1.mjs';
const env=process.env;
const get=route=>runtimeGithubRead(env.GITHUB_TOKEN)(`https://api.github.com/repos/johnkim9524-collab/kaios_enterprise_repo/${route}`);
const directory='out/recovery-execution-admission-v1';fs.mkdirSync(directory,{recursive:true});
try{
  const result=await recoveryExecutionAdmission({env,event:JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH,'utf8')),get});
  fs.writeFileSync(`${directory}/receipt.json`,JSON.stringify({...result,source_sha:env.GITHUB_SHA,run_id:env.GITHUB_RUN_ID})+'\n');
  if(!env.GITHUB_OUTPUT)throw Error('RECOVERY_ADMISSION_OUTPUT_REQUIRED');
  fs.appendFileSync(env.GITHUB_OUTPUT,`admitted=${result.admitted}\n`);
  console.log(JSON.stringify(result));
}catch(error){
  fs.writeFileSync(`${directory}/receipt.json`,JSON.stringify({state:'HOLD',failure_code:error.message,
    ...(error.http_diagnostic?{http_diagnostic:error.http_diagnostic}:{}),
    ...(error.read_resume_checkpoint?{read_resume_checkpoint:error.read_resume_checkpoint}:{}),actual_authority_granted:false,retry_authorized:false,promotion_eligible:false})+'\n');
  throw error;
}
