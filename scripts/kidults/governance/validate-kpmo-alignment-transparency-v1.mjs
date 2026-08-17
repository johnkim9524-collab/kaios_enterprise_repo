#!/usr/bin/env node
import fs from 'node:fs';
const gate=JSON.parse(fs.readFileSync('coordination/kidults/governance/kpmo-alignment-transparency-gate-v1.json','utf8'));
const status=JSON.parse(fs.readFileSync('coordination/kidults/governance/kpmo-cross-track-alignment-status-v1.json','utf8'));
const fail=m=>{throw new Error(m)};
if(gate.alignment_rule.required_score_percent!==100)fail('alignment threshold must be 100');
if(gate.alignment_rule.unaligned_execution_allowed!==false)fail('unaligned execution must be prohibited');
for(const [track,v] of Object.entries(status.tracks)){if(v.alignment_percent!==100)fail(`${track} alignment below 100`);if(v.state!=='ALIGNED_ACTIVE')fail(`${track} not aligned active`)}
for(const key of ['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'])if(!status.shared_north_star.includes(key))fail(`missing north star ${key}`);
const requiredTransparency=['SOURCE_PROVENANCE','RIGHTS_AND_COMMERCIAL_USE_STATE','EVIDENCE_REFERENCES','CONFIDENCE_AND_CLASSIFICATION','KNOWN_LIMITATIONS','CHANGE_AND_AUDIT_HISTORY'];
for(const k of requiredTransparency)if(!gate.transparency.required.includes(k))fail(`missing transparency requirement ${k}`);
if(!gate.transparency.prohibited.includes('BLACK_BOX_SCORE_WITHOUT_EVIDENCE'))fail('black-box score prohibition missing');
if(!gate.transparency.prohibited.includes('UNKNOWN_PROMOTED_AS_VERIFIED'))fail('unknown promotion prohibition missing');
if(gate.exit_gate.cross_track_canonical_id_drift!==0)fail('canonical id drift must be zero');
if(gate.exit_gate.transparency_critical_fields_percent!==100)fail('transparency critical fields must be 100%');
if(status.production!=='HOLD'||gate.exit_gate.production!=='HOLD')fail('production boundary regression');
console.log(JSON.stringify({status:'PASS',alignment:'100%',tracks:Object.keys(status.tracks).length,north_star:status.shared_north_star,transparency_required:gate.transparency.required.length,production:'HOLD'},null,2));
