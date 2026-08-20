import assert from 'node:assert/strict';
import {canonicalizeGradingEvidence, canonicalizeMarketEvent} from './provider-independent-layers-v1.mjs';
import {
  evaluateRights,
  reconcileFacts,
  buildScarcityIntelligence,
  buildValuationIntelligence,
  buildLiquidityIntelligence,
  scoreSourceReliability,
  buildOwnedIntelligence
} from './owned-intelligence-core-v1.mjs';

const rights = {collect:'ALLOW',store:'ALLOW',transform:'ALLOW',internal_display:'ALLOW',redistribute:'DENY',retention_days:90,terms_ref:'test'};
const grading = (provider, total, atGrade, higher) => canonicalizeGradingEvidence({
  grading_evidence_id:`g-${provider}`, provider_id:provider, canonical_entity_id:'card:test:1', provider_item_id:`${provider}-1`,
  certification_number:`${provider}-cert`, identity:{year:2000,set:'SET',card_number:'1',subject:'SUBJECT',variant:'A',language:'EN'},
  grade:{raw_grade:'9',scale_id:'TEN_POINT',scale:{min:0,max:10,higherIsBetter:true}},
  population:{at_grade:atGrade,higher,total,scope:'PROVIDER_CENSUS',as_of:'2026-08-21T00:00:00Z'},
  observed_at:'2026-08-21T00:00:00Z', rights,
  lineage:{source_owner:provider,source_record_ref:`${provider}:1`,adapter_version:'test-v1'}, admission:{confidence:0.95}
});

const g1 = grading('GRADER_A',100,10,2);
const g2 = grading('GRADER_B',250,25,5);
const scarcity = buildScarcityIntelligence([g1,g2]);
assert.equal(scarcity.length,1);
assert.equal(scarcity[0].global_population,null);
assert.equal(scarcity[0].composite_state,'BOUNDED_MULTI_PROVIDER');
assert.equal(scarcity[0].provider_signals.length,2);

assert.deepEqual(evaluateRights(rights,'TRANSFORM'),{state:'ALLOW',reason:null});
assert.equal(evaluateRights({...rights,transform:'UNKNOWN'},'TRANSFORM').state,'HOLD');

function sold(source,id,amount,date,venue='venue-a',durationDays=20) {
  return canonicalizeMarketEvent({
    schema_version:'market-event-v1', market_event_id:id, evidence_class:'VERIFIED_SOLD_EVENT', event_state:'SOLD', source_event_id:id,
    canonical_entity_id:'vehicle:test:1', physical_object_id:`vehicle:test:${id}`, venue_id:venue, event_at:date,
    duration_seconds:durationDays*86400, price:{price_type:'HAMMER',amount,currency:'USD'},
    rights:{collect:'ALLOW',store:'ALLOW',transform:'ALLOW'},
    lineage:{evidence_id:`${source}:${id}`,source_family_id:source}
  });
}
function failed(source,id,date,venue='venue-b') {
  return canonicalizeMarketEvent({
    schema_version:'market-event-v1', market_event_id:id, evidence_class:'FAILED_SALE_EVENT', event_state:'NO_SALE_RESERVE_NOT_MET', source_event_id:id,
    canonical_entity_id:'vehicle:test:1', physical_object_id:`vehicle:test:${id}`, venue_id:venue, event_at:date,
    price:{price_type:'BID',amount:90000,currency:'USD'}, rights:{collect:'ALLOW',store:'ALLOW',transform:'ALLOW'},
    lineage:{evidence_id:`${source}:${id}`,source_family_id:source}
  });
}

const market = [
  sold('SOURCE_A','s1',100000,'2026-07-01T00:00:00Z','venue-a',15),
  sold('SOURCE_B','s2',110000,'2026-07-15T00:00:00Z','venue-b',25),
  sold('SOURCE_A','s3',105000,'2026-08-01T00:00:00Z','venue-c',10),
  failed('SOURCE_B','f1','2026-08-05T00:00:00Z','venue-b')
];
const valuation = buildValuationIntelligence(market,{asOf:'2026-08-21T00:00:00Z'});
assert.equal(valuation.state,'BOUNDED_INTERNAL_VALUATION');
assert.equal(valuation.comparable_count,3);
assert.equal(valuation.source_owner_count,2);
assert.equal(valuation.claim_ceiling,'INTERNAL_DERIVED_ESTIMATE_NOT_MARKET_FACT');

const liquidity = buildLiquidityIntelligence(market);
assert.equal(liquidity.state,'BOUNDED_MARKET_DEPTH_OBSERVED');
assert.equal(liquidity.source_owner_count,2);
assert.ok(liquidity.failed_sale_ratio > 0);
assert.ok(liquidity.median_time_to_sale_days > 0);

const singleSourceValuation = buildValuationIntelligence(market.filter((x)=>x.event.lineage.source_family_id==='SOURCE_A'));
assert.notEqual(singleSourceValuation.state,'BOUNDED_INTERNAL_VALUATION');

const reliability = scoreSourceReliability([g1,g2,...market.map((x)=>x.event)]);
assert.ok(reliability.some((x)=>x.source_owner==='SOURCE_A'));
assert.ok(reliability.every((x)=>x.claim_ceiling==='INTERNAL_SOURCE_QUALITY_SIGNAL'));

const factMatch = reconcileFacts(market.map((x)=>x.event), e=>e.market_event_id, e=>e.price.amount);
assert.ok(factMatch.every((x)=>x.state==='MATCH'));

const conflictA = sold('SOURCE_A','conflict-a',100000,'2026-08-10T00:00:00Z','venue-x');
const conflictB = sold('SOURCE_B','conflict-b',120000,'2026-08-10T00:00:00Z','venue-x');
conflictA.event.physical_object_id='vehicle:conflict:1';
conflictB.event.physical_object_id='vehicle:conflict:1';
const ownedConflict = buildOwnedIntelligence({grading:[g1,g2],market:[conflictA,conflictB],asOf:'2026-08-21T00:00:00Z'});
assert.equal(ownedConflict.status,'HOLD_CONFLICTING_EXTERNAL_FACTS');
assert.equal(ownedConflict.valuation.state,'HOLD_CONFLICTING_EXTERNAL_FACTS');
assert.equal(ownedConflict.external_fact_conflict_count,1);

const owned = buildOwnedIntelligence({grading:[g1,g2],market,asOf:'2026-08-21T00:00:00Z'});
assert.equal(owned.status,'READY_BOUNDED_INTERNAL_INTELLIGENCE');
assert.equal(owned.valuation.state,'BOUNDED_INTERNAL_VALUATION');
assert.equal(owned.liquidity.state,'BOUNDED_MARKET_DEPTH_OBSERVED');
assert.equal(owned.production,'HOLD');

console.log(JSON.stringify({
  status:'PASS',
  owned_capabilities:{
    rights_enforcement:'PASS', scarcity_intelligence:'PASS', valuation_engine:'PASS', liquidity_market_depth:'PASS',
    source_reliability:'PASS', cross_source_reconciliation:'PASS', conflict_quarantine:'PASS'
  },
  hard_boundaries:{
    provider_census_not_summed:'PASS', single_source_not_global_truth:'PASS', derived_value_not_market_fact:'PASS',
    conflicting_external_facts_fail_closed:'PASS', production:'HOLD'
  }
},null,2));
