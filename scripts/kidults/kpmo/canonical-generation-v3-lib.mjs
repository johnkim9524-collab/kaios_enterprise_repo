#!/usr/bin/env node
import fs from 'node:fs';
import {sha256, stableJson} from './material-defect-registry-v3.mjs';

export const MEMBERS=[235,236,237,238,240,256,344,457,479,480,489,521,550,558,559,560,609,742,769,881,921,951,1066,1166,1296];
export const AGGREGATE=344;
export const BASELINE=[1330,1412,1416,1419,1420,1421,1423,1427];
export const MS='<!-- KPMO_CANONICAL_GENERATION_V3_MEMBER_START -->';
export const ME='<!-- KPMO_CANONICAL_GENERATION_V3_MEMBER_END -->';
export const CS='<!-- KPMO_CANONICAL_GENERATION_V3_COMMIT_START -->';
export const CE='<!-- KPMO_CANONICAL_GENERATION_V3_COMMIT_END -->';
export const BOOTSTRAP_WORKFLOW='.github/workflows/kpmo-canonical-generation-v3.yml';
export const WRITER_WORKFLOW='.github/workflows/kpmo-canonical-generation-v3-apply.yml';
export const WORKFLOW=WRITER_WORKFLOW;
export const BOT='github-actions[bot]';

