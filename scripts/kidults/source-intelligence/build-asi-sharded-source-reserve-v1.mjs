#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const currentPath=process.argv[2]||'discovery-out/global-low-risk-discovery.json';
const previousDir=process.argv[3]||'/tmp/previous-asi-sharded-source-reserve-v1';
const outDir=process.argv[4]||'/tmp/asi-sharded-source-reserve-v1';
const shardDir=path.join(outDir,'shards');
fs.rmSync(outDir,{recursive:true,force:true});fs.mkdirSync(shardDir,{recursive:true});
const current=JSON.parse(fs.readFileSync(currentPath,'utf8'));
const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const canonicalize=u=>{const x=new URL(String(u));if(!/^https?:$/.test(x.protocol))throw new Error('NON_HTTP_ENDPOINT');x.hash='';x.hostname=x.hostname.toLowerCase();if((x.protocol==='https:'&&x.port==='443')||(x.protocol==='http:'&&x.port==='80'))x.port='';for(const k of [...x.searchParams.keys()])if(/^utm_|^(fbclid|gclid|mc_cid|mc_eid)$/i.test(k))x.searchParams.delete(k);x.searchParams.sort();return x.toString().replace(/\/$/,'')};
const boundary=r=>{if(r.rights_state!=='UNASSESSED'||r.admission_state!=='NOT_ADMITTED'||r.gate_1_state!=='PENDING'||r.acquisition_authorized!==false||r.production!=='HOLD')throw new Error('RESERVE_PERMISSION_BOUNDARY')};
const incomingByShard=new Map();
for(const raw of current.candidates||[]){
 const endpoint=canonicalize(raw.endpoint_url);const key=sha(endpoint);const shard=key.slice(0,2);const host=new URL(endpoint).hostname.toLowerCase();
 const record={reserve_candidate_id:`reserve-${key.slice(0,24)}`,canonical_key:key,endpoint_url:endpoint,canonical_host:host,first_observed_at:raw.observed_at||new Date().toISOString(),last_observed_at:raw.observed_at||new Date().toISOString(),observation_count:1,discovery_providers:[...new Set((raw.discovery_providers||[raw.discovery_provider]).filter(Boolean))].sort(),discovery_channels:[...new Set((raw.discovery_channels||[raw.discovery_channel]).filter(Boolean))].sort(),scope_hints:[...new Set((raw.scope_hints||[raw.scope_hint]).filter(Boolean))].sort(),region_hints:[...new Set((raw.target_regions||[raw.region_hint]).filter(Boolean))].sort(),source_family_hint:raw.source_family_hint||'UNCLASSIFIED_ANY_SITE_CANDIDATE',candidate_source_roles:[...new Set(raw.candidate_source_roles||['UNCLASSIFIED_PENDING_RELEVANCE'])].sort(),evidence_state:'DISCOVERY_METADATA_ONLY',rights_state:'UNASSESSED',admission_state:'NOT_ADMITTED',gate_1_state:'PENDING',acquisition_authorized:false,target_site_body_crawled:false,content_acquired:false,public_release:'HOLD',production:'HOLD'};
 boundary(record);if(!incomingByShard.has(shard))incomingByShard.set(shard,[]);incomingByShard.get(shard).push(record);
}
function findManifest(root){if(!fs.existsSync(root))return null;for(const e of fs.readdirSync(root,{withFileTypes:true})){const p=path.join(root,e.name);if(e.isDirectory()){const f=findManifest(p);if(f)return f}else if(e.name==='asi-sharded-source-reserve-manifest-v1.json')return p}return null}
const prevManifestPath=findManifest(previousDir);let prevManifest={cycle_number:0};let prevRoot=null;
if(prevManifestPath){prevManifest=JSON.parse(fs.readFileSync(prevManifestPath,'utf8'));prevRoot=path.dirname(prevManifestPath);if(prevManifest.id!=='kidults-asi-sharded-source-reserve-manifest-v1'||prevManifest.production!=='HOLD')throw new Error('PREVIOUS_MANIFEST_BOUNDARY')}
let unique=0,newCount=0,updatedCount=0;const hosts=new Set(),shards=[];
for(let i=0;i<256;i++){
 const id=i.toString(16).padStart(2,'0');const map=new Map();const prevFile=prevRoot?path.join(prevRoot,'shards',`${id}.ndjson`):null;
 if(prevFile&&fs.existsSync(prevFile)){
  for(const line of fs.readFileSync(prevFile,'utf8').split(/\r?\n/).filter(Boolean)){const r=JSON.parse(line);boundary(r);if(r.canonical_key.slice(0,2)!==id)throw new Error('PREVIOUS_SHARD_MISMATCH');map.set(r.canonical_key,r)}
 }
 for(const r of incomingByShard.get(id)||[]){
  const p=map.get(r.canonical_key);
  if(!p){map.set(r.canonical_key,r);newCount++;}
  else{boundary(p);map.set(r.canonical_key,{...p,last_observed_at:r.last_observed_at,observation_count:Number(p.observation_count||1)+1,discovery_providers:[...new Set([...(p.discovery_providers||[]),...r.discovery_providers])].sort(),discovery_channels:[...new Set([...(p.discovery_channels||[]),...r.discovery_channels])].sort(),scope_hints:[...new Set([...(p.scope_hints||[]),...r.scope_hints])].sort(),region_hints:[...new Set([...(p.region_hints||[]),...r.region_hints])].sort(),candidate_source_roles:[...new Set([...(p.candidate_source_roles||[]),...r.candidate_source_roles])].sort(),rights_state:'UNASSESSED',admission_state:'NOT_ADMITTED',gate_1_state:'PENDING',acquisition_authorized:false,public_release:'HOLD',production:'HOLD'});updatedCount++;}
 }
 const rows=[...map.values()].sort((a,b)=>a.canonical_key.localeCompare(b.canonical_key));for(const r of rows){unique++;hosts.add(r.canonical_host)}
 const content=rows.map(r=>JSON.stringify(r)).join('\n')+(rows.length?'\n':'');const file=path.join(shardDir,`${id}.ndjson`);fs.writeFileSync(file,content);
 shards.push({shard_id:id,path:`shards/${id}.ndjson`,candidate_count:rows.length,sha256:sha(content)});
}
const globalDigest=sha(shards.map(s=>`${s.shard_id}:${s.sha256}:${s.candidate_count}`).join('|'));
const manifest={id:'kidults-asi-sharded-source-reserve-manifest-v1',version:'1.0.0',status:'SHADOW_SHARDED_DISCOVERY_SOURCE_RESERVE_READY',cycle_number:Number(prevManifest.cycle_number||0)+1,created_at:new Date().toISOString(),universe_target:'GLOBAL_ANY_SITE_SOURCE_UNIVERSE',reserve_semantics:'DISCOVERY_METADATA_CANDIDATE_RESERVE_NOT_SAFE_POOL',design_capacity_minimum_candidates:100000,shard_algorithm:'SHA256_CANONICAL_ENDPOINT_PREFIX_00_FF',shard_count:256,nonempty_shard_count:shards.filter(s=>s.candidate_count>0).length,unique_candidate_count:unique,unique_host_count:hosts.size,current_cycle_input_count:(current.candidates||[]).length,new_candidate_count:newCount,updated_candidate_count:updatedCount,shards,global_digest:`sha256:${globalDigest}`,rules:{append_only_identity_merge:true,one_shard_loaded_at_a_time:true,completion_claim_allowed:false,reserve_is_not_safe_pool:true,gate1_required:true,rights_never_promoted:true,admission_never_promoted:true,target_site_body_traversal_forbidden:true,content_acquisition_forbidden:true},target_site_body_crawled:false,content_acquired:false,acquisition_authorized:false,public_release:'HOLD',production:'HOLD'};
fs.writeFileSync(path.join(outDir,'asi-sharded-source-reserve-manifest-v1.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({status:manifest.status,cycle:manifest.cycle_number,input:manifest.current_cycle_input_count,unique:manifest.unique_candidate_count,hosts:manifest.unique_host_count,new:newCount,updated:updatedCount,nonempty_shards:manifest.nonempty_shard_count,production:'HOLD'}));
