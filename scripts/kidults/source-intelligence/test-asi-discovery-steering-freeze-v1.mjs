#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const queueDir=process.argv[2]||'queue';
const feedbackPath=process.argv[3]||'/tmp/global-data-acquisition-master-matrix-feedback-v1.json';
const planPath=process.argv[4]||'/tmp/asi-discovery-steering-plan-v1.json';
const plan=JSON.parse(fs.readFileSync(planPath,'utf8'));const fail=m=>{throw new Error(m)};
if(plan.status!=='FROZEN_FEEDBACK_AWARE_SWEEP_PLAN'||plan.sweep_number!==0)fail('INITIAL_PLAN');
const global=plan.category_plans.flatMap(c=>c.cycles.flatMap(x=>x.selected_product_ids));if(global.length!==160||new Set(global).size!==160)fail('FULL_SWEEP_160');
const feedback=JSON.parse(fs.readFileSync(feedbackPath,'utf8'));const mutated=structuredClone(feedback);for(const r of mutated.evidence_bindings||[])r.effective_priority_score=Number((1000-Number(r.effective_priority_score||0)).toFixed(6));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'asi-steer-'));const mutPath=path.join(tmp,'feedback-mutated.json');fs.writeFileSync(mutPath,JSON.stringify(mutated));
const midPath=path.join(tmp,'mid.json');let x=spawnSync(process.execPath,['scripts/kidults/source-intelligence/build-asi-discovery-steering-plan-v1.mjs',queueDir,mutPath,planPath,'1',midPath],{encoding:'utf8'});if(x.status!==0)fail(`MID_BUILD:${x.stderr}`);const mid=JSON.parse(fs.readFileSync(midPath,'utf8'));if(mid.reused_prior_plan!==true||mid.plan_digest!==plan.plan_digest||mid.sweep_number!==0||mid.current_cycle.cycle_index!==1)fail('MID_SWEEP_NOT_FROZEN');
const nextPath=path.join(tmp,'next.json');x=spawnSync(process.execPath,['scripts/kidults/source-intelligence/build-asi-discovery-steering-plan-v1.mjs',queueDir,mutPath,planPath,'10',nextPath],{encoding:'utf8'});if(x.status!==0)fail(`NEXT_BUILD:${x.stderr}`);const next=JSON.parse(fs.readFileSync(nextPath,'utf8'));if(next.reused_prior_plan!==false||next.sweep_number!==1||next.current_cycle.cycle_index!==0||next.feedback_digest===plan.feedback_digest)fail('NEXT_SWEEP_NOT_REFRESHED');const nextGlobal=next.category_plans.flatMap(c=>c.cycles.flatMap(y=>y.selected_product_ids));if(nextGlobal.length!==160||new Set(nextGlobal).size!==160)fail('NEXT_SWEEP_160');
console.log(JSON.stringify({status:'PASS',initial_sweep_unique:160,mid_sweep_plan_frozen:true,next_sweep_feedback_refreshed:true,next_sweep_unique:160,rights_or_admission_mutation:false,production:'HOLD'}));
