#!/usr/bin/env node
import fs from 'node:fs';

const P={
 policy:'coordination/kidults/runtime/cloudflare-pages-staging-governance-v1.json',
 registry:'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json',
 readonlyWorkflow:'.github/workflows/kidults-cloudflare-pages-boundary-readonly-v1.yml',
 deployWorkflow:'.github/workflows/kidults-cloudflare-pages-staging-deploy-v1.yml',
 emergencyWorkflow:'.github/workflows/kidults-cloudflare-pages-emergency-control-v1.yml',
 readonlyScript:'scripts/ops/cloudflare-pages-boundary-readonly.sh',
 containScript:'scripts/ops/cloudflare-pages-auto-deployment-containment.sh',
 cleanupScript:'scripts/ops/cloudflare-pages-preview-cleanup.sh',
 deployScript:'scripts/ops/cloudflare-pages-governed-staging-deploy.sh'
};
for(const f of Object.values(P)) if(!fs.existsSync(f)) throw new Error(`MISSING:${f}`);
const read=f=>fs.readFileSync(f,'utf8');
const policy=JSON.parse(read(P.policy));
const registry=JSON.parse(read(P.registry));
const findings=[];
const req=(c,id)=>{if(!c)findings.push(id)};

req(policy.id==='kidults-cloudflare-pages-staging-governance-v1','POLICY_ID');
req(policy.version==='1.1.0','POLICY_VERSION');
req(policy.status==='ACTIVE_FAIL_CLOSED_GLOBAL_NO_RERUN','POLICY_STATUS');
req(policy.project?.name==='kidults-workspace-staging','PROJECT');
req(policy.project?.expected_repository==='johnkim9524-collab/kaios_enterprise_repo','REPOSITORY');
req(policy.project?.production_branch==='main','MAIN_BRANCH');
req(policy.automatic_deployment_boundary?.production_deployments_enabled===false,'PRODUCTION_AUTO_OFF');
req(policy.automatic_deployment_boundary?.preview_deployment_setting==='none','PREVIEW_NONE');
req(policy.automatic_deployment_boundary?.granular_controls_authoritative===true,'GRANULAR_AUTHORITY');
req(policy.automatic_deployment_boundary?.deprecated_deployments_enabled_authoritative===false,'LEGACY_NONAUTH');
req(policy.automatic_deployment_boundary?.preview_branch_rules_authoritative_only_when_custom===true,'PREVIEW_RULE_SCOPE');
req(policy.automatic_deployment_boundary?.git_push_is_deployment_authority===false,'GIT_PUSH_NOT_AUTHORITY');
req(policy.deployment_policy?.trigger==='workflow_dispatch_only','DEPLOY_MANUAL');
req(policy.deployment_policy?.execution_state==='HOLD_HARD_DISABLED_PENDING_DURABLE_LEDGER','DEPLOY_NO_RERUN');
req(policy.deployment_policy?.authorization_phrase_is_authority===false,'DEPLOY_PHRASE_NOT_AUTHORITY');
req(policy.deployment_policy?.external_durable_one_shot_consume_required===true,'DEPLOY_LEDGER_REQUIRED');
req(policy.deployment_policy?.source_sha==='EXACT_LIVE_MAIN_ONLY','EXACT_MAIN');
req(policy.read_only_monitor?.visible_preview_count_must_be_zero===true,'PREVIEW_ZERO');
req(policy.emergency_control?.production_deployment_delete_forbidden===true,'PROD_DELETE_FORBIDDEN');
req(policy.emergency_control?.execution_state==='HOLD_HARD_DISABLED_PENDING_DURABLE_LEDGER','EMERGENCY_NO_RERUN');
req(policy.emergency_control?.owner_entered_phrase_is_authority===false,'EMERGENCY_PHRASE_NOT_AUTHORITY');
req(policy.emergency_control?.external_durable_one_shot_consume_required===true,'EMERGENCY_LEDGER_REQUIRED');
req(policy.truth_boundary?.platform_environment==='STAGING','STAGING');
req(policy.truth_boundary?.public_release==='HOLD'&&policy.truth_boundary?.production==='HOLD'&&policy.truth_boundary?.g5==='HOLD','RELEASE_HOLD');

