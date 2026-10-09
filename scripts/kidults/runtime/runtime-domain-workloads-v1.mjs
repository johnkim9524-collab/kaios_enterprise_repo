import {canonicalJsonDigest as digest} from '../market/current-sold-batch-v1.mjs';
import {RIGHTS_CLEAR} from '../source-intelligence/lib/source-purpose-rights-gate-v1.mjs';

const IDS=['VALUE_TRACEABILITY','SOURCE_RIGHTS','ENTITY_RESOLUTION','MARKET_EVIDENCE',
  'ASI_EXECUTION','IMMUTABLE_CANDIDATE','TRACK_B_VALIDATION','PROJECTION_TRUTH',
  'PORTAL_TRANSPARENCY_ACCESSIBILITY','EOS_FOUNDER_WORKFLOW','RUNTIME_RELIABILITY',
  'PRIVACY_RETENTION','INTEGRATION_GATE'];
const fail=code=>{throw new Error(`DOMAIN_WORKLOAD_${code}`);};
const holds={production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
const requirements={
  VALUE_TRACEABILITY:['AUTHENTICATED_INPUT_TO_OUTPUT_LINEAGE'],
  SOURCE_RIGHTS:['INDEPENDENT_LEGAL_PURPOSE_RETENTION_ADMISSION'],
  ENTITY_RESOLUTION:['INDEPENDENT_ENTITY_DECISIONS'],
  MARKET_EVIDENCE:['CURRENT_PRICE_AND_LIQUIDITY_NATIVE_WORKLOAD'],
  ASI_EXECUTION:['COMPLETE_NATIVE_PROCESSOR_EXECUTION'],
  IMMUTABLE_CANDIDATE:['AUTHORIZED_IMMUTABLE_PAIR_WRITE_AND_READBACK'],
  TRACK_B_VALIDATION:['EXACT_PAIR_OFFICIAL_TRACK_B_EXECUTION'],
  PROJECTION_TRUTH:['EXACT_ASSESSED_PAIR_PROJECTION_EXECUTION'],
  PORTAL_TRANSPARENCY_ACCESSIBILITY:['RENDERED_PROJECTION_AND_ACCESSIBILITY_EXECUTION'],
  EOS_FOUNDER_WORKFLOW:['ACTUAL_FOUNDER_DECISION_WORKFLOW'],
  RUNTIME_RELIABILITY:['ACTUAL_BUSINESS_REPLAY_FAILURE_RECOVERY_DB_READBACK'],
  PRIVACY_RETENTION:['AUTHORIZED_RETENTION_DELETION_AND_READBACK'],
  INTEGRATION_GATE:['ALL_14_INDEPENDENT_NATIVE_DOMAIN_RECEIPTS']
};

export function orderedRuntimeDomains(definition){
  if(definition?.id!=='kidults-runtime-domain-evidence-demand-v1'
    ||definition.planning_is_runtime_proof!==false||definition.dispatch_authority!==false
    ||Object.keys(holds).some(k=>definition[k]!==holds[k]))fail('DEFINITION');
  const rows=definition.domains;
  if(!Array.isArray(rows)||rows.length!==14||new Set(rows.map(r=>r.id)).size!==14
    ||rows.some(r=>![...IDS,'SECURITY_SUPPLY_CHAIN'].includes(r.id)
      ||typeof r.owner!=='string'||!r.owner||!Array.isArray(r.requires)
      ||new Set(r.requires).size!==r.requires.length
      ||r.requires.some(id=>![...IDS,'SECURITY_SUPPLY_CHAIN'].includes(id)||id===r.id)))fail('DOMAIN_SET');
  const byId=new Map(rows.map(r=>[r.id,r])),active=new Set(),done=new Set(),ordered=[];
  const visit=id=>{
    if(active.has(id))fail('DEPENDENCY_CYCLE');
    if(done.has(id))return;
    active.add(id);
    for(const dependency of byId.get(id).requires)visit(dependency);
    active.delete(id);done.add(id);
    if(id!=='SECURITY_SUPPLY_CHAIN')ordered.push(byId.get(id));
  };
  for(const id of [...IDS,'SECURITY_SUPPLY_CHAIN'])visit(id);
  return ordered;
}

function freeze(value){
  if(value&&typeof value==='object'){
    for(const child of Object.values(value))freeze(child);
    Object.freeze(value);
  }
  return value;
}

function checkedInput(connection,sourceSha){
  if(connection?.state!=='INPUT_TRANSPORT_AND_CONTENT_VERIFIED')return null;
  if(connection.source_sha!==sourceSha||connection.binding_transport_authenticated!==true
    ||connection.native_domain_receipt_emitted!==false
    ||Object.keys(holds).some(k=>connection[k]!==holds[k]))fail('CONNECTION_BINDING');
  const input=structuredClone(connection.input_processing);
  if(!input||input.source_sha!==sourceSha||String(input.canonical_run_id)!==String(connection.run_id)
    ||input.native_domain_receipt_emitted!==false||input.evidence_scope!=='FILE_INTEGRITY_AND_CONTENT_VALIDATION_ONLY')fail('INPUT_SCOPE');
  const {content_digest,...body}=input;
  if(content_digest!==digest(body))fail('INPUT_DIGEST');
  const bundle=input.bundle;
  if(bundle?.receipt?.status!=='PASS'||!Array.isArray(bundle.event_versions)
    ||!bundle.event_versions.length||bundle.event_versions.length>100
    ||!Array.isArray(bundle.evidence)||bundle.evidence.length<1||bundle.evidence.length>100
    ||bundle.evidence.length!==bundle.receipt.counts?.admitted
    ||bundle.receipt.counts.rejected!==0||bundle.receipt.counts.quarantined!==0
    ||input.lineage?.event_versions_digest!==digest(bundle.event_versions)
    ||input.lineage?.evidence_digest!==digest(bundle.evidence))fail('ATOMIC_BUNDLE');
  return freeze(input);
}

function localLineage(input){
  const events=input.bundle.event_versions,evidence=input.bundle.evidence;
  const edges=evidence.map(row=>{
    const matches=events.filter(event=>event.event_id===row.lineage?.current_sold_event_id
      &&event.content_digest===row.lineage?.current_sold_content_digest);
    if(matches.length!==1)fail('LINEAGE_EVENT_JOIN');
    const event=matches[0];
    if(row.canonical_object_id!==event.canonical_object_id
      ||row.lineage.source_id!==event.source_id
      ||row.lineage.acquisition_receipt_id!==event.acquisition_receipt_id
      ||row.lineage.rights_receipt_id!==event.rights_receipt_id)fail('LINEAGE_SOURCE_JOIN');
    return {event_digest:digest(event),evidence_digest:digest(row)};
  });
  return {scope:'ACTUAL_INPUT_TO_PROCESSING_LINEAGE_ONLY',edge_count:edges.length,lineage_digest:digest(edges)};
}

function localRights(input){
  const sources=[...new Set(input.bundle.event_versions.map(row=>row.source_id))].sort();
  if(!Array.isArray(input.rights_decisions)||input.rights_decisions.length!==sources.length
    ||new Set(input.rights_decisions.map(row=>row.source_id)).size!==sources.length
    ||input.rights_decisions.some(row=>!sources.includes(row.source_id)||row.decision!==RIGHTS_CLEAR))fail('RIGHTS_SOURCE_COVERAGE');
  return {scope:'SOURCE_PURPOSE_CONTENT_CLASSIFICATION_ONLY',source_count:sources.length,
    decisions_digest:digest(input.rights_decisions),independent_legal_admission_verified:false};
}

function localEntities(input){
  const byObservation=new Map(),byEntity=new Map();
  for(const row of input.bundle.event_versions){
    if(typeof row.canonical_object_id!=='string'||!row.canonical_object_id)fail('ENTITY_ID');
    const key=JSON.stringify([row.source_id,row.source_event_id]);
    if(byObservation.has(key)&&byObservation.get(key)!==row.canonical_object_id)fail('ENTITY_CONFLICT');
    byObservation.set(key,row.canonical_object_id);
    const group=byEntity.get(row.canonical_object_id)||[];
    group.push(digest(row));byEntity.set(row.canonical_object_id,group);
  }
  const groups=[...byEntity].sort(([a],[b])=>a.localeCompare(b)).map(([id,records])=>({id,records:records.sort()}));
  return {scope:'CANONICAL_ID_GROUPING_NOT_IDENTITY_ADJUDICATION',entity_count:groups.length,
    grouping_digest:digest(groups),independent_entity_resolution_verified:false};
}

function localSold(input){
  const evidence=input.bundle.evidence;
  if(evidence.some(row=>row.assertion?.predicate!=='REALIZED_SALE'
    ||row.assertion?.transaction_status!=='SOLD'))fail('SOLD_SEMANTICS');
  return {scope:'ADMITTED_CURRENT_SOLD_PROCESSING_ONLY',sold_evidence_count:evidence.length,
    sold_evidence_digest:digest(evidence),liquidity_proven:false,current_price_proven:false};
}

function localAsi(input){
  return {scope:'COMPLETE_INPUT_STAGE_PROCESSING_ONLY',event_count:input.bundle.event_versions.length,
    evidence_count:input.bundle.evidence.length,processor_output_digest:digest(input.bundle),
    remote_processor_execution_verified:false};
}

function localPrivacy(input){
  // Never guess a legal classification from an asset or transaction identifier.
  // Observe data surface without exporting records, URLs, object IDs or prices.
  return {scope:'DATA_SURFACE_OBSERVATION_NOT_RETENTION_OR_DELETION_PROOF',
    record_count:input.bundle.event_versions.length,
    field_set_digest:digest([...new Set(input.bundle.event_versions.flatMap(row=>Object.keys(row)))].sort()),
    personal_data_classification:'NOT_INDEPENDENTLY_VERIFIED',deletion_proven:false};
}

const localProcessors={VALUE_TRACEABILITY:localLineage,SOURCE_RIGHTS:localRights,
  ENTITY_RESOLUTION:localEntities,MARKET_EVIDENCE:localSold,ASI_EXECUTION:localAsi,PRIVACY_RETENTION:localPrivacy};

// The implementation deliberately cannot issue a LIVE_RUNTIME domain certificate.
// It consumes a connector result supplied by pinned repository code, computes six
// bounded data-processing stages, and specifies exact remaining native joins for
// all thirteen domains. External writes/commands/callbacks are not an input API.
// Native storage, Track B, Projection, Portal, EOS and recovery require separately
// authenticated workload producers; these requirements cannot be filled by flags.
export function executeRuntimeDomainWorkloads({connection,definition,sourceSha}){
  if(!/^[a-f0-9]{40}$/.test(sourceSha||''))fail('SOURCE');
  const domains=orderedRuntimeDomains(definition),input=checkedInput(connection,sourceSha);
  const completed=new Set(),rows=[];
  for(const domain of domains){
    const pendingDependencies=domain.requires.filter(id=>!completed.has(id));
    const processor=localProcessors[domain.id];
    let processing=null;
    // Local processing dependencies are distinct from native proof dependencies.
    // A local computation never unlocks a remote write or a release gate.
    if(input&&processor&&pendingDependencies.length===0){
      processing=processor(input);completed.add(domain.id);
    }
    rows.push({domain_id:domain.id,owner:domain.owner,
      implementation:processor?'BOUNDED_LOCAL_PROCESSOR':'NATIVE_WORKLOAD_JOIN_REQUIRED',
      processing_state:processing?'EXECUTED_LOCAL_PROCESSING_ONLY':'NOT_EXECUTED',
      processing,processing_digest:processing?digest(processing):null,
      native_state:'HOLD',native_domain_proven:false,native_domain_receipt_emitted:false,
      blocker:!input?(connection?.blocker||'AUTHENTICATED_INPUT_REFERENCE_MISSING')
        :pendingDependencies.length?'NATIVE_OR_PROCESSING_DEPENDENCY_MISSING':'INDEPENDENT_NATIVE_WORKLOAD_EVIDENCE_REQUIRED',
      unmet_dependencies:pendingDependencies,required_native_evidence:requirements[domain.id]});
  }
  const body={id:'kidults-runtime-domain-workload-execution-v1',source_sha:sourceSha,
    state:'VERIFIED_INCOMPLETE',evidence_scope:'LOCAL_PROCESSING_AND_EXPLICIT_NATIVE_JOINS_NOT_DOMAIN_CERTIFICATION',
    input_digest:input?.content_digest??null,domain_count:rows.length,
    locally_executed_domain_count:completed.size,native_verified_domain_count:0,
    domains:rows,native_domain_receipt_emitted:false,whole_platform_runtime_proven:false,
    external_writes:0,remote_commands:0,...holds};
  return {...body,receipt_digest:digest(body)};
}
