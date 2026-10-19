const fail = code => {throw new Error(`RUNTIME_EVIDENCE_DEMAND_${code}`);};
export function buildRuntimeEvidenceDemand({definition, contract, proof}) {
  if (definition?.id !== 'kidults-runtime-domain-evidence-demand-v1'
    || definition.planning_is_runtime_proof !== false || definition.dispatch_authority !== false
    || ['production','public','g5','provider_activation'].some(key=>definition[key]!=='HOLD')) fail('AUTHORITY');
  const ids = contract.value_chain_dimensions;
  const domains = definition.domains;
  if (!Array.isArray(ids) || ids.length!==14 || new Set(ids).size!==14
    || !Array.isArray(domains) || domains.length!==14
    || new Set(domains.map(d=>d.id)).size!==14 || domains.some(d=>!ids.includes(d.id)
      || typeof d.owner!=='string'||!d.owner || typeof d.input!=='string'||!d.input
      || !Array.isArray(d.requires)||new Set(d.requires).size!==d.requires.length
      || d.requires.some(id=>!ids.includes(id)||id===d.id))) fail('DOMAIN_SET');
  const active=new Set(),done=new Set(),byId=new Map(domains.map(d=>[d.id,d]));
  const visit=id=>{if(active.has(id))fail('CYCLE');if(done.has(id))return;
    active.add(id);for(const dependency of byId.get(id).requires)visit(dependency);active.delete(id);done.add(id);};
  for(const id of ids)visit(id);
  const sources=contract.runtime_domain_sources;
  if(!Array.isArray(sources)||sources.length>14||new Set(sources.map(s=>s.domain_id)).size!==sources.length
    ||sources.some(s=>!ids.includes(s.domain_id)))fail('REGISTRY');
  const autonomy=contract.autonomous_operating_readiness,required=new Set(autonomy?.mandatory_runtime_domains||[]),
    future=new Set(autonomy?.future_expansion_domains||[]);
  if(autonomy?.scope!=='AUTONOMOUS_CONTROL_PLANE_NOT_WHOLE_PLATFORM'||required.size!==1
    ||!required.has('SECURITY_SUPPLY_CHAIN')||future.size!==13
    ||[...required,...future].length!==14||ids.some(id=>!required.has(id)&&!future.has(id)))fail('AUTONOMY_SCOPE');
  const verified = new Set((proof.value_chain||[]).filter(d=>d.runtime_state==='VERIFIED_PASS'
    &&/^sha256:[a-f0-9]{64}$/.test(d.runtime_receipt_digest||'')).map(d=>d.id));
  const registered = new Set(sources.map(s=>s.domain_id));
  if([...verified].some(id=>!registered.has(id)||!ids.includes(id)))fail('UNREGISTERED_PASS');
  const demands=domains.map(d=>{const ready=verified.has(d.id),futureExpansion=future.has(d.id)&&!ready;return {domain_id:d.id,owner:d.owner,required_input:d.input,
    state:ready?'VERIFIED_PASS':futureExpansion?'FUTURE_EXPANSION':'HOLD',producer_registered:registered.has(d.id),
    autonomous_scope_required:required.has(d.id),blocker:ready||futureExpansion?null:!registered.has(d.id)?'NATIVE_DOMAIN_PRODUCER_NOT_REGISTERED':'AUTHENTICATED_EXACT_MAIN_RUNTIME_RECEIPT_REQUIRED',
    declared_dependencies:d.requires,unmet_dependencies:futureExpansion?[]:d.requires.filter(id=>!verified.has(id)),
    next_action:ready?'CONSUME_EXISTING_VERIFIED_RECEIPT':futureExpansion?'ADD_AFTER_PROVIDER_CONTRACT':!registered.has(d.id)?'IMPLEMENT_AND_REGISTER_NATIVE_DOMAIN_RECEIPT_PRODUCER':'RECONCILE_EXISTING_NATIVE_RUN_AND_ARTIFACT_BEFORE_RESUME',
    dispatch_authorized:false};});
  const scopedReady=[...required].every(id=>verified.has(id)),wholePlatformReady=demands.every(d=>d.state==='VERIFIED_PASS');
  const wholePlatformState=wholePlatformReady?'VERIFIED_PASS':scopedReady?'FUTURE_EXPANSION':'VERIFIED_INCOMPLETE';
  return {id:definition.id,source_sha:proof.source_sha,state:wholePlatformState,
    autonomous_scope:{id:'AUTONOMOUS_CONTROL_PLANE_NOT_WHOLE_PLATFORM',state:scopedReady?'VERIFIED_PASS':'VERIFIED_HOLD',
      required_domain_ids:[...required].sort(),verified_domain_count:[...required].filter(id=>verified.has(id)).length,
      future_expansion_domain_ids:[...future].sort(),future_expansion_is_blocking:false},
    whole_platform_state:wholePlatformState,scoped_required_domain_count:required.size,
    verified_domain_count:verified.size,required_domain_count:14,registered_domain_count:registered.size,
    demands,planning_is_runtime_proof:false,dispatch_authority:false,
    production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
}
