import {canonicalJsonDigest as digest} from '../market/current-sold-batch-v1.mjs';

const SHA=/^[a-f0-9]{40}$/,HASH=/^sha256:[a-f0-9]{64}$/;
const fail=code=>{throw new Error(`DOMAIN_OUTPUT_${code}`);};
const need=(ok,code)=>{if(!ok)fail(code);};
const hash=(x,code)=>need(HASH.test(x||''),code);
const count=(x,code,min=1)=>need(Number.isSafeInteger(x)&&x>=min&&x<=100000,code);
const text=(x,code)=>need(typeof x==='string'&&x.length>0&&x.length<=256,code);
const recent=(value,now,age,code)=>{
  const t=Date.parse(value);need(Number.isFinite(t)&&t<=now&&now-t<=age,code);return t;
};
const same=(a,b,code)=>need(typeof a==='string'&&a===b,code);
export const immutableObjectPairDigest=objects=>digest({id:'kidults-runtime-immutable-object-pair-v1',
  objects:['CANDIDATE','EVIDENCE'].map(kind=>{const row=objects.find(r=>r.kind===kind);
    return {kind,version_id:row.version_id,object_digest:row.object_digest,protected_object_ref_digest:row.protected_object_ref_digest};})});
const validators={
  VALUE_TRACEABILITY:(o,c)=>{
    count(o.edge_count,'LINEAGE_COUNT');hash(o.source_digest,'LINEAGE_SOURCE');hash(o.decision_digest,'LINEAGE_DECISION');
    same(o.source_digest,c.input_digest,'LINEAGE_INPUT_JOIN');hash(o.lineage_digest,'LINEAGE_GRAPH');
  },
  SOURCE_RIGHTS:(o,c)=>{
    need(Array.isArray(o.source_admissions)&&o.source_admissions.length>0&&o.source_admissions.length<=100,'RIGHTS_ADMISSIONS');
    const sources=new Set();
    for(const row of o.source_admissions){
      text(row.source_id,'RIGHTS_SOURCE');need(!sources.has(row.source_id),'RIGHTS_DUPLICATE');sources.add(row.source_id);
      need(row.purpose==='CURRENT_SOLD_TRANSACTION'&&row.decision==='ADMITTED','RIGHTS_PURPOSE');
      hash(row.rights_document_digest,'RIGHTS_DOCUMENT');hash(row.independent_admission_digest,'RIGHTS_INDEPENDENT_ADMISSION');
      const atoms=['COLLECT','STORE','DERIVE','INTERNAL_REVIEW','DELETE'];
      need(Array.isArray(row.rights_atoms)&&row.rights_atoms.length===atoms.length
        &&new Set(row.rights_atoms).size===atoms.length&&row.rights_atoms.every(atom=>typeof atom==='string'&&atoms.includes(atom)), 'RIGHTS_ATOMS');
      const start=Date.parse(row.effective_at),end=Date.parse(row.expires_at);
      need(Number.isFinite(start)&&Number.isFinite(end)&&start<=c.now&&c.now<end,'RIGHTS_TIME');
      need(Number.isSafeInteger(row.retention_seconds)&&row.retention_seconds>0&&row.retention_seconds<=2592000,'RIGHTS_RETENTION');
    }
    need(JSON.stringify([...sources].sort())===JSON.stringify(c.source_ids),'RIGHTS_INPUT_SOURCES');
  },
  ENTITY_RESOLUTION:(o,c)=>{
    count(o.input_record_count,'ER_RECORDS');count(o.canonical_entity_count,'ER_ENTITIES');
    count(c.input_record_count,'ER_AUTHENTICATED_RECORDS');
    need(o.input_record_count===c.input_record_count,'ER_INPUT_COVERAGE');
    need(o.canonical_entity_count<=o.input_record_count,'ER_CARDINALITY');
    need(o.unresolved_count===0&&o.conflicting_identity_count===0,'ER_UNRESOLVED');
    hash(o.canonical_decisions_digest,'ER_DECISIONS');hash(o.independent_validation_digest,'ER_INDEPENDENT');
  },
  MARKET_EVIDENCE:(o,c)=>{
    count(o.sold_record_count,'MARKET_SOLD');count(o.liquidity_observation_count,'MARKET_LIQUIDITY');
    count(o.independent_factual_origin_count,'MARKET_ORIGINS',2);
    recent(o.oldest_sold_at,c.now,604800000,'MARKET_STALE_SOLD');
    recent(o.oldest_liquidity_observed_at,c.now,604800000,'MARKET_STALE_LIQUIDITY');
    hash(o.sold_evidence_digest,'MARKET_SOLD_DIGEST');hash(o.liquidity_evidence_digest,'MARKET_LIQUIDITY_DIGEST');
    need(o.historical_only===false&&o.reference_only===false,'MARKET_REFERENCE_ONLY');
  },
  ASI_EXECUTION:(o,c)=>{
    same(o.input_digest,c.input_digest,'ASI_INPUT_JOIN');count(o.expected_processor_count,'ASI_EXPECTED');
    need(o.completed_processor_count===o.expected_processor_count&&o.failed_processor_count===0,'ASI_COMPLETENESS');
    count(o.output_count,'ASI_OUTPUTS');hash(o.outputs_digest,'ASI_OUTPUT_DIGEST');
  },
  IMMUTABLE_CANDIDATE:(o,c)=>{
    hash(o.exact_pair_digest,'PAIR_DIGEST');
    need(Array.isArray(o.objects)&&o.objects.length===2&&new Set(o.objects.map(r=>r.kind)).size===2
      &&o.objects.some(r=>r.kind==='CANDIDATE')&&o.objects.some(r=>r.kind==='EVIDENCE'),'PAIR_OBJECT_SET');
    for(const row of o.objects){
      text(row.version_id,'PAIR_VERSION');hash(row.object_digest,'PAIR_OBJECT_DIGEST');
      same(row.readback_digest,row.object_digest,'PAIR_READBACK');hash(row.protected_object_ref_digest,'PAIR_OBJECT_REF');
      need(row.object_lock_mode==='COMPLIANCE'&&Date.parse(row.retain_until)>c.now,'PAIR_OBJECT_LOCK');
    }
    need(new Set(o.objects.map(row=>row.protected_object_ref_digest)).size===2,'PAIR_DISTINCT_OBJECTS');
    same(o.exact_pair_digest,immutableObjectPairDigest(o.objects),'PAIR_OBJECT_BINDING');
    hash(o.reservation_digest,'PAIR_RESERVATION');
  },
  TRACK_B_VALIDATION:(o,c)=>{
    same(o.exact_pair_digest,c.outputs.IMMUTABLE_CANDIDATE?.exact_pair_digest,'TRACK_B_PAIR');
    text(o.assessment_id,'TRACK_B_ASSESSMENT_ID');hash(o.assessment_digest,'TRACK_B_ASSESSMENT');
    need(o.recommendation==='PUBLISHABLE_INTERNAL'&&o.overall_rankability===true,'TRACK_B_VERDICT');
    need(o.production_eligible===false&&o.publication_eligible===false,'TRACK_B_RELEASE');
    hash(o.sample_governance_digest,'TRACK_B_SAMPLE_GOVERNANCE');
  },
  PROJECTION_TRUTH:(o,c)=>{
    same(o.exact_pair_digest,c.outputs.IMMUTABLE_CANDIDATE?.exact_pair_digest,'PROJECTION_PAIR');
    same(o.assessment_digest,c.outputs.TRACK_B_VALIDATION?.assessment_digest,'PROJECTION_ASSESSMENT');
    hash(o.projection_digest,'PROJECTION_DIGEST');text(o.projection_id,'PROJECTION_ID');
    need(o.projection_state==='APPROVED_INTERNAL'&&o.internal_display_right==='ALLOWED','PROJECTION_ADMISSION');
    recent(o.observed_at,c.now,7200000,'PROJECTION_FRESHNESS');need(Date.parse(o.valid_until)>c.now,'PROJECTION_EXPIRED');
  },
  PORTAL_TRANSPARENCY_ACCESSIBILITY:(o,c)=>{
    same(o.rendered_projection_digest,c.outputs.PROJECTION_TRUTH?.projection_digest,'PORTAL_PROJECTION');
    hash(o.rendered_dom_digest,'PORTAL_DOM');hash(o.browser_execution_digest,'PORTAL_BROWSER');
    need(o.accessibility_violation_count===0,'PORTAL_ACCESSIBILITY');
    need(Array.isArray(o.flows)&&o.flows.length===2&&new Set(o.flows.map(r=>r.action)).size===2
      &&['COMPARE','WATCHLIST'].every(action=>o.flows.some(r=>r.action===action&&r.result==='SUCCESS')),'PORTAL_FLOWS');
    hash(o.transparency_disclosure_digest,'PORTAL_DISCLOSURE');
  },
  EOS_FOUNDER_WORKFLOW:(o,c)=>{
    same(o.projection_digest,c.outputs.PROJECTION_TRUTH?.projection_digest,'EOS_PROJECTION');
    text(o.decision_id,'EOS_DECISION_ID');hash(o.decision_workflow_digest,'EOS_WORKFLOW');
    hash(o.actual_acceptance_event_digest,'EOS_ACCEPTANCE');hash(o.persisted_decision_readback_digest,'EOS_READBACK');
    need(o.human_acceptance_simulated===false,'EOS_SIMULATED_ACCEPTANCE');
  },
  RUNTIME_RELIABILITY:(o,c)=>{
    same(o.exact_pair_digest,c.outputs.IMMUTABLE_CANDIDATE?.exact_pair_digest,'RELIABILITY_PAIR');
    count(o.business_records_replayed,'RELIABILITY_RECORDS');count(o.injected_failure_count,'RELIABILITY_FAILURES');
    need(o.recovered_failure_count===o.injected_failure_count&&o.unrecovered_failure_count===0,'RELIABILITY_RECOVERY');
    hash(o.db_readback_digest,'RELIABILITY_DB');hash(o.pitr_restore_readback_digest,'RELIABILITY_PITR');
    hash(o.rollback_audit_digest,'RELIABILITY_ROLLBACK');
  },
  PRIVACY_RETENTION:(o,c)=>{
    count(o.classified_record_count,'PRIVACY_CLASSIFIED');count(o.deleted_record_count,'PRIVACY_DELETED');
    need(o.deleted_record_count<=o.classified_record_count&&o.unclassified_record_count===0,'PRIVACY_COUNTS');
    hash(o.classification_digest,'PRIVACY_CLASSIFICATION');hash(o.deletion_operation_digest,'PRIVACY_OPERATION');
    hash(o.absence_readback_digest,'PRIVACY_READBACK');
    const expiry=Date.parse(o.expires_at),deleted=Date.parse(o.deleted_at),readback=Date.parse(o.readback_at),deadline=Date.parse(o.deletion_deadline);
    need([expiry,deleted,readback,deadline].every(Number.isFinite)&&expiry<=deleted&&deleted<=deadline
      &&deleted<=readback&&readback<=c.now,'PRIVACY_DELETION_TIME');
    need(o.readback_remaining_record_count===0,'PRIVACY_REMAINING');
  },
  INTEGRATION_GATE:(o,c)=>{
    const expected=[...Object.keys(validators).filter(id=>id!=='INTEGRATION_GATE'),'SECURITY_SUPPLY_CHAIN'].sort();
    need(Array.isArray(o.domains)&&o.domains.length===13&&new Set(o.domains.map(r=>r.domain_id)).size===13
      &&JSON.stringify(o.domains.map(r=>r.domain_id).sort())===JSON.stringify(expected),'INTEGRATION_DOMAIN_SET');
    for(const row of o.domains)same(row.receipt_digest,c.receipt_digests[row.domain_id],'INTEGRATION_RECEIPT_JOIN');
    need(o.missing_domain_count===0&&o.failed_domain_count===0,'INTEGRATION_INCOMPLETE');
    hash(o.whole_chain_consumption_digest,'INTEGRATION_CONSUMPTION');
  }
};

