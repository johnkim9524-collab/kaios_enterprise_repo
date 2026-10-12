import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {PILOT_PATH,verifyPinnedPilot,restorePilot} from '../../../scripts/kidults/source-intelligence/restore-preflight-pilot-v1.mjs';
const b=fs.readFileSync(PILOT_PATH);
test('exact historical pilot remains non-authorizing',()=>{const r=verifyPinnedPilot(b);assert.equal(r.original_artifact_id,9290027789);assert.equal(r.github_live_metadata_verified,false);assert.equal(r.original_run_binding_verified,false);assert.equal(r.runtime_authority_created,false);assert.equal(r.acquisition_authorized,false);});
for(const mutation of ['corrupt','truncate','append','authority'])test('reject '+mutation,()=>{let x=Buffer.from(b);if(mutation==='corrupt')x[100]^=1;if(mutation==='truncate')x=x.subarray(0,-1);if(mutation==='append')x=Buffer.concat([x,Buffer.from('\n')]);if(mutation==='authority')x=Buffer.from(x.toString().replace('"acquisition_authorized": false','"acquisition_authorized": true'));assert.throws(()=>verifyPinnedPilot(x),/EXACT_BYTES_MISMATCH/);});
test('fixed pilot restoration requires no artifact API or credential',()=>{const s=fs.readFileSync('.github/workflows/kidults-asi-v2-1-preflight-gap-compiler.yml','utf8');assert.ok(s.includes('restore-preflight-pilot-v1.mjs'));assert.ok(!s.includes('actions/artifacts/9290027789'));});
test('real Git-bound restoration rejects drift and symlinks without overwriting output',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pilot-retention-')),p=path.join(root,PILOT_PATH),output=path.join(root,'output.json');
 const git=(...args)=>execFileSync('git',['-C',root,...args],{stdio:'pipe'});
 try{
  fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,b);git('init');git('add',PILOT_PATH);git('-c','user.name=fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture');
  assert.equal(restorePilot({root,output}).runtime_authority_created,false);assert.deepEqual(fs.readFileSync(output),b);
  fs.writeFileSync(p,Buffer.concat([b,Buffer.from('\n')]));assert.throws(()=>restorePilot({root,output}),/EXACT_BYTES/);assert.deepEqual(fs.readFileSync(output),b);
  fs.unlinkSync(p);fs.symlinkSync(output,p);assert.throws(()=>restorePilot({root,output}),/REGULAR_FILE/);assert.deepEqual(fs.readFileSync(output),b);
  fs.unlinkSync(p);fs.writeFileSync(p,b);const parent=path.dirname(p),moved=parent+'-moved';fs.renameSync(parent,moved);fs.symlinkSync(moved,parent);assert.throws(()=>restorePilot({root,output}),/REGULAR_FILE/);fs.unlinkSync(parent);fs.renameSync(moved,parent);
  git('update-index','--chmod=+x',PILOT_PATH);git('-c','user.name=fixture','-c','user.email=fixture@example.invalid','commit','-m','bad-mode');assert.throws(()=>restorePilot({root,output}),/COMMITTED_REGULAR_FILE/);assert.deepEqual(fs.readFileSync(output),b);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
