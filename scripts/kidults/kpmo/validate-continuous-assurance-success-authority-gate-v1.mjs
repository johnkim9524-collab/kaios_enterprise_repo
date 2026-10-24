#!/usr/bin/env node
import fs from 'node:fs';

const gatePath='.github/workflows/kpmo-continuous-assurance-success-authority-gate-v1.yml';
const producerPath='.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml';
const gate=fs.readFileSync(gatePath,'utf8');
const producer=fs.readFileSync(producerPath,'utf8');
const proofVerifier=fs.readFileSync('scripts/kidults/kpmo/verify-assurance-runtime-proof-handoff-v1.mjs','utf8');
const handoff=fs.readFileSync('scripts/kidults/kpmo/lib/assurance-runtime-proof-handoff-v1.mjs','utf8');
const fail=code=>{throw Error(`SUCCESS_AUTHORITY_GATE_${code}`);};

const requiredGate=[
  "github.event.workflow_run.event == 'push' ||",
  'name: KPMO Continuous Assurance Success Authority Gate V1',
  "workflows: ['KIDULTS Platform Continuous Assurance V1', 'KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1', 'KIDULTS Autonomous KPMO Authorization V1']",
  'classify-assurance-completion:',
  "github.event.workflow_run.path == '.github/workflows/kidults-platform-continuous-assurance-v1.yml' &&",
  'deferred-runtime-proof-handoff-gate:',
  "github.event.workflow_run.path == '.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml' &&",
  "github.event.workflow_run.head_repository.full_name == github.repository &&",
  "github.event.workflow_run.head_branch == 'main' &&",
  "github.event.workflow_run.status == 'completed'",
  'run-deferred-assurance-proof-gate-v1.mjs',
  'verify-assurance-runtime-proof-handoff-v1.mjs',
  'Require exact autonomous Assurance proof closure',
  'whole_platform_authority==false',
  'promotion_eligible==false',
  'production=="HOLD"',
  'public=="HOLD"',
  'g5=="HOLD"',
  'NOT_APPLICABLE',
  'actions: read'
];
for(const token of requiredGate)if(!gate.includes(token))fail(`GATE_TOKEN_MISSING:${token}`);
if(gate.includes('  success-authority-gate:\n')||gate.includes('  enforce-authority-gate-terminal:\n'))fail('OBSOLETE_DIRECT_ARCHIVE_GATE_REMAINS');

const requiredProducer=[
  'name: KIDULTS Autonomous KPMO Authorization V1',
  'reconcile-protected-main-operating-receipts:',
  "github.event.workflow_run.name == 'KIDULTS Platform Continuous Assurance V1' &&",
  'KIDULTS_GITHUB_READ_BUDGET_MODE: SHARED_REQUIRED',
  'Bind the exact parent Assurance run and archive',
  'Seal exact parent Assurance to downstream proof handoff',
  'assurance-runtime-proof-handoff-v1.json',
  'Preserve exact-main operating proof'
];
for(const token of requiredProducer)if(!producer.includes(token))fail(`PRODUCER_TOKEN_MISSING:${token}`);

for(const token of [
  'verifyAssuranceRuntimeProofHandoff',
  'proof?.autonomous_runtime_readiness_proven!==true',
  'assuranceArtifact?.workflow_run?.id',
  'producerRun?.path',
  'CORE_FOUR_CONTENT',
  'whole_platform_authority:false',
  'promotion_eligible:false'
])if(!proofVerifier.includes(token)&&!handoff.includes(token))fail(`PROOF_VERIFIER_TOKEN_MISSING:${token}`);

const tests='node --test tests/kidults/kpmo/authenticated-sentinel-continuation-v1.test.mjs tests/kidults/kpmo/assurance-full-proof-v1.test.mjs tests/kidults/kpmo/assurance-completion-disposition-v1.test.mjs tests/kidults/kpmo/assurance-runtime-proof-handoff-v1.test.mjs tests/kidults/kpmo/verify-assurance-runtime-proof-handoff-v1.test.mjs';
if(!gate.includes(tests))fail('PR_SELF_TESTS_MISSING_HANDOFF_REGRESSION');

const assuranceBranch=gate.replace("github.event.workflow_run.path == '.github/workflows/kidults-platform-continuous-assurance-v1.yml' &&",'');
if(assuranceBranch===gate||assuranceBranch.includes("github.event.workflow_run.path == '.github/workflows/kidults-platform-continuous-assurance-v1.yml' &&"))fail('ASSURANCE_CLASSIFIER_MUTATION_SETUP');
const missingHandoff=producer.replace('Seal exact parent Assurance to downstream proof handoff','removed step');
if(missingHandoff===producer||missingHandoff.includes('Seal exact parent Assurance to downstream proof handoff'))fail('PRODUCER_HANDOFF_MUTATION_SETUP');

const policy=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/platform-continuous-assurance-v1.json','utf8'));
const contract=policy.successful_assurance_authority_gate;
if(contract?.raw_successful_assurance_authority!=='NON_AUTHORIZING_OBSERVATION'
  ||contract?.all_success_events_gate_required!==true||contract?.event_specific_bypass_forbidden!==true
  ||contract?.whole_platform_green_claim_allowed!==false||contract?.production!=='HOLD'
  ||contract?.public!=='HOLD'||contract?.g5!=='HOLD')fail('POLICY_BOUNDARY');

process.stdout.write(JSON.stringify({suite:'KPMO_CONTINUOUS_ASSURANCE_SUCCESS_AUTHORITY_GATE_V1',state:'VERIFIED_PASS',
  proof_source:'EXACT_KPMO_HANDOFF_AND_ASSURANCE_ARCHIVES',whole_platform_authority:false,
  promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'})+'\n');
