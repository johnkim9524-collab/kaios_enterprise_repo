import {buildOwnedIntelligence, evaluateRights} from './owned-intelligence-core-v1.mjs';

const dayMs = 86400000;
const finite = (v) => Number.isFinite(Number(v));
const round = (v,n=6)=>Number(Number(v).toFixed(n));
const validTime=(v)=>{const t=Date.parse(v);return Number.isFinite(t)?t:null};
const eventKey=(e)=>e?.market_event_id??e?.source_event_id??e?.lineage?.evidence_id??null;

export function enforceRightsLifecycle(record,{now=new Date().toISOString()}={}){
  const rights=record?.rights??{};
  const nowMs=validTime(now);
  if(nowMs==null) return {state:'HOLD',reason:'RIGHTS_CLOCK_INVALID'};
  for(const op of ['COLLECT','STORE','TRANSFORM']){
    const r=evaluateRights(rights,op);
    if(r.state!=='ALLOW') return {state:'HOLD',reason:r.reason};
  }
  if(rights.review_due_at){
    const due=validTime(rights.review_due_at);
    if(due==null) return {state:'HOLD',reason:'RIGHTS_REVIEW_DATE_INVALID'};
    if(due<nowMs) return {state:'HOLD',reason:'RIGHTS_REVIEW_EXPIRED'};
  }
  if(rights.retention_days!==undefined&&rights.retention_days!==null){
    if(!finite(rights.retention_days)||Number(rights.retention_days)<=0) return {state:'HOLD',reason:'RETENTION_POLICY_INVALID'};
    if(!record.collected_at) return {state:'HOLD',reason:'COLLECTED_AT_REQUIRED_FOR_RETENTION'};
    const collected=validTime(record.collected_at);
    if(collected==null||collected>nowMs) return {state:'HOLD',reason:'COLLECTED_AT_INVALID'};
    const age=(nowMs-collected)/dayMs;
    if(age>Number(rights.retention_days)) return {state:'DELETE_REQUIRED',reason:'RETENTION_EXPIRED'};
  }
  return {state:'ALLOW',reason:null};
}

export function convertCurrency(amount,from,to,fxFacts,{asOf=new Date().toISOString(),maxAgeDays=7,maxRateDispersionPct=0.01}={}){
  if(!finite(amount)||!from||!to) return {state:'HOLD',reason:'FX_INPUT_INVALID'};
  if(!finite(maxAgeDays)||Number(maxAgeDays)<=0||Number(maxAgeDays)>90||!finite(maxRateDispersionPct)||Number(maxRateDispersionPct)<0||Number(maxRateDispersionPct)>0.1) return {state:'HOLD',reason:'FX_POLICY_INVALID'};
  const asOfMs=validTime(asOf);
  if(asOfMs==null) return {state:'HOLD',reason:'FX_ASOF_INVALID'};
  if(from===to) return {state:'PASS',amount:round(amount,2),currency:to,rate:1,source_owner:'IDENTITY',source_owner_count:0};
  const directRates=[];
  for(const f of fxFacts??[]){
    const observed=validTime(f?.observed_at);
    if(!finite(f?.rate)||Number(f.rate)<=0||observed==null||!f.source_owner) continue;
    if(['collect','store','transform'].some((k)=>f.rights?.[k]!=='ALLOW')) continue;
    const age=(asOfMs-observed)/dayMs;
    if(age<0||age>Number(maxAgeDays)) continue;
    if(f.base_currency===from&&f.quote_currency===to) directRates.push({rate:Number(f.rate),source_owner:f.source_owner});
    else if(f.base_currency===to&&f.quote_currency===from) directRates.push({rate:1/Number(f.rate),source_owner:f.source_owner});
  }
  if(!directRates.length) return {state:'HOLD',reason:'FX_RATE_MISSING_OR_STALE'};
  const uniqueOwners=new Set(directRates.map(x=>x.source_owner));
  const rates=directRates.map(x=>x.rate);
  const hi=Math.max(...rates),lo=Math.min(...rates);
  if(!finite(hi)||!finite(lo)||lo<=0) return {state:'HOLD',reason:'FX_RATE_INVALID'};
  if(rates.length>1&&(hi-lo)/hi>Number(maxRateDispersionPct)) return {state:'HOLD',reason:'FX_RATE_CONFLICT',source_owner_count:uniqueOwners.size,rate_min:round(lo,10),rate_max:round(hi,10)};
  const rate=rates.reduce((a,b)=>a+b,0)/rates.length;
  return {state:'PASS',amount:round(Number(amount)*rate,2),currency:to,rate:round(rate,10),source_owner:uniqueOwners.size===1?[...uniqueOwners][0]:'MULTI_SOURCE_RECONCILED',source_owner_count:uniqueOwners.size};
}

