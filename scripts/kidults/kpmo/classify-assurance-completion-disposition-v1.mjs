#!/usr/bin/env node
import fs from 'node:fs';
import {classifyAssuranceCompletion} from './lib/assurance-completion-disposition-v1.mjs';
const [runPath,jobsPath,output]=process.argv.slice(2);
if(!runPath||!jobsPath||!output) throw new Error('ASSURANCE_COMPLETION_INPUT_REQUIRED');
const run=JSON.parse(fs.readFileSync(runPath,'utf8'));
const data=JSON.parse(fs.readFileSync(jobsPath,'utf8'));
if(!Array.isArray(data.jobs)||data.total_count!==data.jobs.length) throw new Error('ASSURANCE_COMPLETION_JOBS_TRUNCATED');
const receipt=classifyAssuranceCompletion({run,jobs:data.jobs,expected:{
 repository:process.env.GITHUB_REPOSITORY,sha:process.env.UPSTREAM_SHA,
 run_id:Number(process.env.UPSTREAM_RUN_ID),run_attempt:Number(process.env.UPSTREAM_RUN_ATTEMPT)
}});
fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');
if(process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT,'eligible_full_audit='+receipt.eligible_full_audit+'\n');
console.log(JSON.stringify(receipt));
