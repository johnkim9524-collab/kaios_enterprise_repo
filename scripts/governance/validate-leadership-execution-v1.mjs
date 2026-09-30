#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const REQUIRED_PLAN_FIELDS=['goal','terminal_evidence','current_facts','hypotheses_and_unknowns','critical_bottleneck','chosen_route','excluded_work','decisive_precheck','limits','pivot_rule','handoff'];
export const HOLD_FIELDS=['PRODUCTION','PUBLIC','G5','NEW_EXTERNAL_SPEND','CONTRACT_EULA','PROVIDER_ACTIVATION','CREDENTIAL_API_ACTIVATION','GITHUB_APP_OAUTH_INSTALLATION','TRUST_ROOT_CHANGE','IRREVERSIBLE_SECURITY_LEGAL_CHANGE'];
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function validateExecutionPlan(plan,expectedSha){
 const e=[];const check=(v,c)=>{if(!v)e.push(c)};
 check(plan&&typeof plan==='object'&&!Array.isArray(plan),'PLAN_REQUIRED');if(e.length)return e;
 check(/^[0-9a-f]{40}$/.test(plan.source_sha??'')&&plan.source_sha===expectedSha,'PLAN_EXACT_SHA_REQUIRED');
 check(nonempty(plan.task_id)&&nonempty(plan.role_id),'PLAN_TASK_ROLE_BINDING_REQUIRED');
 for(const key of ['goal','terminal_evidence','critical_bottleneck','chosen_route','decisive_precheck','pivot_rule','handoff'])check(nonempty(plan[key]),'PLAN_FIELD_REQUIRED:'+key);
 for(const key of ['current_facts','hypotheses_and_unknowns','excluded_work'])check(Array.isArray(plan[key])&&plan[key].every(nonempty),'PLAN_ARRAY_REQUIRED:'+key);
 check((plan.current_facts?.length??0)>0,'PLAN_CURRENT_EVIDENCE_REQUIRED');
 check((plan.excluded_work?.length??0)>0,'PLAN_EXCLUSIONS_REQUIRED');
 const l=plan.limits??{};
 check(Number.isInteger(l.max_retries)&&l.max_retries>=0&&l.max_retries<=2,'PLAN_RETRY_BOUND_REQUIRED');
 check(Number.isFinite(l.max_elapsed_seconds)&&l.max_elapsed_seconds>0,'PLAN_TIME_BOUND_REQUIRED');
 check(Number.isFinite(l.max_planning_seconds)&&l.max_planning_seconds>0&&l.max_planning_seconds<=l.max_elapsed_seconds,'PLAN_PLANNING_BOUND_REQUIRED');
 check(Number.isFinite(l.max_incremental_spend)&&l.max_incremental_spend>=0,'PLAN_COST_BOUND_REQUIRED');
 if(l.max_incremental_spend>0)check(nonempty(l.budget_authority_ref),'PLAN_EXISTING_BUDGET_AUTHORITY_REQUIRED');
 check(nonempty(l.cost_observability),'PLAN_COST_OBSERVABILITY_REQUIRED');
 check(plan.same_failure_retry_without_new_evidence===false,'PLAN_UNCHANGED_RETRY_FORBIDDEN');
 check(plan.authority_granted_by_plan===false,'PLAN_CANNOT_GRANT_AUTHORITY');
 return e;
}
export function loadLeadershipState(root){
 const j=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
 const t=p=>fs.readFileSync(path.join(root,p),'utf8');
 const base='coordination/kidults/registry/';
 const ids={'people-ai':['agent-atlas','agent-codex-deputy','agent-aegis','agent-track-c'],'role':['role-integration-conductor','role-deputy-kpmo','role-track-r','role-track-c'],'track':['track-r-red-team-assurance','track-c-portal-v502-experience-layer']};
 const indexes={};const records={};for(const [kind,list]of Object.entries(ids)){indexes[kind]=j(base+kind+'/index.json');for(const id of list)records[id]=j(base+kind+'/records/'+id+'.json')}
 return {roles:j(base+'roles-and-responsibilities.json'),indexes,records,contract:j('coordination/kidults/governance/ai-agent-github-bootstrap-contract-v1.json'),manifest:j('coordination/kidults/governance/agent-constitutional-readiness-manifest-v1.json'),trackSchema:j('coordination/kidults/registry-engine/schemas/track-record.schema.json'),historicalWork:j(base+'work-queue/records/work-track-c-complete-role-acceptance.json'),sources:{emitter:t('scripts/governance/bootstrap-ai-agent-from-github-v1.mjs'),verifier:t('scripts/governance/verify-ai-agent-bootstrap-receipt-v1.mjs')},documents:Object.fromEntries(['AGENTS.md','.github/AI_AGENT_OPERATING_RULES.md','.github/copilot-instructions.md','coordination/kidults/bootstrap/README.md'].map(p=>[p,t(p)]))};
}
export function validateLeadershipState(s){
 const e=[];const check=(v,c)=>{if(!v)e.push(c)};const r=s.roles;const g=r.leadership_governance??{};const strategy=r.mandatory_execution_strategy??{};
 check(same(strategy.required_plan_fields,REQUIRED_PLAN_FIELDS),'STRATEGY_FIELDS_MISMATCH');
 check(strategy.applies_to==='ALL_GOVERNED_AI_AGENT_WORK','STRATEGY_SCOPE_MISMATCH');
 for(const field of ['same_failure_retry_without_new_evidence_allowed','routine_owner_approval_required','missing_cost_observability_allows_paid_dispatch','reading_receipt_proves_execution_quality','plan_validation_grants_dispatch_or_spend_authority'])check(strategy[field]===false,'STRATEGY_FALSE_REQUIRED:'+field);
 check(strategy.planning_must_be_bounded===true&&strategy.existing_evidence_reuse_required===true&&strategy.maximum_retries_per_root===2,'STRATEGY_BOUNDS_REQUIRED');
 check(g.permanent_kpmo_target_score===92&&g.qualification_pass_claimed===false&&g.material_disqualifiers_waived===false,'QUALIFICATION_BAR_CHANGED');
 for(const field of ['deputy_and_track_r_may_be_same_holder','kpmo_may_overrule_track_r_findings','track_r_may_replace_track_b','same_vendor_counts_as_independent','automatic_kpmo_succession_allowed','pat_allowed','ruleset_bypass_allowed','actual_new_role_dispatch_claimed'])check(g[field]===false,'GOVERNANCE_FALSE_REQUIRED:'+field);
 check(g.appointment_does_not_grant_dispatch===true,'DESIGNATION_IS_NOT_DISPATCH');
 check(g.external_launcher_enforcement==='NOT_ESTABLISHED_BY_REPOSITORY_CHANGE','EXTERNAL_LAUNCHER_PROOF_INFLATION');
 for(const gate of HOLD_FIELDS)check(g.protected_holds?.includes(gate),'HOLD_MISSING:'+gate);
 check(g.track_r_reports_to==='program-owner','TRACK_R_REPORTING_LINE');
 const ids=r.roles.map(x=>x.role_id);check(new Set(ids).size===ids.length,'DUPLICATE_JD_ROLE');
 const rules=[['deputy-kpmo','role-deputy-kpmo','agent-codex-deputy','integration-conductor','DEPUTY_KPMO'],['track-r-red-team','role-track-r','agent-aegis','program-owner','TRACK_R']];
 for(const [jdId,roleId,actorId,reportsTo,agentClass]of rules){
  const jd=r.roles.find(x=>x.role_id===jdId);const role=s.records[roleId];const actor=s.records[actorId];check(!!jd&&!!role&&!!actor,'ROLE_TRIAD_MISSING:'+jdId);if(!jd||!role||!actor)continue;
  check(jd.holder_id===actorId&&role.holder_id===actorId&&actor.role_ids?.includes(roleId)&&role.jd_role_id===jdId&&actor.jd_role_id===jdId,'ROLE_IDENTITY_MISMATCH:'+jdId);
  check(jd.reports_to===reportsTo&&role.reports_to===reportsTo&&actor.reports_to===reportsTo,'ROLE_REPORTING_MISMATCH:'+jdId);
  for(const key of ['mission','reporting_cadence'])check(nonempty(jd[key]),'JD_FIELD_REQUIRED:'+jdId+':'+key);
  for(const key of ['core_responsibilities','required_deliverables','decision_authority','must_not','success_measures'])check(Array.isArray(jd[key])&&jd[key].length>0,'JD_ARRAY_REQUIRED:'+jdId+':'+key);
  for(const record of [role,actor])check(record.status==='DESIGNATED_PENDING_ROLE_READINESS'&&record.dispatch_enabled===false&&record.current_session_readiness==='PENDING'&&record.role_acceptance_receipt===null,'UNPROVEN_ROLE_ACTIVATION:'+record.id);
  check(s.contract.inheritance.applies_to.includes(agentClass),'BOOTSTRAP_CLASS_MISSING:'+agentClass);
  for(const [label,source]of Object.entries(s.sources))check(source.includes(agentClass+": '"+jdId+"'"),'BOOTSTRAP_ROLE_MAP_MISMATCH:'+label+':'+agentClass);
 }
 const identityGate=r.named_role_identity_gate;
 check(identityGate?.mode==='DENY_UNTIL_PROTECTED_IDENTITY_VERIFIER'&&identityGate.trusted_identity_verifier_registered===false&&identityGate.holder_string_is_authentication===false&&identityGate.synthetic_receipt_is_actor_acceptance===false,'NAMED_ROLE_IDENTITY_CONTAINMENT_REQUIRED');
 check(same(identityGate?.roles,['deputy-kpmo','track-r-red-team','track-c-portal-v502']),'NAMED_ROLE_SET_MISMATCH');
 const namedIds=['integration-conductor','deputy-kpmo','track-r-red-team','track-c-portal-v502'];
 const holders=namedIds.map(id=>r.roles.find(role=>role.role_id===id)?.holder_id);
 check(holders.every(nonempty)&&new Set(holders).size===namedIds.length,'NAMED_ROLE_HOLDER_CONFLICT');
 check(holders[0]===s.records['role-integration-conductor'].holder_id&&holders[3]===s.records['role-track-c'].holder_id,'NAMED_ROLE_HOLDER_REGISTRY_MISMATCH');
 for(const [label,text]of Object.entries(s.sources))check(text.includes('enforceNamedRoleIdentity(roleRegistry,')&&text.includes("fail('ROLE_IDENTITY_ATTESTATION_REQUIRED')")&&text.includes("fail('REGISTERED_ROLE_HOLDER_MISMATCH')"),'NAMED_ROLE_GUARD_MISSING:'+label);
 check(s.contract.version==='1.8.0','BOOTSTRAP_VERSION_MISMATCH');
 for(const [label,source]of Object.entries(s.sources))check(source.includes('strategy_contract_sha256')&&source.includes('strategy_first_attitude_accepted')&&source.includes('reading_proves_execution_quality'),'STRATEGY_RECEIPT_BINDING_MISSING:'+label);
 const tc=s.records['track-c-portal-v502-experience-layer'];
 for(const id of ['agent-track-c','role-track-c']){const a=s.records[id];check(a.status==='ROLE_REVALIDATION_PENDING'&&a.historical_role_acceptance?.status==='APPROVED_AS_RECORDED'&&a.current_session_readiness==='PENDING'&&a.dispatch_enabled===false&&a.role_acceptance_receipt===null,'TRACK_C_HISTORY_CURRENT_CONFLATION:'+id)}
 check(tc.role_acceptance==='APPROVED'&&tc.role_acceptance_scope==='HISTORICAL_20260812_NOT_CURRENT_SESSION'&&tc.current_session_readiness==='PENDING'&&tc.dispatch_enabled===false,'TRACK_C_OPERATIONAL_SCOPE_MISMATCH');
 check(s.historicalWork.status==='COMPLETED'&&s.historicalWork.completed_at==='2026-08-12T23:10:00+09:00','TRACK_C_HISTORY_REWRITTEN');
 const tr=s.records['track-r-red-team-assurance'];check(tr.holder_id==='agent-aegis'&&tr.role_id==='role-track-r'&&tr.reports_to==='program-owner'&&tr.dispatch_enabled===false,'TRACK_R_TRIAD_MISMATCH');
 check(s.trackSchema.properties.id.enum.includes(tr.id),'TRACK_R_SCHEMA_MISSING');
 for(const [kind,index]of Object.entries(s.indexes)){check(index.record_count===index.records.length,'INDEX_COUNT_MISMATCH:'+kind);check(new Set(index.records.map(x=>x.id)).size===index.records.length,'INDEX_DUPLICATE:'+kind);for(const row of index.records){if(s.records[row.id])check(row.status===s.records[row.id].status,'INDEX_STATUS_MISMATCH:'+row.id)}}
 for(const [name,body]of Object.entries(s.documents))check(body.includes('mandatory_execution_strategy')&&body.includes('DEPUTY_KPMO')&&body.includes('TRACK_R'),'BOOTSTRAP_REMINDER_MISSING:'+name);
 check(s.manifest.required_reading_domains.find(x=>x.domain==='JD_AND_ROLE')?.required_topics.includes('mandatory_execution_strategy'),'READINESS_STRATEGY_TOPIC_MISSING');
 return e;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try {const args=process.argv.slice(2);let planPath=null;let expectedSha=null;for(let i=0;i<args.length;i++){if(args[i]==='--plan')planPath=args[++i];else if(args[i]==='--expected-sha')expectedSha=args[++i];else throw Error('UNKNOWN_ARGUMENT:'+args[i])}
 const state=loadLeadershipState(process.cwd());const errors=validateLeadershipState(state);if(planPath)errors.push(...validateExecutionPlan(JSON.parse(fs.readFileSync(planPath,'utf8')),expectedSha));
 console.log(JSON.stringify({id:'kidults-leadership-execution-validation-v1',state:errors.length?'VERIFIED_FAIL':'CONFIGURATION_VERIFIED_NOT_RUNTIME',errors,scope:'REPOSITORY_CONFIGURATION_AND_OPTIONAL_PLAN_SCHEMA_ONLY',independent_actor_acceptance_claimed:false,external_launcher_enforcement_claimed:false,dispatch_authority_granted:false,production:'HOLD',public_release:'HOLD',g5:'HOLD'},null,2));process.exitCode=errors.length?1:0;
 }catch(error){console.error(JSON.stringify({state:'VERIFIED_FAIL',failure_code:String(error.message),dispatch_authority_granted:false}));process.exitCode=1}
}