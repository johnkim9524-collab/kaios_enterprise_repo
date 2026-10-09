import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const root=process.cwd();
const p0=fs.readFileSync('.github/workflows/kidults-p0-control-plane-closure-v1.yml','utf8');

test('P0 failure receipt initializes before checkout and uploads even when the suite fails',()=>{
  assert.ok(p0.indexOf('Initialize current-run fail-closed P0 receipt')<p0.indexOf('uses: actions/checkout@'));
  assert.match(p0,/name: Preserve P0 receipt on both success and failure\n        if: always\(\)/);
  assert.match(p0,/path: \$\{\{ runner.temp \}\}\/kidults-p0-control-plane-closure-receipt-v1.json/);
  assert.match(p0,/if-no-files-found: error/);assert.match(p0,/retention-days: 90/);
  assert.doesNotMatch(p0,/continue-on-error:|issues: write|contents: write|secrets\./);
});

test('actual P0 initializer replaces stale PASS with current-run diagnostic RED',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'p0-bootstrap-receipt-'));
  try{
    const file=path.join(dir,'receipt.json');fs.writeFileSync(file,JSON.stringify({state:'VERIFIED_PASS',run_id:1}));
    const source=p0.match(/<<'PY_RECEIPT'\n([\s\S]*?)\n          PY_RECEIPT/)[1].replace(/^ {10}/gm,'');
    const p=spawnSync('python3',['-I','-c',source],{encoding:'utf8',timeout:10000,
      env:{PATH:process.env.PATH,KPMO_RECEIPT_PATH:file,KPMO_SOURCE_SHA:'a'.repeat(40),
        GITHUB_REPOSITORY:'johnkim9524-collab/kaios_enterprise_repo',GITHUB_RUN_ID:'900',GITHUB_RUN_ATTEMPT:'1'}});
    assert.equal(p.status,0,p.stderr);const x=JSON.parse(fs.readFileSync(file,'utf8'));
    assert.equal(x.state,'VERIFIED_FAIL');assert.equal(x.failure_class,'P0_SUITE_NOT_RECONCILED');
    assert.equal(x.run_id,900);assert.equal(x.run_attempt,1);assert.equal(x.exact_source_sha,'a'.repeat(40));
    assert.equal(x.scope,'BOOTSTRAP_DIAGNOSTIC_NOT_COMPLETED_PROOF');
    assert.deepEqual(x.authority_boundary,{remote_mutation:false,provider_contact:false,spend:false,
      production:'HOLD',public_release:'HOLD',g5:'HOLD'});
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

for(const fail of [false,true])test(`actual P0 suite preserves outcome and receipt under closed child transport (failure=${fail})`,()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'p0-terminal-test-'));
  try{
    const output=path.join(dir,'receipt.json'),hook=path.join(dir,'closed-transport.mjs');
    fs.writeFileSync(hook,`import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
cp.spawnSync=(_file,args)=>({status:${fail}&&args.includes('scripts/kidults/kpmo/validate-asi-workflow-fanout-budget-v1.mjs')?1:0,stdout:'',stderr:''});
syncBuiltinESMExports();globalThis.fetch=()=>{throw Error('REAL_NETWORK_FORBIDDEN');};`);
    const p=spawnSync(process.execPath,['--import',pathToFileURL(hook).href,'scripts/kidults/kpmo/run-p0-control-plane-closure-suite-v1.mjs'],
      {cwd:root,encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH,KPMO_RECEIPT_PATH:output,KPMO_SOURCE_SHA:'a'.repeat(40)}});
    assert.equal(p.status,fail?1:0);const x=JSON.parse(fs.readFileSync(output,'utf8'));
    assert.equal(x.state,fail?'VERIFIED_FAIL':'VERIFIED_PASS');assert.equal(x.facts.checks_passed,fail?17:18);assert.equal(x.facts.checks_total,18);
    assert.equal(x.evidence_refs.find(e=>e.id==='asi-workflow-fanout-budget').state,fail?'VERIFIED_FAIL':'VERIFIED_PASS');
    assert.equal(x.authority_boundary.remote_mutation,false);assert.equal(x.authority_boundary.production,'HOLD');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('every main push runs P0 while the scoped PR trigger and suite execute the receipt regression',()=>{
  const file='tests/kidults/kpmo/p0-failure-receipt-retention-v1.test.mjs';
  const push=p0.match(/^  push:\n([\s\S]*?)(?=^  [a-z_]+:|^permissions:)/m);
  assert.ok(push);assert.match(push[1],/^    branches: \[main\]$/m);
  assert.doesNotMatch(push[1],/^    paths(?:-ignore)?:/m);
  assert.equal(p0.split(`      - '${file}'`).length-1,1);
  assert.ok(p0.includes(`node --test ${file}`));
  assert.ok(p0.indexOf(`node --test ${file}`)<p0.indexOf('node scripts/kidults/kpmo/run-p0-control-plane-closure-suite-v1.mjs'));
});


test('runner context is restricted to step env and upload inputs, not job env',()=>{
  const jobEnv=p0.match(/^    env:\n([\s\S]*?)\n    steps:/m);
  assert.ok(jobEnv);assert.doesNotMatch(jobEnv[1],/runner\./);
  const boundPath='KPMO_RECEIPT_PATH: ${{ runner.temp }}/kidults-p0-control-plane-closure-receipt-v1.json';
  assert.equal(p0.split(boundPath).length-1,2);
  for(const name of ['Initialize current-run fail-closed P0 receipt','Verify exact source and execute integrated closure suite']){
    const step=p0.split(`      - name: ${name}\n`)[1].split('      - ')[0];
    assert.ok(step.includes(`        env:\n          ${boundPath}`));
  }
});
