import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [attestationPath,receiptPath='/tmp/private-market-activation-receipt-v1.json',mode]=process.argv.slice(2);
if(!attestationPath)throw new Error('Usage: node validate-licensed-private-market-activation-v1.mjs <private-activation-attestation.json> [receipt.json] [--contract-test-fixture]');
const fixtureMode=mode==='--contract-test-fixture';
const contract=JSON.parse(await fs.readFile('coordination/kidults/source-intelligence/classiccom-licensed-private-market-activation-v1.json','utf8'));
const x=JSON.parse(await fs.readFile(attestationPath,'utf8'));
function canonical(v){return Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;}
const sha=v=>`sha256:${createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex')}`;
const fail=(c,d='')=>{throw new Error(d?`${c}:${d}`:c);};
const normalized=k=>String(k).replace(/([a-z0-9])([A-Z])/g,'$1_$2').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'').toLowerCase();
const prohibited=new Set(['access_token','api_token','authorization','bearer_token','cookie','password','secret','raw_provider_payload','raw_transaction_record','full_private_object_locator','agreement_text','license_text','contract_text']);
function scan(v,path='$'){if(Array.isArray(v)){v.forEach((z,i)=>scan(z,`${path}[${i}]`));return;}if(v&&typeof v==='object'){for(const[k,z]of Object.entries(v)){if(prohibited.has(normalized(k)))fail('PROHIBITED_PRIVATE_OR_SECRET_FIELD',`${path}.${k}`);scan(z,`${path}.${k}`);}return;}if(typeof v==='string'&&(/\bbearer\s+[A-Za-z0-9._~+\/-]{12,}/i.test(v)||/\bauthorization\s*:/i.test(v)||/[?&](?:token|api[_-]?key|access[_-]?token|signature|sig)=/i.test(v)))fail('SECRET_LIKE_VALUE_PROHIBITED',path);}
function exactKeys(v,keys,code){if(!v||typeof v!=='object'||Array.isArray(v))fail(code);const a=new Set(keys);for(const k of Object.keys(v))if(!a.has(k))fail(code,k);for(const k of keys)if(!(k in v))fail(code,`MISSING_${k}`);}
function sameSet(a,b){return Array.isArray(a)&&Array.isArray(b)&&new Set(a).size===a.length&&new Set(b).size===b.length&&JSON.stringify([...a].sort())===JSON.stringify([...b].sort());}
function nonempty(v,c){if(typeof v!=='string'||!v.trim())fail(c);return v.trim();}
const shaRe=/^sha256:[a-f0-9]{64}$/;