export const exact=(actual,expected,label)=>{if(stableJson(actual)!==stableJson(expected))throw new Error(`${label}_MISMATCH`);};
export const marked=(start,end,payload)=>`${start}\n${JSON.stringify(payload,null,2)}\n${end}`;
export function parseMarked(body,start,end){
  const text=String(body||''); const first=text.indexOf(start),last=text.lastIndexOf(start),endFirst=text.indexOf(end),endLast=text.lastIndexOf(end);
  if(first<0||endFirst<0)throw new Error('MARKER_MISSING');
  if(first!==last||endFirst!==endLast||endFirst<=first)throw new Error('MARKER_CARDINALITY_INVALID');
  try{return JSON.parse(text.slice(first+start.length,endFirst).trim());}catch{throw new Error('MARKER_JSON_INVALID');}
}
export const issueNo=(comment)=>Number(String(comment?.issue_url||'').split('/').at(-1));
export const generationId=(main,run,attempt)=>`kpmo-canonical-v3-${main.slice(0,12)}-${run}-${attempt}`;
export function snapshotProjection(payload){return {repository:payload.repository,protected_main_sha:payload.protected_main_sha,canonical_issue_numbers:payload.canonical_issue_numbers,canonical_issue_count:payload.canonical_issue_count,active_baseline_defects:payload.active_baseline_defects,material_defect_count:payload.material_defect_count,material_defect_issue_numbers:payload.material_defect_issue_numbers,material_defect_registry_sha256:payload.material_defect_registry_sha256,production:payload.production,public:payload.public,g5:payload.g5,promotion_eligible:payload.promotion_eligible,empirical_gate_effect:payload.empirical_gate_effect,truth_digest:payload.truth_digest};}
export function issueRegistrySnapshotProjection(payload){return {active_baseline_defects:payload.active_baseline_defects,material_defect_count:payload.material_defect_count,material_defect_issue_numbers:payload.material_defect_issue_numbers,material_defect_registry_sha256:payload.material_defect_registry_sha256};}
export function classifyCommitSnapshot(payload,snapshot){
  if(payload.protected_main_sha!==snapshot.protected_main_sha)return {stale:true,stale_reason:'PROTECTED_MAIN_MOVED'};
  if(stableJson(issueRegistrySnapshotProjection(payload))!==stableJson(issueRegistrySnapshotProjection(snapshot)))return {stale:true,stale_reason:'ISSUE_REGISTRY_SNAPSHOT_MOVED'};
  return {stale:false,stale_reason:null};
}
export function validateShared(payload,snapshot,label){exact(snapshotProjection(payload),snapshotProjection(snapshot),label);if(payload.production!=='HOLD'||payload.public!=='HOLD'||payload.g5!=='HOLD'||payload.promotion_eligible!==false)throw new Error(`${label}_HOLD_INVALID`);}
export function memberPayload(snapshot,id,issue,index,run,attempt,at){return {schema:'kpmo-canonical-generation-v3-member',version:'3.1.0',state:'STAGED_NONAUTHORITATIVE_UNTIL_AGGREGATE_COMMIT',generation_id:id,member_issue_number:issue,member_index:index+1,member_count:MEMBERS.length,writer_workflow_path:WRITER_WORKFLOW,writer_run_id:run,writer_run_attempt:attempt,generated_at:at,...snapshotProjection(snapshot)};}
export function commitPayload(snapshot,id,run,attempt,entries,at){return {schema:'kpmo-canonical-generation-v3-commit',version:'3.1.0',state:'COMMITTED',generation_id:id,aggregate_issue_number:AGGREGATE,writer_workflow_path:WRITER_WORKFLOW,writer_run_id:run,writer_run_attempt:attempt,committed_at:at,member_comments:entries,...snapshotProjection(snapshot)};}
export function validateMember(payload,snapshot,options){if(payload.schema!=='kpmo-canonical-generation-v3-member'||payload.state!=='STAGED_NONAUTHORITATIVE_UNTIL_AGGREGATE_COMMIT'||payload.generation_id!==options.id||payload.member_issue_number!==options.issue||payload.member_index!==options.index||payload.member_count!==MEMBERS.length||payload.writer_workflow_path!==WRITER_WORKFLOW||payload.writer_run_id!==options.run||payload.writer_run_attempt!==options.attempt)throw new Error('MEMBER_PAYLOAD_INVALID');validateShared(payload,snapshot,'MEMBER');}
export function validateCommitEnvelope(payload,run=null){
  if(payload.schema!=='kpmo-canonical-generation-v3-commit'||payload.state!=='COMMITTED'||payload.aggregate_issue_number!==AGGREGATE||payload.writer_workflow_path!==WRITER_WORKFLOW||!Number.isInteger(payload.writer_run_id)||!Number.isInteger(payload.writer_run_attempt)||!Array.isArray(payload.member_comments)||payload.member_comments.length!==MEMBERS.length)throw new Error('COMMIT_PAYLOAD_INVALID');
  if(run&&payload.writer_run_id!==run)throw new Error('COMMIT_WRITER_RUN_MISMATCH');
  if(!/^[0-9a-f]{40}$/.test(payload.protected_main_sha||'')||payload.generation_id!==generationId(payload.protected_main_sha,payload.writer_run_id,payload.writer_run_attempt))throw new Error('COMMIT_GENERATION_ID_INVALID');
  exact(payload.member_comments.map((entry)=>entry.issue_number),MEMBERS,'COMMIT_MEMBER_ORDER');
  if(new Set(payload.member_comments.map((entry)=>entry.comment_id)).size!==MEMBERS.length||payload.member_comments.some((entry)=>!Number.isInteger(entry.comment_id)||!/^sha256:[0-9a-f]{64}$/.test(entry.comment_body_sha256||'')))throw new Error('COMMIT_MEMBER_ID_OR_DIGEST_INVALID');
  exact(payload.canonical_issue_numbers,MEMBERS,'COMMIT_CANONICAL_ISSUE_ORDER');
  if(payload.canonical_issue_count!==MEMBERS.length||!Array.isArray(payload.active_baseline_defects)||payload.active_baseline_defects.some((number)=>!Number.isInteger(number)||number<1)||!Number.isInteger(payload.material_defect_count)||payload.material_defect_count<0||!Array.isArray(payload.material_defect_issue_numbers)||payload.material_defect_issue_numbers.length!==payload.material_defect_count||payload.material_defect_issue_numbers.some((number)=>!Number.isInteger(number)||number<1)||new Set(payload.material_defect_issue_numbers).size!==payload.material_defect_issue_numbers.length||!/^sha256:[0-9a-f]{64}$/.test(payload.material_defect_registry_sha256||'')||!/^sha256:[0-9a-f]{64}$/.test(payload.truth_digest||''))throw new Error('COMMIT_SNAPSHOT_PROJECTION_INVALID');
  if(payload.production!=='HOLD'||payload.public!=='HOLD'||payload.g5!=='HOLD'||payload.promotion_eligible!==false||payload.empirical_gate_effect!=='NONE')throw new Error('COMMIT_HOLD_INVALID');
}
export function validateCommit(payload,snapshot,run=null){validateCommitEnvelope(payload,run);validateShared(payload,snapshot,'COMMIT');}

