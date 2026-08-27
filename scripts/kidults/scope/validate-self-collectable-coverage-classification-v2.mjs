#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const d=process.argv[2]||'coverage-v2-out';
const x=JSON.parse(fs.readFileSync(path.join(d,'self-collectable-coverage-classification-v2.json'),'utf8'));
const readiness=JSON.parse(fs.readFileSync(path.join(d,'scope-capability-evaluation-readiness-v2.json'),'utf8'));
const status=JSON.parse(fs.readFileSync(path.join(d,'self-collectable-coverage-status-v2.json'),'utf8'));
const req=(v,m)=>{if(!v)throw new Error(m)};

req(!fs.existsSync(path.join(d,'track-b-self-collectable-coverage-assessment-v2.json')),'shadow Track B assessment must not be emitted');
req(!fs.existsSync(path.join(d,'rankability-assessment.json')),'rankability-assessment is Track B-owned and must not be emitted here');
req(x.status==='INTERNAL_SCOPE_CAPABILITY_CLASSIFICATION_READY'&&x.summary.scope_count===32,'internal classification shape');
req(x.inputs.closure_artifact===9304814238&&x.inputs.wave1_artifact===9304988483&&x.inputs.wave2_artifact===9305092664,'historical input ids');
req(x.inputs.provenance_status==='UNVERIFIED_HARDCODED_ACTIONS_ARTIFACT_IDS','input provenance must remain explicitly unverified');
req(x.scopes.length===32,'scope count');
req(x.summary.authentication_external_scopes===32,'authentication exhaustion');
req(x.summary.sold_transaction_external_scopes===32,'sold transaction exhaustion');
req(x.track_b_input_pair==='NONE'&&x.track_b_status==='NOT_STARTED'&&x.rankability_assessment_created===false,'Track B boundary');
req(readiness.record_type==='INTERNAL_NON_TRACK_B_READINESS','readiness type');
req(readiness.input_provenance==='NOT_PROVEN','readiness provenance');
req(readiness.provider_independence==='NOT_ASSESSED_BY_TRACK_B','provider independence must not be self-certified');
req(readiness.decision_authority==='PROGRAM_OWNER_OR_GOVERNED_PROVIDER_GATE','decision authority');
req(readiness.provider_contact_authorized===false&&x.provider_contact_authorized===false,'provider hold');
req(readiness.track_b_status==='NOT_STARTED'&&readiness.rankability_assessment_created===false,'readiness Track B boundary');
req(readiness.publication_eligibility==='BLOCKED'&&readiness.production==='HOLD'&&status.production==='HOLD','production/publication');
req(status.approved_projection===false&&status.track_b_status==='NOT_STARTED','projection/Track B boundary');

console.log(JSON.stringify({status:'PASS',summary:x.summary,recommendation:readiness.recommendation,track_b:'NOT_STARTED',provider_contact:'HOLD',production:'HOLD'},null,2));
