import assert from 'node:assert/strict';
import test from 'node:test';
import {approvedObjectPassportFixture,approvedProjectionFixture} from '../../scripts/kidults/portal/proof-product-test-fixtures-v1.mjs';
import {authorizeProjection,issueProjectionCapability,projectionDigest,toPortalView,verifyProjectionCapability} from './projection-capability-v1.mjs';

const secret='projection-capability-test-secret-with-at-least-32-bytes';
const now=new Date('2026-08-22T10:30:00Z');

test('capability is signed, short lived, exact-projection and exact-surface bound',()=>{
  const projection=approvedProjectionFixture();
  const issued=issueProjectionCapability({projection,surface:'PORTAL_RENDER',secret,now,ttlSeconds:60});
  const claims=verifyProjectionCapability({token:issued.token,projection,surface:'PORTAL_RENDER',secret,now});
  assert.equal(claims.projection_digest,projectionDigest(projection));
  assert.throws(()=>verifyProjectionCapability({token:`${issued.token}x`,projection,surface:'PORTAL_RENDER',secret,now}),/SIGNATURE/);
  assert.throws(()=>verifyProjectionCapability({token:issued.token,projection,surface:'EXPORT',secret,now}),/SURFACE/);
  const replaced=structuredClone(projection);
  replaced.updated_at='2026-08-22T10:06:00Z';
  assert.throws(()=>verifyProjectionCapability({token:issued.token,projection:replaced,surface:'PORTAL_RENDER',secret,now}),/projection_digest/);
  assert.throws(()=>verifyProjectionCapability({token:issued.token,projection,surface:'PORTAL_RENDER',secret,now:new Date('2026-08-22T10:31:00Z')}),/EXPIRED/);
});

test('server authorization admits each rights-specific surface and rejects stale evidence',()=>{
  for(const surface of ['PORTAL_RENDER','PUBLIC_API_RESPONSE','EXPORT']){
    const result=authorizeProjection({projection:approvedProjectionFixture(),surface,secret,now});
    assert.equal(result.admission.accepted,true);
    assert.equal(result.admission.receipt.surface,surface);
    assert.equal(result.admission.receipt.payload_exposed,true);
  }
  const stale=approvedProjectionFixture();
  stale.freshness.valid_until='2026-08-22T10:30:00Z';
  assert.throws(()=>authorizeProjection({projection:stale,surface:'PORTAL_RENDER',secret,now}),/FRESHNESS_EXPIRED/);
});

test('approved Object Passport preserves canonical dossier, evidence, signals and governed actions',()=>{
  const projection=approvedObjectPassportFixture();
  const authorized=authorizeProjection({projection,surface:'PORTAL_RENDER',secret,now});
  const view=toPortalView(projection,authorized.admission.receipt);
  assert.equal(view.projection.product_type,'OBJECT_PASSPORT');
  assert.equal(view.projection.canonical_object_id,projection.payload.canonical_object_id);
  assert.equal(view.objects.length,1);
  assert.equal(view.objects[0].object_id,projection.payload.canonical_object_id);
  assert.deepEqual(view.actions.map(action=>[action.action_id,action.state,action.destination]),[
    ['COMPARE','ENABLED',projection.actions[0].destination],
    ['WATCHLIST','ENABLED',projection.actions[1].destination]
  ]);
  assert.deepEqual(view.objects[0].actions,view.actions);
  assert.ok(view.evidence.length>=projection.evidence_summary.evidence_references.length);
  assert.ok(view.signals.length>0&&view.signals.every(signal=>signal.canonical_object_id===projection.payload.canonical_object_id));
});

test('Object Passport action destinations fail closed before Portal release',()=>{
  const projection=approvedObjectPassportFixture();
  projection.actions[0].destination='https://attacker.invalid/compare';
  const authorized=authorizeProjection({projection,surface:'PORTAL_RENDER',secret,now});
  assert.throws(()=>toPortalView(projection,authorized.admission.receipt),/ACTION_DESTINATION_UNSAFE/);

  const duplicate=approvedObjectPassportFixture();
  duplicate.actions.push({...duplicate.actions[0]});
  const duplicateAuthorized=authorizeProjection({projection:duplicate,surface:'PORTAL_RENDER',secret,now});
  assert.throws(()=>toPortalView(duplicate,duplicateAuthorized.admission.receipt),/ACTION_ID_DUPLICATE/);
});