// This is a semantic consumer, not a producer authenticator. Callers must first
// authenticate native run/artifact identity and archive bytes independently.
// No shape, digest, local test or caller-supplied "live" flag grants that trust.
export function consumeRuntimeDomainOutput({domainId,output,sourceSha,inputDigest,sourceIds,inputRecordCount,
  dependencyOutputs={},dependencyReceiptDigests={},now=new Date()}){
  need(SHA.test(sourceSha||'')&&now instanceof Date&&Number.isFinite(now.getTime()),'CONTEXT');
  hash(inputDigest,'INPUT_DIGEST');
  need(Array.isArray(sourceIds)&&sourceIds.length>0&&sourceIds.length<=100
    &&sourceIds.every(id=>typeof id==='string'&&id.length>0)&&new Set(sourceIds).size===sourceIds.length,'SOURCE_IDS');
  const validator=validators[domainId];need(!!validator,'DOMAIN_ID');
  const frozen=JSON.parse(JSON.stringify(output));
  need(frozen?.id==='kidults-runtime-domain-output-v1'&&frozen.domain_id===domainId
    &&frozen.source_sha===sourceSha&&frozen.fixture_evidence===false,'OUTPUT_BINDING');
  need(['production','public','g5','provider_activation'].every(k=>frozen[k]==='HOLD'),'RELEASE');
  const {output_digest,...body}=frozen;same(output_digest,digest(body),'OUTPUT_DIGEST');
  same(frozen.input_digest,inputDigest,'OUTPUT_INPUT_JOIN');
  validator(frozen,{now:now.getTime(),input_digest:inputDigest,input_record_count:inputRecordCount,source_ids:[...sourceIds].sort(),
    outputs:structuredClone(dependencyOutputs),receipt_digests:{...dependencyReceiptDigests}});
  return {domain_id:domainId,state:'OUTPUT_CONTENT_VERIFIED_NOT_NATIVE_DOMAIN_CERTIFICATE',
    source_sha:sourceSha,output_digest,native_producer_authenticated:false,
    native_domain_receipt_emitted:false,whole_platform_runtime_proven:false};
}
