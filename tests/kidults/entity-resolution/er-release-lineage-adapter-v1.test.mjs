import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { digest, materializeBase720, validateBase720, BASE720_ELIGIBLE_STRATA } from '../../../scripts/kidults/entity-resolution/er-base720-materializer-v1-lib.mjs';
import { adaptReleaseLineageForBase720 } from '../../../scripts/kidults/entity-resolution/er-release-lineage-adapter-v1-lib.mjs';

const sampling=JSON.parse(fs.readFileSync('coordination/kidults/entity-resolution/empirical-validation-sampling-plan-r1.json','utf8'));
const byId=new Map(sampling.strata.map(x=>[x.stratum_id,x]));
const lic=['https://rights.example/allow'];
const prov=id=>[`PROV:${id}`];

function releaseFragments(stratumId){
  const key=stratumId.includes('pressing')?'pressing':'variant';
  const normal=Array.from({length:40},(_,i)=>{const n=String(i+1).padStart(3,'0'),id=`${key}-norm-${n}`,ref=`https://authority.example/${key}/norm/${n}`,sha=digest(`${key}:norm:${n}`);return {case_id:id,stratum_id:stratumId,case_class:'SAME_OBJECT_NORMALIZATION',identity_boundary:'SOURCE_RECORD',source_a_reference:ref,source_b_reference:ref,source_a_payload_sha256:sha,source_b_payload_sha256:sha,license_evidence_refs:lic,rights_state:'ALLOW',provenance_refs:prov(id),label:null,model_prediction:null};});
  const hard=Array.from({length:40},(_,i)=>{const n=String(i+1).padStart(3,'0'),id=`${key}-hard-${n}`;return {case_id:id,stratum_id:stratumId,case_class:'HARD_NEGATIVE',identity_boundary:'PHYSICAL_OBJECT',source_a_reference:`https://authority.example/${key}/hard/${n}/a`,source_b_reference:`https://authority.example/${key}/hard/${n}/b`,source_a_payload_sha256:digest(`${key}:hard:${n}:a`),source_b_payload_sha256:digest(`${key}:hard:${n}:b`),license_evidence_refs:lic,rights_state:'ALLOW',provenance_refs:prov(id),expected:'NO_MATCH',label:null,model_prediction:null};});
  const cross=Array.from({length:40},(_,i)=>{const n=String(i+1).padStart(3,'0'),id=`${key}-cross-${n}`;return {case_id:id,stratum_id:stratumId,case_class:'CROSS_MARKET_ALIAS',identity_boundary:'SOURCE_RECORD',source_reference:`https://crosswalk.example/${key}/${n}`,source_payload_sha256:digest(`${key}:cross:${n}`),license_evidence_refs:lic,rights_state:'ALLOW',provenance_refs:prov(id),expected:'MATCH',label:null,model_prediction:null};});
  return [{production:'HOLD',cases:[...normal,...hard]},{production:'HOLD',packets:{[key]:{cases:cross}}}];
}

function expanded(targets){return Object.entries(targets).flatMap(([k,n])=>Array.from({length:n},()=>k))}
function syntheticPacket(stratumId){
  const target=byId.get(stratumId),classes=expanded(target.case_class_targets),boundaries=expanded(target.identity_boundary_targets);
  return {production:'HOLD',cases:Array.from({length:120},(_,i)=>{const n=String(i+1).padStart(3,'0'),id=`${stratumId.replace('er-stratum-','')}-synthetic-${n}`;return {case_id:id,stratum_id:stratumId,case_class:classes[i],identity_boundary:boundaries[i],source_a_reference:`https://a.example/${id}`,source_b_reference:`https://b.example/${id}`,source_a_payload_sha256:digest(`a:${id}`),source_b_payload_sha256:digest(`b:${id}`),license_evidence_refs:lic,rights_state:'ALLOW',provenance_refs:prov(id),label:null,model_prediction:null};})};
}

