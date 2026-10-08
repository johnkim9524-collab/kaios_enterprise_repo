import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

test('private store proof preserves supplied parent and isolates repeated executions',async()=>{
  const parent=await fs.mkdtemp(path.join(os.tmpdir(),'private-store-test-'));
  try{
    await fs.writeFile(path.join(parent,'existing.txt'),'preserve');
    for(let i=0;i<2;i++){
      const r=JSON.parse(execFileSync(process.execPath,['scripts/kidults/source-intelligence/prove-private-market-store-r1.mjs',parent],{encoding:'utf8'}));
      assert.equal(r.ttl_delete,'PASS');assert.equal(r.opaque_receipt_hmac_verify,'PASS');
      assert.equal(r.private_provider_runtime_verified,false);assert.equal(r.provider_payloads_used,0);
    }
    assert.equal(await fs.readFile(path.join(parent,'existing.txt'),'utf8'),'preserve');
    const dirs=(await fs.readdir(parent)).filter(n=>n.startsWith('kidults-private-market-store-r1-'));
    assert.equal(dirs.length,2);
    for(const dir of dirs){
      assert.equal((await fs.stat(path.join(parent,dir))).mode&0o777,0o700);
      await assert.rejects(fs.stat(path.join(parent,dir,'private-object.enc.json')),e=>e.code==='ENOENT');
    }
  }finally{await fs.rm(parent,{recursive:true,force:true});}
});
