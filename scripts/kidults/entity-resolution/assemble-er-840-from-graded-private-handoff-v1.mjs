import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { normalizeEvidenceCases } from './er-human-review-gate-r1-lib.mjs';

const [basePath,handoffPath,rightsPath,receiptPath,outPath='/tmp/er-840-private-unlabeled-v1.json',mode]=process.argv.slice(2);
if(!basePath||!handoffPath||!rightsPath||!receiptPath)throw new Error('Usage: node assemble-er-840-from-graded-private-handoff-v1.mjs <base-720.json> <graded-private-handoff.json> <rights-attestation.json> <receipt.json> [out.json] [--contract-test-fixture]');
const fixtureMode=mode==='--contract-test-fixture';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const [base,handoff,rights,receipt,samplingPlan,operational]=await Promise.all([
  read(basePath),read(handoffPath),read(rightsPath),read(receiptPath),
  read('coordination/kidults/entity-resolution/empirical-validation-sampling-plan-r1.json'),
  read('coordination/kidults/entity-resolution/human-review-gate-operational-contract-r1.json')
]);
function canonical(v){return Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;}
const sha=v=>`sha256:${createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex')}`;
const fail=c=>{throw new Error(c);};
if(base.production!=='HOLD'||!Array.isArray(base.cases)||base.cases.length!==720)fail('EXACT_720_BASE_CASES_REQUIRED');
if(base.cases.some(c=>c?.stratum_id==='er-stratum-graded-population'))fail('BASE_720_MUST_EXCLUDE_GRADED_STRATUM');
if(!fixtureMode&&base.dataset_class!==operational.input.dataset_class_required)fail('BASE_REAL_WORLD_UNLABELED_REQUIRED');
if(fixtureMode){if(base.fixture_classification!=='CONTRACT_TEST_FIXTURE_ONLY'||handoff.fixture_classification!=='CONTRACT_TEST_FIXTURE_ONLY'||rights.fixture_classification!=='CONTRACT_TEST_FIXTURE_ONLY')fail('ASSEMBLY_FIXTURE_BOUNDARY_REQUIRED');}else if('fixture_classification' in base||'fixture_classification' in handoff||'fixture_classification' in rights)fail('REAL_ASSEMBLY_CANNOT_USE_FIXTURE');
if(handoff.state!=='PRIVATE_EMPIRICAL_HANDOFF_READY'||handoff.private_only!==true||handoff.production!=='HOLD'||!Array.isArray(handoff.cases)||handoff.cases.length!==120)fail('VALIDATED_GRADED_HANDOFF_REQUIRED');
if(rights.status!=='FIELD_BY_PURPOSE_RIGHTS_PASS'||rights.rights_attestation_id!==handoff.rights_attestation_id||rights.provider_id!==handoff.provider_id)fail('RIGHTS_ATTESTATION_BINDING_REQUIRED');
if(receipt.handoff_sha256!==sha(handoff)||receipt.handoff_id!==handoff.handoff_id||receipt.rights_attestation_id!==rights.rights_attestation_id||receipt.case_count!==120||receipt.production!=='HOLD'||receipt.public_release!=='HOLD')fail('VALIDATOR_RECEIPT_BINDING_REQUIRED');
if(fixtureMode&&receipt.status!=='PASS_CONTRACT_TEST_FIXTURE_ONLY')fail('FIXTURE_RECEIPT_REQUIRED');
if(!fixtureMode&&receipt.status!=='PASS_PRIVATE_HANDOFF_VALIDATED_NOT_REVIEWED')fail('REAL_VALIDATOR_RECEIPT_REQUIRED');
const candidate={
  ...base,
  id:`${base.id}-plus-graded-private-120-${receipt.case_set_sha256.slice(7,19)}`,
  dataset_class:fixtureMode?base.dataset_class:operational.input.dataset_class_required,
  cases:[...base.cases,...handoff.cases],
  graded_private_handoff_receipt_id:receipt.receipt_id,
  graded_private_handoff_sha256:receipt.handoff_sha256,
  graded_private_rights_attestation_id:rights.rights_attestation_id,
  reviewer_assignment_state:'NOT_ASSIGNED',
  labels_state:'NOT_COLLECTED',
  empirical_attestation:'NOT_CREATED',
  track_b:'NOT_STARTED',
  public_release:'HOLD',
  production:'HOLD'
};
const normalized=normalizeEvidenceCases(candidate,samplingPlan,operational,{allowContractTestFixture:fixtureMode});
candidate.cases=normalized;
const setByStratum={};for(const c of normalized)setByStratum[c.stratum_id]=(setByStratum[c.stratum_id]||0)+1;
if(Object.keys(setByStratum).length!==7||Object.values(setByStratum).some(n=>n!==120))fail('EXACT_SEVEN_BY_120_REQUIRED');
await fs.writeFile(outPath,`${JSON.stringify(candidate,null,2)}\n`);
console.log(JSON.stringify({status:fixtureMode?'PASS_CONTRACT_TEST_FIXTURE_ONLY':'PASS_PRIVATE_840_UNLABELED_INPUT_READY_FOR_EXISTING_HUMAN_REVIEW_PREFLIGHT',total_cases:840,graded_cases:120,strata:7,reviewers:'NOT_ASSIGNED',labels:'NOT_COLLECTED',empirical_pass:false,public_release:'HOLD',production:'HOLD'}));