export function normalizeMarketCurrencies(events,fxFacts,{targetCurrency='USD',asOf,maxAgeDays=7,maxRateDispersionPct=0.01}={}){
  return (events??[]).map((wrapper)=>{
    const event=structuredClone(wrapper.event??wrapper);
    const conversion=convertCurrency(event.price?.amount,event.price?.currency,targetCurrency,fxFacts,{asOf,maxAgeDays,maxRateDispersionPct});
    if(conversion.state==='PASS') event.price={...event.price,normalized_amount:conversion.amount,normalized_currency:targetCurrency,fx_source_owner:conversion.source_owner,fx_source_owner_count:conversion.source_owner_count,fx_rate:conversion.rate};
    return {event,fx_state:conversion.state,fx_reason:conversion.reason??null};
  });
}

export function selectComparables(events,target){
  const entity=target?.canonical_entity_id;
  if(!entity) return [];
  return (events??[]).filter((w)=>{
    const e=w.event??w;
    if(e.canonical_entity_id!==entity) return false;
    if(target.region && (!e.region||e.region!==target.region)) return false;
    if(target.sale_mechanism && (!e.sale_mechanism||e.sale_mechanism!==target.sale_mechanism)) return false;
    return e.evidence_class==='VERIFIED_SOLD_EVENT'&&e.event_state==='SOLD';
  });
}

export function adjustForCondition(amount,observedGrade,targetGrade,policy){
  if(!finite(amount)) return {state:'HOLD',reason:'AMOUNT_INVALID'};
  if(observedGrade==null||targetGrade==null) return {state:'NO_ADJUSTMENT_CLAIM',amount:Number(amount),reason:'GRADE_MISSING'};
  if(!policy?.id||!policy?.version||!policy?.factors||typeof policy.factors!=='object') return {state:'HOLD',reason:'VERSIONED_METHODOLOGY_REQUIRED'};
  const observed=policy.factors[String(observedGrade)],target=policy.factors[String(targetGrade)];
  const cap=Number(policy.max_adjustment_ratio);
  if(!finite(observed)||!finite(target)||Number(observed)<=0||Number(target)<=0||!finite(cap)||cap<0||cap>0.5) return {state:'HOLD',reason:'METHODOLOGY_POLICY_INVALID'};
  const ratio=Number(target)/Number(observed);
  if(!finite(ratio)||Math.abs(ratio-1)>cap) return {state:'HOLD',reason:'CONDITION_ADJUSTMENT_OUTSIDE_CAP'};
  return {state:'PASS',amount:round(Number(amount)*ratio,2),ratio:round(ratio),methodology_id:policy.id,methodology_version:policy.version};
}

export function analyzeRelistings(events){
  const byKey=new Map();
  for(const w of events??[]){const e=w.event??w;const k=eventKey(e);if(k&&!byKey.has(k))byKey.set(k,e);}
  const canonical=[...byKey.values()];
  const relisted=canonical.filter((e)=>e.relist_parent_event_id||e.event_state==='RELISTED');
  const crossGroups=new Map();
  for(const e of canonical){if(e.cross_list_group_id){const set=crossGroups.get(e.cross_list_group_id)??new Set();set.add(eventKey(e));crossGroups.set(e.cross_list_group_id,set);}}
  const crossListed=[...crossGroups.values()].filter((set)=>set.size>1).reduce((a,set)=>a+set.size,0);
  return {observed_event_count:canonical.length,relisted_event_count:relisted.length,relisting_rate:canonical.length?round(relisted.length/canonical.length):null,cross_listed_event_count:crossListed,state:canonical.length?'OBSERVED_BOUNDED':'NOT_VERIFIED_NO_EVENTS'};
}

