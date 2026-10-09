import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {analyzeCapabilityRepair} from '../../../scripts/kidults/kpmo/lib/capability-repair-analysis-v1.mjs';
import {withCapabilityRepairAnalysis} from '../../../scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs';

const fixture=()=>({repository:'johnkim9524-collab/kaios_enterprise_repo',repositoryId:'1',pullRequest:2621,
  baseSha:'a'.repeat(40),headSha:'b'.repeat(40),treeSha:'c'.repeat(40),
  policy:{delegated_internal_path_prefixes:['scripts/kidults/kpmo/'],delegated_internal_exact_path_exceptions:[]},
  files:[{filename:'scripts/kidults/kpmo/a.mjs',base_content:'const limit=1;\nif(value>limit)throw new Error("DENIED");\n',
    head_content:'const limit=2;\nif(value>limit)throw new Error("DENIED");\n'},
    {filename:'scripts/kidults/kpmo/b.mjs',base_content:'if(!approved)throw new Error("DENIED");\n',head_content:'export const value=1;\n'}]});

test('both engines report later blocked files without replacing whole-scope denial',()=>{
  const report=analyzeCapabilityRepair(fixture());
  assert.equal(report.blocked_path_count,2);
  assert.equal(report.findings.length,4);
  assert.ok(report.whole_scope.every(item=>item.result==='VERIFIED_FAIL'));
  for(const field of ['authority_created','autonomous_eligible','landing_authorization_created','merge_authorized','repository_mutation_performed','automatic_retry_performed'])assert.equal(report[field],false);
});
test('diagnostic binding changes when immutable bytes drift under the same tuple',()=>{
  const input=fixture(),before=analyzeCapabilityRepair(input);
  input.files[1].head_content+='// source drift\n';
  const after=analyzeCapabilityRepair(input);
  assert.notEqual(before.binding.immutable_sources_digest,after.binding.immutable_sources_digest);
  assert.notEqual(before.receipt_digest,after.receipt_digest);
});
test('receipt digest is deterministic across file ordering and binds the complete report',()=>{
  const input=fixture(),report=analyzeCapabilityRepair(input);
  input.files.reverse();assert.deepEqual(analyzeCapabilityRepair(input),report);
  const {receipt_digest,...payload}=report;
  assert.equal(receipt_digest,'sha256:'+createHash('sha256').update(JSON.stringify(payload)).digest('hex'));
});
test('candidate classifier edits cannot grant their own activation even when probes pass',()=>{
  const input=fixture();input.files=[{filename:'scripts/kidults/kpmo/lib/semantic-capability-delta-v1.mjs',
    base_content:'export const value=1;\n',head_content:'export const value=2;\n'}];
  const report=analyzeCapabilityRepair(input);
  assert.equal(report.state,'DIAGNOSTIC_CLASSIFIERS_ACCEPTED');
  assert.equal(report.activation_constraint,'CANDIDATE_CANNOT_AUTHORIZE_ITS_OWN_POLICY_ACTIVATION');
  assert.equal(report.autonomous_eligible,false);
});
test('authority policy edits retain denials and an explicit protected activation boundary',()=>{
  const input=fixture(),path='coordination/kidults/governance/autonomous-internal-landing-policy-v1.json';
  input.policy.delegated_internal_exact_path_exceptions=[path];
  input.files=[{filename:path,base_content:JSON.stringify({owner_reserved_actions:['PRODUCTION']}),head_content:JSON.stringify({owner_reserved_actions:[]})}];
  const report=analyzeCapabilityRepair(input);
  assert.equal(report.activation_constraint,'CANDIDATE_CANNOT_AUTHORIZE_ITS_OWN_POLICY_ACTIVATION');
  assert.deepEqual(report.findings.map(item=>item.code),['CAPABILITY_AUTHORITY_POLICY_CHANGED','INDEPENDENT_AUTHORITY_POLICY_CHANGED']);
});
test('source and raw rejection text are never copied into diagnostic output',()=>{
  const input=fixture();input.files[0].head_content+='\n// PRIVATE_SOURCE_MARKER\n';
  assert.doesNotMatch(JSON.stringify(analyzeCapabilityRepair(input)),/PRIVATE_SOURCE_MARKER/);
});
test('paired immutable metadata retains the other changed source during per-file probes',()=>{
  const input=fixture();input.policy.delegated_internal_exact_path_exceptions=['coordination/kidults/governance/approval-policy-file-manifest-v1.json'];
  input.files.push({filename:'coordination/kidults/governance/approval-policy-file-manifest-v1.json',
    base_content:JSON.stringify({manifest_sha256:'a',files:[]}),
    head_content:JSON.stringify({manifest_sha256:'b',files:[]})});
  const report=analyzeCapabilityRepair(input);
  assert.equal(report.blocked_path_count,2);
  assert.ok(report.findings.every(item=>!item.path.endsWith('.json')));
});
for(const [name,mutate]of Object.entries({
  'duplicate path':x=>x.files.push(x.files[0]),'missing source':x=>delete x.files[0].head_content,
  'path traversal':x=>x.files[0].filename='../unsafe', 'newline path':x=>x.files[0].filename+='\n',
  'invalid tuple':x=>x.headSha='unbound','file budget':x=>x.files=Array.from({length:129},(_,n)=>({...x.files[0],filename:`scripts/kidults/kpmo/${n}.mjs`})),
  'byte budget':x=>x.files[0].head_content='x'.repeat(4*1024*1024),
})){test(`analysis rejects ${name}`,()=>{const input=fixture();mutate(input);assert.throws(()=>analyzeCapabilityRepair(input),/CAPABILITY_REPAIR_ANALYSIS_INPUT_INVALID/);});}
test('dispatcher preserves its original rejected state and reason with diagnostics',()=>{
  const input=fixture(),record={state:'OWNER_REVIEW_REQUIRED',reason:'CAPABILITY_GUARD_DEPENDENCY_CHANGED',merge_authorized:false};
  const context={pr:{number:input.pullRequest,base:{sha:input.baseSha,repo:{full_name:input.repository,id:input.repositoryId}},head:{sha:input.headSha}},treeSha:input.treeSha,files:input.files};
  const result=withCapabilityRepairAnalysis(record,context,input.policy);
  assert.equal(result.state,record.state);assert.equal(result.reason,record.reason);
  assert.equal(result.capability_repair_analysis.blocked_path_count,2);
  delete context.files[0].head_content;
  assert.equal(withCapabilityRepairAnalysis(record,context,input.policy).capability_repair_analysis.state,'DIAGNOSTIC_INPUT_UNAVAILABLE');
  assert.equal(withCapabilityRepairAnalysis({...record,reason:'DISPATCH_CHECKS_NOT_GREEN'},context,input.policy).capability_repair_analysis,undefined);
});