if(contract.production!=='HOLD'||contract.public_release!=='HOLD'||contract.provider_network_call_by_contract!==false||contract.active_market_claim!=='NONE')fail('CONTRACT_BOUNDARY_INVALID');
const keys=['schema_version','activation_attestation_id','provider_id','provider_path','claim_class','fields','regional_fields_admitted','rights_status','purpose_rights','private_store_runtime','ttl_days','credential_boundary','automation_rights','historical_cleanup_review','agreement_reference_hash','rights_decision_ref','attested_by','attested_at','production','public_release',...(fixtureMode?['fixture_classification']:[])];
exactKeys(x,keys,'ACTIVATION_ATTESTATION_FIELD_INVALID');scan(x);
if(x.schema_version!=='1.0.0'||x.provider_id!==contract.provider_id||x.provider_path!==contract.provider_path||x.claim_class!==contract.claim_class_target||x.production!=='HOLD'||x.public_release!=='HOLD')fail('ACTIVATION_BINDING_INVALID');
nonempty(x.activation_attestation_id,'ACTIVATION_ID_REQUIRED');
if(fixtureMode){if(x.fixture_classification!=='CONTRACT_TEST_FIXTURE_ONLY'||x.attested_by!=='FIXTURE_ONLY')fail('FIXTURE_BOUNDARY_INVALID');}else{if('fixture_classification'in x)fail('REAL_ATTESTATION_CANNOT_BE_FIXTURE');const who=nonempty(x.attested_by,'REAL_ATTESTER_REQUIRED');if(/^(?:fixture|test|dummy|example|placeholder|unknown|pending|tbd)/i.test(who))fail('REAL_ATTESTER_PLACEHOLDER_PROHIBITED');}
if(typeof x.attested_at!=='string'||Number.isNaN(Date.parse(x.attested_at)))fail('ATTESTED_AT_REQUIRED');
if(!shaRe.test(x.agreement_reference_hash)||!shaRe.test(x.rights_decision_ref))fail('OPAQUE_RIGHTS_REFERENCE_HASH_REQUIRED');
if(x.rights_status!=='FIELD_BY_PURPOSE_RIGHTS_PASS')fail('SOURCE_SPECIFIC_RIGHTS_PASS_REQUIRED');
const purposeKeys=['collect','store_private','derive_internal_market_metrics','internal_review_display','retention','raw_public_display','redistribute'];exactKeys(x.purpose_rights,purposeKeys,'PURPOSE_RIGHTS_INVALID');
for(const k of ['collect','store_private','derive_internal_market_metrics','internal_review_display','retention'])if(x.purpose_rights[k]!=='PASS')fail('PURPOSE_RIGHTS_PASS_REQUIRED',k);
for(const k of ['raw_public_display','redistribute'])if(x.purpose_rights[k]!=='BLOCK')fail('PUBLIC_OR_REDISTRIBUTION_MUST_BLOCK',k);
if(x.private_store_runtime!=='PASS')fail('PRIVATE_STORE_RUNTIME_PASS_REQUIRED');
if(x.historical_cleanup_review!=='COMPLETE')fail('HISTORICAL_CLEANUP_REVIEW_COMPLETE_REQUIRED');
if(x.credential_boundary!=='SECRET_MANAGER_ONLY')fail('SECRET_MANAGER_BOUNDARY_REQUIRED');
if(x.automation_rights!=='PASS')fail('AUTOMATION_RIGHTS_PASS_REQUIRED');
if(!Number.isInteger(x.ttl_days)||x.ttl_days<1||x.ttl_days>30)fail('TTL_1_TO_30_REQUIRED');
const required=contract.required_fields;const optional=contract.optional_regional_fields_only_if_separately_admitted;const expected=x.regional_fields_admitted===true?[...required,...optional]:required;
if(x.regional_fields_admitted!==true&&x.regional_fields_admitted!==false)fail('REGIONAL_FIELD_ADMISSION_BOOLEAN_REQUIRED');
if(!sameSet(x.fields,expected))fail('EXACT_LICENSED_FIELD_SET_REQUIRED');
if(x.fields.some(f=>contract.prohibited_fields.includes(f)))fail('PROHIBITED_FIELD_REQUESTED');
const receipt={schema_version:'1.0.0',receipt_id:`kidults-private-market-activation-preflight-v1:${sha(x).slice(7,19)}`,status:fixtureMode?'PASS_CONTRACT_TEST_FIXTURE_ONLY':'PASS_PRIVATE_REACQUISITION_ACTIVATION_PREFLIGHT_NO_PROVIDER_CALL',provider_id:x.provider_id,claim_class:x.claim_class,activation_attestation_sha256:sha(x),agreement_reference_hash:x.agreement_reference_hash,rights_decision_ref:x.rights_decision_ref,field_set_sha256:sha([...x.fields].sort()),field_count:x.fields.length,regional_fields_admitted:x.regional_fields_admitted,ttl_days:x.ttl_days,provider_network_requests:0,provider_payload_emitted:false,credential_emitted:false,agreement_text_emitted:false,active_market_evidence_created:false,active_market_claim:'NONE',production:'HOLD',public_release:'HOLD'};
await fs.writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`);
console.log(JSON.stringify({status:receipt.status,field_count:receipt.field_count,regional_fields_admitted:receipt.regional_fields_admitted,ttl_days:receipt.ttl_days,provider_network_requests:0,active_market_evidence_created:false,active_market_claim:'NONE',production:'HOLD'}));
