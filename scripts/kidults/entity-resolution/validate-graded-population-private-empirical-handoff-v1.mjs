import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [handoffPath, rightsPath, receiptPath = '/tmp/graded-population-private-handoff-receipt-v1.json', mode] = process.argv.slice(2);
if (!handoffPath || !rightsPath) throw new Error('Usage: node validate-graded-population-private-empirical-handoff-v1.mjs <private-handoff.json> <rights-attestation.json> [receipt.json] [--contract-test-fixture]');
const fixtureMode = mode === '--contract-test-fixture';
const [handoff, rights] = await Promise.all([handoffPath, rightsPath].map(async p => JSON.parse(await fs.readFile(p, 'utf8'))));
const sha = v => `sha256:${createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex')}`;
function canonical(v){return Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;}
function fail(code, detail=''){throw new Error(detail?`${code}:${detail}`:code);}
const shaRe=/^sha256:[a-f0-9]{64}$/;
const idRe=/^[A-Za-z0-9][A-Za-z0-9._:-]{2,199}$/;
const normalized=k=>String(k).replace(/([a-z0-9])([A-Z])/g,'$1_$2').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'').toLowerCase();
const prohibited=new Set(['authorization','access_token','api_token','bearer_token','cookie','password','secret','raw_provider_payload','raw_response','response_body','expected','expected_label','gold_label','label','labels','reviewer_id','reviewer_label','reviewer_identity','model_prediction','model_score','blind_holdout']);
function scan(v,path='$'){
  if(Array.isArray(v)){for(let i=0;i<v.length;i++)scan(v[i],`${path}[${i}]`);return;}
  if(v&&typeof v==='object'){for(const [k,x] of Object.entries(v)){if(prohibited.has(normalized(k)))fail('PROHIBITED_FIELD_IN_HANDOFF',`${path}.${k}`);scan(x,`${path}.${k}`);}return;}
  if(typeof v==='string'){
    if(/\bbearer\s+[A-Za-z0-9._~+\/-]{12,}/i.test(v)||/\bauthorization\s*:/i.test(v))fail('SECRET_LIKE_VALUE_IN_HANDOFF',path);
    if(/[?&](?:token|api[_-]?key|access[_-]?token|authorization|signature|sig)=/i.test(v))fail('SIGNED_OR_SECRET_QUERY_REFERENCE_PROHIBITED',path);
  }
}
function exactKeys(v,allowed,code){if(!v||typeof v!=='object'||Array.isArray(v))fail(code);const a=new Set(allowed);for(const k of Object.keys(v))if(!a.has(k))fail(code,k);for(const k of allowed)if(!(k in v))fail(code,`MISSING_${k}`);}
function nonempty(v,code){if(typeof v!=='string'||!v.trim())fail(code);return v.trim();}
function uniqueStrings(v,code,{https=false}={}){if(!Array.isArray(v)||v.length<1)fail(code);const x=v.map(e=>nonempty(e,code));if(new Set(x).size!==x.length)fail(`${code}_DUPLICATE`);if(https&&x.some(e=>!/^https:\/\//.test(e)))fail(`${code}_HTTPS_REQUIRED`);return [...x].sort();}
function countsBy(a,k){const o={};for(const x of a)o[x[k]]=(o[x[k]]||0)+1;return o;}
function same(a,b){return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));}

const handoffKeys=['schema_version','handoff_id','state','provider_id','rights_attestation_id','private_only','raw_provider_payload_embedded','secrets_embedded','cases','production','public_release',...(fixtureMode?['fixture_classification']:[])];
exactKeys(handoff,handoffKeys,'HANDOFF_TOP_LEVEL_INVALID');
if(handoff.schema_version!=='1.0.0'||handoff.state!=='PRIVATE_EMPIRICAL_HANDOFF_READY'||handoff.private_only!==true||handoff.raw_provider_payload_embedded!==false||handoff.secrets_embedded!==false||handoff.production!=='HOLD'||handoff.public_release!=='HOLD')fail('HANDOFF_BOUNDARY_INVALID');
nonempty(handoff.handoff_id,'HANDOFF_ID_REQUIRED');nonempty(handoff.provider_id,'PROVIDER_ID_REQUIRED');
if(fixtureMode){if(handoff.fixture_classification!=='CONTRACT_TEST_FIXTURE_ONLY')fail('FIXTURE_CLASSIFICATION_REQUIRED');}else if('fixture_classification' in handoff)fail('REAL_HANDOFF_CANNOT_BE_FIXTURE');
scan(handoff);

const rightsKeys=['schema_version','rights_attestation_id','provider_id','status','purpose_rights','terms_or_license_evidence_refs','attested_by','attested_at','production','public_release',...(fixtureMode?['fixture_classification']:[])];
exactKeys(rights,rightsKeys,'RIGHTS_ATTESTATION_TOP_LEVEL_INVALID');
if(rights.schema_version!=='1.0.0'||rights.status!=='FIELD_BY_PURPOSE_RIGHTS_PASS'||rights.provider_id!==handoff.provider_id||rights.rights_attestation_id!==handoff.rights_attestation_id||rights.production!=='HOLD'||rights.public_release!=='HOLD')fail('RIGHTS_ATTESTATION_BINDING_INVALID');
if(fixtureMode){if(rights.fixture_classification!=='CONTRACT_TEST_FIXTURE_ONLY'||rights.attested_by!=='FIXTURE_ONLY')fail('RIGHTS_FIXTURE_BOUNDARY_INVALID');}else{
  const who=nonempty(rights.attested_by,'REAL_RIGHTS_ATTESTER_REQUIRED');
  if(/^(?:fixture|test|dummy|example|placeholder|tbd|unknown|pending)/i.test(who))fail('REAL_RIGHTS_ATTESTER_PLACEHOLDER_PROHIBITED');
}
if(typeof rights.attested_at!=='string'||Number.isNaN(Date.parse(rights.attested_at)))fail('RIGHTS_ATTESTED_AT_REQUIRED');
uniqueStrings(rights.terms_or_license_evidence_refs,'RIGHTS_EVIDENCE_REFS_REQUIRED',{https:true});
const purposeKeys=['collect','store_private','derive_internal_er_calibration','internal_reviewer_display','retention','public_display','redistribute'];
exactKeys(rights.purpose_rights,purposeKeys,'PURPOSE_RIGHTS_INVALID');
for(const k of ['collect','store_private','derive_internal_er_calibration','internal_reviewer_display','retention'])if(rights.purpose_rights[k]!=='PASS')fail('PURPOSE_RIGHTS_PASS_REQUIRED',k);
for(const k of ['public_display','redistribute'])if(rights.purpose_rights[k]!=='BLOCK')fail('PURPOSE_RIGHTS_BLOCK_REQUIRED',k);
scan(rights);

if(!Array.isArray(handoff.cases)||handoff.cases.length!==120)fail('EXACT_120_GRADED_CASES_REQUIRED');
const caseKeys=['case_id','stratum_id','case_class','identity_boundary','source_a_reference','source_b_reference','source_a_payload_sha256','source_b_payload_sha256','license_evidence_refs','rights_state','provenance_refs'];
const ids=new Set(), pairs=new Set();
for(const [i,c] of handoff.cases.entries()){
  exactKeys(c,caseKeys,`CASE_FIELD_INVALID:${i}`);
  if(!idRe.test(c.case_id))fail('CASE_ID_INVALID',String(i));
  if(ids.has(c.case_id))fail('DUPLICATE_CASE_ID',c.case_id);ids.add(c.case_id);
  if(c.stratum_id!=='er-stratum-graded-population')fail('GRADED_STRATUM_REQUIRED',c.case_id);
  if(!['SAME_OBJECT_NORMALIZATION','HARD_NEGATIVE','CROSS_MARKET_ALIAS'].includes(c.case_class))fail('CASE_CLASS_INVALID',c.case_id);
  if(!['SOURCE_RECORD','PHYSICAL_OBJECT'].includes(c.identity_boundary))fail('IDENTITY_BOUNDARY_INVALID',c.case_id);
  if(c.rights_state!=='ALLOW')fail('CASE_RIGHTS_ALLOW_REQUIRED',c.case_id);
  const ar=nonempty(c.source_a_reference,'SOURCE_A_REFERENCE_REQUIRED'), br=nonempty(c.source_b_reference,'SOURCE_B_REFERENCE_REQUIRED');
  if(!shaRe.test(c.source_a_payload_sha256)||!shaRe.test(c.source_b_payload_sha256))fail('SOURCE_PAYLOAD_DIGEST_REQUIRED',c.case_id);
  uniqueStrings(c.license_evidence_refs,'CASE_LICENSE_EVIDENCE_REQUIRED',{https:true});uniqueStrings(c.provenance_refs,'CASE_PROVENANCE_REQUIRED');
  const sides=[{r:ar,s:c.source_a_payload_sha256},{r:br,s:c.source_b_payload_sha256}].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if(same(sides[0],sides[1]))fail('SELF_EVIDENCE_PAIR_PROHIBITED',c.case_id);
  const pd=sha(sides);if(pairs.has(pd))fail('DUPLICATE_EVIDENCE_PAIR_PADDING',c.case_id);pairs.add(pd);
}
const classCounts=countsBy(handoff.cases,'case_class'), boundaryCounts=countsBy(handoff.cases,'identity_boundary');
if(!same(classCounts,{SAME_OBJECT_NORMALIZATION:40,HARD_NEGATIVE:40,CROSS_MARKET_ALIAS:40}))fail('GRADED_CASE_CLASS_QUOTA_MISMATCH');
if(!same(boundaryCounts,{SOURCE_RECORD:60,PHYSICAL_OBJECT:60}))fail('GRADED_IDENTITY_BOUNDARY_QUOTA_MISMATCH');
const caseSet=handoff.cases.map(c=>({case_id:c.case_id,case_evidence_sha256:sha(c)})).sort((a,b)=>a.case_id.localeCompare(b.case_id));
const receipt={schema_version:'1.0.0',receipt_id:`kidults-er-graded-private-handoff-receipt-v1:${sha(handoff).slice(7,19)}`,status:fixtureMode?'PASS_CONTRACT_TEST_FIXTURE_ONLY':'PASS_PRIVATE_HANDOFF_VALIDATED_NOT_REVIEWED',handoff_id:handoff.handoff_id,provider_id:handoff.provider_id,rights_attestation_id:rights.rights_attestation_id,case_count:120,case_class_counts:classCounts,identity_boundary_counts:boundaryCounts,handoff_sha256:sha(handoff),case_set_sha256:sha(caseSet),case_material_emitted:false,provider_payload_emitted:false,secrets_emitted:false,reviewers:'NOT_ASSIGNED',labels:'NOT_COLLECTED',empirical_pass:false,production:'HOLD',public_release:'HOLD'};
await fs.writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`);
console.log(JSON.stringify({status:receipt.status,case_count:120,case_class_counts:classCounts,identity_boundary_counts:boundaryCounts,case_material_emitted:false,provider_payload_emitted:false,secrets_emitted:false,production:'HOLD'}));
