import test from 'node:test';
import assert from 'node:assert/strict';
import {TARGET,MARKER,validateRun,reconcileRuns,validateApproval,validateRules,validateMerge} from './owner-pinned-preflight-bootstrap-2576.mjs';
const launcherSha='a'.repeat(40);
const expected={runId:'7001',attempt:'1',launcherSha,ref:`refs/heads/${TARGET.launcher_branch}`};
const run=()=>({id:7001,run_attempt:1,workflow_id:350643082,event:'workflow_dispatch',head_branch:TARGET.launcher_branch,head_sha:launcherSha,path:TARGET.workflow_path,display_title:TARGET.title,actor:{login:TARGET.owner},triggering_actor:{login:TARGET.owner},repository:{id:TARGET.repository_id,full_name:TARGET.repository},head_repository:{id:TARGET.repository_id}});
const approval=()=>({id:42,user:{login:TARGET.owner,type:'User'},author_association:'OWNER',performed_via_github_app:null,created_at:'2026-10-06T00:10:00Z',updated_at:'2026-10-06T00:10:00Z',body:MARKER+'\n'+JSON.stringify({...TARGET,launcher_sha:launcherSha,production:'HOLD',public:'HOLD',g5:'HOLD',approval_rebind:'FORBIDDEN',expires_at:'2026-10-06T00:55:00Z',nonce:'b'.repeat(32)})});
const times={launcherSha,runStartedAt:'2026-10-06T00:11:00Z',readyAt:'2026-10-06T00:00:00Z',headCommittedAt:'2026-10-06T00:05:00Z',now:Date.parse('2026-10-06T00:15:00Z')};
test('native branch bootstrap identity is explicit and differs from main',()=>assert.equal(validateRun(run(),expected).head_branch,TARGET.launcher_branch));
for(const [key,value] of [['id',7002],['run_attempt',2],['event','push'],['head_branch','main'],['head_sha','c'.repeat(40)],['path','other.yml'],['display_title','Other']])test(`reject native ${key} mismatch`,()=>assert.throws(()=>validateRun({...run(),[key]:value},expected)));
for(const key of ['actor','triggering_actor'])test(`reject non-Owner ${key}`,()=>assert.throws(()=>validateRun({...run(),[key]:{login:'other'}},expected)));
test('reject repository substitution',()=>assert.throws(()=>validateRun({...run(),head_repository:{id:9}},expected)));
test('missing current native run is supplemented exactly once without altering input',()=>{const rows=[];assert.deepEqual(reconcileRuns(rows,run(),expected),{matching_run_count:1,current_supplemented:true,native_run_id:7001});assert.equal(rows.length,0);});
test('already indexed current run is not duplicated',()=>assert.equal(reconcileRuns([run()],run(),expected).current_supplemented,false));
test('duplicate current run denied',()=>assert.throws(()=>reconcileRuns([run(),run()],run(),expected),/DUPLICATE/));
test('prior other dispatch denied even after failure',()=>assert.throws(()=>reconcileRuns([{...run(),id:7000,status:'completed',conclusion:'failure'}],run(),expected),/ALREADY_DISPATCHED/));
for(const [key,value] of [['run_attempt',2],['workflow_id',7],['event','push'],['head_branch','main'],['head_sha','c'.repeat(40)],['path','other.yml'],['display_title','wrong']])test(`reject indexed ${key} conflict`,()=>assert.throws(()=>reconcileRuns([{...run(),[key]:value}],run(),expected),/INDEX_CONFLICT/));
test('exact Owner bootstrap approval accepted',()=>assert.equal(validateApproval(approval(),times).comment_id,42));
for(const [key,value] of [['head_sha','c'.repeat(40)],['base_sha','c'.repeat(40)],['head_tree_sha','c'.repeat(40)],['pull_request',2575],['launcher_sha','c'.repeat(40)],['production','PASS'],['approval_rebind','ALLOWED'],['operation','OTHER']])test(`approval ${key} mismatch denied`,()=>{const c=approval(),p=JSON.parse(c.body.slice(MARKER.length+1));p[key]=value;c.body=MARKER+'\n'+JSON.stringify(p);assert.throws(()=>validateApproval(c,times));});
test('edited approval denied',()=>assert.throws(()=>validateApproval({...approval(),updated_at:'2026-10-06T00:12:00Z'},times),/EDITED/));
test('App-authored approval denied',()=>assert.throws(()=>validateApproval({...approval(),performed_via_github_app:{id:1}},times),/ACTOR/));
test('expired approval denied',()=>assert.throws(()=>validateApproval(approval(),{...times,now:Date.parse('2026-10-06T02:00:00Z')}),/EXPIRY/));
test('approval after run denied',()=>assert.throws(()=>validateApproval(approval(),{...times,runStartedAt:'2026-10-06T00:09:00Z'}),/AFTER_RUN/));
test('approval before final lifecycle boundary denied',()=>assert.throws(()=>validateApproval(approval(),{...times,readyAt:'2026-10-06T00:10:00Z'}),/ORDER/));
const rules=()=>[{id:20985805,enforcement:'active',bypass_actors:[],conditions:{ref_name:{exclude:[],include:['~DEFAULT_BRANCH']}},rules:[{type:'required_status_checks',parameters:{strict_required_status_checks_policy:true,required_status_checks:['KAIOS Solo Owner Preflight','Validate KAIOS Foundation','Validate Production Container','KIDULTS Scope-Aware Authoritative Status V1','KIDULTS Governed Landing Authorization V1'].map(context=>({context,integration_id:15368}))}}]},{id:19862431,enforcement:'active',bypass_actors:[],conditions:{ref_name:{exclude:[],include:['~DEFAULT_BRANCH']}},rules:[{type:'pull_request',parameters:{required_approving_review_count:0,dismiss_stale_reviews_on_push:true,require_code_owner_review:false,require_last_push_approval:false,required_review_thread_resolution:true,require_extra_approval_for_unattributed_changes:true}}]}];
test('exact unchanged native protection accepted',()=>assert.match(validateRules(...rules()),/^sha256:/));
test('ruleset bypass denied',()=>{const r=rules();r[0].bypass_actors=[{actor_id:1}];assert.throws(()=>validateRules(...r),/BOUNDARY/);});
test('non-Actions issuer denied',()=>{const r=rules();r[0].rules[0].parameters.required_status_checks[0].integration_id=0;assert.throws(()=>validateRules(...r),/ISSUER/);});
test('removed required context denied',()=>{const r=rules();r[0].rules[0].parameters.required_status_checks.pop();assert.throws(()=>validateRules(...r),/REQUIRED_SET/);});
test('weakened review-thread rule denied',()=>{const r=rules();r[1].rules[0].parameters.required_review_thread_resolution=false;assert.throws(()=>validateRules(...r),/PR_POLICY/);});
const pr=()=>({merged:true,head:{sha:TARGET.head_sha},merged_by:{login:TARGET.owner},merge_commit_sha:'d'.repeat(40),merged_at:'2026-10-06T00:20:00Z'});
const commit=()=>({sha:'d'.repeat(40),commit:{tree:{sha:TARGET.head_tree_sha}},parents:[{sha:TARGET.base_sha},{sha:TARGET.head_sha}]});
const window={openedAt:'2026-10-06T00:15:00Z',expiresAt:'2026-10-06T00:55:00Z',windowSeconds:600};
test('exact bounded Owner merge accepted',()=>assert.equal(validateMerge(pr(),commit(),window).merge_sha,'d'.repeat(40)));
test('wrong merger denied',()=>assert.throws(()=>validateMerge({...pr(),merged_by:{login:'app[bot]'}},commit(),window),/ACTOR/));
test('wrong merge tree denied',()=>{const c=commit();c.commit.tree.sha='e'.repeat(40);assert.throws(()=>validateMerge(pr(),c,window),/TREE/);});
test('reordered parents denied',()=>{const c=commit();c.parents.reverse();assert.throws(()=>validateMerge(pr(),c,window),/PARENTS/);});
test('merge outside window denied',()=>assert.throws(()=>validateMerge({...pr(),merged_at:'2026-10-06T00:26:00Z'},commit(),window),/WINDOW/));