export function selfTest(){
  if(BOOTSTRAP_WORKFLOW===WRITER_WORKFLOW||WORKFLOW!==WRITER_WORKFLOW)throw new Error('SELF_TEST_WORKFLOW_ROLE_CONFLATION');
  const snapshot={repository:'o/r',protected_main_sha:'a'.repeat(40),canonical_issue_numbers:MEMBERS,canonical_issue_count:25,active_baseline_defects:[1330],material_defect_count:1,material_defect_issue_numbers:[9],material_defect_registry_sha256:`sha256:${'1'.repeat(64)}`,production:'HOLD',public:'HOLD',g5:'HOLD',promotion_eligible:false,empirical_gate_effect:'NONE'};
  snapshot.truth_digest=sha256({...snapshot});
  const id=generationId(snapshot.protected_main_sha,7,1);
  const member=memberPayload(snapshot,id,235,0,7,1,'2026-01-01T00:00:00Z');
  if(member.writer_workflow_path!==WRITER_WORKFLOW)throw new Error('SELF_TEST_MEMBER_WRITER_PATH');
  validateMember(parseMarked(marked(MS,ME,member),MS,ME),snapshot,{id,issue:235,index:1,run:7,attempt:1});
  const entries=MEMBERS.map((issue,index)=>({issue_number:issue,comment_id:100+index,comment_body_sha256:`sha256:${String(index).padStart(64,'0')}`}));
  const commit=commitPayload(snapshot,id,7,1,entries,'2026-01-01T00:01:00Z');
  if(commit.writer_workflow_path!==WRITER_WORKFLOW)throw new Error('SELF_TEST_COMMIT_WRITER_PATH');
  validateCommit(commit,snapshot,7);
  const unchanged=classifyCommitSnapshot(commit,snapshot);
  if(unchanged.stale||unchanged.stale_reason!==null)throw new Error('SELF_TEST_UNCHANGED_SNAPSHOT_NOT_IDEMPOTENT');
  const added={...snapshot,material_defect_count:2,material_defect_issue_numbers:[9,10],material_defect_registry_sha256:`sha256:${'2'.repeat(64)}`};
  const deleted={...snapshot,material_defect_count:0,material_defect_issue_numbers:[],material_defect_registry_sha256:`sha256:${'3'.repeat(64)}`};
  const relabeled={...snapshot,material_defect_registry_sha256:`sha256:${'4'.repeat(64)}`};
  for(const [name,current] of [['issue-addition',added],['issue-deletion',deleted],['label-change',relabeled]]){
    const classification=classifyCommitSnapshot(commit,current);
    if(!classification.stale||classification.stale_reason!=='ISSUE_REGISTRY_SNAPSHOT_MOVED')throw new Error(`SELF_TEST_${name}_NOT_STALE`);
  }
  const mainMoved=classifyCommitSnapshot(commit,{...snapshot,protected_main_sha:'b'.repeat(40)});
  if(!mainMoved.stale||mainMoved.stale_reason!=='PROTECTED_MAIN_MOVED')throw new Error('SELF_TEST_MAIN_MOVE_NOT_STALE');
  for(const [name,fn] of [
    ['partial',()=>validateCommit({...commit,member_comments:entries.slice(1)},snapshot)],
    ['stale',()=>validateCommit({...commit,protected_main_sha:'b'.repeat(40)},snapshot)],
    ['hold',()=>validateCommit({...commit,production:'PASS'},snapshot)],
    ['digest',()=>validateCommit({...commit,material_defect_registry_sha256:`sha256:${'0'.repeat(64)}`},snapshot)],
    ['writer-path',()=>validateCommit({...commit,writer_workflow_path:BOOTSTRAP_WORKFLOW},snapshot)],
    ['canonical-count',()=>validateCommit({...commit,canonical_issue_count:24},snapshot)],
  ]){let rejected=false;try{fn();}catch{rejected=true;}if(!rejected)throw new Error(`SELF_TEST_${name}_ESCAPED`);}
  const workflow=fs.readFileSync(BOOTSTRAP_WORKFLOW,'utf8');
  const invariants=[
    ['pr',/^  pull_request:/m,true],['dispatch',/^  workflow_dispatch:/m,true],
    ['no-push',/^  push:/m,false],['no-issues',/^  issues:/m,false],['no-schedule',/^  schedule:/m,false],
    ['no-issues-write',/issues:\s*write/,false],['no-secrets',/\$\{\{[^}]*secrets/i,false],
    ['validation-only',/CANONICAL_V3_BOOTSTRAP_VALIDATION_ONLY/,true],
  ];
  for(const [name,re,want] of invariants)if(re.test(workflow)!==want)throw new Error(`SELF_TEST_WORKFLOW_${name}`);
  return {test:'KPMO_CANONICAL_GENERATION_V3_SELF_TEST',state:'VERIFIED_PASS',canonical_members:25,append_only_payload_model:true,partial_generation_nonauthoritative:true,exact_main_and_hold:true,material_registry_bound:true,same_main_issue_addition_stale:true,same_main_issue_deletion_stale:true,same_main_label_change_stale:true,unchanged_snapshot_idempotent_eligible:true,workflow_bootstrap_read_only:true,writes_reachable_from_workflow:false,workflow_roles_separated:true,writer_workflow_path:WRITER_WORKFLOW,mutations_rejected:6};
}
