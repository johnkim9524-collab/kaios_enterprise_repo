import {createHash} from 'node:crypto';
import {backtestPointEstimatesV21,calibrateSourceReliabilityV21} from './owned-intelligence-redteam-v2.1.mjs';
const finite=v=>Number.isFinite(Number(v));
const norm=v=>String(v??'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const sha=v=>`sha256:${createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex')}`;
export function buildHardeningReceiptV22({registry_ref,gate_state='ALLOW_SHADOW_ONLY',checks=[]}={}){
  const payload={producer:'owned-intelligence-redteam-v2.2',methodology_version:'2.2.0',registry_ref,registry_state:typeof registry_ref==='string'&&registry_ref.trim()?'REGISTERED':'UNREGISTERED',gate_state,checks:[...checks].sort()};
  return {...payload,digest:sha(payload)};
}
export function strictBacktestV22(rows,opts={}){
  if(!Array.isArray(rows)||rows.length===0)return {state:'HOLD_NO_BACKTEST_ROWS'};
  const invalid=rows.filter(r=>!r?.case_id||!r?.source_owner||!finite(r?.predicted)||!finite(r?.actual)||Number(r.actual)===0||!Number.isFinite(Date.parse(r?.trained_through))||!Number.isFinite(Date.parse(r?.target_at)));
  if(invalid.length)return {state:'HOLD_INVALID_BACKTEST_ROW',invalid_row_count:invalid.length};
  return backtestPointEstimatesV21(rows,opts);
}
export function strictCalibrationV22(samples,opts={}){
  if(!Array.isArray(samples)||samples.length===0)return [{state:'HOLD_NO_CALIBRATION_ROWS',live_weight_mutation:false}];
  const invalid=samples.filter(s=>!s?.case_id||!s?.source_owner||!finite(s?.predicted_score)||Number(s.predicted_score)<0||Number(s.predicted_score)>1||![0,1].includes(s?.observed_correct));
  if(invalid.length)return [{state:'HOLD_INVALID_CALIBRATION_ROW',invalid_row_count:invalid.length,live_weight_mutation:false}];
  return calibrateSourceReliabilityV21(samples,opts);
}
export function reconcileGovernedV22(events,{venueAliases={},venue_alias_registry_ref=null,identityLinks={},identity_link_registry_ref=null,dateToleranceHours=24}={}){
  if(!Array.isArray(events)||!events.length)return [{state:'HOLD_NO_RECONCILIATION_EVIDENCE'}];
  if(Object.keys(venueAliases).length&&!(typeof venue_alias_registry_ref==='string'&&venue_alias_registry_ref.trim()))return [{state:'HOLD_UNGOVERNED_VENUE_ALIAS_MAP'}];
  if(Object.keys(identityLinks).length&&!(typeof identity_link_registry_ref==='string'&&identity_link_registry_ref.trim()))return [{state:'HOLD_UNGOVERNED_IDENTITY_LINK_MAP'}];
  if(!finite(dateToleranceHours)||dateToleranceHours<0||dateToleranceHours>168)return [{state:'HOLD_INVALID_RECONCILIATION_CONFIG'}];
  const aliasKey=v=>{const hit=Object.entries(venueAliases).find(([k])=>norm(k)===norm(v));return norm(hit?hit[1]:v)};
  const identityKey=v=>{const n=norm(v);const hit=Object.entries(identityLinks).find(([k])=>norm(k)===n);return norm(hit?hit[1]:v)};
  const groups=[];
  for(const e of events){const t=Date.parse(e?.event_at);if(!Number.isFinite(t)){groups.push({state:'HOLD_INVALID_DATE'});continue}const id=identityKey(e?.physical_object_id??e?.canonical_entity_id),venue=aliasKey(e?.venue_id);let g=groups.find(x=>x.events&&x.id===id&&x.venue===venue&&Math.abs(t-x.anchor)<=dateToleranceHours*3600000);if(!g){g={id,venue,anchor:t,events:[]};groups.push(g)}g.events.push(e)}
  return groups.map(g=>g.events?{state:'GOVERNED_MATCH_GROUP',observations:g.events.length,identity_key:g.id,venue_key:g.venue,source_owner_count:new Set(g.events.map(e=>e.lineage?.source_family_id??e.lineage?.source_owner).filter(Boolean)).size}:g);
}
