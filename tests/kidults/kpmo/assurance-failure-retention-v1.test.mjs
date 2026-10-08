import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const workflow=readFileSync('.github/workflows/kidults-platform-continuous-assurance-v1.yml','utf8');
function runBlock(name){const section=workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - name:')[0];
  assert.ok(section);return section.split('        run: |\n')[1].split('\n').map(line=>line.startsWith('          ')?line.slice(10):line).join('\n');}
test('early binding failure retains stale request separately and names failed step',()=>{
  const root=mkdtempSync(join(tmpdir(),'assurance-failure-test-'));
  try{
    const env={...process.env,RUNNER_TEMP:root,KPMO_CLASSIFIER_PACKET:'packet',GITHUB_REPOSITORY:'unit/test',GITHUB_SHA:'b'.repeat(40),GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',REQUESTED_SOURCE_SHA:'a'.repeat(40),REQUESTED_COVERAGE_RUN_ID:'122',CLASSIFIER_STEP_RESULTS:JSON.stringify({coverage_continuation_binding:{outcome:'failure'}})};
    const result=spawnSync('bash',['-c',runBlock('Retain failed canonical classification observation')],{env,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const receipt=JSON.parse(readFileSync(join(root,'packet/canonical-classification-failure-observation.json'),'utf8'));
    assert.deepEqual(receipt.failed_steps,['coverage_continuation_binding']);
    assert.notEqual(receipt.observer_source_sha,receipt.requested_source_sha);
    assert.equal(receipt.requested_inputs_authenticated,false);assert.equal(receipt.audit_executed,false);
    assert.equal(receipt.promotion_eligible,false);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('missing prerequisite receipts fail closed without an ENOENT secondary error',()=>{
  const root=mkdtempSync(join(tmpdir(),'assurance-missing-test-'));
  try{
    const result=spawnSync('bash',['-c',runBlock('Preserve control result without promoting overall HOLD')],{env:{...process.env,RUNNER_TEMP:root,KPMO_PACKET_SUFFIX:'missing'},encoding:'utf8'});
    assert.equal(result.status,1);assert.doesNotMatch(result.stderr,/ENOENT/);
    const observation=JSON.parse(result.stderr.trim());
    assert.equal(observation.failure_class,'ASSURANCE_PREREQUISITE_RECEIPTS_NOT_CREATED');
    assert.equal(observation.missing_receipts.length,3);assert.equal(observation.promotion_eligible,false);
  }finally{rmSync(root,{recursive:true,force:true});}
});
