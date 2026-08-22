#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'/tmp/asi-observed-domain-source-graph-v1.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
const fail=m=>{throw new Error(m)};
if(x.id!=='kidults-asi-observed-domain-source-graph-v1'||x.status!=='SHADOW_OBSERVED_DOMAIN_SOURCE_GRAPH_READY')fail('IDENTITY');
if(x.universe_target!=='GLOBAL_ANY_SITE_SOURCE_UNIVERSE'||x.graph_semantics!=='OBSERVED_ENDPOINT_AND_HOST_RELATIONSHIPS_ONLY')fail('GRAPH_SEMANTICS');
if(x.production!=='HOLD'||x.public_release!=='HOLD'||x.acquisition_authorized!==false||x.content_acquired!==false||x.target_site_body_crawled!==false)fail('RELEASE_BOUNDARY');
const r=x.rules||{};for(const k of ['public_index_metadata_only','exact_host_or_seed_subdomain_grouping_only','ownership_never_inferred','officiality_never_inferred','source_family_never_promoted','rights_never_promoted','admission_never_promoted','listing_is_not_sold'])if(r[k]!==true)fail(`RULE:${k}`);
const nodes=x.nodes||[],edges=x.edges||[];const byId=new Map(nodes.map(n=>[n.node_id,n]));if(byId.size!==nodes.length)fail('DUPLICATE_NODE');
const groups=nodes.filter(n=>n.node_type==='OBSERVED_HOST_GROUP'),candidates=nodes.filter(n=>n.node_type==='SOURCE_ENDPOINT_CANDIDATE');
if(groups.length!==Number(x.group_count)||candidates.length!==Number(x.candidate_node_count)||edges.length!==Number(x.edge_count))fail('COUNT_MISMATCH');
for(const g of groups){if(!g.anchor_host||g.ownership_verified!==false||g.officiality_verified!==false||g.rights_effect!=='NONE'||g.admission_effect!=='NONE')fail('GROUP_PROMOTION');}
for(const c of candidates){if(!c.endpoint_url||c.ownership_verified!==false||c.officiality_verified!==false||c.rights_state!=='UNASSESSED'||c.admission_state!=='NOT_ADMITTED'||c.gate_1_state!=='PENDING'||c.acquisition_authorized!==false||c.production!=='HOLD')fail('CANDIDATE_PROMOTION');}
for(const e of edges){if(e.edge_type!=='CANDIDATE_OBSERVED_WITHIN_HOST_GROUP'||e.ownership_effect!=='NONE'||e.officiality_effect!=='NONE'||e.rights_effect!=='NONE')fail('EDGE_PROMOTION');const c=byId.get(e.from_node_id),g=byId.get(e.to_node_id);if(c?.node_type!=='SOURCE_ENDPOINT_CANDIDATE'||g?.node_type!=='OBSERVED_HOST_GROUP')fail('EDGE_ENDPOINTS');const h=new URL(c.endpoint_url).hostname.toLowerCase(),a=String(g.anchor_host).toLowerCase();if(!(h===a||h.endsWith(`.${a}`)))fail('HOST_ESCAPE');}
console.log(JSON.stringify({status:'PASS',groups:groups.length,candidates:candidates.length,edges:edges.length,production:'HOLD'}));
