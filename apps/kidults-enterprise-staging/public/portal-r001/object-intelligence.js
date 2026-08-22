import {normalizeIntelligenceState} from './projection-store.js';

const query=(selector,root=document)=>root.querySelector(selector);
const write=(root,selector,value)=>{[...root.querySelectorAll(selector)].forEach(node=>{node.textContent=value})};
const clean=value=>value==null||value===''?'Not available':String(value);
const summarize=(values,fallback='Waiting')=>Array.isArray(values)&&values.length?values.map(clean).join(' · '):fallback;

export function renderObjectIntelligence(data,{root=document,objectId=null}={}){
  const projection=data?.projection||{};
  const state=normalizeIntelligenceState(projection.state);
  const objects=Array.isArray(data?.objects)?data.objects:[];
  const requestedId=objectId||new URLSearchParams(globalThis.location?.search||'').get('id');
  const object=state==='LIVE_APPROVED'?(requestedId?objects.find(item=>item.object_id===requestedId)||null:objects[0]||null):null;
  const localState=object?'LIVE_APPROVED':state==='LIVE_APPROVED'?'NOT_AVAILABLE':state;
  const stage=query('[data-object-state]',root);

  write(root,'[data-object-count]',state==='LIVE_APPROVED'?`${objects.length} APPROVED`:'WAITING');
  if(stage){
    stage.dataset.objectState=localState;
    stage.setAttribute('aria-label',object?`Governed object: ${clean(object.title)}`:'No governed object is available');
  }

  if(!object){
    write(root,'[data-object-title]','No governed object');
    write(root,'[data-object-id]',state==='LIVE_APPROVED'?'No approved object in Projection':state.replaceAll('_',' '));
    write(root,'[data-object-identity]','Waiting');
    write(root,'[data-object-market]','Waiting');
    write(root,'[data-object-comparables]','Waiting');
    write(root,'[data-object-evidence]','Waiting');
    write(root,'[data-object-rights]',state==='LIVE_APPROVED'?'Not available':clean(projection.rights_state||'Waiting'));
    write(root,'[data-object-limitations]','Visible');
    return {state,object:null};
  }

  const identity=[object.maker,object.model,object.year,...(Array.isArray(object.aliases)?object.aliases:[])].filter(Boolean);
  const evidence=[object.confidence&&`Confidence ${object.confidence}`,object.evidence_coverage&&`Coverage ${object.evidence_coverage}`,object.source_owner_independence&&`Independence ${object.source_owner_independence}`,Array.isArray(object.evidence_refs)&&`${object.evidence_refs.length} evidence refs`].filter(Boolean);
  write(root,'[data-object-title]',clean(object.title));
  write(root,'[data-object-id]',clean(object.object_id));
  write(root,'[data-object-identity]',summarize(identity,`ID ${clean(object.object_id)}`));
  write(root,'[data-object-market]',summarize(object.market_observations,'No observation promoted'));
  write(root,'[data-object-comparables]',summarize(object.comparables,'No comparable promoted'));
  write(root,'[data-object-evidence]',summarize(evidence,'Evidence attached'));
  write(root,'[data-object-rights]',clean(object.rights_state));
  write(root,'[data-object-limitations]',summarize(object.limitations,'No stated limitation'));
  return {state,object};
}
