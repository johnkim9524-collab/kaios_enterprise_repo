#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';

const [contractPath='coordination/kidults/source-intelligence/asi-official-source-schema-observation-contract-v1.json',outputDir1='/tmp/kidults-asi-official-source-schema-observation-run-1',outputDir2='/tmp/kidults-asi-official-source-schema-observation-run-2']=process.argv.slice(2);
const readJson=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const stableJson=v=>`${JSON.stringify(stable(v),null,2)}\n`;
const sha256=v=>`sha256:${crypto.createHash('sha256').update(v).digest('hex')}`;
const id=(prefix,v)=>`${prefix}::${crypto.createHash('sha256').update(stableJson(v)).digest('hex').slice(0,32)}`;
const uniq=v=>[...new Set((v||[]).filter(Boolean))].sort();
const contract=await readJson(contractPath);const principles=['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'];
if(contract.id!=='kidults-asi-official-source-schema-observation-contract-v1'||contract.version!=='1.0.0')throw new Error('SCHEMA_OBSERVATION_CONTRACT_INVALID');
if(JSON.stringify(contract.platform_principles)!==JSON.stringify(principles)||contract.source_profiles?.length!==6||contract.required_outputs?.length!==4)throw new Error('SCHEMA_OBSERVATION_BINDING_INVALID');

