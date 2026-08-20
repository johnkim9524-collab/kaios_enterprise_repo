import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const admission=JSON.parse(await fs.readFile('coordination/kidults/source-intelligence/musicbrainz-regional-catalog-observation-admission-r1.json','utf8'));
const outPath=process.argv[2]||'/tmp/musicbrainz-regional-catalog-observation-r1.json';
const endpoint=new URL('https://musicbrainz.org/ws/2/release/');
endpoint.searchParams.set('query','format:vinyl AND status:official AND country:* AND date:*');
endpoint.searchParams.set('fmt','json');
endpoint.searchParams.set('limit','100');
const sha=v=>`sha256:${createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;
const cc=v=>/^[A-Z]{2}$/.test(String(v||''))?String(v):null;
const macroregion=c=>['US','CA','MX'].includes(c)?'NORTH_AMERICA':['GB','FR','DE','IT','ES','NL','BE','CH','AT','SE','NO','DK','FI','IE','PT','PL','CZ'].includes(c)?'EUROPE':c==='JP'?'JAPAN':c==='KR'?'KOREA':['CN','HK','MO','TW'].includes(c)?'GREATER_CHINA':['SG','MY','TH','ID','PH','VN'].includes(c)?'SOUTHEAST_ASIA':['AU','NZ'].includes(c)?'OCEANIA':'OTHER';
const response=await fetch(endpoint,{headers:{accept:'application/json','user-agent':'KIDULTS-ASI-REGIONAL-CATALOG/1.0 (bounded noncommercial shadow; contact via repository)'},signal:AbortSignal.timeout(30000)});
if(!response.ok)throw new Error(`MUSICBRAINZ_HTTP_${response.status}`);
const body=await response.json();
const observations=[];
for(const r of body.releases||[]){const country=cc(r?.country),date=String(r?.date||'').trim(),id=String(r?.id||'').toLowerCase(),group=String(r?.['release-group']?.id||'').toLowerCase(),status=String(r?.status||'');const vinyl=(r?.media||[]).some(m=>/vinyl/i.test(String(m?.format||'')));if(!country||!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(date)||!/^[0-9a-f-]{36}$/.test(id)||!/^[0-9a-f-]{36}$/.test(group)||status.toLowerCase()!=='official'||!vinyl)continue;const projected={release_mbid:id,release_group_mbid:group,country_code:country,macroregion_id:macroregion(country),release_date:date,title:String(r?.title||''),status:'Official',format:'Vinyl'};observations.push({...projected,source_reference:`https://musicbrainz.org/release/${id}`,source_projection_sha256:sha(projected),rights_state:'ALLOW_CORE_CC0',purpose:'REGIONAL_CATALOG_OBSERVATION'});}
const regionCounts={};for(const x of observations)regionCounts[x.macroregion_id]=(regionCounts[x.macroregion_id]||0)+1;
const artifact={id:'kidults-asi-musicbrainz-regional-catalog-observation-r1',version:'1.0.0',parent_issue:654,source_id:admission.source_id,source_owner_id:admission.source_owner_id,purpose:admission.purpose,rights_state:admission.rights_state,transport_state:admission.transport_state,license_evidence_refs:admission.license_evidence_refs,query_reference:endpoint.toString(),query_response_sha256:sha(body),observed_result_count:Number(body.count||0),sampled_response_records:(body.releases||[]).length,region_bound_observation_count:observations.length,macroregion_counts:regionCounts,observations:observations.slice(0,40),language:null,currency:null,local_market_or_venue:'MUSICBRAINZ_RELEASE_COUNTRY_FIELD',factor_eligibility:'NOT_VERIFIED',market_scale_claim:false,transaction_activity_claim:false,current_market_claim:false,global_weight_claim:false,production:'HOLD',public_release:'HOLD',truth_boundary:'MusicBrainz core release country/date observations only. These prove region-bound catalog/release observations, not transaction activity, demand, sales, liquidity, market scale, maturity or regional analytical weight. Missing currency/language/market-factor evidence remains UNKNOWN.'};
if(artifact.region_bound_observation_count<1)throw new Error('NO_REGION_BOUND_CORE_RELEASE_OBSERVATIONS');
await fs.writeFile(outPath,JSON.stringify(artifact,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',region_bound_observation_count:artifact.region_bound_observation_count,macroregion_counts:artifact.macroregion_counts,factor_eligibility:artifact.factor_eligibility,market_scale_claim:false,production:'HOLD'}));
