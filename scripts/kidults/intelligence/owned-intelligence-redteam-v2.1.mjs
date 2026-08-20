const finite=v=>Number.isFinite(Number(v));
const round=(v,n=6)=>Number(Number(v).toFixed(n));
const norm=v=>String(v??'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
const raw=v=>String(v??'').trim().toUpperCase();
const validDate=v=>{const t=Date.parse(v);return Number.isFinite(t)?t:null};
const uniqueBy=(rows,keyFn)=>{const m=new Map();for(const r of rows){const k=keyFn(r);if(k&&!m.has(k))m.set(k,r)}return [...m.values()]};

export function populationStabilityIndex(baseline,current,{bins=10,epsilon=1e-6}={}){
  const b=(baseline??[]).filter(finite).map(Number),c=(current??[]).filter(finite).map(Number);
  if(b.length<20||c.length<20||!Number.isInteger(bins)||bins<2||bins>50||!finite(epsilon)||epsilon<=0||epsilon>=.01)return {state:'HOLD_DRIFT_SAMPLE_OR_CONFIG_INVALID'};
  const sorted=[...b].sort((a,z)=>a-z),cuts=[];for(let i=1;i<bins;i++)cuts.push(sorted[Math.min(sorted.length-1,Math.floor(i*sorted.length/bins))]);
  const bucket=x=>{let i=0;while(i<cuts.length&&x>cuts[i])i++;return i};const counts=arr=>{const o=Array(bins).fill(0);for(const x of arr)o[bucket(x)]++;return o.map(n=>n/arr.length)};
  const bp=counts(b),cp=counts(c);let psi=0;for(let i=0;i<bins;i++){const p=Math.max(bp[i],epsilon),q=Math.max(cp[i],epsilon);psi+=(q-p)*Math.log(q/p)}
  const bm=b.reduce((a,z)=>a+z,0)/b.length,cm=c.reduce((a,z)=>a+z,0)/c.length;
  return {state:'COMPUTED',psi:round(psi),normalized_mean_shift:round(Math.abs(cm-bm)/(Math.abs(bm)||1)),bins};
}

export function evaluateModelGovernanceV21({champion,challenger,baseline,current,thresholds={psi:.2,mean_shift:.15,error_delta:.05}}={}){
  if(!champion?.version||!challenger?.version)return {state:'HOLD_VERSIONING_INCOMPLETE',live_auto_promotion:false};
  if(!finite(thresholds.psi)||thresholds.psi<=0||!finite(thresholds.mean_shift)||thresholds.mean_shift<=0||!finite(thresholds.error_delta)||thresholds.error_delta<0)return {state:'HOLD_INVALID_THRESHOLDS',live_auto_promotion:false};
  const d=populationStabilityIndex(baseline,current);if(d.state!=='COMPUTED')return {...d,live_auto_promotion:false};
  const errorDelta=finite(champion.error)&&finite(challenger.error)?Number(challenger.error)-Number(champion.error):null;const drift=d.psi>thresholds.psi||d.normalized_mean_shift>thresholds.mean_shift;
  const independent=challenger.independent_holdout===true&&typeof challenger.holdout_ref==='string'&&challenger.holdout_ref.length>5;
  return {state:drift?'HOLD_MODEL_DRIFT':'GOVERNED_SHADOW_READY',psi:d.psi,normalized_mean_shift:d.normalized_mean_shift,challenger_error_delta:errorDelta==null?null:round(errorDelta),challenger_promotable:!drift&&independent&&errorDelta!=null&&errorDelta<=-thresholds.error_delta,independent_holdout_verified:independent,live_auto_promotion:false,production:'HOLD'};
}

function identityCompatible(a,b){const ar=raw(a),br=raw(b);if(!ar||!br)return false;if(ar.includes('*')||br.includes('*'))return false;const x=norm(ar),y=norm(br);if(x===y)return true;if(x.length>=10&&y.length>=10)return x.slice(0,6)===y.slice(0,6)&&x.slice(-4)===y.slice(-4);return false;}
function normalizeVenue(v,aliases){const target=Object.entries(aliases??{}).find(([k])=>norm(k)===norm(v));return norm(target?target[1]:v)}
export function reconcileSemantic(events,{venueAliases={},dateToleranceHours=24,priceTolerancePct=.02}={}){
  if(!finite(dateToleranceHours)||dateToleranceHours<0||dateToleranceHours>168||!finite(priceTolerancePct)||priceTolerancePct<0||priceTolerancePct>.25)return [{state:'HOLD_INVALID_RECONCILIATION_CONFIG'}];
  if(!Array.isArray(events)||events.length===0)return [{state:'HOLD_NO_RECONCILIATION_EVIDENCE'}];
  const groups=[];for(const e of events){const t=validDate(e.event_at);if(t==null){groups.push({state:'HOLD_INVALID_DATE'});continue}const oid=e.physical_object_id??e.canonical_entity_id,venue=normalizeVenue(e.venue_id,venueAliases);let g=groups.find(x=>x.events&&identityCompatible(x.oid,oid)&&x.venue===venue&&Math.abs(t-x.anchor)<=dateToleranceHours*3600000);if(!g){g={oid,venue,anchor:t,events:[]};groups.push(g)}g.events.push(e)}
  return groups.map(g=>{if(!g.events)return g;const states=[...new Set(g.events.map(e=>e.event_state).filter(Boolean))],curr=[...new Set(g.events.map(e=>e.price?.currency).filter(Boolean))],byType=new Map();for(const e of g.events){const pt=e.price?.price_type??'UNKNOWN';if(finite(e.price?.amount)){const a=byType.get(pt)??[];a.push(Number(e.price.amount));byType.set(pt,a)}}let pc=false;for(const vals of byType.values())if(vals.length>1&&(Math.max(...vals)-Math.min(...vals))/Math.max(...vals)>priceTolerancePct)pc=true;const pts=[...byType.keys()],hard=states.length>1||curr.length>1||pc;return {state:hard?'CONFLICT_QUARANTINE':'TOLERANCE_MATCH',reasons:[states.length>1?'STATE_CONFLICT':null,curr.length>1?'CURRENCY_CONFLICT':null,pc?'SAME_PRICE_TYPE_CONFLICT':null].filter(Boolean),price_semantic_difference:pts.length>1,price_types:pts,source_owner_count:new Set(g.events.map(e=>e.lineage?.source_family_id??e.lineage?.source_owner).filter(Boolean)).size};});
}

export function backtestPointEstimatesV21(rows,{minN=30,minSourceOwners=2,maxMape=.2,maxMedianAePct=.15}={}){
  if(!Number.isInteger(minN)||minN<10||!Number.isInteger(minSourceOwners)||minSourceOwners<1||!finite(maxMape)||maxMape<=0||!finite(maxMedianAePct)||maxMedianAePct<=0)return {state:'HOLD_INVALID_BACKTEST_CONFIG'};
  const usable=(rows??[]).filter(r=>finite(r.predicted)&&finite(r.actual)&&Number(r.actual)!==0);if(usable.some(r=>validDate(r.trained_through)==null||validDate(r.target_at)==null))return {state:'HOLD_INVALID_BACKTEST_DATE'};
  const dedup=uniqueBy(usable,r=>r.case_id??`${r.source_owner}|${r.target_at}|${r.predicted}|${r.actual}`),owners=new Set(dedup.map(r=>r.source_owner).filter(Boolean));if(dedup.length<minN||owners.size<minSourceOwners)return {state:'NOT_COMPUTABLE_INSUFFICIENT_HOLDOUT',n:dedup.length,source_owner_count:owners.size};
  if(dedup.some(r=>validDate(r.target_at)<=validDate(r.trained_through)))return {state:'HOLD_TEMPORAL_LEAKAGE'};const ape=dedup.map(r=>Math.abs(Number(r.predicted)-Number(r.actual))/Math.abs(Number(r.actual))).sort((a,b)=>a-b),mape=ape.reduce((a,b)=>a+b,0)/ape.length,med=ape[Math.floor((ape.length-1)/2)];return {state:mape<=maxMape&&med<=maxMedianAePct?'BACKTEST_PASS':'BACKTEST_FAIL',n:dedup.length,source_owner_count:owners.size,mape:round(mape),median_absolute_error_pct:round(med),claim_ceiling:'INTERNAL_BACKTEST_ONLY_NOT_LIVE_MARKET_FACT'};
}

export function calibrateSourceReliabilityV21(samples,{minN=30,bins=10,maxEce=.1,maxBrier=.2}={}){
  if(!Number.isInteger(minN)||minN<10||!Number.isInteger(bins)||bins<2||bins>20||!finite(maxEce)||maxEce<=0||!finite(maxBrier)||maxBrier<=0)return [{state:'HOLD_INVALID_CALIBRATION_CONFIG',live_weight_mutation:false}];
  const by=new Map();for(const s of samples??[]){if(!s.source_owner||!finite(s.predicted_score)||Number(s.predicted_score)<0||Number(s.predicted_score)>1||![0,1].includes(s.observed_correct))continue;const a=by.get(s.source_owner)??[];a.push(s);by.set(s.source_owner,a)}
  return [...by.entries()].map(([source_owner,list])=>{const dedup=uniqueBy(list,r=>r.case_id??`${r.predicted_score}|${r.observed_correct}|${r.observed_at}`);if(dedup.length<minN)return {source_owner,state:'INSUFFICIENT_SAMPLE',n:dedup.length,live_weight_mutation:false};const brier=dedup.reduce((a,r)=>a+(Number(r.predicted_score)-r.observed_correct)**2,0)/dedup.length;let ece=0;for(let i=0;i<bins;i++){const lo=i/bins,hi=(i+1)/bins,b=dedup.filter(r=>Number(r.predicted_score)>=lo&&(i===bins-1?Number(r.predicted_score)<=hi:Number(r.predicted_score)<hi));if(!b.length)continue;const p=b.reduce((a,r)=>a+Number(r.predicted_score),0)/b.length,o=b.reduce((a,r)=>a+r.observed_correct,0)/b.length;ece+=b.length/dedup.length*Math.abs(p-o)}return {source_owner,state:ece<=maxEce&&brier<=maxBrier?'CALIBRATED_BOUNDED':'CALIBRATION_FAIL',n:dedup.length,brier_score:round(brier),expected_calibration_error:round(ece),live_weight_mutation:false};});
}

export function enforceOwnedIntelligenceRuntimeGate({reconciliation=[],valuationBacktest,liquidityBacktest,sourceCalibration=[],modelGovernance}={}){
  const reasons=[];if(!reconciliation.length)reasons.push('RECONCILIATION_MISSING');else if(reconciliation.some(r=>String(r.state).startsWith('HOLD')||r.state==='CONFLICT_QUARANTINE'))reasons.push('RECONCILIATION_NOT_CLEAR');if(valuationBacktest?.state!=='BACKTEST_PASS')reasons.push('VALUATION_BACKTEST_NOT_PASS');if(liquidityBacktest?.state!=='BACKTEST_PASS')reasons.push('LIQUIDITY_BACKTEST_NOT_PASS');if(!sourceCalibration.length)reasons.push('SOURCE_CALIBRATION_MISSING');else if(!sourceCalibration.every(r=>r.state==='CALIBRATED_BOUNDED'))reasons.push('SOURCE_CALIBRATION_NOT_PASS');if(modelGovernance?.state!=='GOVERNED_SHADOW_READY')reasons.push('MODEL_GOVERNANCE_NOT_READY');return {state:reasons.length?'HOLD':'ALLOW_SHADOW_ONLY',reasons,asi_factor_mutation:false,candidate_promotion:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
}