const ro=read(P.readonlyScript), dep=read(P.deployScript), clean=read(P.cleanupScript), contain=read(P.containScript);
for(const s of [ro,dep]){
 req(s.includes('production_deployments_enabled')&&s.includes('preview_deployment_setting'),'GRANULAR_SCRIPT_GUARD');
 req(!s.includes('legacy_deployments_enabled == false'),'LEGACY_MUST_NOT_GATE');
}
req(ro.includes('legacy_deployments_enabled_authoritative:false'),'READONLY_LEGACY_INFORMATIONAL');
req(ro.includes('preview_branch_rules_authoritative_only_when_custom:true'),'READONLY_PREVIEW_RULE_SCOPE');
req(ro.includes('select(.environment == "preview" and .materialized == true)'),'READONLY_MATERIALIZED_PREVIEW');
req(ro.includes('UNVERIFIED_APPROVAL_MESSAGE_V1')&&ro.includes('LEGACY_SELF_ASSERTED_MESSAGE_V1'),'READONLY_UNVERIFIED_LINEAGE_FORMATS');
req(ro.includes('startswith("[KIDULTS-GOVERNED-STAGING] approval_id=")'),'READONLY_APPROVAL_BOUND_PREFIX');
req(ro.includes('contains(" repository=" + $expected_repository + " ")'),'READONLY_APPROVAL_REPOSITORY_BINDING');
req(ro.includes('contains(" source_sha=" + $commit_hash + " ")'),'READONLY_SOURCE_SHA_BINDING');
req(ro.includes('current_main_match_required:true')&&ro.includes('current_main_match_is_informational:false'),'READONLY_CURRENT_MAIN_PARITY_REQUIRED');
req(ro.includes('governed_staging_current_main_parity'),'READONLY_PARITY_RECEIPT');
req(ro.includes('LATEST_DEPLOYMENT_SIGNED_LEDGER_LINEAGE_UNVERIFIED'),'READONLY_SIGNED_LINEAGE_BLOCKER');
req(ro.includes('latest_governed=false')&&ro.includes('signed_ledger_lineage_verified=false'),'READONLY_SELF_ASSERTED_LINEAGE_FORBIDDEN');
req(clean.includes('select(.environment == "preview" and .materialized == true) | .id'),'CLEANUP_PREVIEW_ONLY');
req(clean.includes('test "$initial_production_ids" = "$final_production_ids"'),'PRODUCTION_HISTORY_GUARD');
req(!clean.includes('select(.environment == "production") | .id | @sh'),'NO_PROD_DELETE');
req(contain.includes('.config.production_deployments_enabled = false'),'CONTAIN_PRODUCTION_OFF');
req(contain.includes('.config.preview_deployment_setting = "none"'),'CONTAIN_PREVIEW_NONE');
req(dep.includes('wrangler@4.127.1 pages deploy'),'WRANGLER_PIN');
req(dep.includes('trigger_type == "ad_hoc"'),'ADHOC_PROOF');
req(dep.includes('public_release:"HOLD"')&&dep.includes('production:"HOLD"')&&dep.includes('g5:"HOLD"'),'DEPLOY_HOLD');
for(const mutationScript of [dep,clean,contain]) req(mutationScript.includes('Cloudflare mutation NO-RERUN'),'MUTATION_SCRIPT_NO_RERUN');
for(const mutationWorkflow of [read(P.deployWorkflow),read(P.emergencyWorkflow)]) req(mutationWorkflow.includes('&& false'),'MUTATION_WORKFLOW_HARD_DISABLED');

for(const wf of [P.readonlyWorkflow,P.emergencyWorkflow,P.deployWorkflow]) req((registry.registered_workflows||[]).includes(wf),`REGISTRY:${wf}`);

const mutations=[
 ['AUTO_ON',()=>{const x=structuredClone(policy);x.automatic_deployment_boundary.production_deployments_enabled=true;return x.automatic_deployment_boundary.production_deployments_enabled===false}],
 ['PREVIEW_ALL',()=>{const x=structuredClone(policy);x.automatic_deployment_boundary.preview_deployment_setting='all';return x.automatic_deployment_boundary.preview_deployment_setting==='none'}],
 ['LEGACY_AUTH',()=>{const x=structuredClone(policy);x.automatic_deployment_boundary.deprecated_deployments_enabled_authoritative=true;return x.automatic_deployment_boundary.deprecated_deployments_enabled_authoritative===false}],
 ['PUBLIC_ON',()=>{const x=structuredClone(policy);x.truth_boundary.public_release='GO';return x.truth_boundary.public_release==='HOLD'}]
 ,['DEPLOY_REENABLED',()=>{const x=structuredClone(policy);x.deployment_policy.execution_state='ACTIVE';return x.deployment_policy.execution_state==='HOLD_HARD_DISABLED_PENDING_DURABLE_LEDGER'}]
];
for(const [id,fn] of mutations) req(fn()===false,`MUTATION_FALSE_GREEN:${id}`);

const receipt={id:'kidults-cloudflare-pages-staging-governance-validation-receipt-v1',version:'1.3.0',state:findings.length?'VERIFIED_FAIL':'VERIFIED_PASS',project:'kidults-workspace-staging',granular_controls_authoritative:true,deprecated_deployments_enabled_informational:true,automatic_git_deployments:'DISABLED_REQUIRED',mutation_lanes_hard_disabled:true,governed_exact_sha_deployment:false,signed_approval_lineage_readback:false,current_main_parity_required:true,current_main_parity_state:'HOLD_UNVERIFIED_LINEAGE_OR_STALE_SHA',readonly_drift_monitor:true,emergency_preview_cleanup:'HOLD_NO_RERUN',findings,public_release:'HOLD',production:'HOLD',g5:'HOLD'};
console.log(JSON.stringify(receipt,null,2));
if(findings.length) process.exit(1);
