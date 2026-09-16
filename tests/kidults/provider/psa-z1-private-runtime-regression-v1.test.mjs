/** Offline regressions only. Synthetic network/rights/account fixtures, real crypto and temporary files.
 * No PSA request, real credential, protected environment, bootstrap, or activation is exercised.
 * Run with: node --experimental-vm-modules --test <this-file>
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as store from '../../../services/kidults-control-plane/src/psa-private-evaluation-store.mjs';
import * as evaluation from '../../../services/kidults-control-plane/src/psa-private-evaluation.mjs';

const fixtureCert = '00001234'; // Synthetic key; never transmitted to a real provider.
const fixtureToken = 'FIXTURE_ONLY_NO_REAL_TOKEN';
const sourcePath = process.env.KIR_TEST_TARGET_SOURCE || fileURLToPath(new URL('../../../scripts/kidults/provider/run-psa-z1-private-runtime-v1.mjs', import.meta.url));
const source = await fs.readFile(sourcePath, 'utf8');
const payload = () => ({ PSACert: { CertNumber: fixtureCert, Subject: 'SYNTHETIC_ONLY', TotalPopulation: 0 } });
const fieldMap = () => ({ provider_id:'psa-public-api',state:'APPROVED_FOR_BOUNDED_PRIVATE_EVALUATION',
  observed_schema_digest:`sha256:${'a'.repeat(64)}`,field_map_id:'OFFLINE_FIXTURE_NOT_AUTHORITY',
  mappings:[{source_path:'PSACert.CertNumber',canonical_field:'certification_number',required:true},
    {source_path:'PSACert.Subject',canonical_field:'subject',required:false},
    {source_path:'PSACert.TotalPopulation',canonical_field:'population_total',required:false}] });
const policy = () => ({ fixture_only:true,blocked:{public_display_raw:true,redistribution_raw:true},
  source_evidence:{acquisition_120_case_right:'CONFIRMED_FOR_BOUNDED_KNOWN_CERT_INTERNAL_EVALUATION_SUBJECT_TO_100_CALLS_PER_DAY_AND_NO_ENUMERATION'} });

async function runFixture(options={}) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'psa-z1-offline-'));
  const workspace=path.join(dir,'workspace'),runnerTemp=path.join(dir,'runner-temp');
  const dataPath=path.join(workspace,'coordination/kidults/provider');
  await fs.mkdir(dataPath,{recursive:true});await fs.mkdir(runnerTemp);
  await fs.writeFile(path.join(dataPath,'psa-120-field-map-v1.json'),JSON.stringify(options.fieldMap || fieldMap()));
  await fs.writeFile(path.join(dataPath,'psa-cert-verification-connection-policy-v1.json'),JSON.stringify(options.policy || policy()));
  const env={PSA_PRIVATE_RUNTIME_MODE:'EPHEMERAL_ENCRYPTED_IMMEDIATE_DELETE',GITHUB_ACTIONS:'true',
    GITHUB_REF:'refs/heads/main',GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'900000000001',
    GITHUB_WORKSPACE:workspace,RUNNER_TEMP:options.overlap ? workspace : runnerTemp,
    PSA_PUBLIC_API_TOKEN:fixtureToken,PSA_Z1_CERT_NUMBER:fixtureCert,...(options.env || {})};
  const requests=[],keys=[],encryptedWrites=[];
  let fileReads=0,logged='',error=null;
  const fsFacade={...fs,
    async readFile(file,...args){if(String(file).endsWith('z1-private-record.json')) fileReads++;return fs.readFile(file,...args);},
    async writeFile(file,bytes,flags){
      if(String(file).endsWith('z1-private-record.json')){
        encryptedWrites.push(String(bytes));
        await fs.writeFile(file,bytes,flags);
        if(options.corruptFile)await fs.writeFile(file,'{"corrupt":true}\n');
        if(options.removeFile)await fs.unlink(file);
        return;
      }
      return fs.writeFile(file,bytes,flags);
    },
    async unlink(file){if(options.deleteFailure && String(file).endsWith('z1-private-record.json'))throw new Error('FIXTURE_DELETE_FAILURE');return fs.unlink(file);},
  };
  const cryptoFacade={...crypto,randomBytes(size){const b=crypto.randomBytes(size);if(size===32)keys.push(b);return b;}};
  const ctx=vm.createContext({Buffer,Uint8Array,TextDecoder,AbortController,Date,URL,
    setTimeout:options.fastTimeout ? ((fn,_ms)=>setTimeout(fn,1)) : setTimeout,clearTimeout,
    process:{env,stdout:{write(value){logged+=String(value);}}},
    console:{log(...a){logged+=a.join(' ');},error(...a){logged+=a.join(' ');}},
    fetch:async (url,config)=>{
      requests.push({url:String(url),method:config.method,redirect:config.redirect});
      // Absolute isolation: this function never delegates to global fetch.
      if(options.fetchError)throw new Error(options.fetchError);
      if(options.fastTimeout)return new Promise((resolve,reject)=>config.signal.addEventListener('abort',()=>reject(new Error('fixture abort')),{once:true}));
      if(options.responseFactory)return options.responseFactory();
      const raw=options.raw!==undefined ? options.raw : JSON.stringify(options.payload || payload());
      const response=new Response(raw,{status:options.status || 200,headers:options.headers || {}});
      if(options.redirected)Object.defineProperty(response,'redirected',{value:true});
      return response;
    }});
  const imports={'node:crypto':cryptoFacade,'node:fs/promises':fsFacade,'node:path':path,
    '../../../services/kidults-control-plane/src/psa-private-evaluation-store.mjs':store,
    '../../../services/kidults-control-plane/src/psa-private-evaluation.mjs':evaluation};
  try{
    const module=new vm.SourceTextModule(source,{context:ctx,identifier:sourcePath});
    await module.link(specifier=>{
      const values=imports[specifier];assert.ok(values,`Unapproved fixture import: ${specifier}`);
      return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v);},{context:ctx});
    });
    try{await module.evaluate({timeout:2000});}catch(e){error=String(e.message);}
    let receipt=null;try{receipt=JSON.parse(await fs.readFile(path.join(runnerTemp,'psa-z1-private-runtime-receipt.json'),'utf8'));}catch{}
    const residual=(await fs.readdir(runnerTemp)).filter(n=>n.startsWith('kidults-psa-z1-'));
    return {error,receipt,requests,keysZeroed:keys.every(b=>b.every(x=>x===0)),fileReads,encryptedWrites,residual,logged};
  }finally{await fs.rm(dir,{recursive:true,force:true});}
}
function expectClosed(result,code,calls=1){
  assert.ok(result.error?.includes(code),`Expected ${code}; received ${result.error}`);
  assert.equal(result.receipt,null);assert.equal(result.requests.length,calls);
  assert.equal(result.keysZeroed,true);assert.deepEqual(result.residual,[]);
  assert.ok(!result.logged.includes(fixtureToken));assert.ok(!result.logged.includes(fixtureCert));
}

test('one synthetic response: real AES/file/readback/normalization/deletion; no public admission',async()=>{
  const r=await runFixture();assert.equal(r.error,null);assert.equal(r.requests.length,1);
  assert.equal(r.fileReads,1);assert.equal(r.requests[0].redirect,'error');
  assert.equal(r.receipt.private_record_readback_verified,true);assert.equal(r.receipt.response_cert_binding_verified,true);
  assert.equal(r.receipt.private_record_deleted,true);assert.equal(r.receipt.deletion_verified,true);
  assert.equal(r.receipt.acquisition_120_increment,0);assert.equal(r.receipt.product_pipeline_admission_increment,0);
  assert.equal(r.receipt.production,'HOLD');assert.equal(r.receipt.public,'HOLD');
  assert.equal(r.receipt.g5,'EXPLICIT_APPROVAL_REQUIRED');assert.equal(r.keysZeroed,true);assert.deepEqual(r.residual,[]);
  assert.equal(r.encryptedWrites.length,1);
  assert.ok(!r.encryptedWrites[0].includes('SYNTHETIC_ONLY'));assert.ok(!r.encryptedWrites[0].includes(fixtureCert));
  assert.ok(!JSON.stringify(r.receipt).includes(fixtureCert));assert.ok(!JSON.stringify(r.receipt).includes(fixtureToken));
});
test('corrupted persisted file must not become PASS from in-memory decrypt',async()=>expectClosed(await runFixture({corruptFile:true}),'PSA_Z1_PRIVATE_READBACK_MISMATCH'));
test('missing persisted file must fail readback and clean up',async()=>expectClosed(await runFixture({removeFile:true}),'ENOENT'));
test('valid HTTP with another cert is not valid evidence',async()=>expectClosed(await runFixture({payload:{PSACert:{CertNumber:'99991234',Subject:'SYNTHETIC_ONLY'}}}),'PSA_Z1_RESPONSE_CERT_MISMATCH'));
for(const [label,value] of [['missing',undefined],['null',null],['number',1234],['array',[fixtureCert]],['leading-zero-loss','1234']]){
  test(`response cert ${label} must fail exact identity`,async()=>expectClosed(await runFixture({payload:{PSACert:{CertNumber:value}}}),'PSA_Z1_RESPONSE_CERT_MISMATCH'));
}
for(const status of [301,302,401,403,429,500])test(`HTTP ${status}: no retry and no PASS`,async()=>expectClosed(await runFixture({status,raw:'SYNTHETIC_ERROR_BODY'}),`PSA_Z1_HTTP_REJECTED:${status}`));
test('redirected response is rejected even with HTTP 200',async()=>expectClosed(await runFixture({redirected:true}),'PSA_Z1_REDIRECT_FORBIDDEN'));
test('transport error is sanitized',async()=>{
  const r=await runFixture({fetchError:`unsafe ${fixtureToken} ${fixtureCert}`});expectClosed(r,'PSA_Z1_TRANSPORT_FAILED');
  assert.ok(!r.error.includes(fixtureToken));assert.ok(!r.error.includes(fixtureCert));
});
test('timeout remains one attempt',async()=>expectClosed(await runFixture({fastTimeout:true}),'PSA_Z1_TIMEOUT'));
test('advertised body over bound rejected',async()=>expectClosed(await runFixture({headers:{'content-length':'1048577'}}),'PSA_Z1_RESPONSE_SIZE_LIMIT'));
test('negative advertised length rejected',async()=>expectClosed(await runFixture({headers:{'content-length':'-1'}}),'PSA_Z1_RESPONSE_SIZE_LIMIT'));
test('chunked body over bound rejected without relying on content-length',async()=>expectClosed(await runFixture({raw:'x'.repeat(1048577)}),'PSA_Z1_RESPONSE_SIZE_LIMIT'));
test('non-compressed body length mismatch rejected',async()=>expectClosed(await runFixture({headers:{'content-length':'1'}}),'PSA_Z1_RESPONSE_LENGTH_MISMATCH'));
test('compressed length is not compared with decoded stream length',async()=>{const r=await runFixture({headers:{'content-length':'2','content-encoding':'gzip'}});assert.equal(r.error,null);});
test('invalid JSON stays failed',async()=>expectClosed(await runFixture({raw:'{bad'}),'PSA_Z1_INVALID_JSON'));
test('invalid UTF-8 cannot produce evidence',async()=>expectClosed(await runFixture({raw:new Uint8Array([0xff,0xfe])}),'PSA_Z1_INVALID_JSON'));
test('empty response body rejected',async()=>expectClosed(await runFixture({responseFactory:()=>new Response(null,{status:200})}),'PSA_Z1_RESPONSE_BODY_REQUIRED'));
test('stream read error is sanitized',async()=>expectClosed(await runFixture({responseFactory:()=>new Response(new ReadableStream({start(c){c.error(new Error(fixtureToken));}}))}),'PSA_Z1_RESPONSE_READ_FAILED'));
test('unexpected provider field remains fail-closed via unchanged store',async()=>expectClosed(await runFixture({payload:{PSACert:{CertNumber:fixtureCert,ImageUrl:'SYNTHETIC_IMAGE'}}}),'PSA_PAYLOAD_FIELD_NOT_ALLOWED'));
test('private file deletion failure cannot report PASS',async()=>expectClosed(await runFixture({deleteFailure:true}),'FIXTURE_DELETE_FAILURE'));
test('unapproved field map remains rejected',async()=>expectClosed(await runFixture({fieldMap:{...fieldMap(),state:'HOLD'}}),'PSA_EXACT_FIELD_MAP_NOT_APPROVED'));
test('repository/private directory overlap rejected before network',async()=>expectClosed(await runFixture({overlap:true}),'PSA_RUNNER_TEMP_OVERLAPS_REPOSITORY',0));
for(const [name,value,code]of [
 ['PSA_PUBLIC_API_TOKEN','','PSA_PUBLIC_API_TOKEN_REQUIRED'],
 ['PSA_Z1_CERT_NUMBER','','PSA_Z1_CERT_NUMBER_REQUIRED'],
 ['GITHUB_ACTIONS','false','PSA_GOVERNED_ACTIONS_RUNTIME_REQUIRED'],
 ['GITHUB_REF','refs/heads/test','PSA_MAIN_REF_REQUIRED'],
 ['GITHUB_SHA','invalid','PSA_MAIN_SHA_REQUIRED'],
 ['PSA_PRIVATE_RUNTIME_MODE','OTHER','PSA_PRIVATE_RUNTIME_MODE_INVALID'],
])test(`${name} gate preserved`,async()=>expectClosed(await runFixture({env:{[name]:value}}),code,0));
test('public boundary policy invalid: no synthetic request issued',async()=>expectClosed(await runFixture({policy:{...policy(),blocked:{public_display_raw:false,redistribution_raw:true}}}),'PSA_PRIVATE_BOUNDARY_POLICY_INVALID',0));
test('no bounded rights binding: no synthetic request issued',async()=>expectClosed(await runFixture({policy:{...policy(),source_evidence:{}}}),'PSA_BOUNDED_EVALUATION_RIGHT_NOT_BOUND',0));
