import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {readPortalProjection} from '../../../apps/kidults-enterprise-staging/public/portal-r001/projection-store.js';
import {authorizeProjection,toPortalView} from '../../../apps/kidults-enterprise-staging/projection-capability-v1.mjs';
import {approvedObjectPassportFixture} from '../../../scripts/kidults/portal/proof-product-test-fixtures-v1.mjs';

const CONTROL={
  record_type:'kidults_non_promotable_control_projection',
  schema_version:'1.0.0',
  fixture_type:'NON_PROMOTABLE_CONTROL',
  release:{state:'HOLD'},
  projection:{state:'NO_PROJECTION',synthetic:true,promotable:false,production:false,public:false}
};

const response=(body,status=200)=>({
  ok:status>=200&&status<300,
  status,
  json:async()=>body
});

async function withFetch(fetchImpl,test){
  const previous=globalThis.fetch;
  globalThis.fetch=fetchImpl;
  try{await test()}
  finally{globalThis.fetch=previous}
}

await withFetch(async url=>{
  assert.equal(url,'/api/v1/projection');
  return response({record_type:'unknown',schema_version:'1.0.0'});
},async()=>{
  const result=await readPortalProjection();
  assert.equal(result.projection.state,'INVALID');
  assert.equal(result.source,'PRIMARY_INVALID');
  assert.equal(result.audit.reason_category,'PROJECTION_RECORD_TYPE_INVALID');
});

await withFetch(async url=>{
  assert.equal(url,'/api/v1/projection');
  return {ok:true,status:200,json:async()=>{throw new SyntaxError('bad json')}};
},async()=>{
  const result=await readPortalProjection();
  assert.equal(result.projection.state,'INVALID');
  assert.equal(result.source,'PRIMARY_INVALID');
  assert.equal(result.audit.reason_category,'PROJECTION_JSON_INVALID');
});

await withFetch(async url=>{
  if(url==='/api/v1/projection')return response({ok:false},409);
  throw new Error(`unexpected fallback ${url}`);
},async()=>{
  const result=await readPortalProjection();
  assert.equal(result.projection.state,'INVALID');
  assert.equal(result.source,'PRIMARY_INVALID');
  assert.equal(result.audit.reason_category,'HTTP_409');
});

const calls=[];
await withFetch(async url=>{
  calls.push(url);
  if(url==='/api/v1/projection')throw new TypeError('network unavailable');
  if(url==='./data/projection-control-fixture.json')return response(CONTROL);
  throw new Error(`unexpected ${url}`);
},async()=>{
  const result=await readPortalProjection();
  assert.equal(result.projection.state,'NO_PROJECTION');
  assert.equal(result.fixture_type,'NON_PROMOTABLE_CONTROL');
  assert.deepEqual(calls,['/api/v1/projection','./data/projection-control-fixture.json']);
});

await withFetch(async()=>{
  const error=new Error('aborted');
  error.name='AbortError';
  throw error;
},async()=>{
  await assert.rejects(()=>readPortalProjection(),error=>error?.name==='AbortError');
});

const signedProjection=approvedObjectPassportFixture();
const signedAuthorization=authorizeProjection({
  projection:signedProjection,
  surface:'PORTAL_RENDER',
  secret:'portal-fallback-contract-secret-at-least-32-bytes',
  now:new Date('2026-08-22T10:30:00Z')
});
const signedEnvelope={
  ok:true,
  capability_expires_at:signedAuthorization.claims.expires_at,
  revalidate_after_ms:5000,
  portal_view:toPortalView(signedProjection,signedAuthorization.admission.receipt),
  consumption_receipt:signedAuthorization.admission.receipt
};
await withFetch(async url=>{
  assert.equal(url,'/api/v1/projection');
  return response(signedEnvelope);
},async()=>{
  const result=await readPortalProjection();
  assert.equal(result.projection.state,'LIVE_APPROVED');
  assert.equal(result.source,'SIGNED_SERVER_CAPABILITY');
  assert.equal(result.objects.length,1,'exact signed Object Passport must remain consumable');
  assert.equal(result.objects[0].canonical_object_id,signedProjection.payload.canonical_object_id);
  assert.deepEqual(result.objects[0].actions,result.actions,'object actions must retain exact signed binding');
});

const objectSource=await readFile(new URL('../../../apps/kidults-enterprise-staging/public/portal-r001/object-intelligence.js',import.meta.url),'utf8');
assert.match(objectSource,/state==='LIVE_APPROVED'&&objects\.length>0\?`\$\{objects\.length\} APPROVED`:'WAITING'/);

const appStore=await readFile(new URL('../../../apps/kidults-enterprise-staging/public/portal-r001/projection-store.js',import.meta.url),'utf8');
const repositoryRoot=fileURLToPath(new URL('../../../',import.meta.url));
const blob=path=>execFileSync('git',['-C',repositoryRoot,'rev-parse',`HEAD:${path}`],{encoding:'utf8'}).trim();
assert.equal(
  blob('scripts/kidults/portal/runtime/projection-store.js'),
  blob('apps/kidults-enterprise-staging/public/portal-r001/projection-store.js'),
  'committed runtime projection-store copies must remain byte-identical'
);
assert.match(appStore,/signed_capability_object_publication:'EXACT_OBJECT_AND_ACTION_BINDING_REQUIRED'/);

const portalSource=await readFile(new URL('../../../apps/kidults-enterprise-staging/public/portal-r001/portal-release-001.js',import.meta.url),'utf8');
const syncGate=portalSource.indexOf("gateWorkspace({projection:{state:'NO_PROJECTION'},actions:[]});");
const firstRead=portalSource.lastIndexOf('refreshProjection(true);');
assert.ok(syncGate>0&&syncGate<firstRead,'workspace must be blocked synchronously before the first async Projection read');
assert.match(portalSource,/updateControlFixtureMarker\(data\.fixture_type==='NON_PROMOTABLE_CONTROL'\)/);
assert.match(portalSource,/renderFailure\(\)[\s\S]*updateControlFixtureMarker\(false\);/);
assert.match(portalSource,/delete bar\.dataset\.fixture;/);

console.log('PORTAL_PROJECTION_FALLBACK_CONTRACT_PASS');
