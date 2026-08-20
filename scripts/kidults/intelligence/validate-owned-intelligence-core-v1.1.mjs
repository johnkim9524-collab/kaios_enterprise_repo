import assert from 'node:assert/strict';
import {canonicalizeMarketEvent,canonicalizeGradingEvidence} from './provider-independent-layers-v1.mjs';
import {
  enforceRightsLifecycle,convertCurrency,normalizeMarketCurrencies,selectComparables,
  adjustForCondition,analyzeRelistings,classifyIntelligenceConfidence,buildOwnedIntelligenceV11
} from './owned-intelligence-core-v1.1.mjs';

const now='2026-08-21T00:00:00Z';
const rights={collect:'ALLOW',store:'ALLOW',transform:'ALLOW',internal_display:'ALLOW',retention_days:90,review_due_at:'2026-09-01T00:00:00Z'};
assert.equal(enforceRightsLifecycle({rights,collected_at:'2026-08-01T00:00:00Z'},{now}).state,'ALLOW');
assert.equal(enforceRightsLifecycle({rights:{...rights,review_due_at:'2026-08-01T00:00:00Z'},collected_at:'2026-08-01T00:00:00Z'},{now}).state,'HOLD');
assert.equal(enforceRightsLifecycle({rights:{...rights,retention_days:5},collected_at:'2026-08-01T00:00:00Z'},{now}).state,'DELETE_REQUIRED');

const fx=[{base_currency:'EUR',quote_currency:'USD',rate:1.2,observed_at:'2026-08-20T00:00:00Z',source_owner:'FX_OWNER',rights:{collect:'ALLOW',store:'ALLOW',transform:'ALLOW'}}];
assert.equal(convertCurrency(100,'EUR','USD',fx,{asOf:now}).amount,120);
assert.equal(convertCurrency(120,'USD','EUR',fx,{asOf:now}).amount,100);
assert.equal(convertCurrency(100,'GBP','USD',fx,{asOf:now}).state,'HOLD');

const event=(id,source,amount,currency,date,venue,grade='9')=>canonicalizeMarketEvent({
 schema_version:'market-event-v1',market_event_id:id,evidence_class:'VERIFIED_SOLD_EVENT',event_state:'SOLD',source_event_id:id,
 canonical_entity_id:'vehicle:1',physical_object_id:`vehicle:${id}`,venue_id:venue,event_at:date,region:'NA',sale_mechanism:'AUCTION',duration_seconds:864000,
 condition_grade:{grade,condition_state:null,grader:'G',authenticity_state:'VERIFIED'},price:{price_type:'HAMMER',amount,currency},
 rights:{collect:'ALLOW',store:'ALLOW',transform:'ALLOW'},lineage:{evidence_id:`${source}:${id}`,source_family_id:source}
});
const market=[event('a','S1',100000,'USD','2026-07-01T00:00:00Z','V1','9'),event('b','S2',90000,'EUR','2026-07-15T00:00:00Z','V2','8'),event('c','S1',105000,'USD','2026-08-01T00:00:00Z','V3','9')];
market[2].event.event_state='RELISTED';market[2].event.evidence_class='VERIFIED_SOLD_EVENT';market[2].event.relist_parent_event_id='a';
const normalized=normalizeMarketCurrencies(market,fx,{targetCurrency:'USD',asOf:now});
assert.equal(normalized.filter(x=>x.fx_state==='PASS').length,3);assert.equal(normalized[1].event.price.normalized_amount,108000);assert.equal(selectComparables(normalized,{canonical_entity_id:'vehicle:1',region:'NA'}).length,2);

const policy={id:'grade-policy-test',version:'1.0.0',max_adjustment_ratio:0.5,factors:{'8':0.8,'9':0.9,'10':1}};
assert.equal(adjustForCondition(80000,'8','9',policy).amount,90000);assert.equal(adjustForCondition(80000,null,'9',policy).state,'NO_ADJUSTMENT_CLAIM');assert.equal(adjustForCondition(80000,'8','10',{...policy,max_adjustment_ratio:0.1}).state,'HOLD');
const relist=analyzeRelistings(market);assert.equal(relist.relisted_event_count,1);assert.ok(relist.relisting_rate>0);
assert.equal(classifyIntelligenceConfidence({eventCount:2,sourceOwnerCount:2,venueCount:2}).classification,'NOT_VERIFIED');assert.equal(classifyIntelligenceConfidence({eventCount:10,sourceOwnerCount:3,venueCount:3,dispersionRatio:0.1}).classification,'HIGH');assert.equal(classifyIntelligenceConfidence({eventCount:10,sourceOwnerCount:3,venueCount:3,conflictCount:1}).classification,'HOLD_CONFLICT');

const grading=(provider,total)=>canonicalizeGradingEvidence({grading_evidence_id:`g-${provider}`,provider_id:provider,canonical_entity_id:'card:1',provider_item_id:`${provider}-1`,certification_number:`${provider}-cert`,identity:{year:2000,set:'S',card_number:'1',subject:'X',variant:'A',language:'EN'},grade:{raw_grade:'9',scale_id:'TEN',scale:{min:0,max:10,higherIsBetter:true}},population:{at_grade:10,higher:2,total,scope:'PROVIDER_CENSUS',as_of:now},observed_at:now,rights:{collect:'ALLOW',store:'ALLOW',transform:'ALLOW',internal_display:'ALLOW'},lineage:{source_owner:provider,source_record_ref:`${provider}:1`,adapter_version:'test'},admission:{confidence:0.9}});
const result=buildOwnedIntelligenceV11({grading:[grading('G1',100),grading('G2',200)],market,fxFacts:fx,targetCurrency:'USD',asOf:now});
assert.equal(result.version,'1.1.1');assert.equal(result.fx.normalized_count,3);assert.equal(result.production,'HOLD');
console.log(JSON.stringify({status:'PASS',owned_v11:{rights_lifecycle:'PASS',fx_conversion:'PASS',comparables:'PASS',condition_adjustment:'PASS',relisting:'PASS',confidence:'PASS'},external_fact_boundary:'PRESERVED',production:'HOLD'},null,2));
