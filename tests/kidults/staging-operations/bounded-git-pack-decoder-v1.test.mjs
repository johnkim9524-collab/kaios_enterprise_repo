import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {decodeBoundedGitPack} from '../../../scripts/kidults/kpmo/lib/bounded-git-pack-decoder-v1.mjs';
import {gitObjectId,createBoundedGitSourceReader} from '../../../scripts/kidults/kpmo/lib/bounded-git-source-reader-v1.mjs';
const finish=body=>Buffer.concat([body,createHash('sha1').update(body).digest()]);
function entry(type,data,base=Buffer.alloc(0)){
  let size=data.length,first=(type<<4)|(size&15);size=Math.floor(size/16);const bytes=[];
  if(size)first|=128;bytes.push(first);while(size){let b=size&127;size=Math.floor(size/128);if(size)b|=128;bytes.push(b);}
  return Buffer.concat([Buffer.from(bytes),base,deflateSync(data)]);
}
const pack=entries=>{const header=Buffer.alloc(12);header.write('PACK');header.writeUInt32BE(2,4);header.writeUInt32BE(entries.length,8);return finish(Buffer.concat([header,...entries]));};
const blob=Buffer.from('abc\n'),target=Buffer.from('abcXYZ\n'),delta=Buffer.from([4,7,0x90,3,3,88,89,90,0x91,3,1]);
for(const type of [6,7])test(`Git delta type ${type} reconstructs the exact hash-bound object`,async()=>{
  const first=entry(3,blob),base=type===6?Buffer.from([first.length]):Buffer.from(gitObjectId('blob',blob),'hex');
  const decoded=decodeBoundedGitPack(pack([first,entry(type,delta,base)]));
  assert.equal((await decoded.readObject(gitObjectId('blob',target))).bytes.toString(),target.toString());
  const value=await decoded.readObject(gitObjectId('blob',blob));value.bytes.fill(0);
  assert.equal((await decoded.readObject(gitObjectId('blob',blob))).bytes.toString(),blob.toString());
  assert.equal(decoded.receipt().transport_verified,false);assert.equal(decoded.receipt().authorization_created,false);
});
test('commit tree blob pack supplies the same immutable source reader bytes',async()=>{
  const tree=Buffer.concat([Buffer.from('100644 file.mjs\0'),Buffer.from(gitObjectId('blob',blob),'hex')]);
  const commit=Buffer.from(`tree ${gitObjectId('tree',tree)}\nauthor test <test@example.invalid> 0 +0000\ncommitter test <test@example.invalid> 0 +0000\n\ntest\n`);
  const producer=decodeBoundedGitPack(pack([entry(1,commit),entry(2,tree),entry(3,blob)])),sha=gitObjectId('commit',commit);
  const reader=createBoundedGitSourceReader({sourceShas:[sha],readObject:producer.readObject});
  assert.equal((await reader.file(sha,'file.mjs')).content,blob.toString());reader.seal();
});
test('forward ref delta resolves without fetching an external base',async()=>{
  const decoded=decodeBoundedGitPack(pack([entry(7,delta,Buffer.from(gitObjectId('blob',blob),'hex')),entry(3,blob)]));
  assert.equal((await decoded.readObject(gitObjectId('blob',target))).bytes.toString(),target.toString());
});
test('thin or cyclic unresolved delta fails globally',()=>assert.throws(()=>decodeBoundedGitPack(pack([entry(7,delta,Buffer.alloc(20))])),/EXTERNAL_OR_CYCLIC_DELTA/));
test('pack corruption is rejected before inflating objects',()=>{const p=pack([entry(3,blob)]);p[15]^=1;assert.throws(()=>decodeBoundedGitPack(p),/DIGEST_MISMATCH/);});
test('duplicate objects cannot hide pack object cost',()=>assert.throws(()=>decodeBoundedGitPack(pack([entry(3,blob),entry(3,blob)])),/DUPLICATE_OBJECT/));
for(const [limits,code] of [[{packBytes:1},'PACK_BYTE'],[{objects:1},'OBJECT_BUDGET'],[{objectBytes:1},'INFLATE_BUDGET'],[{inflatedBytes:1},'INFLATE_BUDGET'],[{bytes:1},'OBJECT_BYTES']])test(`hard bound ${code} is checked before returning a producer`,()=>assert.throws(()=>decodeBoundedGitPack(pack([entry(3,blob),entry(3,target)]),{limits}),new RegExp(code)));
test('limit expansion and unknown fields cannot widen decoder authority',()=>{
  const p=pack([entry(3,blob)]);for(const limits of [{bytes:128*1024*1024+1},{retries:1}])assert.throws(()=>decodeBoundedGitPack(p,{limits}),/CONFIGURATION_INVALID/);
});
test('invalid or reversing clock cannot remove time limit',()=>{
  const p=pack([entry(3,blob)]);assert.throws(()=>decodeBoundedGitPack(p,{clock:()=>NaN}),/CONFIGURATION_INVALID/);
  let count=0;assert.throws(()=>decodeBoundedGitPack(p,{clock:()=>count++?0:1}),/TIME_EXHAUSTED/);
});
test('object bytes, trailing data, and invalid object types fail closed',()=>{
  const normal=pack([entry(3,blob)]),body=normal.subarray(0,-20);assert.throws(()=>decodeBoundedGitPack(finish(Buffer.concat([body,Buffer.from([1])]))),/TRAILING_BYTES/);
  assert.throws(()=>decodeBoundedGitPack(pack([entry(5,blob)])),/TYPE_INVALID/);
});
for(const [bad,code] of [[Buffer.from([4,7,0]),'INSERT_INVALID'],[Buffer.from([3,7,0x90,3]),'BASE_SIZE_INVALID'],[Buffer.from([4,7,0x90,9]),'COPY_INVALID'],[Buffer.from([4,7,0x90,3]),'SIZE_INVALID']])test(`malformed delta ${code} never produces partial objects`,()=>{
  const first=entry(3,blob);assert.throws(()=>decodeBoundedGitPack(pack([first,entry(6,bad,Buffer.from([first.length]))])),new RegExp(code));
});
test('ofs delta cannot reference a non-object offset',()=>assert.throws(()=>decodeBoundedGitPack(pack([entry(3,blob),entry(6,delta,Buffer.from([1]))])),/OFFSET_INVALID/));

export {entry as packFixtureEntry,pack as packFixture};
