import {createHash} from 'node:crypto';
import {backtestPointEstimatesV21,calibrateSourceReliabilityV21} from './owned-intelligence-redteam-v2.1.mjs';
const finite=v=>Number.isFinite(Number(v));
const norm=v=>String(v??'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const sha=v=>`sha256:${createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex')}`;
export const HARDENING_REGISTRY={id:'owned-intelligence-hardening-proof-registry-v1',version:'1.0.0',ref:'coordination/kidults/registry/owned-intelligence-hardening-proof-registry-v1.json',digest:'sha256:27636efd78eae996120e5bd117050376c8aab9c9635fd97389c9976e501025a7'};
export const REQUIRED_HARDENING_CHECKS=['calibration:PASS','drift:PASS','liquidity:PASS','reconciliation:PASS','valuation:PASS'];
const rowConflict=(rows,keyFn)=>{const m=new Map();for(const r of rows){const k=keyFn(r);if(!k)continue;const body=JSON.stringify(canonical(r));if(m.has(k)&&m.get(k)!==body)return true;m.set(k,body)}return false};

export function buildHardeningReceiptV22({gate_state='ALLOW_SHADOW_ONLY',checks=[]}={}){
  const payload={producer:'owned-intelligence-redteam-v2.2',methodology_version:'2.2.0',registry_id:HARDENING_REGISTRY.id,registry_version:HARDENING_REGISTRY.version,registry_ref:HARDENING_REGISTRY.ref,registry_contract_digest:HARDENING_REGISTRY.digest,registry_state:'REGISTERED',gate_state,checks:[...new Set(checks)].sort()};
  return {...payload,digest:sha(payload)};
}
export function strictBacktestV22(rows,opts={}){
  if(!Array.isArray(rows)||!rows.length)return {state:'HOLD_NO_BACKTEST_ROWS'};
  const invalid=rows.filter(r=>!r?.case_id||!r?.source_owner||!finite(r?.predicted)||!finite(r?.actual)||Number(r.actual)===0||!Number.isFinite(Date.parse(r?.trained_through))||!Number.isFinite(Date.parse(r?.target_at)));
  if(invalid.length)return {state:'HOLD_INVALID_BACKTEST_ROW',invalid_row_count:invalid.length};
  if(rowConflict(rows,r=>r.case_id))return {state:'HOLD_DUPLICATE_BACKTEST_CASE_CONFLICT'};
  return backtestPointEstimatesV21(rows,opts);
}
export function strictCalibrationV22(samples,opts={}){
  if(!Array.isArray(samples)||!samples.length)return [{state:'HOLD_NO_CALIBRATION_ROWS',live_weight_mutation:false}];
  const invalid=samples.filter(s=>!s?.case_id||!s?.source_owner||!finite(s?.predicted_score)||Number(s.predicted_score)<0||Number(s.predicted_score)>1||![0,1].includes(s?.observed_correct));
  if(invalid.length)return [{state:'HOLD_INVALID_CALIBRATION_ROW',invalid_row_count:invalid.length,live_weight_mutation:false}];
  if(rowConflict(samples,s=>s.case_id))return [{state:'HOLD_DUPLICATE_CALIBRATION_CASE_CONFLICT',live_weight_mutation:false}];
  return calibrateSourceReliabilityV21(samples,opts);
}
export function strictLiquidityBacktestV22(rows,{minN=30,minPerClass=10,minSourceOwners=2,minBalancedAccuracy=.7}={}){
  if(!Array.isArray(rows)||!rows.length)return {state:'HOLD_NO_LIQUIDITY_ROWS'};
  if(!Number.isInteger(minN)||minN<20||!Number.isInteger(minPerClass)||minPerClass<5||!Number.isInteger(minSourceOwners)||minSourceOwners<2||!finite(minBalancedAccuracy)||minBalancedAccuracy<=0||minBalancedAccuracy>1)return {state:'HOLD_INVALID_LIQUIDITY_CONFIG'};
  const invalid=rows.filter(r=>!r?.case_id||!r?.source_owner||!['LIQUID','ILLIQUID'].includes(r.actual)||!['LIQUID','ILLIQUID'].includes(r.predicted));if(invalid.length)return {state:'HOLD_INVALID_LIQUIDITY_ROW',invalid_row_count:invalid.length};
  if(rowConflict(rows,r=>r.case_id))return {state:'HOLD_DUPLICATE_LIQUIDITY_CASE_CONFLICT'};
  const unique=[...new Map(rows.map(r=>[r.case_id,r])).values()],owners=new Set(unique.map(r=>r.source_owner)),pos=unique.filter(r=>r.actual==='LIQUID').length,neg=unique.filter(r=>r.actual==='ILLIQUID').length;
  if(unique.length<minN||owners.size<minSourceOwners||pos<minPerClass||neg<minPerClass)return {state:'NOT_COMPUTABLE_INSUFFICIENT_STRATIFIED_HOLDOUT',n:unique.length,liquid_n:pos,illiquid_n:neg,source_owner_count:owners.size};
  const tp=unique.filter(r=>r.actual==='LIQUID'&&r.predicted==='LIQUID').length,fn=unique.filter(r=>r.actual==='LIQUID'&&r.predicted==='ILLIQUID').length,tn=unique.filter(r=>r.actual==='ILLIQUID'&&r.predicted==='ILLIQUID').length,fp=unique.filter(r=>r.actual==='ILLIQUID'&&r.predicted==='LIQUID').length;const ba=((tp/(tp+fn))+(tn/(tn+fp)))/2;
  return {state:ba>=minBalancedAccuracy?'BACKTEST_PASS':'BACKTEST_FAIL',n:unique.length,liquid_n:pos,illiquid_n:neg,source_owner_count:owners.size,balanced_accuracy:Number(ba.toFixed(6)),claim_ceiling:'INTERNAL_BACKTEST_ONLY'};
}
function resolveLink(value,links){let cur=norm(value),seen=new Set();while(true){if(seen.has(cur))return {state:'CYCLE'};seen.add(cur);const hit=Object.entries(links).find(([k])=>norm(k)===cur);if(!hit)return {state:'OK',value:cur};cur=norm(hit[1]);if(!cur)return {state:'INVALID'}}}
export function reconcileGovernedV22(events,{venueAliases={},venue_alias_registry_ref=null,identityLinks={},identity_link_registry_ref=null,dateToleranceHours=24,priceTolerancePct=.02}={}){
  if(!Array.isArray(events)||!events.length)return [{state:'HOLD_NO_RECONCILIATION_EVIDENCE'}];
  if(Object.keys(venueAliases).length&&!(typeof venue_alias_registry_ref==='string'&&venue_alias_registry_ref.trim()))return [{state:'HOLD_UNGOVERNED_VENUE_ALIAS_MAP'}];
  if(Object.keys(identityLinks).length&&!(typeof identity_link_registry_ref==='string'&&identity_link_registry_ref.trim()))return [{state:'HOLD_UNGOVERNED_IDENTITY_LINK_MAP'}];
  if(!finite(dateToleranceHours)||dateToleranceHours<0||dateToleranceHours>168||!finite(priceTolerancePct)||priceTolerancePct<0||priceTolerancePct>.25)return [{state:'HOLD_INVALID_RECONCILIATION_CONFIG'}];
  const venueKey=v=>{const hit=Object.entries(venueAliases).find(([k])=>norm(k)===norm(v));return norm(hit?hit[1]:v)};
  const groups=[];for(const e of events){const t=Date.parse(e?.event_at);if(!Number.isFinite(t)){groups.push({state:'HOLD_INVALID_DATE'});continue}const linked=resolveLink(e?.physical_object_id??e?.canonical_entity_id,identityLinks);if(linked.state==='CYCLE'){groups.push({state:'HOLD_IDENTITY_LINK_CYCLE'});continue}if(linked.state!=='OK'||!linked.value){groups.push({state:'HOLD_INVALID_IDENTITY_LINK'});continue}const id=linked.value,venue=venueKey(e?.venue_id);let g=groups.find(x=>x.events&&x.id===id&&x.venue===venue&&Math.abs(t-x.anchor)<=dateToleranceHours*3600000);if(!g){g={id,venue,anchor:t,events:[]};groups.push(g)}g.events.push(e)}
  return groups.map(g=>{if(!g.events)return g;const states=[...new Set(g.events.map(e=>e.event_state).filter(Boolean))],curr=[...new Set(g.events.map(e=>e.price?.currency).filter(Boolean))],byType=new Map();for(const e of g.events){const pt=e.price?.price_type??'UNKNOWN';if(finite(e.price?.amount)){const a=byType.get(pt)??[];a.push(Number(e.price.amount));byType.set(pt,a)}}let pc=false;for(const vals of byType.values())if(vals.length>1&&(Math.max(...vals)-Math.min(...vals))/Math.max(...vals)>priceTolerancePct)pc=true;const hard=states.length>1||curr.length>1||pc;return {state:hard?'CONFLICT_QUARANTINE':'GOVERNED_MATCH_GROUP',reasons:[states.length>1?'STATE_CONFLICT':null,curr.length>1?'CURRENCY_CONFLICT':null,pc?'SAME_PRICE_TYPE_CONFLICT':null].filter(Boolean),observations:g.events.length,identity_key:g.id,venue_key:g.venue,source_owner_count:new Set(g.events.map(e=>e.lineage?.source_family_id??e.lineage?.source_owner).filter(Boolean)).size};});
}
