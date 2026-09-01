#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const script = path.join(path.dirname(new URL(import.meta.url).pathname), 'reconcile-continuous-assurance-terminal-v1.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'assurance-reconcile-'));
const baseRun={id:42,run_attempt:1,name:'KIDULTS Platform Continuous Assurance V1',path:'.github/workflows/kidults-platform-continuous-assurance-v1.yml',repository:{full_name:'owner/repo'},head_branch:'main',head_sha:'a'.repeat(40),status:'completed',event:'workflow_run'};
function one(name,run,jobs,expectRc,expectState,expectNeedle){
 const rp=path.join(tmp,`${name}-run.json`),jp=path.join(tmp,`${name}-jobs.json`),op=path.join(tmp,`${name}-out.json`);
 fs.writeFileSync(rp,JSON.stringify(run));fs.writeFileSync(jp,JSON.stringify({jobs}));
 const p=spawnSync(process.execPath,[script,'--run',rp,'--jobs',jp,'--output',op,'--expected-sha','a'.repeat(40)],{encoding:'utf8',env:{...process.env,GITHUB_REPOSITORY:'owner/repo'}});
 if(p.status!==expectRc)throw new Error(`${name}:RC:${p.status}:${p.stderr}`);
 if(expectRc===0){const o=JSON.parse(fs.readFileSync(op));if(o.terminal.internal_control_state!==expectState)throw new Error(`${name}:STATE`);if(expectNeedle&&!o.terminal.failed_check_ids.some(x=>x.includes(expectNeedle)))throw new Error(`${name}:MISSING:${expectNeedle}`);if(o.terminal.promotion_eligible!==false||o.boundary.production!=='HOLD')throw new Error(`${name}:BOUNDARY`);}
}
one('required-fail',{...baseRun,conclusion:'failure'},[{name:'audit',steps:[{name:'Validate exact Sharded Reserve upstream terminal binding',conclusion:'failure'},{name:'Run audit and always retain receipt',conclusion:'success'}]}],0,'VERIFIED_FAIL','Sharded Reserve');
one('generic-fail',{...baseRun,conclusion:'failure'},[{name:'audit',steps:[{name:'Some other step',conclusion:'failure'}]}],0,'VERIFIED_FAIL','Some other step');
one('success',{...baseRun,conclusion:'success'},[{name:'audit',steps:[{name:'Assert exact source binding',conclusion:'success'}]}],0,'CONTROL_ONLY_PASS',null);
one('inconsistent',{...baseRun,conclusion:'success'},[{name:'audit',steps:[{name:'Assert exact source binding',conclusion:'failure'}]}],1,null,null);
console.log(JSON.stringify({suite:'KIDULTS_CONTINUOUS_ASSURANCE_TERMINAL_RECONCILIATION_V1',positive:3,negative:1,state:'VERIFIED_PASS'}));
