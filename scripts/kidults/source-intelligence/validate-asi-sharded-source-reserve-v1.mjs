#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.argv[2]||'/tmp/asi-sharded-source-reserve-v1';
const manifest=JSON.parse(fs.readFileSync(path.join(root,'asi-sharded-source-reserve-manifest-v1.json'),'utf8'));
const fail=m=>{throw new Error(m)};const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const canonicalize=u=>{const x=new URL(String(u));if(!/^https?:$/.test(x.protocol))fail('NON_HTTP_ENDPOINT');x.hash='';x.hostname=x.hostname.toLowerCase();if((x.protocol==='https:'&&x.port==='443')||(x.protocol==='http:'&&x.port==='80'))x.port='';for(const k of [...x.searchParams.keys()])if(/^utm_|^(fbclid|gclid|mc_cid|mc_eid)$/i.test(k))x.searchParams.delete(k);x.searchParams.sort();return x.toString().replace(/\/$/,'')};
if(manifest.id!=='kidults-asi-sharded-source-reserve-manifest-v1'||manifest.status!=='SHADOW_SHARDED_DISCOVERY_SOURCE_RESERVE_READY')fail('IDENTITY');
if(manifest.universe_target!=='GLOBAL_ANY_SITE_SOURCE_UNIVERSE'||manifest.reserve_semantics!=='DISCOVERY_METADATA_CANDIDATE_RESERVE_NOT_SAFE_POOL'||Number(manifest.design_capacity_minimum_candidates)<100000)fail('RESERVE_SEMANTICS');
if(manifest.shard_algorithm!=='SHA256_CANONICAL_ENDPOINT_PREFIX_00_FF'||Number(manifest.shard_count)!==256||!Array.isArray(manifest.shards)||manifest.shards.length!==256)fail('SHARD_MANIFEST');
if(manifest.production!=='HOLD'||manifest.public_release!=='HOLD'||manifest.acquisition_authorized!==false||manifest.content_acquired!==false||manifest.target_site_body_crawled!==false)fail('RELEASE_BOUNDARY');
const rules=manifest.rules||{};for(const k of ['append_only_identity_merge','one_shard_loaded_at_a_time','gate1_required','rights_never_promoted','admission_never_promoted','target_site_body_traversal_forbidden','content_acquisition_forbidden'])if(rules[k]!==true)fail(`RULE:${k}`);if(rules.completion_claim_allowed!==false||rules.reserve_is_not_safe_pool!==true)fail('COMPLETION_OR_SAFE_POOL_MISCLAIM');
const ids=new Set(),hosts=new Set();let total=0,nonempty=0;const digestRows=[];
for(let i=0;i<256;i++){
 const expected=i.toString(16).padStart(2,'0'),s=manifest.shards[i];if(s.shard_id!==expected||s.path!==`shards/${expected}.ndjson`)fail('SHARD_ORDER');
 const file=path.join(root,s.path);if(!fs.existsSync(file))fail('SHARD_FILE_MISSING');const content=fs.readFileSync(file,'utf8');if(sha(content)!==s.sha256)fail('SHARD_DIGEST');
 const lines=content.split(/\r?\n/).filter(Boolean);if(lines.length!==Number(s.candidate_count))fail('SHARD_COUNT');if(lines.length)nonempty++;
 let prior='';for(const line of lines){const r=JSON.parse(line);const endpoint=canonicalize(r.endpoint_url),key=sha(endpoint);if(r.canonical_key!==key||key.slice(0,2)!==expected||r.reserve_candidate_id!==`reserve-${key.slice(0,24)}`)fail('CANONICAL_OR_PARTITION_KEY');if(prior&&prior>=key)fail('SHARD_SORT_OR_DUPLICATE');prior=key;if(ids.has(key))fail('GLOBAL_DUPLICATE');ids.add(key);hosts.add(new URL(endpoint).hostname.toLowerCase());
  if(r.evidence_state!=='DISCOVERY_METADATA_ONLY'||r.rights_state!=='UNASSESSED'||r.admission_state!=='NOT_ADMITTED'||r.gate_1_state!=='PENDING')fail('RECORD_SELF_PROMOTION');if(r.acquisition_authorized!==false||r.target_site_body_crawled!==false||r.content_acquired!==false||r.public_release!=='HOLD'||r.production!=='HOLD')fail('RECORD_PERMISSION_BOUNDARY');if(!Array.isArray(r.discovery_providers)||!r.discovery_providers.length||!Number.isInteger(Number(r.observation_count))||Number(r.observation_count)<1)fail('RECORD_PROVENANCE');total++;}
 digestRows.push(`${s.shard_id}:${s.sha256}:${s.candidate_count}`);
}
if(total!==Number(manifest.unique_candidate_count)||hosts.size!==Number(manifest.unique_host_count)||nonempty!==Number(manifest.nonempty_shard_count)||ids.size!==total)fail('GLOBAL_COUNTS');
if(`sha256:${sha(digestRows.join('|'))}`!==manifest.global_digest)fail('GLOBAL_DIGEST');
if(total<1)fail('EMPTY_RESERVE');
console.log(JSON.stringify({status:'PASS',cycle:manifest.cycle_number,candidates:total,hosts:hosts.size,nonempty_shards:nonempty,design_capacity:manifest.design_capacity_minimum_candidates,production:'HOLD'}));
