import assert from 'node:assert/strict';
import {canonicalizeMarketEvent} from './provider-independent-layers-v1.mjs';
import {buildOwnedIntelligence,buildValuationIntelligence} from './owned-intelligence-core-v1.mjs';
import {enforceRightsLifecycle,convertCurrency,normalizeMarketCurrencies,selectComparables,adjustForCondition,analyzeRelistings,classifyIntelligenceConfidence,buildOwnedIntelligenceV11} from './owned-intelligence-core-v1.1.mjs';

const now='2026-08-21T00:00:00Z';
const rights={collect:'ALLOW',store:'ALLOW',transform:'ALLOW',retention_days:30,review_due_at:'2026-09-01T00:00:00Z'};
assert.equal(enforceRightsLifecycle({rights:{...rights,review_due_at:'bad-date'},collected_at:'2026-08-01T00:00:00Z'},{now}).reason,'RIGHTS_REVIEW_DATE_INVALID');
assert.equal(enforceRightsLifecycle({rights:{...rights,retention_days:-1},collected_at:'2026-08-01T00:00:00Z'},{now}).reason,'RETENTION_POLICY_INVALID');
assert.equal(enforceRightsLifecycle({rights,collected_at:'bad-date'},{now}).reason,'COLLECTED_AT_INVALID');
assert.equal(enforceRightsLifecycle({rights},{now}).reason,'COLLECTED_AT_REQUIRED_FOR_RETENTION');

const fxFact=(owner,rate)=>({base_currency:'EUR',quote_currency:'USD',rate,observed_at:'2026-08-20T00:00:00Z',source_owner:owner,rights:{collect:'ALLOW',store:'ALLOW',transform:'ALLOW'}});
assert.equal(convertCurrency(100,'EUR','USD',[fxFact('A',0)],{asOf:now}).state,'HOLD');
assert.equal(convertCurrency(100,'EUR','USD',[fxFact('A',-1)],{asOf:now}).state,'HOLD');
assert.equal(convertCurrency(100,'EUR','USD',[fxFact('A',1.1),fxFact('B',1.3)],{asOf:now}).reason,'FX_RATE_CONFLICT');
assert.equal(convertCurrency(100,'EUR','USD',[fxFact('A',1.1),fxFact('B',1.105)],{asOf:now}).state,'PASS');
assert.equal(convertCurrency(100,'EUR','USD',[fxFact('A',1.1)],{asOf:'bad-date'}).reason,'FX_ASOF_INVALID');

const make=(id,source,entity='asset:1',amount=100000,currency='USD',date='2026-08-01T00:00:00Z',state='SOLD')=>canonicalizeMarketEvent({schema_version:'market-event-v1',market_event_id:id,evidence_class:state==='SOLD'?'VERIFIED_SOLD_EVENT':'FAILED_SALE_EVENT',event_state:state,source_event_id:id,canonical_entity_id:entity,physical_object_id:`obj:${entity}:${id}`,venue_id:`venue:${id}`,event_at:date,region:'NA',sale_mechanism:'AUCTION',duration_seconds:86400,condition_grade:{grade:'9',condition_state:null,grader:'G',authenticity_state:'VERIFIED'},price:{price_type:'HAMMER',amount,currency},rights:{collect:'ALLOW',store:'ALLOW',transform:'ALLOW'},lineage:{evidence_id:`${source}:${id}`,source_family_id:source}});

const same=[make('a','S1'),make('b','S1', 'asset:1',101000,'USD','2026-08-05T00:00:00Z'),make('c','S1','asset:1',99000,'USD','2026-08-10T00:00:00Z')];
const failedOther=make('f','S2','asset:1',90000,'USD','2026-08-11T00:00:00Z','NO_SALE_RESERVE_NOT_MET');
assert.equal(buildValuationIntelligence([...same,failedOther],{asOf:now}).state,'NOT_VERIFIED_SINGLE_SOURCE_OWNER');
assert.equal(buildValuationIntelligence([make('x','S1','asset:1'),make('y','S2','asset:2'),make('z','S3','asset:2')],{asOf:now}).state,'HOLD_MULTI_ENTITY_VALUATION_INPUT');
assert.equal(buildValuationIntelligence([make('x1','S1'),make('x2','S2','asset:1',101000,'USD','2026-08-05T00:00:00Z'),make('x3','S3','asset:1',102000,'USD','2026-09-01T00:00:00Z')],{asOf:now}).state,'HOLD_INVALID_OR_FUTURE_EVENT_DATE');
assert.equal(buildOwnedIntelligence({market:[make('m1','S1','asset:1'),make('m2','S2','asset:2')],asOf:now}).status,'HOLD_MULTI_ENTITY_MARKET_INPUT');

const missingRegion=structuredClone(make('r1','S1'));delete missingRegion.event.region;
assert.equal(selectComparables([missingRegion],{canonical_entity_id:'asset:1',region:'NA'}).length,0);
assert.equal(adjustForCondition(100000,'8','9',{id:'p',max_adjustment_ratio:.5,factors:{8:.8,9:.9}}).reason,'VERSIONED_METHODOLOGY_REQUIRED');

const dup=make('dup','S1');dup.event.relist_parent_event_id='parent';
const rel=analyzeRelistings([dup,structuredClone(dup)]);assert.equal(rel.observed_event_count,1);assert.equal(rel.relisted_event_count,1);
assert.equal(classifyIntelligenceConfidence({eventCount:-1,sourceOwnerCount:2,venueCount:2}).classification,'HOLD_INVALID_INPUT');

const partialFx=[make('u1','S1','asset:1',100000,'USD'),make('e1','S2','asset:1',90000,'EUR','2026-08-05T00:00:00Z'),make('u2','S3','asset:1',101000,'USD','2026-08-10T00:00:00Z')];
const cherry=buildOwnedIntelligenceV11({market:partialFx,fxFacts:[],targetCurrency:'USD',asOf:now});assert.equal(cherry.status,'HOLD_FX_INCOMPLETE_OR_CONFLICT');
const policy={id:'p',version:'1.0.0',max_adjustment_ratio:.1,factors:{8:.8,9:.9,10:1}};
const condMarket=[make('q1','S1'),make('q2','S2','asset:1',101000,'USD','2026-08-05T00:00:00Z'),make('q3','S3','asset:1',102000,'USD','2026-08-10T00:00:00Z')];
condMarket[0].event.condition_grade.grade='8';condMarket[1].event.condition_grade.grade='8';condMarket[2].event.condition_grade.grade='8';
const cond=buildOwnedIntelligenceV11({market:condMarket,targetCurrency:'USD',asOf:now,targetGrade:'10',conditionPolicy:policy});assert.equal(cond.status,'HOLD_CONDITION_ADJUSTMENT_NOT_PASS');

const multiV11=buildOwnedIntelligenceV11({market:[make('v1','S1','asset:1'),make('v2','S2','asset:2')],targetCurrency:'USD',asOf:now});assert.equal(multiV11.status,'HOLD_MULTI_ENTITY_VALUATION_INPUT');

console.log(JSON.stringify({status:'PASS',controls:{rights_dates:'PASS',retention_domain:'PASS',fx_positive_only:'PASS',fx_conflict_quarantine:'PASS',fx_subset_cherrypick_blocked:'PASS',comparable_dimensions:'PASS',versioned_condition_policy:'PASS',condition_hold_blocks_valuation:'PASS',relisting_dedupe:'PASS',confidence_domain:'PASS',multi_entity_core:'PASS',sold_source_owners_only:'PASS',future_date_hold:'PASS'}},null,2));
