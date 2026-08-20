const finite = (v) => Number.isFinite(Number(v));
const round = (v, n = 6) => Number(Number(v).toFixed(n));
const median = (xs) => {
  const a = xs.filter(finite).map(Number).sort((x,y)=>x-y);
  if (!a.length) return null;
  const m = Math.floor(a.length/2);
  return a.length % 2 ? a[m] : (a[m-1]+a[m])/2;
};

function norm(v) {
  return String(v ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
}

export function tolerantMarketKey(event) {
  const objectId = norm(event.physical_object_id ?? event.canonical_entity_id);
  const venue = norm(event.venue_id);
  const day = event.event_at ? new Date(event.event_at).toISOString().slice(0,10) : '';
  return [objectId, venue, day].join('|');
}

export function reconcileAdversarial(events, {priceTolerancePct=0.01, dateToleranceHours=24}={}) {
  const groups = new Map();
  for (const event of events) {
    const objectId = norm(event.physical_object_id ?? event.canonical_entity_id);
    const venue = norm(event.venue_id);
    const candidates = [...groups.values()].filter(g => g.objectId === objectId && g.venue === venue);
    let group = candidates.find(g => {
      if (!g.anchorTime || !event.event_at) return false;
      return Math.abs(new Date(event.event_at)-g.anchorTime) <= dateToleranceHours*3600000;
    });
    if (!group) {
      group = {objectId, venue, anchorTime:event.event_at?new Date(event.event_at):null, events:[]};
      groups.set(`${objectId}|${venue}|${groups.size}`, group);
    }
    group.events.push(event);
  }
  return [...groups.values()].map(group => {
    const states = [...new Set(group.events.map(e=>e.event_state).filter(Boolean))];
    const currencies = [...new Set(group.events.map(e=>e.price?.currency).filter(Boolean))];
    const prices = group.events.map(e=>e.price?.amount).filter(finite).map(Number);
    const priceConflict = prices.length > 1 && (Math.max(...prices)-Math.min(...prices))/Math.max(...prices) > priceTolerancePct;
    const hardConflict = states.length > 1 || currencies.length > 1 || priceConflict;
    return {
      object_id: group.objectId,
      venue: group.venue,
      observations: group.events.length,
      source_owner_count: new Set(group.events.map(e=>e.lineage?.source_family_id ?? e.lineage?.source_owner).filter(Boolean)).size,
      state: hardConflict ? 'CONFLICT_QUARANTINE' : 'TOLERANCE_MATCH',
      reasons: [states.length>1?'STATE_CONFLICT':null,currencies.length>1?'CURRENCY_CONFLICT':null,priceConflict?'PRICE_CONFLICT':null].filter(Boolean)
    };
  });
}

export function backtestPointEstimates(rows, {maxMape=0.2, maxMedianAePct=0.15}={}) {
  const usable = rows.filter(r=>finite(r.predicted) && finite(r.actual) && Number(r.actual)!==0);
  if (usable.length < 3) return {state:'NOT_COMPUTABLE_INSUFFICIENT_HOLDOUT', n:usable.length};
  const ape = usable.map(r=>Math.abs(Number(r.predicted)-Number(r.actual))/Math.abs(Number(r.actual)));
  const mape = ape.reduce((a,b)=>a+b,0)/ape.length;
  const med = median(ape);
  return {
    state: mape<=maxMape && med<=maxMedianAePct ? 'BACKTEST_PASS' : 'BACKTEST_FAIL',
    n: usable.length,
    mape: round(mape),
    median_absolute_error_pct: round(med),
    thresholds:{max_mape:maxMape,max_median_absolute_error_pct:maxMedianAePct},
    claim_ceiling:'INTERNAL_BACKTEST_ONLY_NOT_LIVE_MARKET_FACT'
  };
}

export function backtestLiquidity(rows, {minBalancedAccuracy=0.7}={}) {
  const usable = rows.filter(r=>['LIQUID','ILLIQUID'].includes(r.actual) && ['LIQUID','ILLIQUID'].includes(r.predicted));
  if (usable.length < 4) return {state:'NOT_COMPUTABLE_INSUFFICIENT_HOLDOUT', n:usable.length};
  const tp = usable.filter(r=>r.actual==='LIQUID'&&r.predicted==='LIQUID').length;
  const fn = usable.filter(r=>r.actual==='LIQUID'&&r.predicted==='ILLIQUID').length;
  const tn = usable.filter(r=>r.actual==='ILLIQUID'&&r.predicted==='ILLIQUID').length;
  const fp = usable.filter(r=>r.actual==='ILLIQUID'&&r.predicted==='LIQUID').length;
  const tpr = tp+fn ? tp/(tp+fn) : 0;
  const tnr = tn+fp ? tn/(tn+fp) : 0;
  const balanced = (tpr+tnr)/2;
  return {state:balanced>=minBalancedAccuracy?'BACKTEST_PASS':'BACKTEST_FAIL',n:usable.length,balanced_accuracy:round(balanced),threshold:minBalancedAccuracy,claim_ceiling:'INTERNAL_BACKTEST_ONLY'};
}

export function calibrateSourceReliability(samples, {minN=5}={}) {
  const bySource = new Map();
  for (const s of samples) {
    if (!s.source_owner || typeof s.predicted_score !== 'number' || ![0,1].includes(s.observed_correct)) continue;
    const list = bySource.get(s.source_owner) ?? [];
    list.push(s); bySource.set(s.source_owner,list);
  }
  return [...bySource.entries()].map(([source_owner,list])=>{
    if (list.length < minN) return {source_owner,state:'INSUFFICIENT_SAMPLE',n:list.length,live_weight_mutation:false};
    const predicted = list.reduce((a,b)=>a+b.predicted_score,0)/list.length;
    const observed = list.reduce((a,b)=>a+b.observed_correct,0)/list.length;
    const calibrationError = Math.abs(predicted-observed);
    return {source_owner,state:calibrationError<=0.15?'CALIBRATED_BOUNDED':'CALIBRATION_FAIL',n:list.length,mean_predicted:round(predicted),observed_accuracy:round(observed),calibration_error:round(calibrationError),live_weight_mutation:false};
  });
}

const VERTICAL_REQUIREMENTS = {
  TRADING_CARD:['canonical_entity_id','grade_or_condition','source_owner'],
  COLLECTOR_CAR:['canonical_entity_id','event_at','venue_id','price','source_owner'],
  WATCH:['canonical_entity_id','reference_or_serial','condition','source_owner'],
  SNEAKER:['canonical_entity_id','size_or_variant','condition','source_owner'],
  ART_TOY:['canonical_entity_id','edition_or_variant','condition','source_owner'],
  WINE:['canonical_entity_id','vintage','bottle_or_lot_condition','source_owner'],
  DESIGN_OBJECT:['canonical_entity_id','maker_or_designer','edition_or_provenance','source_owner'],
  VINYL:['canonical_entity_id','pressing_or_matrix','condition','source_owner']
};

export function validateVerticalCompatibility(vertical, record) {
  const required = VERTICAL_REQUIREMENTS[vertical];
  if (!required) return {state:'UNSUPPORTED_VERTICAL',missing:[]};
  const missing = required.filter(k=>record?.[k]===undefined || record?.[k]===null || record?.[k]==='');
  return {state:missing.length?'HOLD_MISSING_VERTICAL_DIMENSIONS':'COMPATIBLE_CONTRACT',missing,vertical};
}

export function evaluateModelGovernance({champion,challenger,baseline,current,thresholds={psi:0.2,error_delta:0.05}}={}) {
  if (!champion?.version || !challenger?.version) return {state:'HOLD_VERSIONING_INCOMPLETE'};
  if (!Array.isArray(baseline) || !Array.isArray(current) || baseline.length<3 || current.length<3) return {state:'HOLD_DRIFT_SAMPLE_INSUFFICIENT'};
  const bMean = baseline.filter(finite).reduce((a,b)=>a+Number(b),0)/baseline.filter(finite).length;
  const cMean = current.filter(finite).reduce((a,b)=>a+Number(b),0)/current.filter(finite).length;
  const normalizedShift = Math.abs(cMean-bMean)/(Math.abs(bMean)||1);
  const errorDelta = finite(champion.error) && finite(challenger.error) ? Number(challenger.error)-Number(champion.error) : null;
  const drift = normalizedShift > thresholds.psi;
  return {
    state:drift?'HOLD_MODEL_DRIFT':'GOVERNED_SHADOW_READY',
    champion_version:champion.version,
    challenger_version:challenger.version,
    normalized_distribution_shift:round(normalizedShift),
    challenger_error_delta:errorDelta==null?null:round(errorDelta),
    challenger_promotable:!drift && errorDelta!=null && errorDelta <= -thresholds.error_delta,
    live_auto_promotion:false,
    production:'HOLD'
  };
}
