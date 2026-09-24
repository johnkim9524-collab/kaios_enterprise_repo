import assert from 'node:assert/strict';
import fs from 'node:fs';
import {classifyCandidate,DispatcherError} from '../../../scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs';
const policy=JSON.parse(fs.readFileSync('coordination/kidults/governance/autonomous-internal-landing-policy-v1.json'));
const sha=c=>c.repeat(40);
const pr={number:42,state:'open',merged:false,draft:false,base:{ref:'main',sha:sha('a'),repo:{id:1281328888,full_name:'johnkim9524-collab/kaios_enterprise_repo'}},head:{sha:sha('b'),repo:{full_name:'johnkim9524-collab/kaios_enterprise_repo'}}};
const input={pr,mainSha:sha('a'),treeSha:sha('c'),files:[{filename:'src/a.js'}],statuses:[{context:'required',state:'success'}],checks:[{id:101,name:'unit',head_sha:sha('b'),app:{id:7},status:'completed',conclusion:'success',external_id:'unit-101'}],requiredChecks:[{context:'unit',integration_id:7}],policy,now:new Date('2026-09-24T12:00:00Z')};
const e=classifyCandidate(input);assert.equal(e.authorization_generation,'pr-42-bbbbbbbbbbbbbbbbbbbb');assert.equal(e.production,'HOLD');assert.deepEqual(e.changed_paths,['src/a.js']);
const deny=(patch,code)=>assert.throws(()=>classifyCandidate({...input,...patch}),x=>x instanceof DispatcherError&&x.code===code);
deny({pr:{...pr,draft:true}},'DISPATCH_PR_NOT_READY');
deny({mainSha:sha('d')},'DISPATCH_BASE_STALE');
deny({files:[{filename:'.github/workflows/x.yml'}]},'DISPATCH_OWNER_RESERVED_PATH');
const canonicalFiles=[
  {filename:'.github/workflows/kpmo-canonical-generation-v3.yml'},
  {filename:'.github/workflows/kpmo-canonical-generation-v3-apply.yml'},
  {filename:'scripts/kidults/kpmo/canonical-generation-v3.mjs'},
  {filename:'coordination/kidults/governance/approval-policy-file-manifest-v1.json'},
  {filename:'coordination/kidults/governance/approval-policy-inventory-v1.json'},
];
assert.equal(classifyCandidate({...input,files:canonicalFiles}).changed_paths.length,5);
deny({files:[{filename:'coordination/kidults/governance/delegated-autonomous-internal-authority-policy-v1.json'}]},'DISPATCH_OWNER_RESERVED_PATH');
deny({checks:[{id:101,name:'unit',head_sha:sha('b'),status:'completed',conclusion:'failure'}]},'DISPATCH_CHECKS_NOT_GREEN');
deny({requiredChecks:[{context:'unit',integration_id:7},{context:'slow-required',integration_id:7}]},'DISPATCH_REQUIRED_CONTEXT_MISSING');
deny({requiredChecks:[{context:'unit',integration_id:8}]},'DISPATCH_REQUIRED_CONTEXT_MISSING');
deny({checks:[{id:101,name:'unit',head_sha:sha('b'),app:{id:7},status:'completed',conclusion:'success'},{id:102,name:'unit',head_sha:sha('b'),app:{id:7},status:'completed',conclusion:'success'}]},'DISPATCH_REQUIRED_CONTEXT_AMBIGUOUS');
deny({checks:[],statuses:[]},'DISPATCH_EVIDENCE_MISSING');
deny({pr:{...pr,head:{...pr.head,repo:{full_name:'fork/repo'}}}},'DISPATCH_REPOSITORY_SCOPE_INVALID');
deny({requiredChecks:[{context:'KPMO Live Canonical Issue Truth V1',integration_id:7}],checks:[{id:201,name:'KPMO Live Canonical Issue Truth V1',head_sha:sha('b'),app:{id:7},status:'completed',conclusion:'success',output:{summary:'IMPLEMENTED_NOT_VERIFIED'}}]},'DISPATCH_CANONICAL_SEMANTIC_STATE_NOT_VERIFIED');
const canonicalVerified=classifyCandidate({...input,requiredChecks:[{context:'KPMO Live Canonical Issue Truth V1',integration_id:7}],checks:[{id:202,name:'KPMO Live Canonical Issue Truth V1',head_sha:sha('b'),app:{id:7},status:'completed',conclusion:'success',output:{summary:'VERIFIED_PASS'}}]});
assert.equal(canonicalVerified.test_evidence.required_check_runs[0].id,202);
console.log(JSON.stringify({state:'VERIFIED_PASS',positive:3,negative:11}));

const dispatcherWorkflow=fs.readFileSync('.github/workflows/kidults-autonomous-dispatcher-v1.yml','utf8');
const deployWorkflow=fs.readFileSync('.github/workflows/kidults-autonomous-event-broker-deploy-v1.yml','utf8');
assert.doesNotMatch(dispatcherWorkflow,/\/tmp\/broker-response\.json/);
assert.match(dispatcherWorkflow,/\/dev\/stderr 2>&1 >\/dev\/null/);
assert.doesNotMatch(deployWorkflow,/\n  push:/);
assert.match(dispatcherWorkflow,/pull_request_target:/);
assert.match(dispatcherWorkflow,/types: \[opened, synchronize, reopened, ready_for_review\]/);
assert.match(dispatcherWorkflow,/github\.event\.pull_request\.number \|\| inputs\.pull_request/);
assert.match(dispatcherWorkflow,/KIDULTS_PR_NUMBER="\$pr_number" node scripts\/kidults\/kpmo\/run-autonomous-dispatcher-v1\.mjs/);
assert.equal((dispatcherWorkflow.match(/for event in kidults\.track\.authorization\.v1/g)||[]).length,1);
assert.match(dispatcherWorkflow,/for event[\s\S]*KIDULTS_PR_NUMBER="\$pr_number" node scripts\/kidults\/kpmo\/run-autonomous-dispatcher-v1\.mjs[\s\S]*repos\/\$\{GITHUB_REPOSITORY\}\/dispatches/);
const finalizerSource=fs.readFileSync('scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs','utf8');
assert.match(finalizerSource,/const eventToken=await acquireEventToken\(\);\s*await validateLiveCandidate\([^;]+;\s*invokeFinalizerWriter\(\{\s*action:'CREATE_RESERVATION'/);
for(const marker of ['main_sha:','stack_name:','change_set_name:','authorization_id:','create-change-set','execute-change-set']) assert.match(deployWorkflow,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));

assert.match(deployWorkflow,/expected_authorization_id="DEPLOY-STAGING-BROKER-\$\{GITHUB_SHA:0:12\}-\$\{\{ inputs\.change_set_name \}\}"/);
assert.doesNotMatch(deployWorkflow,/authorization_id[^\n]*GITHUB_RUN_ID/);