test('normalizes legacy Pressing accepted lineage to exact frozen 40/40/40 and 60/60 without labels',()=>{
  const stratum='er-stratum-pressing-edition-media';
  const out=adaptReleaseLineageForBase720({stratumId:stratum,fragments:releaseFragments(stratum),samplingPlan:sampling});
  assert.equal(out.case_count,120);
  assert.deepEqual(out.case_class_counts,{SAME_OBJECT_NORMALIZATION:40,HARD_NEGATIVE:40,CROSS_MARKET_ALIAS:40});
  assert.deepEqual(out.identity_boundary_counts,{SOURCE_RECORD:60,PHYSICAL_OBJECT:60});
  assert.equal(out.boundary_repair.applied,true);assert.equal(out.boundary_repair.repaired_case_count,20);
  assert.equal(out.cases.filter(c=>c.case_class==='SAME_OBJECT_NORMALIZATION'&&c.identity_boundary==='PHYSICAL_OBJECT').length,20);
  assert.equal(out.cases.some(c=>'expected' in c||'label' in c||'model_prediction' in c),false);
  assert.equal(out.empirical_pass,false);assert.equal(out.production,'HOLD');
});

test('normalizes Variant with the same narrow release-manifestation rule',()=>{
  const stratum='er-stratum-variant-release-heavy';
  const out=adaptReleaseLineageForBase720({stratumId:stratum,fragments:releaseFragments(stratum),samplingPlan:sampling});
  assert.deepEqual(out.identity_boundary_counts,{SOURCE_RECORD:60,PHYSICAL_OBJECT:60});
  assert.equal(out.boundary_repair.repaired_case_count,20);
});

test('fails closed on inconsistent expected scaffolding or any actual result leakage',()=>{
  const stratum='er-stratum-pressing-edition-media';
  const a=releaseFragments(stratum);a[1].packets.pressing.cases[0].expected='NO_MATCH';
  assert.throws(()=>adaptReleaseLineageForBase720({stratumId:stratum,fragments:a,samplingPlan:sampling}),/LEGACY_EXPECTED_SEMANTICS_INVALID/);
  const b=releaseFragments(stratum);b[0].cases[0].label='MATCH';
  assert.throws(()=>adaptReleaseLineageForBase720({stratumId:stratum,fragments:b,samplingPlan:sampling}),/LINEAGE_RESULT_LEAKAGE/);
});

test('adapted release packets are consumable by exact base-720 materializer only with narrow self-evidence opt-in',()=>{
  const pressing=adaptReleaseLineageForBase720({stratumId:'er-stratum-pressing-edition-media',fragments:releaseFragments('er-stratum-pressing-edition-media'),samplingPlan:sampling});
  const variant=adaptReleaseLineageForBase720({stratumId:'er-stratum-variant-release-heavy',fragments:releaseFragments('er-stratum-variant-release-heavy'),samplingPlan:sampling});
  const packets=BASE720_ELIGIBLE_STRATA.map(id=>id==='er-stratum-pressing-edition-media'?pressing:id==='er-stratum-variant-release-heavy'?variant:syntheticPacket(id));
  const manifest={id:'kidults-er-base720-materialization-manifest-v1',production:'HOLD',packet_paths:packets.map((_,i)=>`/tmp/packet-${i}.json`),single_record_identity_case_classes:['SAME_OBJECT_NORMALIZATION','CROSS_MARKET_ALIAS']};
  const out=materializeBase720({manifest,packets,samplingPlan:sampling});
  assert.equal(out.case_count,720);assert.equal(out.labels_state,'NOT_COLLECTED');assert.equal(out.production,'HOLD');
  assert.deepEqual(validateBase720(out,sampling),{status:'PASS_BASE720_UNLABELED_NOT_REVIEWED',case_count:720,strata:6,graded:0,labels:'NOT_COLLECTED',production:'HOLD'});
});
