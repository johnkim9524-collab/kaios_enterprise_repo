#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const d=process.argv[2]||'scope-poc-live-out';
const closure=JSON.parse(fs.readFileSync(path.join(d,'scope-self-collection-closure-v1.json'),'utf8'));
const spec=JSON.parse(fs.readFileSync(path.join(d,'provider-requirement-specification-v1.json'),'utf8'));
const readiness=JSON.parse(fs.readFileSync(path.join(d,'scope-provider-source-evaluation-readiness-v1.json'),'utf8'));
const status=JSON.parse(fs.readFileSync(path.join(d,'scope-poc-closure-status-v1.json'),'utf8'));
const req=(x,m)=>{if(!x)throw new Error(m)};

req(!fs.existsSync(path.join(d,'track-b-scope-requirement-assessment-v1.json')),'shadow Track B scope assessment must not be emitted');
req(!fs.existsSync(path.join(d,'rankability-assessment.json')),'rankability-assessment is Track B-owned and must not be emitted here');
req(!fs.existsSync(path.join(d,'scope-poc-closure-projection-v1.json')),'scope lane must not emit a pseudo Projection artifact');
req(closure.scope_count===32&&closure.product_count===64,'closure shape');
req(closure.p0_task_count===closure.p0_terminal_count,'p0 terminal within bounded topology');
req(closure.status==='INTERNAL_32_SCOPE_POC_BOUNDARY_CLASSIFIED','internal closure status');
req(closure.input_provenance?.artifact_id===9304716429&&closure.input_provenance?.status==='UNVERIFIED_HARDCODED_ACTIONS_ARTIFACT_ID','input provenance must remain unverified');
req(closure.scope_closures.length===32&&closure.scope_closures.every(s=>s.provider_requirement_ready),'scope readiness shape');
req(spec.requirements.length===32&&spec.status==='INTERNAL_REQUIREMENTS_PROVIDER_SELECTION_NOT_STARTED','internal spec');
req(spec.provider_contact_authorized===false&&closure.provider_contact_authorized===false,'provider hold');
req(closure.track_b_input_pair==='NONE'&&closure.track_b_status==='NOT_STARTED'&&closure.rankability_assessment_created===false,'Track B boundary');
req(spec.track_b_status==='NOT_STARTED','spec Track B boundary');
req(readiness.record_type==='INTERNAL_NON_TRACK_B_READINESS','readiness record type');
req(readiness.input_provenance==='NOT_PROVEN','readiness provenance');
req(readiness.provider_independence==='NOT_ASSESSED_BY_TRACK_B','provider independence must not be self-certified');
req(readiness.decision_authority==='PROGRAM_OWNER_OR_GOVERNED_PROVIDER_GATE','decision authority');
req(readiness.provider_contact_authorized===false&&readiness.track_b_status==='NOT_STARTED'&&readiness.rankability_assessment_created===false,'readiness authority boundary');
req(readiness.publication_eligibility==='BLOCKED'&&readiness.threshold_relaxation===false,'publication/threshold');
req(status.scope_count===32&&status.state==='INTERNAL_REQUIREMENTS_CLASSIFIED_MARKET_EVIDENCE_NOT_VERIFIED','status');
req(status.approved_projection===false&&status.track_b_status==='NOT_STARTED','projection/Track B boundary');
req(closure.production==='HOLD'&&spec.production==='HOLD'&&readiness.production==='HOLD'&&status.production==='HOLD','production');

console.log(JSON.stringify({status:'PASS',scopes:32,products:64,p0_tasks:closure.p0_task_count,p0_terminal:closure.p0_terminal_count,requirements:32,recommendation:readiness.recommendation,track_b:'NOT_STARTED',approved_projection:false,production:'HOLD'},null,2));
