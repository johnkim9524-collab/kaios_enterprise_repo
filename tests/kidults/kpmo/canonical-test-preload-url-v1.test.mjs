import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonicalPreloadUrl} from './canonical-test-preload-url-v1.mjs';

test('Windows drive paths with spaces and Unicode become canonical file URLs',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'preload 경로 '));
  try{const preload=path.join(dir,'fixture 한글.mjs');fs.writeFileSync(preload,'export {};');assert.equal(canonicalPreloadUrl(preload,{windows:true}),pathToFileURL(preload,{windows:true}).href);}
  finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('POSIX paths use the same deterministic pathToFileURL conversion',()=>assert.equal(canonicalPreloadUrl('/tmp/fixture path/한글.mjs',{windows:false,mustExist:false}),'file:///tmp/fixture%20path/%ED%95%9C%EA%B8%80.mjs'));
test('an existing valid file URL is accepted and canonicalized',()=>{const url=pathToFileURL(import.meta.filename);assert.equal(canonicalPreloadUrl(url.href),url.href);});
for(const [name,value,code] of [['missing preload',undefined,'PRELOAD_PATH_REQUIRED'],['empty preload','', 'PRELOAD_PATH_REQUIRED'],['relative path','fixture.mjs','PRELOAD_PATH_NOT_ABSOLUTE'],['unsupported scheme','https://example.com/fixture.mjs','PRELOAD_URL_SCHEME_INVALID'],['malformed file URL','file:///%ZZ','PRELOAD_FILE_URL_INVALID']])test(`${name} fails closed`,()=>assert.throws(()=>canonicalPreloadUrl(value),new RegExp(code)));
test('a nonexistent absolute preload fails before Node child startup',()=>{const missing=path.join(os.tmpdir(),'canonical-preload-missing','fixture.mjs');assert.throws(()=>canonicalPreloadUrl(missing),/PRELOAD_FILE_MISSING/);});
