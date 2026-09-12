import assert from 'node:assert/strict';
import test from 'node:test';
import {approvedObjectPassportFixture} from '../../scripts/kidults/portal/proof-product-test-fixtures-v1.mjs';
import {authorizeProjection,toPortalView} from './projection-capability-v1.mjs';
import {objectIntelligenceModel} from './public/portal-r001/object-intelligence.js';
import {readPortalProjection} from './public/portal-r001/projection-store.js';

const secret='projection-capability-test-secret-with-at-least-32-bytes';
const now=new Date('2026-08-22T10:30:00Z');

function signedEnvelope(projection=approvedObjectPassportFixture()){
  const authorized=authorizeProjection({projection,surface:'PORTAL_RENDER',secret,now});
  return {
    projection,
    envelope:{
      ok:true,capability_expires_at:authorized.claims.expires_at,revalidate_after_ms:5000,
      consumption_receipt:authorized.admission.receipt,
      portal_view:toPortalView(projection,authorized.admission.receipt)
    }
  };
}

async function withFetchJson(value,run){
  const previous=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
  try{return await run()}finally{globalThis.fetch=previous}
}

test('signed same-origin envelope reaches browser store and Dossier action model without field loss',async()=>{
  const {projection,envelope}=signedEnvelope();
  const portal=await withFetchJson(envelope,()=>readPortalProjection());
  const model=objectIntelligenceModel(portal,{objectId:projection.payload.canonical_object_id});
  assert.equal(portal.projection.state,'LIVE_APPROVED');
  assert.equal(portal.objects[0].canonical_object_id,projection.payload.canonical_object_id);
  assert.deepEqual(model.actions.map(action=>[action.action_id,action.state,action.destination]),[
    ['COMPARE','ENABLED',projection.actions[0].destination],
    ['WATCHLIST','ENABLED',projection.actions[1].destination]
  ]);
  assert.ok(portal.evidence.length>0);
  assert.ok(portal.signals.length>0);
});

test('browser envelope rejects object identity rebound and unsafe action destination',async()=>{
  for(const mutate of [
    envelope=>{envelope.portal_view.objects[0].object_id='fixture:object:rebound'},
    envelope=>{envelope.portal_view.actions[0].destination='javascript:alert(1)';envelope.portal_view.objects[0].actions=envelope.portal_view.actions},
    envelope=>{envelope.portal_view.evidence.pop()}
  ]){
    const {envelope}=signedEnvelope();
    const candidate=structuredClone(envelope);
    mutate(candidate);
    const portal=await withFetchJson(candidate,()=>readPortalProjection());
    assert.equal(portal.projection.state,'INVALID');
    assert.equal(portal.objects.length,0);
    assert.equal(portal.actions.length,0);
  }
});

test('public-display-approved Object Passport remains consumable when unrelated API rights are partial',async()=>{
  const projection=approvedObjectPassportFixture();
  projection.rights.api_redistribution='UNKNOWN';
  projection.rights.state='PARTIAL';
  const {envelope}=signedEnvelope(projection);
  const portal=await withFetchJson(envelope,()=>readPortalProjection());
  assert.equal(portal.projection.state,'LIVE_APPROVED');
  assert.equal(portal.projection.rights_state,'PARTIAL');
  assert.equal(portal.objects[0].rights_state,'PARTIAL');
});

test('unsigned raw approved Projection remains rejected in the browser path',async()=>{
  const projection=approvedObjectPassportFixture();
  const portal=await withFetchJson(projection,()=>readPortalProjection());
  assert.equal(portal.projection.state,'INVALID');
  assert.equal(portal.audit.reason_category,'TRUSTED_CLOCK_REQUIRED');
  assert.equal(portal.objects.length,0);
  assert.equal(portal.actions.length,0);
});
