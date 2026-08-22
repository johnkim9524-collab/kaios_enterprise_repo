#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const input=process.argv[2]||'/tmp/asi-global-any-site-web-index-expanded-v1.json';
const out=process.argv[3]||'/tmp/asi-observed-domain-source-graph-v1.json';
const x=JSON.parse(fs.readFileSync(input,'utf8'));
const fail=m=>{throw new Error(m)};
if(x.expanded_view_id!=='kidults-asi-global-any-site-web-index-expanded-v1')fail('INPUT_ID');
const hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex').slice(0,24);
const endpointType=u=>{const z=new URL(u);const t=`${z.hostname}${z.pathname}`.toLowerCase();if(/(^|[./_-])api([./_-]|$)/.test(t))return'API_ENDPOINT_CANDIDATE';if(/docs?|documentation|developer/.test(t))return'DOCUMENTATION_ENDPOINT_CANDIDATE';if(/support|help|knowledge/.test(t))return'SUPPORT_ENDPOINT_CANDIDATE';if(/registry|register|lookup|verify/.test(t))return'REGISTRY_ENDPOINT_CANDIDATE';if(/catalog|catalogue|archive|collection/.test(t))return'CATALOG_ENDPOINT_CANDIDATE';if(/auction|market|shop|store|dealer|sell|buy/.test(t))return'MARKET_ENDPOINT_CANDIDATE';return'GENERAL_WEB_ENDPOINT_CANDIDATE'};
const groups=new Map(),nodes=[],edges=[];
for(const c of x.candidates||[]){
 const url=new URL(c.endpoint_url),host=url.hostname.toLowerCase();
 const lineage=(c.web_index_expansion_lineage||[])[0]||null;const anchor=String(lineage?.seed_host||host).toLowerCase();
 if(lineage&&!(host===anchor||host.endsWith(`.${anchor}`)))fail('HOST_ESCAPE');
 const groupId=`host-group-${hash(anchor)}`;const candidateId=`source-candidate-${hash(c.candidate_id||c.endpoint_url)}`;
 if(!groups.has(groupId))groups.set(groupId,{node_id:groupId,node_type:'OBSERVED_HOST_GROUP',anchor_host:anchor,grouping_basis:lineage?'COMMON_CRAWL_SEED_HOST_LINEAGE':'EXACT_OBSERVED_HOST',ownership_verified:false,officiality_verified:false,rights_effect:'NONE',admission_effect:'NONE'});
 nodes.push({node_id:candidateId,node_type:'SOURCE_ENDPOINT_CANDIDATE',source_candidate_id:c.candidate_id||null,endpoint_url:c.endpoint_url,observed_host:host,endpoint_type_hint:endpointType(c.endpoint_url),classification_effect:'METADATA_RELEVANCE_HINT_ONLY',ownership_verified:false,officiality_verified:false,rights_state:'UNASSESSED',admission_state:'NOT_ADMITTED',gate_1_state:'PENDING',acquisition_authorized:false,production:'HOLD'});
 edges.push({edge_id:`edge-${hash(groupId+candidateId)}`,edge_type:'CANDIDATE_OBSERVED_WITHIN_HOST_GROUP',from_node_id:candidateId,to_node_id:groupId,evidence_basis:lineage?'PUBLIC_WEB_INDEX_SAME_HOST_OR_SUBDOMAIN_OBSERVATION':'DISCOVERY_ENDPOINT_HOST_OBSERVATION',ownership_effect:'NONE',officiality_effect:'NONE',rights_effect:'NONE'});
}
const groupNodes=[...groups.values()].sort((a,b)=>a.anchor_host.localeCompare(b.anchor_host));
const output={id:'kidults-asi-observed-domain-source-graph-v1',version:'1.0.0',status:'SHADOW_OBSERVED_DOMAIN_SOURCE_GRAPH_READY',universe_target:'GLOBAL_ANY_SITE_SOURCE_UNIVERSE',graph_semantics:'OBSERVED_ENDPOINT_AND_HOST_RELATIONSHIPS_ONLY',group_count:groupNodes.length,candidate_node_count:nodes.length,edge_count:edges.length,nodes:[...groupNodes,...nodes],edges,rules:{public_index_metadata_only:true,exact_host_or_seed_subdomain_grouping_only:true,ownership_never_inferred:true,officiality_never_inferred:true,source_family_never_promoted:true,rights_never_promoted:true,admission_never_promoted:true,listing_is_not_sold:true},target_site_body_crawled:false,content_acquired:false,acquisition_authorized:false,public_release:'HOLD',production:'HOLD'};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:output.status,groups:output.group_count,candidates:output.candidate_node_count,edges:output.edge_count,production:'HOLD'}));
