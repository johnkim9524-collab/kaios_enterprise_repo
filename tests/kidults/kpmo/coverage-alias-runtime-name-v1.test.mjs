import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {observeCoverageAlias,receiptDigest} from '../../../scripts/kidults/kpmo/observe-continuous-assurance-coverage-alias-v1.mjs';
// Captured protected receipts reproduce manual Assurance 37204744865 offline.
// This fixture is regression evidence, never a newly admitted runtime receipt.
const fixture=()=>JSON.parse(fs.readFileSync('tests/fixtures/kpmo/coverage-alias-runtime-name-input-v1.json'));
test('actual run-name metadata consumes the original signed alias without an empirical or release promotion',()=>{
  const r=observeCoverageAlias(fixture());assert.equal(r.audit.states.internal_control_state,'VERIFIED_PASS');
  assert.equal(r.audit.states.external_empirical_state,'HOLD');assert.equal(r.audit.states.promotion_eligible,false);
  assert.equal(r.plan.activation_eligible,false);assert.equal(r.audit.empirical_truth_effect.candidate_or_evidence_created,false);
});
test('historical fixed workflow name remains valid with the same exact display title and source',()=>{
  const f=fixture();f.canonical_run.name='KIDULTS ASI Requirement-to-Adapter Coverage v1';
  assert.equal(observeCoverageAlias(f).audit.states.internal_control_state,'VERIFIED_PASS');
});
test('stored dynamic names are equivalent only when their source identity is exact',()=>{
  const f=fixture();f.leader_receipt.coverage_workflow_name=f.canonical_run.name;
  f.leader_receipt.receipt_digest=receiptDigest(f.leader_receipt);
  f.alias_receipt.canonical_receipt_digest=f.leader_receipt.receipt_digest;
  f.alias_receipt.receipt_digest=receiptDigest(f.alias_receipt);
  assert.equal(observeCoverageAlias(f).audit.states.internal_control_state,'VERIFIED_PASS');
});
test('foreign name, wrong-source name, wrong path/repository/event and nonterminal metadata remain denied',()=>{
  for(const change of [{name:'untrusted workflow'},{name:'KIDULTS Coverage / source-'+'a'.repeat(40)},
    {path:'.github/workflows/untrusted.yml'},{repository:{full_name:'foreign/repository'}},{event:'workflow_dispatch'},
    {status:'in_progress'},{display_title:'KIDULTS Coverage / source-'+'a'.repeat(40)}]){
    const f=fixture();Object.assign(f.canonical_run,change);assert.throws(()=>observeCoverageAlias(f),/COVERAGE_CANONICAL_RUN/);
  }
});
test('source and durable receipt tampering cannot be normalized into valid metadata',()=>{
  const f=fixture();f.canonical_run.head_sha='a'.repeat(40);assert.throws(()=>observeCoverageAlias(f),/STORED_RUN_METADATA/);
  const g=fixture();g.leader_receipt.coverage_workflow_name='untrusted';assert.throws(()=>observeCoverageAlias(g),/RECEIPT_DIGEST/);
});
