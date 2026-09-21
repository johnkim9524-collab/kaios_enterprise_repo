#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sha256, validateEnvelope, validateQuorum, buildTerminalReceipt} from './lib/autonomous-internal-landing-v1.mjs';

const policy = JSON.parse(fs.readFileSync('coordination/kidults/governance/autonomous-internal-landing-policy-v1.json','utf8'));
const sha = char => char.repeat(40);
const actor = (role, id) => ({actor_login:`${role.toLowerCase()}-${id}`,actor_id:String(id),actor_type:'Bot',app_id:String(id+100),installation_id:String(id+200),workflow_ref:`owner/repo/.github/workflows/${role}.yml@refs/heads/main`,workflow_sha:sha(String(id).slice(-1)),repository_id:'1281328888'});
const registry = {actors:[['ACCOUNTABLE_TRACK_AGENT',1],['KPMO',2],['INDEPENDENT_VERIFIER',3]].map(([role,id])=>({role,...actor(role,id)}))};
const paths = ['src/internal-a.js','tests/internal-a.test.js'];
const base = {
  repository_id:'1281328888',repository:'johnkim9524-collab/kaios_enterprise_repo',pull_request:42,
  base_sha:sha('a'),head_sha:sha('b'),head_tree_sha:sha('c'),scope_digest:sha256([...paths].sort().join('\n')),
  test_evidence_digest:sha256('tests'),rollback_digest:sha256('rollback'),authorization_generation:'gen-1',
  nonce_digest:sha256('nonce'),issued_at:'2026-09-21T12:00:00Z',expires_at:'2026-09-21T12:30:00Z',
  operation:'INTERNAL_REVERSIBLE_LANDING',changed_paths:paths,production:'HOLD',public:'HOLD',g5:'HOLD'
};
const track={...base,actor:actor('ACCOUNTABLE_TRACK_AGENT',1)};
const kpmo={...base,actor:actor('KPMO',2)};
const verifier={...base,actor:actor('INDEPENDENT_VERIFIER',3),verification_state:'VERIFIED_PASS'};
const now=Date.parse('2026-09-21T12:10:00Z');
assert.equal(validateEnvelope(track,{policy,now}).operation,'INTERNAL_REVERSIBLE_LANDING');
const quorum=validateQuorum({track,kpmo,verifier,registry,policy,now});
assert.equal(quorum.state,'INDEPENDENT_VERIFIED');
const receipt=buildTerminalReceipt({quorum,reservation:{state:'CONSUMED',conditional_write:true},merge:{merge_sha:sha('d'),main_sha:sha('d'),head_sha:sha('b'),tree_sha:sha('c')},postmerge:{state:'VERIFIED_PASS'}});
assert.equal(receipt.state,'RECEIPT_SEALED');
const rejects = mutator => assert.throws(()=>validateQuorum({track:mutator({...track}),kpmo,verifier,registry,policy,now}));
rejects(value=>({...value,production:'ALLOW'}));
rejects(value=>({...value,changed_paths:['production/release.yml'],scope_digest:sha256('production/release.yml')}));
rejects(value=>({...value,head_sha:sha('e')}));
rejects(value=>({...value,actor:{...value.actor,actor_id:'999'}}));
assert.throws(()=>validateQuorum({track,kpmo:{...kpmo,actor:track.actor},verifier,registry,policy,now}));
assert.throws(()=>validateQuorum({track,kpmo,verifier:{...verifier,verification_state:'FAILED'},registry,policy,now}));
assert.throws(()=>buildTerminalReceipt({quorum,reservation:{state:'RESERVED',conditional_write:true},merge:{},postmerge:{}}));
console.log(JSON.stringify({state:'VERIFIED_PASS',positive:3,negative:7,production:'HOLD',public:'HOLD',g5:'HOLD'}));
