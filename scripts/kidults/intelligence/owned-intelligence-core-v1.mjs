import {
  deduplicateMarketEvents,
  reconcileGradingEvidence,
  marketAdmissionErrors,
  gradingAdmissionErrors
} from './provider-independent-layers-v1.mjs';

const round = (v, n = 6) => Number(Number(v).toFixed(n));
const finite = (v) => Number.isFinite(Number(v));
const validTime = (v) => { const t=Date.parse(v); return Number.isFinite(t)?t:null; };
const median = (xs) => { const a = xs.filter(finite).map(Number).sort((x, y) => x - y); if (!a.length) return null; const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const mad = (xs) => { const m = median(xs); if (m == null) return null; return median(xs.map((x) => Math.abs(Number(x) - m))); };

export function evaluateRights(rights, operation) {
  const map = {COLLECT:'collect',STORE:'store',TRANSFORM:'transform',INTERNAL_DISPLAY:'internal_display',PUBLIC_DISPLAY:'display',REDISTRIBUTE:'redistribute',COMMERCIAL_SALE:'sell'};
  const field = map[operation]; if (!field) return {state:'HOLD',reason:'UNKNOWN_OPERATION'};
  const state = rights?.[field] ?? 'UNKNOWN'; return state === 'ALLOW' ? {state:'ALLOW',reason:null} : {state:'HOLD',reason:`RIGHT_${field.toUpperCase()}_${state}`};
}

export function reconcileFacts(records, keyFn, valueFn) {
  const groups = new Map();
  for (const record of records) { const key = keyFn(record); if (!key) continue; const group = groups.get(key) ?? []; group.push(record); groups.set(key, group); }
  return [...groups.entries()].map(([key, group]) => {
    const values = [...new Set(group.map(valueFn).filter((v)=>v!==undefined&&v!==null).map((v)=>JSON.stringify(v)))];
    const owners = [...new Set(group.map((r)=>r.lineage?.source_owner??r.lineage?.source_family_id).filter(Boolean))].sort();
    return {key,state:values.length<=1?'MATCH':'CONFLICT_QUARANTINE',source_owner_count:owners.length,source_owners:owners,values:values.map((v)=>JSON.parse(v))};
  });
}

export function buildScarcityIntelligence(gradingRecords) {
  const admitted = gradingRecords.filter((r)=>gradingAdmissionErrors(r).length===0&&r.admission?.state==='ADMITTED');
  const reconciled = reconcileGradingEvidence(admitted);
  return reconciled.map((entity)=>{
    const providerSignals=entity.provider_censuses.map((c)=>{const denom=[c.at_grade,c.higher].filter(finite).map(Number).reduce((a,b)=>a+b,0);return {provider_id:c.provider_id,as_of:c.as_of,at_or_above_grade_population:denom||null,scarcity_index:denom>0?round(1/Math.log10(10+denom)):null,interpretation:denom>0?'PROVIDER_SPECIFIC_RELATIVE_SCARCITY':'NOT_VERIFIED'};});
    const usable=providerSignals.map((x)=>x.scarcity_index).filter(finite);
    return {canonical_entity_id:entity.canonical_entity_id,provider_signals:providerSignals,global_population:null,global_population_reason:'PROVIDER_CENSUSES_ARE_NOT_SUMMED',composite_scarcity_index:usable.length>=2?round(usable.reduce((a,b)=>a+b,0)/usable.length):null,composite_state:usable.length>=2?'BOUNDED_MULTI_PROVIDER':'NOT_VERIFIED_INSUFFICIENT_INDEPENDENT_GRADERS'};
  });
}

function normalizedSoldAmount(event) { if (finite(event.price?.condition_adjusted_amount)) return Number(event.price.condition_adjusted_amount); if (finite(event.price?.normalized_amount)) return Number(event.price.normalized_amount); return finite(event.price?.amount)?Number(event.price.amount):null; }

export function buildValuationIntelligence(events, {asOf = new Date().toISOString()} = {}) {
  const asOfMs=validTime(asOf); if(asOfMs==null) return {state:'HOLD_INVALID_ASOF'};
  const unique=deduplicateMarketEvents(events);
  const soldEntries=unique.filter((x)=>x.canonical_event?.evidence_class==='VERIFIED_SOLD_EVENT'&&x.canonical_event?.event_state==='SOLD'&&marketAdmissionErrors(x.canonical_event).length===0);
  const sold=soldEntries.map((x)=>x.canonical_event);
  const comparable=sold.filter((e)=>normalizedSoldAmount(e)!=null);
  const entityIds=[...new Set(comparable.map(e=>e.canonical_entity_id).filter(Boolean))];
  if(entityIds.length>1) return {state:'HOLD_MULTI_ENTITY_VALUATION_INPUT',entity_ids:entityIds,comparable_count:comparable.length};
  if(comparable.some(e=>!e.canonical_entity_id)) return {state:'HOLD_ENTITY_ID_MISSING'};
  const temporalInvalid=comparable.some((e)=>{const t=validTime(e.event_at);return t==null||t>asOfMs;});
  if(temporalInvalid) return {state:'HOLD_INVALID_OR_FUTURE_EVENT_DATE'};
  const soldOwners=new Set(soldEntries.flatMap((x)=>x.corroborating_source_owners??[]));
  const currencies=[...new Set(sold.map((e)=>e.price?.currency).filter(Boolean))];
  const allNormalized=sold.every((e)=>finite(e.price?.condition_adjusted_amount)||finite(e.price?.normalized_amount));
  if(comparable.length<3) return {state:'NOT_VERIFIED_INSUFFICIENT_SOLD_EVENTS',comparable_count:comparable.length,source_owner_count:soldOwners.size};
  if(soldOwners.size<2) return {state:'NOT_VERIFIED_SINGLE_SOURCE_OWNER',comparable_count:comparable.length,source_owner_count:soldOwners.size};
  if(currencies.length>1&&!allNormalized) return {state:'NOT_VERIFIED_CURRENCY_NORMALIZATION_REQUIRED',comparable_count:comparable.length,currency_set:currencies};
  const amounts=comparable.map(normalizedSoldAmount),weights=comparable.map((e)=>Math.exp(-Math.max(0,(asOfMs-validTime(e.event_at))/86400000)/180));
  const weightTotal=weights.reduce((a,b)=>a+b,0); if(!finite(weightTotal)||weightTotal<=0) return {state:'HOLD_RECENCY_WEIGHT_INVALID'};
  const weighted=comparable.reduce((sum,e,i)=>sum+normalizedSoldAmount(e)*weights[i],0)/weightTotal,baseMedian=median(amounts),dispersion=mad(amounts);
  return {state:'BOUNDED_INTERNAL_VALUATION',canonical_entity_id:entityIds[0]??null,comparable_count:comparable.length,source_owner_count:soldOwners.size,representative_value:round((baseMedian+weighted)/2,2),median_value:round(baseMedian,2),recency_weighted_mean:round(weighted,2),median_absolute_deviation:dispersion==null?null:round(dispersion,2),currency_basis:allNormalized?(comparable[0].price?.normalized_currency??currencies[0]??'NORMALIZED'):currencies[0],claim_ceiling:'INTERNAL_DERIVED_ESTIMATE_NOT_MARKET_FACT'};
}

export function buildLiquidityIntelligence(events) {
  const unique=deduplicateMarketEvents(events),canonical=unique.map((x)=>x.canonical_event),entityIds=[...new Set(canonical.map(e=>e.canonical_entity_id).filter(Boolean))];
  if(entityIds.length>1) return {state:'HOLD_MULTI_ENTITY_LIQUIDITY_INPUT',entity_ids:entityIds,claim_ceiling:'NO_LIQUIDITY_CLAIM'};
  const sold=canonical.filter((e)=>e.evidence_class==='VERIFIED_SOLD_EVENT'&&e.event_state==='SOLD'),failed=canonical.filter((e)=>e.evidence_class==='FAILED_SALE_EVENT'||['NO_SALE_RESERVE_NOT_MET','WITHDRAWN','EXPIRED'].includes(e.event_state));
  const durations=sold.map((e)=>e.duration_seconds).filter(finite).map(Number),venues=new Set(canonical.map((e)=>e.venue_id).filter(Boolean)),owners=new Set(unique.flatMap((x)=>x.corroborating_source_owners));
  const base={canonical_entity_id:entityIds[0]??null,unique_event_count:canonical.length,sold_event_count:sold.length,failed_sale_event_count:failed.length,source_owner_count:owners.size,venue_count:venues.size,failed_sale_ratio:canonical.length?round(failed.length/canonical.length):null,median_time_to_sale_days:durations.length?round(median(durations)/86400,2):null};
  const complete=sold.length>=3&&owners.size>=2&&venues.size>=2;
  return {...base,state:complete?'BOUNDED_MARKET_DEPTH_OBSERVED':'NOT_VERIFIED_INSUFFICIENT_DEPTH',claim_ceiling:complete?'INTERNAL_LIQUIDITY_SIGNAL':'NO_LIQUIDITY_CLAIM'};
}

export function scoreSourceReliability(records) {
  const byOwner=new Map(); for(const r of records){const owner=r.lineage?.source_owner??r.lineage?.source_family_id;if(!owner)continue;const list=byOwner.get(owner)??[];list.push(r);byOwner.set(owner,list);}
  return [...byOwner.entries()].map(([source_owner,list])=>{const rightsPass=list.filter((r)=>['collect','store','transform'].every((k)=>r.rights?.[k]==='ALLOW')).length/list.length,lineagePass=list.filter((r)=>r.lineage?.evidence_id||r.lineage?.source_record_ref).length/list.length,freshPass=list.filter((r)=>!r.freshness||r.freshness.state==='CURRENT').length/list.length,completePass=list.filter((r)=>r.canonical_entity_id&&(r.observed_at||r.event_at)).length/list.length,score=round((rightsPass+lineagePass+freshPass+completePass)/4);return {source_owner,sample_count:list.length,reliability_score:score,classification:list.length<3?'INSUFFICIENT_SAMPLE':score>=0.9?'HIGH':score>=0.7?'MEDIUM':'LOW',dimensions:{rights:round(rightsPass),lineage:round(lineagePass),freshness:round(freshPass),completeness:round(completePass)},claim_ceiling:'INTERNAL_SOURCE_QUALITY_SIGNAL'};});
}

export function buildOwnedIntelligence({grading=[],market=[],asOf}={}) {
  const canonicalMarket=market.map((x)=>x.event??x),entityIds=[...new Set(canonicalMarket.map(e=>e.canonical_entity_id).filter(Boolean))];
  if(entityIds.length>1) return {status:'HOLD_MULTI_ENTITY_MARKET_INPUT',entity_ids:entityIds,scarcity:buildScarcityIntelligence(grading),valuation:{state:'HOLD_MULTI_ENTITY_VALUATION_INPUT'},liquidity:{state:'HOLD_MULTI_ENTITY_LIQUIDITY_INPUT'},source_reliability:scoreSourceReliability([...grading,...canonicalMarket]),reconciliation:[],external_fact_conflict_count:0,production:'HOLD'};
  const marketFactConflicts=reconcileFacts(canonicalMarket,(e)=>[e.physical_object_id??e.canonical_entity_id,e.event_at,e.venue_id].join('|'),(e)=>({state:e.event_state,amount:e.price?.amount??null,currency:e.price?.currency??null,price_type:e.price?.price_type??null}));
  const conflicts=marketFactConflicts.filter((x)=>x.state==='CONFLICT_QUARANTINE');
  return {status:conflicts.length?'HOLD_CONFLICTING_EXTERNAL_FACTS':'READY_BOUNDED_INTERNAL_INTELLIGENCE',scarcity:buildScarcityIntelligence(grading),valuation:conflicts.length?{state:'HOLD_CONFLICTING_EXTERNAL_FACTS'}:buildValuationIntelligence(market,{asOf}),liquidity:conflicts.length?{state:'HOLD_CONFLICTING_EXTERNAL_FACTS'}:buildLiquidityIntelligence(market),source_reliability:scoreSourceReliability([...grading,...canonicalMarket]),reconciliation:marketFactConflicts,external_fact_conflict_count:conflicts.length,production:'HOLD'};
}