// New tests only; the prior 46 bootstrap tests are retained, not rerun here.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {ENVIRONMENT,validateEnvironment,requireNativeReview,validatePreflight} from './owner-pinned-preflight-bootstrap-2576.mjs';
const nativeEnvironment=()=>({id:ENVIRONMENT.id,name:ENVIRONMENT.name,can_admins_bypass:false,deployment_branch_policy:{protected_branches:false,custom_branch_policies:true},protection_rules:[{type:'required_reviewers',prevent_self_review:false,reviewers:[{type:'User',reviewer:{id:ENVIRONMENT.reviewer_id,login:TARGET.owner}}]},{type:'branch_policy'}]});
const nativeBranches=()=>({total_count:1,branch_policies:[{id:ENVIRONMENT.branch_policy_id,type:'branch',name:TARGET.launcher_branch}]});
const nativeReview=()=>[{state:'approved',user:{id:ENVIRONMENT.reviewer_id,login:TARGET.owner,type:'User'},environments:[{id:ENVIRONMENT.id,name:ENVIRONMENT.name}]}];
test('GitHub protected exact native environment accepted',()=>assert.match(validateEnvironment(nativeEnvironment(),nativeBranches()),/^sha256:/));
for(const [name,mutate] of [
 ['wrong environment',e=>e.id++],['admin bypass',e=>e.can_admins_bypass=true],
 ['missing reviewer',e=>e.protection_rules=e.protection_rules.filter(x=>x.type!=='required_reviewers')],
 ['wrong reviewer',e=>e.protection_rules[0].reviewers[0].reviewer.id++],
 ['additional reviewer',e=>e.protection_rules[0].reviewers.push(e.protection_rules[0].reviewers[0])],
 ['all branches',e=>e.deployment_branch_policy=null],
 ['missing branch protection',e=>e.protection_rules.pop()],
 ])test(`GitHub protected rejects ${name}`,()=>{const e=nativeEnvironment();mutate(e);assert.throws(()=>validateEnvironment(e,nativeBranches()));});
