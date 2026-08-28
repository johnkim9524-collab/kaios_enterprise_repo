import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readPortalProjection} from '../../../apps/kidults-enterprise-staging/public/portal-r001/projection-store.js';

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

const signedEnvelope={
  ok:true,
  capability_expires_at:1787905000000,
  revalidate_after_ms:5000,
  portal_view:{
    source:'SIGNED_SERVER_CAPABILITY',
    projection:{state:'LIVE_APPROVED',projection_id:'projection-qa',assessment_id:'assessment-qa'},
    release:{state:'READY'},
    objects:[{object_id:'object-secret',title:'Quarantined object'}],
    overview:[{label:'Allowed signed field',value:'visible'}]
  },
  consumption_receipt:{
    decision:'ACCEPTED',surface:'PORTAL_RENDER',purpose:'PUBLIC_DISPLAY',
    release_authority:'SIGNED_SERVER_CAPABILITY',clock_authority:'KIDULTS_CONTROL_PLANE',
    capability_digest:'a'.repeat(64),payload_exposed:true,
    projection_id:'projection-qa',assessment_id:'assessment-qa',
    rights_state:'CLEARED',freshness_state:'CURRENT',
    production:'HOLD',public:'HOLD',g5:'HOLD'
  }
};
await withFetch(async url=>{
  assert.equal(url,'/api/v1/projection');
  return response(signedEnvelope);
},async()=>{
  const result=await readPortalProjection();
  assert.equal(result.projection.state,'LIVE_APPROVED');
  assert.equal(result.source,'SIGNED_SERVER_CAPABILITY');
  assert.deepEqual(result.objects,[],'signed Portal capability must not publish object identity/count without independent authority');
  assert.equal(result.overview[0].value,'visible','non-object signed fields must remain available');
});

const objectSource=await readFile(new URL('../../../apps/kidults-enterprise-staging/public/portal-r001/object-intelligence.js',import.meta.url),'utf8');
assert.match(objectSource,/state==='LIVE_APPROVED'&&objects\.length>0\?`\$\{objects\.length\} APPROVED`:'WAITING'/);

const appStore=await readFile(new URL('../../../apps/kidults-enterprise-staging/public/portal-r001/projection-store.js',import.meta.url),'utf8');
const runtimeStore=await readFile(new URL('../../../scripts/kidults/portal/runtime/projection-store.js',import.meta.url),'utf8');
assert.equal(runtimeStore,appStore,'runtime projection-store copies must remain byte-identical');
assert.match(appStore,/signed_capability_object_publication:'QUARANTINED_UNTIL_INDEPENDENT_AUTHORITY'/);

const portalSource=await readFile(new URL('../../../apps/kidults-enterprise-staging/public/portal-r001/portal-release-001.js',import.meta.url),'utf8');
const syncGate=portalSource.indexOf("gateWorkspace('NO_PROJECTION');");
const firstRead=portalSource.lastIndexOf('refreshProjection(true);');
assert.ok(syncGate>0&&syncGate<firstRead,'workspace must be blocked synchronously before the first async Projection read');
assert.match(portalSource,/updateControlFixtureMarker\(data\.fixture_type==='NON_PROMOTABLE_CONTROL'\)/);
assert.match(portalSource,/renderFailure\(\)[\s\S]*updateControlFixtureMarker\(false\);/);
assert.match(portalSource,/delete bar\.dataset\.fixture;/);

console.log('PORTAL_PROJECTION_FALLBACK_CONTRACT_PASS');
