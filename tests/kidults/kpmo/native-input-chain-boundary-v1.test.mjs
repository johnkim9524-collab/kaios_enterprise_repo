import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const runner='scripts/kidults/integration/run-exact-pair-product-chain-v1.py';

test('unregistered native input stops before reading pair or invoking Track B',()=>{
  const dir=fs.mkdtempSync(path.join(root,'.native-input-boundary-'));
  try{
    const manifest=path.join(dir,'manifest.json'),output=path.join(dir,'output');
    fs.writeFileSync(manifest,JSON.stringify({synthetic:false,promotable:true,
      native_business_input_reference:{producer_id:'unregistered-native-source',run_id:1,artifact_id:1},
      candidate_path:'does-not-exist/snapshot-candidate.json',
      evidence_path:'does-not-exist/evidence-package.json'}));
    const result=spawnSync('python3',[runner,manifest,output],{cwd:root,encoding:'utf8',
      env:{...process.env,GH_TOKEN:'',GITHUB_TOKEN:''}});
    assert.equal(result.status,1,result.stdout);
    assert.match(result.stderr,/AUTHENTICATED_NATIVE_INPUT_REQUIRED/);
    assert.doesNotMatch(result.stderr,/EXACT_PAIR_FILE_MISSING/);
    const receipt=JSON.parse(fs.readFileSync(path.join(output,'runtime-domain-input-connections.json')));
    assert.equal(receipt.native_input_blocker,'SOURCE_PRODUCER_NOT_REGISTERED');
    assert.equal(receipt.domain_connections.length,13);
    assert.ok(receipt.domain_connections.every(d=>d.state==='HOLD'&&!d.native_domain_proven));
    assert.deepEqual(fs.readdirSync(output),['runtime-domain-input-connections.json']);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('missing business input remains an explicit waiting state with no domain certificate',()=>{
  const dir=fs.mkdtempSync(path.join(root,'.native-input-boundary-'));
  try{
    const output=path.join(dir,'output');
    const result=spawnSync('python3',[runner,path.join(dir,'absent.json'),output],{
      cwd:root,encoding:'utf8',env:{...process.env,GH_TOKEN:'',GITHUB_TOKEN:''}});
    assert.equal(result.status,0,result.stderr);
    const terminal=JSON.parse(result.stdout.slice(result.stdout.indexOf('{\n')));
    assert.equal(terminal.state,'WAITING_PAIR');
    assert.equal(terminal.native_runtime_proven,false);
    assert.equal(terminal.locally_executed_domain_count,0);
    assert.equal(terminal.authenticated_native_output_count,0);
    const receipt=JSON.parse(fs.readFileSync(path.join(output,'runtime-domain-input-connections.json')));
    assert.equal(receipt.native_input_blocker,'AUTHENTICATED_INPUT_REFERENCE_MISSING');
    assert.equal(receipt.whole_platform_runtime_proven,false);
    assert.equal(terminal.runtime_domain_observation_digest,receipt.receipt_digest);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