function ipv4ToInt(ip){return ip.split('.').reduce((n,p)=>(n<<8)+Number(p),0)>>>0;}
function inCidr4(ip,base,bits){const mask=bits===0?0:(0xffffffff<<(32-bits))>>>0;return(ipv4ToInt(ip)&mask)===(ipv4ToInt(base)&mask);}
function isForbiddenIp(address){
  const family=net.isIP(address);if(!family)return true;
  if(family===4){
    const ranges=[['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]];
    return ranges.some(([base,bits])=>inCidr4(address,base,bits));
  }
  const normalized=address.toLowerCase();
  if(normalized==='::'||normalized==='::1')return true;
  if(normalized.startsWith('fc')||normalized.startsWith('fd')||normalized.startsWith('fe8')||normalized.startsWith('fe9')||normalized.startsWith('fea')||normalized.startsWith('feb'))return true;
  if(normalized.startsWith('ff'))return true;
  if(normalized.startsWith('2001:db8'))return true;
  if(normalized.startsWith('::ffff:'))return isForbiddenIp(normalized.slice(7));
  return false;
}
function normalizeUrl(raw,profile){
  const url=new URL(raw);if(url.protocol!=='https:')throw new Error('OBSERVATION_HTTPS_REQUIRED');if(url.username||url.password)throw new Error('OBSERVATION_CREDENTIALS_FORBIDDEN');
  if(url.port&&url.port!=='443')throw new Error('OBSERVATION_DEFAULT_PORT_REQUIRED');if(!profile.allowed_hosts.includes(url.hostname.toLowerCase()))throw new Error(`OBSERVATION_HOST_NOT_ALLOWED:${url.hostname}`);
  url.hash='';return url;
}
async function resolvePinned(hostname){
  const answers=await dns.lookup(hostname,{all:true,verbatim:true});if(!answers.length)throw new Error('OBSERVATION_DNS_EMPTY');
  const normalized=answers.map(a=>({address:a.address,family:a.family}));if(normalized.some(a=>isForbiddenIp(a.address)))throw new Error('OBSERVATION_DNS_PRIVATE_OR_SPECIAL');
  return normalized.sort((a,b)=>a.family-b.family||a.address.localeCompare(b.address));
}
function requestPinned(url,profile,config,redirects=[]){return new Promise(async(resolve,reject)=>{
  let answers;try{answers=await resolvePinned(url.hostname);}catch(e){reject(e);return;}
  const pinned=answers[0];const startedAt=new Date().toISOString();let completed=false;
  const req=https.request({protocol:'https:',hostname:url.hostname,port:443,path:`${url.pathname}${url.search}`,method:'GET',headers:{'user-agent':config.user_agent,'accept':'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.1','accept-encoding':'identity','cookie':''},servername:url.hostname,rejectUnauthorized:true,timeout:config.connect_timeout_ms,lookup:(host,opts,cb)=>cb(null,pinned.address,pinned.family)},res=>{
    const connectedAddress=req.socket?.remoteAddress||null;if(connectedAddress&&connectedAddress!==pinned.address){req.destroy(new Error('OBSERVATION_REMOTE_ADDRESS_MISMATCH'));return;}
    const status=Number(res.statusCode||0);const location=res.headers.location;
    if(status>=300&&status<400&&location){res.resume();if(redirects.length>=config.max_redirects){reject(new Error('OBSERVATION_REDIRECT_LIMIT'));return;}let next;try{next=normalizeUrl(new URL(location,url).href,profile);}catch(e){reject(e);return;}requestPinned(next,profile,config,[...redirects,{from:url.href,to:next.href,status}]).then(resolve,reject);return;}
    const chunks=[];let bytes=0;res.on('data',chunk=>{bytes+=chunk.length;if(bytes>config.max_body_bytes){req.destroy(new Error('OBSERVATION_BODY_LIMIT'));return;}chunks.push(chunk);});
    res.on('end',()=>{if(completed)return;completed=true;const body=Buffer.concat(chunks);resolve({requested_url:url.href,final_url:url.href,status,headers:{content_type:String(res.headers['content-type']||''),content_length:String(res.headers['content-length']||'')},body,body_bytes:body.length,body_digest:sha256(body),started_at:startedAt,completed_at:new Date().toISOString(),resolved_addresses:answers,pinned_address:pinned.address,connected_address:connectedAddress,redirects});});
  });
  req.setTimeout(config.total_timeout_ms,()=>req.destroy(new Error('OBSERVATION_TOTAL_TIMEOUT')));req.on('error',err=>{if(completed)return;completed=true;reject(err);});req.end();
});}
const stripTags=s=>String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
function parseTitle(html){const m=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);return m?stripTags(m[1]).slice(0,300):null;}
function parseJsonLdTypes(html){const types=[];const regex=/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;let m;while((m=regex.exec(html))){try{const x=JSON.parse(m[1]);const visit=v=>{if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object'){if(v['@type'])types.push(...(Array.isArray(v['@type'])?v['@type']:[v['@type']]));for(const value of Object.values(v))visit(value);}};visit(x);}catch{types.push('UNPARSEABLE_JSON_LD');}}return uniq(types.map(String));}
function parseLinks(html,baseUrl,profile,keywords){const terms=[],paths=[];const regex=/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;while((m=regex.exec(html))){let u;try{u=new URL(m[1],baseUrl);}catch{continue;}if(u.protocol!=='https:'||!profile.allowed_hosts.includes(u.hostname.toLowerCase()))continue;u.hash='';const label=stripTags(m[2]).slice(0,200);const combined=`${u.pathname} ${label}`.toLowerCase();if(/terms|privacy|legal|cookie/.test(combined))terms.push({url:u.href,label});if(keywords.some(k=>combined.includes(k)))paths.push({url:u.href,path:u.pathname,label,followed:false});}return{terms:uniq(terms.map(x=>stableJson(x))).map(x=>JSON.parse(x)),paths:uniq(paths.map(x=>stableJson(x))).map(x=>JSON.parse(x)).slice(0,100)};}

const profileReceipts=[];const resultCandidates=[];let liveRequests=0;
for(const profile of contract.source_profiles){
  const observations=[];for(const requestPath of contract.transport.paths){
    const startUrl=normalizeUrl(new URL(requestPath,profile.root_url).href,profile);liveRequests+=1;
    try{const response=await requestPinned(startUrl,profile,contract.transport);const contentType=response.headers.content_type;const bodyText=/text|html|json|xml/i.test(contentType)?response.body.toString('utf8'):'';const parsed=requestPath==='/'?parseLinks(bodyText,response.final_url,profile,contract.observation.result_path_keywords):{terms:[],paths:[]};
      observations.push({path:requestPath,state:'OBSERVED',requested_url:response.requested_url,final_url:response.final_url,http_status:response.status,content_type:contentType,body_bytes:response.body_bytes,body_digest:response.body_digest,title:requestPath==='/'?parseTitle(bodyText):null,json_ld_types:requestPath==='/'?parseJsonLdTypes(bodyText):[],terms_privacy_links:parsed.terms,result_path_candidate_count:parsed.paths.length,resolved_addresses:response.resolved_addresses,pinned_address:response.pinned_address,connected_address:response.connected_address,redirects:response.redirects,error:null});
      for(const candidate of parsed.paths)resultCandidates.push({candidate_id:id('official-result-path',{profile_id:profile.profile_id,url:candidate.url}),profile_id:profile.profile_id,expected_domain:profile.expected_domain,url:candidate.url,path:candidate.path,label:candidate.label,state:'DISCOVERED_NOT_FOLLOWED',same_host_or_allowed_alias:true,followed:false,rights_state:'UNKNOWN',evidence_state:'NOT_EVIDENCE',public_release:'HOLD',production:'HOLD'});
    }catch(error){observations.push({path:requestPath,state:'FAILED_EXPLICIT',requested_url:startUrl.href,final_url:null,http_status:null,content_type:null,body_bytes:0,body_digest:null,title:null,json_ld_types:[],terms_privacy_links:[],result_path_candidate_count:0,resolved_addresses:[],pinned_address:null,connected_address:null,redirects:[],error:String(error?.message||error)});}
  }
  const root=observations.find(x=>x.path==='/');const robots=observations.find(x=>x.path==='/robots.txt');const successCount=observations.filter(x=>x.state==='OBSERVED').length;
  profileReceipts.push({receipt_id:id('official-schema-observation',profile.profile_id),profile_id:profile.profile_id,root_url:profile.root_url,allowed_hosts:profile.allowed_hosts,expected_domain:profile.expected_domain,state:successCount===2?'OBSERVATION_COMPLETE':successCount>0?'OBSERVATION_PARTIAL':'OBSERVATION_FAILED',request_count:2,successful_request_count:successCount,failed_request_count:2-successCount,root_reachable:Boolean(root&&root.state==='OBSERVED'),robots_observed:Boolean(robots&&robots.state==='OBSERVED'),live_result_extraction_verified:false,rights_pass_created:false,evidence_admitted:false,observations,public_release:'HOLD',production:'HOLD'});
}
const uniqueCandidates=[...new Map(resultCandidates.map(c=>[c.url,c])).values()].sort((a,b)=>a.profile_id.localeCompare(b.profile_id)||a.url.localeCompare(b.url));
const ledger={id:'kidults-asi-official-source-schema-observation-ledger-v1',version:'1.0.0',state:profileReceipts.every(r=>r.state==='OBSERVATION_COMPLETE')?'ALL_PROFILE_OBSERVATIONS_COMPLETE':profileReceipts.some(r=>r.successful_request_count>0)?'PARTIAL_PROFILE_OBSERVATIONS_PRESERVED':'ALL_PROFILE_OBSERVATIONS_FAILED_EXPLICIT',platform_principles:principles,profile_count:profileReceipts.length,request_count:liveRequests,successful_request_count:profileReceipts.reduce((a,b)=>a+b.successful_request_count,0),failed_request_count:profileReceipts.reduce((a,b)=>a+b.failed_request_count,0),complete_profile_count:profileReceipts.filter(r=>r.state==='OBSERVATION_COMPLETE').length,partial_profile_count:profileReceipts.filter(r=>r.state==='OBSERVATION_PARTIAL').length,failed_profile_count:profileReceipts.filter(r=>r.state==='OBSERVATION_FAILED').length,profiles:profileReceipts,raw_body_persisted:false,live_result_extraction_verified:0,rights_pass_created:0,evidence_admitted:0,public_release:'HOLD',production:'HOLD'};
const candidateRegistry={id:'kidults-asi-official-source-result-path-candidate-registry-v1',version:'1.0.0',state:'SAME_HOST_PATH_CANDIDATES_DISCOVERED_NOT_FOLLOWED',profile_count:profileReceipts.length,candidate_count:uniqueCandidates.length,candidates:uniqueCandidates,discovered_links_followed:0,rights_pass_created:0,evidence_admitted:0,public_release:'HOLD',production:'HOLD'};
const transportReceipt={id:'kidults-asi-official-source-transport-receipt-v1',version:'1.0.0',state:'BOUNDED_LIVE_TRANSPORT_EXECUTED',request_count:liveRequests,exact_allowlist_only:true,https_only:true,credentials_used:false,cookies_used:false,writes_executed:false,pinned_dns_and_tls_hostname_verification:true,private_or_special_ip_accepted:false,unvalidated_redirects_followed:0,max_body_bytes:contract.transport.max_body_bytes,raw_body_persisted:false,target_host_egress_executed:true,collection_right_created:false,rights_pass_created:false,evidence_admitted:0,public_release:'HOLD',production:'HOLD'};
const outputsFor=async outputDir=>{await fs.mkdir(outputDir,{recursive:true});const outputs=[];for(const[name,value]of [['official-source-schema-observation-ledger-v1.json',ledger],['official-source-result-path-candidate-registry-v1.json',candidateRegistry],['official-source-transport-receipt-v1.json',transportReceipt]]){const text=stableJson(value);await fs.writeFile(path.join(outputDir,name),text);outputs.push({name,sha256:sha256(text),bytes:Buffer.byteLength(text)});}const manifest={id:'kidults-asi-official-source-schema-observation-manifest-v1',version:'1.0.0',state:'BOUNDED_OFFICIAL_SOURCE_SCHEMA_OBSERVATION_EXECUTED',platform_principles:principles,input_binding:{contract:{id:contract.id,version:contract.version,digest:sha256(stableJson(contract))}},results:{profiles:profileReceipts.length,requests_executed:liveRequests,successful_requests:ledger.successful_request_count,failed_requests:ledger.failed_request_count,complete_profiles:ledger.complete_profile_count,partial_profiles:ledger.partial_profile_count,failed_profiles:ledger.failed_profile_count,result_path_candidates:uniqueCandidates.length,discovered_links_followed:0,raw_body_persisted:false,target_host_egress_executed:true,rights_pass_created:0,evidence_admitted:0,market_events_created:0,snapshot_candidates_created:0},output_files:outputs,autonomous_effect:'POSITIVE_BOUNDED_OFFICIAL_SCHEMA_OBSERVATION_EXECUTED_WITH_PARTIAL_FAILURE_PRESERVATION',global_effect:'POSITIVE_SIX_PRIORITY_OFFICIAL_SOURCE_PROFILES_OBSERVED_WITHOUT_CLAIMING_GLOBAL_COMPLETION',irreplaceable_value_effect:'POSITIVE_KIDULTS_OWNED_TRANSPORT_SCHEMA_PATH_AND_DIGEST_RECEIPTS',transparency_effect:'POSITIVE_EVERY_REQUEST_SUCCESS_FAILURE_REDIRECT_DIGEST_AND_BOUNDARY_RECORDED',public_release:'HOLD',production:'HOLD'};const manifestText=stableJson(manifest);await fs.writeFile(path.join(outputDir,'official-source-schema-observation-manifest-v1.json'),manifestText);};
await outputsFor(outputDir1);await outputsFor(outputDir2);
console.log(JSON.stringify({state:'BOUNDED_OFFICIAL_SOURCE_SCHEMA_OBSERVATION_EXECUTED',profiles:profileReceipts.length,requests_executed:liveRequests,successful_requests:ledger.successful_request_count,failed_requests:ledger.failed_request_count,complete_profiles:ledger.complete_profile_count,partial_profiles:ledger.partial_profile_count,failed_profiles:ledger.failed_profile_count,result_path_candidates:uniqueCandidates.length,target_host_egress_executed:true,raw_body_persisted:false,rights_pass_created:0,evidence_admitted:0,market_events_created:0,snapshot_candidates_created:0,public_release:'HOLD',production:'HOLD'},null,2));