export function classifyIntelligenceConfidence({eventCount=0,sourceOwnerCount=0,venueCount=0,dispersionRatio=null,conflictCount=0}={}){
  for(const n of [eventCount,sourceOwnerCount,venueCount,conflictCount]) if(!finite(n)||Number(n)<0) return {score:null,classification:'HOLD_INVALID_INPUT'};
  if(dispersionRatio!==null&&(!finite(dispersionRatio)||Number(dispersionRatio)<0)) return {score:null,classification:'HOLD_INVALID_INPUT'};
  if(Number(conflictCount)>0) return {score:0,classification:'HOLD_CONFLICT'};
  if(Number(eventCount)<3||Number(sourceOwnerCount)<2) return {score:null,classification:'NOT_VERIFIED'};
  const eventScore=Math.min(1,Number(eventCount)/10),ownerScore=Math.min(1,Number(sourceOwnerCount)/3),venueScore=Math.min(1,Number(venueCount)/3);
  const dispersionScore=dispersionRatio==null?0.5:Math.max(0,1-Math.min(1,Number(dispersionRatio)));
  const score=round(eventScore*0.3+ownerScore*0.3+venueScore*0.2+dispersionScore*0.2);
  return {score,classification:score>=0.85?'HIGH':score>=0.7?'MEDIUM':'LOW'};
}

export function buildOwnedIntelligenceV11({grading=[],market=[],fxFacts=[],targetCurrency='USD',asOf,targetComparable=null,conditionPolicy=null,targetGrade=null}={}){
  const fxNormalized=normalizeMarketCurrencies(market,fxFacts,{targetCurrency,asOf});
  const fxFailures=fxNormalized.filter((x)=>x.fx_state!=='PASS');
  if(fxFailures.length) return {status:'HOLD_FX_INCOMPLETE_OR_CONFLICT',fx:{target_currency:targetCurrency,input_count:market.length,normalized_count:fxNormalized.length-fxFailures.length,failed_count:fxFailures.length,reasons:[...new Set(fxFailures.map(x=>x.fx_reason).filter(Boolean))]},production:'HOLD',version:'1.1.1'};
  const selected=targetComparable?selectComparables(fxNormalized,targetComparable):fxNormalized;
  if(targetComparable&&selected.length===0) return {status:'HOLD_NO_COMPARABLES',fx:{target_currency:targetCurrency,input_count:market.length,normalized_count:fxNormalized.length},comparable_count:0,production:'HOLD',version:'1.1.1'};
  const entityIds=[...new Set(selected.map(w=>(w.event??w).canonical_entity_id).filter(Boolean))];
  if(entityIds.length!==1) return {status:entityIds.length?'HOLD_MULTI_ENTITY_VALUATION_INPUT':'HOLD_ENTITY_ID_MISSING',entity_ids:entityIds,production:'HOLD',version:'1.1.1'};
  const adjusted=[];
  for(const w of selected){
    const e=structuredClone(w.event);
    if(targetGrade!=null){
      const a=adjustForCondition(e.price?.normalized_amount,e.condition_grade?.grade,targetGrade,conditionPolicy);
      if(a.state!=='PASS') return {status:'HOLD_CONDITION_ADJUSTMENT_NOT_PASS',condition_reason:a.reason,canonical_entity_id:e.canonical_entity_id,production:'HOLD',version:'1.1.1'};
      e.price.normalized_amount=a.amount;e.price.condition_adjusted_amount=a.amount;adjusted.push({...w,event:e,condition_adjustment:a});
    } else adjusted.push({...w,event:e});
  }
  const base=buildOwnedIntelligence({grading,market:adjusted,asOf});
  const relisting=analyzeRelistings(market),liq=base.liquidity??{},valuation=base.valuation??{};
  const dispersionRatio=finite(valuation.median_absolute_deviation)&&finite(valuation.median_value)&&Number(valuation.median_value)!==0?Number(valuation.median_absolute_deviation)/Number(valuation.median_value):null;
  const confidence=classifyIntelligenceConfidence({eventCount:liq.unique_event_count??0,sourceOwnerCount:liq.source_owner_count??0,venueCount:liq.venue_count??0,dispersionRatio,conflictCount:base.external_fact_conflict_count??0});
  return {...base,fx:{target_currency:targetCurrency,input_count:market.length,normalized_count:fxNormalized.length},comparable_count:adjusted.length,relisting,confidence,version:'1.1.1'};
}
