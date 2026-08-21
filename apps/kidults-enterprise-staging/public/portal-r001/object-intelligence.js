import {readPortalProjection,normalizeIntelligenceState} from './projection-store.js';
const $=(s,r=document)=>r.querySelector(s);
const safe=value=>value==null||value===''?'Not available':String(value);
const list=(items=[])=>items.length?`<ul>${items.map(x=>`<li>${safe(x)}</li>`).join('')}</ul>`:'<p>Not available from the governed Projection.</p>';

function renderBlocked(data){
  const p=data.projection||{},state=normalizeIntelligenceState(p.state);
  document.documentElement.dataset.state=state;
  $('[data-projection-state]').textContent=state;
  $('[data-assessment]').textContent=p.assessment_id||'Not started';
  $('[data-rights]').textContent=p.rights_state||'Waiting';
  $('[data-release-state]').textContent=data.release?.state||'HOLD';
  $('[data-object-state]').innerHTML=`<div><p class="eyebrow">${state.replaceAll('_',' ')}</p><h2>Object intelligence is fail-closed.</h2><p>No identity, market observation, comparable or confidence claim is promoted without an admissible governed Projection.</p></div>`;
  ['identity','market','comparables','evidence','rights','limitations'].forEach(k=>$(`[data-object-${k}]`).innerHTML='<p>Waiting for an admissible governed Projection.</p>');
}

function renderObject(data,object){
  const p=data.projection||{};document.documentElement.dataset.state='LIVE_APPROVED';
  $('[data-projection-state]').textContent='LIVE_APPROVED';$('[data-assessment]').textContent=p.assessment_id||'Not available';$('[data-rights]').textContent=p.rights_state||'Not available';$('[data-release-state]').textContent=data.release?.state||'HOLD';
  $('[data-object-id]').textContent=safe(object.object_id);$('[data-object-title]').textContent=safe(object.title);
  $('[data-object-state]').innerHTML=`<div><p class="eyebrow">GOVERNED OBJECT</p><h2>${safe(object.title)}</h2><p>As of ${safe(p.as_of)} · Projection ${safe(p.projection_id)}</p></div>`;
  $('[data-object-identity]').innerHTML=list([`Object ID: ${safe(object.object_id)}`,...(object.aliases||[])]);
  $('[data-object-market]').innerHTML=list(object.market_observations||[]);
  $('[data-object-comparables]').innerHTML=list(object.comparables||[]);
  $('[data-object-evidence]').innerHTML=list([`Confidence: ${safe(object.confidence)}`,`Evidence coverage: ${safe(object.evidence_coverage)}`,`Source-owner independence: ${safe(object.source_owner_independence)}`]);
  $('[data-object-rights]').innerHTML=list([`Freshness: ${safe(p.freshness)}`,`Rights: ${safe(p.rights_state)}`]);
  $('[data-object-limitations]').innerHTML=list(object.limitations||[]);
}

const data=await readPortalProjection();
const state=normalizeIntelligenceState(data.projection?.state);
const objectId=new URLSearchParams(location.search).get('id');
const object=(data.objects||[]).find(x=>x.object_id===objectId);
if(state!=='LIVE_APPROVED'||!object)renderBlocked(data);else renderObject(data,object);
