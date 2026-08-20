import {buildOwnedIntelligence, evaluateRights} from './owned-intelligence-core-v1.mjs';

const dayMs = 86400000;
const finite = (v) => Number.isFinite(Number(v));
const round = (v,n=6)=>Number(Number(v).toFixed(n));

export function enforceRightsLifecycle(record,{now=new Date().toISOString()}={}){
  const rights=record?.rights??{};
  for(const op of ['COLLECT','STORE','TRANSFORM']){
    const r=evaluateRights(rights,op);
    if(r.state!=='ALLOW') return {state:'HOLD',reason:r.reason};
  }
  if(rights.review_due_at && new Date(rights.review_due_at).getTime()<new Date(now).getTime()) return {state:'HOLD',reason:'RIGHTS_REVIEW_EXPIRED'};
  if(finite(rights.retention_days) && record.collected_at){
    const age=(new Date(now).getTime()-new Date(record.collected_at).getTime())/dayMs;
    if(age>Number(rights.retention_days)) return {state:'DELETE_REQUIRED',reason:'RETENTION_EXPIRED'};
  }
  return {state:'ALLOW',reason:null};
}

export function convertCurrency(amount,from,to,fxFacts,{asOf=new Date().toISOString(),maxAgeDays=7}={}){
  if(!finite(amount)||!from||!to) return {state:'HOLD',reason:'FX_INPUT_INVALID'};
  if(from===to) return {state:'PASS',amount:round(amount,2),currency:to,rate:1,source_owner:'IDENTITY'};
  const asOfMs=new Date(asOf).getTime();
  const usable=(fxFacts??[]).filter((f)=>{
    if(!finite(f.rate)||!f.observed_at||!f.source_owner) return false;
    if(['collect','store','transform'].some((k)=>f.rights?.[k]!=='ALLOW')) return false;
    const age=(asOfMs-new Date(f.observed_at).getTime())/dayMs;
    return age>=0&&age<=maxAgeDays;
  });
  const direct=usable.find((f)=>f.base_currency===from&&f.quote_currency===to);
  if(direct) return {state:'PASS',amount:round(Number(amount)*Number(direct.rate),2),currency:to,rate:Number(direct.rate),source_owner:direct.source_owner};
  const inverse=usable.find((f)=>f.base_currency===to&&f.quote_currency===from);
  if(inverse) return {state:'PASS',amount:round(Number(amount)/Number(inverse.rate),2),currency:to,rate:round(1/Number(inverse.rate),10),source_owner:inverse.source_owner};
  return {state:'HOLD',reason:'FX_RATE_MISSING_OR_STALE'};
}

export function normalizeMarketCurrencies(events,fxFacts,{targetCurrency='USD',asOf,maxAgeDays=7}={}){
  return (events??[]).map((wrapper)=>{
    const event=structuredClone(wrapper.event??wrapper);
    const conversion=convertCurrency(event.price?.amount,event.price?.currency,targetCurrency,fxFacts,{asOf,maxAgeDays});
    if(conversion.state==='PASS'){
      event.price={...event.price,normalized_amount:conversion.amount,normalized_currency:targetCurrency,fx_source_owner:conversion.source_owner,fx_rate:conversion.rate};
    }
    return {event,fx_state:conversion.state,fx_reason:conversion.reason??null};
  });
}

export function selectComparables(events,target){
  const entity=target?.canonical_entity_id;
  if(!entity) return [];
  return (events??[]).filter((w)=>{
    const e=w.event??w;
    if(e.canonical_entity_id!==entity) return false;
    if(target.region && e.region && e.region!==target.region) return false;
    if(target.sale_mechanism && e.sale_mechanism && e.sale_mechanism!==target.sale_mechanism) return false;
    return e.evidence_class==='VERIFIED_SOLD_EVENT'&&e.event_state==='SOLD';
  });
}

