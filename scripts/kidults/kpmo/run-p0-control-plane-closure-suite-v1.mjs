#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';

const controlPlaneTests=fs.readdirSync('services/kidults-control-plane/scripts').filter(f=>f.endsWith('.test.mjs')).sort().map(f=>`services/kidults-control-plane/scripts/${f}`);
const commands=[
['postgres-d1-boundary',['node','services/kidults-control-plane/scripts/validate-boundary-v1.mjs']],
['postgres-d1-runtime-negative-mutations',['node','--test',...controlPlaneTests]],
['durable-action-state-boundary',['node','scripts/kidults/kpmo/validate-durable-action-state-boundary-v1.mjs']],
['source-adapter-concurrency',['node','scripts/kidults/redteam/validate-source-adapter-wave-concurrency-v1.mjs']],
['continuous-assurance-cancellation-watch',['node','scripts/kidults/kpmo/validate-continuous-assurance-adapter-cancellation-watch-v1.mjs']],
['autonomous-resolution-provenance',['node','scripts/kidults/source-intelligence/validate-asi-autonomous-resolution-provenance-v1.mjs']],
['sharded-reserve-provenance',['node','scripts/kidults/source-intelligence/validate-asi-sharded-source-reserve-provenance-v1.mjs']],
['hourly-v2-promotion-provenance',['node','scripts/kidults/source-intelligence/validate-asi-hourly-v2-promotion-provenance-v1.mjs']],
['mission-directed-provenance',['node','scripts/kidults/source-intelligence/validate-asi-mission-directed-discovery-provenance-v1.mjs']],
['track-b-authority-boundary',['node','scripts/kidults/scope/validate-track-b-boundary-no-shadow-assessment-v1.mjs']],
['canonical-anchor-consumers',['node','scripts/kidults/supply-chain/validate-canonical-anchor-consumers-v1.mjs']],
['asi-workflow-fanout-budget',['node','scripts/kidults/kpmo/validate-asi-workflow-fanout-budget-v1.mjs']],
['source-channel-control-plane',['node','scripts/kidults/source-intelligence/validate-source-channel-control-plane-v1.mjs']],
['pull-request-impact-routing',['node','scripts/kidults/kpmo/validate-pr-impact-routing-v1.mjs']],
['governed-landing-coverage',['node','scripts/kidults/kpmo/validate-governed-landing-coverage-v1.mjs']]];
const sha256=v=>`sha256:${createHash('sha256').update(v).digest('hex')}`;
const exactSha=process.env.KPMO_SOURCE_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(!/^[0-9a-f]{40}$/.test(exactSha))throw new Error('KPMO_EXACT_SOURCE_SHA_REQUIRED');
const results=[];let failed=false;
for(const [id,[program,...args]] of commands){const r=spawnSync(program,args,{encoding:'utf8',env:process.env});const stdout=r.stdout||'';const stderr=r.stderr||'';const passed=r.status===0;results.push({id,state:passed?'VERIFIED_PASS':'VERIFIED_FAIL',exit_code:r.status,stdout_digest:sha256(stdout),stderr_digest:sha256(stderr)});if(!passed){failed=true;process.stderr.write(`\n[${id}] FAILED\n${stdout}${stderr}`)}}
const ledger=JSON.parse(fs.readFileSync('coordination/kidults/source-intelligence/source-channel-control-plane-v1.json','utf8'));
const receipt={id:'kidults-p0-control-plane-closure-receipt-v1',version:'1.2.0',agent_id:'AI-018 / GLOBAL_SCALE_STEWARDSHIP',as_of:new Date().toISOString(),scope:'LOCAL_AND_CI_CONTRACT_VERIFICATION_ONLY',exact_source_sha:exactSha,state:failed?'VERIFIED_FAIL':'VERIFIED_PASS',governance:{mode:'SOLO_OWNER_PROTECTED_MAIN',pull_request_required:true,required_approving_review_count:0,code_owner_review_required:false,last_push_approval_required:false,required_status_checks:['KAIOS Solo Owner Preflight','Validate KAIOS Foundation','Validate Production Container'],bypass_allowed:false},facts:{checks_total:results.length,checks_passed:results.filter(r=>r.state==='VERIFIED_PASS').length,system_of_record:'POSTGRESQL',d1_role:'READ_MODEL_ONLY',permitted_normal_d1_writer:['kpmo-d1-projector-v1'],executive_action_state:'FAIL_CLOSED_UNTIL_POSTGRESQL_DURABLE_BACKEND',enterprise_authorization:'EXACT_RESOURCE_GRANT_AND_ACTIVE_POSTGRESQL_ENTITLEMENT_REQUIRED',billing_authority:'ATOMIC_POSTGRESQL_SUBSCRIPTION_ENTITLEMENT_AUDIT_OUTBOX',outbox_delivery:'LEASED_SINGLE_PROJECTOR_WITH_APPEND_ONLY_TERMINAL_RECEIPTS',d1_projection_ordering:'MONOTONIC_SOURCE_CREATED_AT_AND_EVENT_ID',source_ledger_digest:ledger.ledger_digest,canonical_sources:ledger.summary.canonical_source_count,lawful_collector_current_sold_sources:ledger.summary.rights_clear_collector_current_sold_sources,empirically_active_adapters:ledger.summary.empirically_active_adapters,candidate_created:ledger.summary.candidate_created,track_b_started:ledger.summary.track_b_started,approved_projection:ledger.summary.approved_projection},evidence_refs:results,uncertainties:['REMOTE_POSTGRESQL_NOT_PROVISIONED','REMOTE_D1_PROJECTOR_NOT_DEPLOYED','LEGACY_D1_WRITER_CUTOVER_NOT_VERIFIED_REMOTE','CLOUDFLARE_PREVIEW_SKIP_REMOTE_READBACK_PENDING'],blockers:['REMOTE_INFRASTRUCTURE_AND_CREDENTIAL_GATE'],next_action:'EXACT_HEAD_REQUIRED_CHECKS_THEN_GOVERNED_REMOTE_STAGING_CANARY',authority_boundary:{remote_mutation:false,provider_contact:false,spend:false,production:'HOLD',public_release:'HOLD',g5:'HOLD'},autonomous_effect:'POSITIVE',global_effect:'POSITIVE',irreplaceable_value_effect:'POSITIVE',transparency_effect:'POSITIVE'};
const serialized=`${JSON.stringify(receipt,null,2)}\n`;if(process.env.KPMO_RECEIPT_PATH)fs.writeFileSync(process.env.KPMO_RECEIPT_PATH,serialized);process.stdout.write(serialized);if(failed)process.exit(1);
