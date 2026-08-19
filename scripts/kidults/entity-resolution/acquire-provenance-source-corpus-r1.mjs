import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const out = process.argv[2] || '/tmp/provenance-source-corpus-r1.json';
const activityBase = 'https://data.getty.edu/provenance/activity-stream/page';
const licenseRefs = ['https://data.getty.edu/provenance/docs/','https://linked.art/model/provenance/acquisition/'];
const headers = { 'user-agent':'KIDULTS-ER-EMPIRICAL-ACQUISITION/1.1', accept:'application/json, application/ld+json' };
function sha(v){return `sha256:${createHash('sha256').update(v).digest('hex')}`;}
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
function digest(v){return sha(JSON.stringify(canonical(v)));}
function arr(v){return Array.isArray(v)?v:(v?[v]:[]);}
function typeOf(v){return String(v?.type||v?.['@type']||'');}
function idOf(v){return typeof v==='string'?v:String(v?.id||v?.['@id']||'');}
function isGettyEntity(u){return /^https:\/\/data\.getty\.edu\/provenance\/[0-9a-f-]{20,}$/i.test(u);}
async function getJson(url){const r=await fetch(url,{headers});if(r.status===404||r.status===410)return null;if(!r.ok)throw new Error(`GETTY_HTTP_${r.status}:${url}`);return r.json();}

const activityUrls=[]; const seenActivities=new Set();
for(let pageNo=1;pageNo<=1200 && activityUrls.length<800;pageNo++){
  const page=await getJson(`${activityBase}/${pageNo}`); if(!page) continue;
  for(const change of (page.orderedItems||page.items||[])){
    const obj=change?.object;
    const u=idOf(obj)||idOf(change?.target);
    const t=typeOf(obj)||typeOf(change?.target);
    if(!isGettyEntity(u)||seenActivities.has(u)) continue;
    if(t && t!=='Activity') continue;
    seenActivities.add(u); activityUrls.push(u);
  }
}
if(activityUrls.length<240) throw new Error(`GETTY_ACTIVITY_CANDIDATES_LT_240:${activityUrls.length}`);

const pairs=[]; const pairKeys=new Set();
for(const activityUrl of activityUrls){
  if(pairs.length>=240) break;
  const activity=await getJson(activityUrl); if(!activity||typeOf(activity)!=='Activity') continue;
  const acquisitions=arr(activity.part).filter(p=>typeOf(p)==='Acquisition');
  for(const acq of acquisitions){
    for(const objectRef of arr(acq.transferred_title_of)){
      if(pairs.length>=240) break;
      const objectUrl=idOf(objectRef); if(!isGettyEntity(objectUrl)||typeOf(objectRef)!=='HumanMadeObject') continue;
      const key=`${activityUrl}|${objectUrl}`; if(pairKeys.has(key)) continue;
      const object=await getJson(objectUrl); if(!object||typeOf(object)!=='HumanMadeObject') continue;
      const eventPayload={
        activity_id:activityUrl,
        source_label:String(activity._label||''),
        identified_by:arr(activity.identified_by).slice(0,5),
        timespan:activity.timespan||null,
        took_place_at:arr(activity.took_place_at).slice(0,5),
        carried_out_by:arr(activity.carried_out_by).slice(0,5),
        acquisition:{
          transferred_title_of:arr(acq.transferred_title_of).slice(0,5),
          transferred_title_from:arr(acq.transferred_title_from).slice(0,5),
          transferred_title_to:arr(acq.transferred_title_to).slice(0,5)
        }
      };
      const objectPayload={
        object_id:objectUrl,
        source_label:String(object._label||''),
        identified_by:arr(object.identified_by).slice(0,8),
        produced_by:object.produced_by||null,
        current_owner:arr(object.current_owner).slice(0,5),
        referred_to_by:arr(object.referred_to_by).slice(0,5)
      };
      pairKeys.add(key);
      pairs.push({
        pair_id:`getty-provenance-pair-${String(pairs.length+1).padStart(4,'0')}`,
        source_id:'getty-provenance-index-linked-open-data',
        event_source_reference:activityUrl,
        object_source_reference:objectUrl,
        event_payload_sha256:digest(eventPayload),
        object_payload_sha256:digest(objectPayload),
        linkage_path:'Activity.part[Acquisition].transferred_title_of -> HumanMadeObject',
        rights_state:'ALLOW',
        license_evidence_refs:licenseRefs,
        provenance_refs:[activityUrl,objectUrl,'https://data.getty.edu/provenance/activity-stream'],
        event_payload:eventPayload,
        object_payload:objectPayload
      });
    }
  }
}
if(pairs.length!==240) throw new Error(`GETTY_LINKED_EVENT_OBJECT_PAIRS_NE_240:${pairs.length}`);
if(new Set(pairs.map(p=>p.pair_id)).size!==240||new Set(pairs.map(p=>`${p.event_source_reference}|${p.object_source_reference}`)).size!==240) throw new Error('PAIR_UNIQUENESS_REQUIRED');
if(pairs.some(p=>p.rights_state!=='ALLOW'||!/^sha256:[a-f0-9]{64}$/.test(p.event_payload_sha256)||!/^sha256:[a-f0-9]{64}$/.test(p.object_payload_sha256))) throw new Error('PAIR_EVIDENCE_INVALID');
const artifact={id:'kidults-er-provenance-source-corpus-r1',status:'REAL_SOURCE_LINKED_EVENT_OBJECT_CORPUS_UNLABELED',stratum_id:'er-stratum-provenance-unique-object',source_id:'getty-provenance-index-linked-open-data',acquired_at:new Date().toISOString(),pair_count:pairs.length,labels_present:false,model_predictions_present:false,reviewer_assignment_required:true,production:'HOLD',public_release:'HOLD',pairs};
await fs.writeFile(out,JSON.stringify(artifact,null,2));
console.log(JSON.stringify({id:artifact.id,pair_count:artifact.pair_count,status:artifact.status,labels_present:false,production:'HOLD'}));