export function adjustForCondition(amount,observedGrade,targetGrade,policy){
  if(!finite(amount)) return {state:'HOLD',reason:'AMOUNT_INVALID'};
  if(observedGrade==null||targetGrade==null) return {state:'NO_ADJUSTMENT_CLAIM',amount:Number(amount),reason:'GRADE_MISSING'};
  const observed=policy?.factors?.[String(observedGrade)];
  const target=policy?.factors?.[String(targetGrade)];
  if(!finite(observed)||!finite(target)||Number(observed)<=0) return {state:'NO_ADJUSTMENT_CLAIM',amount:Number(amount),reason:'METHODOLOGY_POLICY_MISSING'};
  const ratio=Number(target)/Number(observed);
  const cap=Number(policy?.max_adjustment_ratio??0.5);
  if(Math.abs(ratio-1)>cap) return {state:'HOLD',reason:'CONDITION_ADJUSTMENT_OUTSIDE_CAP'};
  return {state:'PASS',amount:round(Number(amount)*ratio,2),ratio:round(ratio),methodology_id:policy.id??'UNVERSIONED'};
}

export function analyzeRelistings(events){
  const canonical=(events??[]).map((w)=>w.event??w);
  const relisted=canonical.filter((e)=>e.relist_parent_event_id||e.event_state==='RELISTED');
  const crossGroups=new Map();
  for(const e of canonical){if(e.cross_list_group_id){const n=crossGroups.get(e.cross_list_group_id)??0;crossGroups.set(e.cross_list_group_id,n+1);}}
  const crossListed=[...crossGroups.values()].filter((n)=>n>1).reduce((a,b)=>a+b,0);
  return {
    observed_event_count:canonical.length,
    relisted_event_count:relisted.length,
    relisting_rate:canonical.length?round(relisted.length/canonical.length):null,
    cross_listed_event_count:crossListed,
    state:canonical.length?'OBSERVED_BOUNDED':'NOT_VERIFIED_NO_EVENTS'
  };
}

export function classifyIntelligenceConfidence({eventCount=0,sourceOwnerCount=0,venueCount=0,dispersionRatio=null,conflictCount=0}={}){
  if(conflictCount>0) return {score:0,classification:'HOLD_CONFLICT'};
  if(eventCount<3||sourceOwnerCount<2) return {score:null,classification:'NOT_VERIFIED'};
  const eventScore=Math.min(1,eventCount/10);
  const ownerScore=Math.min(1,sourceOwnerCount/3);
  const venueScore=Math.min(1,venueCount/3);
  const dispersionScore=dispersionRatio==null?0.5:Math.max(0,1-Math.min(1,Math.abs(Number(dispersionRatio))));
  const score=round(eventScore*0.3+ownerScore*0.3+venueScore*0.2+dispersionScore*0.2);
  return {score,classification:score>=0.85?'HIGH':score>=0.7?'MEDIUM':'LOW'};
}

export function buildOwnedIntelligenceV11({grading=[],market=[],fxFacts=[],targetCurrency='USD',asOf,targetComparable=null,conditionPolicy=null,targetGrade=null}={}){
  const fxNormalized=normalizeMarketCurrencies(market,fxFacts,{targetCurrency,asOf});
  const fxPass=fxNormalized.filter((x)=>x.fx_state==='PASS');
  const selected=targetComparable?selectComparables(fxPass,targetComparable):fxPass;
  const adjusted=selected.map((w)=>{
    const e=structuredClone(w.event);
    if(targetGrade!=null){
      const a=adjustForCondition(e.price?.normalized_amount,e.condition_grade?.grade,targetGrade,conditionPolicy);
      if(a.state==='PASS') e.price.condition_adjusted_amount=a.amount;
      return {...w,event:e,condition_adjustment:a};
    }
    return {...w,event:e};
  });
  const base=buildOwnedIntelligence({grading,market:adjusted,asOf});
  const relisting=analyzeRelistings(market);
  const liq=base.liquidity??{};
  const valuation=base.valuation??{};
  const dispersionRatio=finite(valuation.median_absolute_deviation)&&finite(valuation.median_value)&&Number(valuation.median_value)!==0?Number(valuation.median_absolute_deviation)/Number(valuation.median_value):null;
  const confidence=classifyIntelligenceConfidence({eventCount:liq.unique_event_count??0,sourceOwnerCount:liq.source_owner_count??0,venueCount:liq.venue_count??0,dispersionRatio,conflictCount:base.external_fact_conflict_count??0});
  return {...base,fx:{target_currency:targetCurrency,input_count:market.length,normalized_count:fxPass.length},comparable_count:adjusted.length,relisting,confidence,version:'1.1.0'};
}
