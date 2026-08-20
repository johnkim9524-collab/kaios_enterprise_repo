import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {canonicalizeGradingEvidence} from './provider-independent-layers-v1.mjs';
import {buildScarcityIntelligence,scoreSourceReliability} from './owned-intelligence-core-v1.mjs';
import {HARDENING_REGISTRY} from './owned-intelligence-redteam-v2.2.mjs';

const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const digest=v=>`sha256:${createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex')}`;
const registry=JSON.parse(fs.readFileSync(HARDENING_REGISTRY.ref,'utf8'));
assert.equal(registry.id,HARDENING_REGISTRY.id);assert.equal(registry.version,HARDENING_REGISTRY.version);assert.equal(digest(registry),HARDENING_REGISTRY.digest);

const now='2026-08-21T00:00:00Z';
const g=(provider,owner,total=100,at=10,higher=2,asOf=now,ref='r')=>canonicalizeGradingEvidence({grading_evidence_id:`${provider}-${owner}-${ref}`,provider_id:provider,canonical_entity_id:'card:1',provider_item_id:`${provider}-item-${ref}`,identity:{year:2000,set:'S',card_number:'1',subject:'X',variant:'A',language:'EN'},grade:{raw_grade:'9',scale:{min:0,max:10,higherIsBetter:true}},population:{at_grade:at,higher,total,scope:'PROVIDER_CENSUS',as_of:asOf},observed_at:asOf,rights:{collect:'ALLOW',store:'ALLOW',transform:'ALLOW'},lineage:{source_owner:owner,source_record_ref:`${owner}:${ref}`},admission:{confidence:.9}});

let scarcity=buildScarcityIntelligence([g('G1','OWNER_X'),g('G2','OWNER_X',200,20,3)]);assert.equal(scarcity[0].composite_state,'NOT_VERIFIED_INSUFFICIENT_INDEPENDENT_GRADERS');assert.equal(scarcity[0].independent_source_owner_count,1);
scarcity=buildScarcityIntelligence([g('G1','OWNER_A'),g('G2','OWNER_B',200,20,3)]);assert.equal(scarcity[0].composite_state,'BOUNDED_MULTI_PROVIDER');
const conflict=[g('G1','OWNER_A',100,10,2,now,'a'),g('G1','OWNER_B',100,20,2,now,'b')];scarcity=buildScarcityIntelligence(conflict);assert.equal(scarcity[0].composite_state,'HOLD_CONFLICTING_PROVIDER_CENSUS');
const revised=[g('G1','OWNER_A',100,10,2,'2026-08-20T00:00:00Z','old'),g('G1','OWNER_A',120,12,2,'2026-08-21T00:00:00Z','new'),g('G2','OWNER_B',200,20,3,now,'g2')];scarcity=buildScarcityIntelligence(revised);assert.equal(scarcity[0].provider_signals.length,2);assert.equal(scarcity[0].composite_state,'BOUNDED_MULTI_PROVIDER');

const base={canonical_entity_id:'asset:1',event_at:now,rights:{collect:'ALLOW',store:'ALLOW',transform:'ALLOW'},lineage:{source_family_id:'SRC',evidence_id:'E1'}};
let rel=scoreSourceReliability([base,structuredClone(base),{...base,lineage:{...base.lineage,evidence_id:'E2'}},{...base,lineage:{...base.lineage,evidence_id:'E3'}}]);
assert.equal(rel[0].sample_count,3);assert.equal(rel[0].classification,'INSUFFICIENT_FRESHNESS_EVIDENCE');assert.equal(rel[0].dimensions.freshness,0);assert.equal(rel[0].dimensions.freshness_coverage,0);
const fresh=[1,2,3].map(i=>({...base,lineage:{...base.lineage,evidence_id:`F${i}`},freshness:{state:'CURRENT'}}));rel=scoreSourceReliability(fresh);assert.equal(rel[0].dimensions.freshness,1);assert.equal(rel[0].dimensions.freshness_coverage,1);assert.ok(['HIGH','MEDIUM','LOW'].includes(rel[0].classification));

console.log(JSON.stringify({status:'PASS',controls:{registry_file_digest_binding:'PASS',scarcity_source_independence:'PASS',census_conflict_quarantine:'PASS',revision_padding_blocked:'PASS',reliability_duplicate_padding:'PASS',missing_freshness_not_pass:'PASS',freshness_coverage:'PASS'}},null,2));