for(const [name,mutate] of [
 ['wildcard',b=>b.branch_policies[0].name='*'],['tag substitution',b=>b.branch_policies[0].type='tag'],
 ['extra branch',b=>{b.total_count=2;b.branch_policies.push({...b.branch_policies[0],name:'main'});}]
 ])test(`GitHub protected rejects ${name}`,()=>{const b=nativeBranches();mutate(b);assert.throws(()=>validateEnvironment(nativeEnvironment(),b));});
test('GitHub protected accepts actual Owner review history',()=>assert.equal(requireNativeReview(nativeReview()).reviewer,TARGET.owner));
test('GitHub protected denies absent native review',()=>assert.throws(()=>requireNativeReview([])));
test('GitHub protected denies rejected native review',()=>{const r=nativeReview();r[0].state='rejected';assert.throws(()=>requireNativeReview(r));});
test('GitHub protected denies non-Owner native review',()=>{const r=nativeReview();r[0].user.id=9;assert.throws(()=>requireNativeReview(r));});
test('GitHub protected denies review for another environment',()=>{const r=nativeReview();r[0].environments[0].id++;assert.throws(()=>requireNativeReview(r));});
test('GitHub protected denies ambiguous review history',()=>assert.throws(()=>requireNativeReview([...nativeReview(),...nativeReview()])));
const sealNative=x=>({...x,receipt_sha256:'sha256:'+crypto.createHash('sha256').update(JSON.stringify(x,(_k,v)=>v&&!Array.isArray(v)&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v)).digest('hex')});
const nativeProof=()=>sealNative({state:'READ_ONLY_PREFLIGHT_VERIFIED',native_run_id:7001,native_run_attempt:1,launcher_sha:launcherSha,target:TARGET,source_sha:TARGET.head_sha,source_tree:TARGET.head_tree_sha,environment_digest:'env-digest',ruleset_digest:'rules-digest',status_write_performed:false,merge_performed_by_workflow:false});
const nativeProofOptions={runId:7001,launcherSha,environmentDigest:'env-digest',rulesDigest:'rules-digest'};
test('GitHub protected accepts same-run sealed preflight',()=>assert.equal(validatePreflight(nativeProof(),nativeProofOptions).native_run_id,7001));
test('GitHub protected denies altered preflight bytes',()=>{const p=nativeProof();p.source_sha='e'.repeat(40);assert.throws(()=>validatePreflight(p,nativeProofOptions));});
test('GitHub protected denies another-run preflight',()=>assert.throws(()=>validatePreflight(nativeProof(),{...nativeProofOptions,runId:7002})));
test('GitHub protected denies environment drift',()=>assert.throws(()=>validatePreflight(nativeProof(),{...nativeProofOptions,environmentDigest:'changed'})));
test('GitHub protected denies a preflight claiming write authority',()=>{const {receipt_sha256,...p}=nativeProof();p.status_write_performed=true;assert.throws(()=>validatePreflight(sealNative(p),nativeProofOptions));});
test('GitHub protected separates read-only and environment-gated jobs',()=>{
 const y=fs.readFileSync(new URL('../../../.github/workflows/kidults-direct-owner-landing-handoff-v1.yml',import.meta.url),'utf8');
 const readOnly=y.slice(y.indexOf('  read-only-verification:'),y.indexOf('  github-approved-recovery:'));
 const writer=y.slice(y.indexOf('  github-approved-recovery:'));
 assert.doesNotMatch(readOnly,/statuses: write|contents: write|id-token: write|pull-requests: write/);
 assert.match(writer,/needs: read-only-verification/);assert.match(writer,/environment:\s+name: KIDULTS-OWNER-RECOVERY-2576/);
 assert.match(writer,/statuses: write/);assert.doesNotMatch(writer,/contents: write|pull-requests: write|id-token: write/);
 assert.match(writer,/preflight_artifact_id/);assert.doesNotMatch(y,/approval_comment_id/);
});
test('GitHub protected privileged validation uses protected-base libraries, not candidate imports',()=>{
 const s=fs.readFileSync(new URL('./owner-pinned-preflight-bootstrap-2576.mjs',import.meta.url),'utf8');
 assert.match(s,/GITHUB_WRITE_WITHOUT_NATIVE_APPROVAL/);assert.match(s,/requireNativeReview\(await request/);
 assert.match(s,/import\(pathToFileURL\(path.join\(trusted,/);assert.doesNotMatch(s,/import\(pathToFileURL\(path.join\(source,/);
 assert.doesNotMatch(s,/method:'PUT'|\/merges|\/pending_deployments/);
});
