import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {gitObjectId} from './bounded-git-source-reader-v1.mjs';

// Preparation only: no network, process, checkout, or policy authorization.
// Git's documented pack format; reject thin packs and every unresolved delta.
const MAX=Object.freeze({packBytes:64*1024*1024,objects:10000,objectBytes:16*1024*1024,
  inflatedBytes:128*1024*1024,bytes:128*1024*1024,deltaDepth:64,milliseconds:60000});
const TYPES={1:'commit',2:'tree',3:'blob',4:'tag'};
export function decodeBoundedGitPack(input,{limits={},clock=()=>performance.now()}={}) {
  const fail=code=>{throw Object.assign(new Error(code),{code,global:true});};
  const bound={...MAX,...limits};
  if(!Buffer.isBuffer(input)||typeof clock!=='function'||Object.keys(limits).some(k=>!Object.hasOwn(MAX,k))
    ||Object.keys(MAX).some(k=>!Number.isSafeInteger(bound[k])||bound[k]<1||bound[k]>MAX[k]))fail('SOURCE_BATCH_PACK_CONFIGURATION_INVALID');
  if(input.length>bound.packBytes)fail('SOURCE_BATCH_PACK_BYTE_BUDGET_EXHAUSTED');
  const pack=Buffer.from(input),started=clock();let last=started;
  if(!Number.isFinite(started))fail('SOURCE_BATCH_PACK_CONFIGURATION_INVALID');
  const check=()=>{const now=clock();if(!Number.isFinite(now)||now<last||now-started>bound.milliseconds)fail('SOURCE_BATCH_PACK_TIME_EXHAUSTED');last=now;};
  if(pack.length<32||pack.subarray(0,4).toString()!=='PACK'||![2,3].includes(pack.readUInt32BE(4)))fail('SOURCE_BATCH_PACK_HEADER_INVALID');
  const end=pack.length-20,count=pack.readUInt32BE(8);
  if(!count||count>bound.objects)fail('SOURCE_BATCH_PACK_OBJECT_BUDGET_EXHAUSTED');
  if(!createHash('sha1').update(pack.subarray(0,end)).digest().equals(pack.subarray(end)))fail('SOURCE_BATCH_PACK_DIGEST_MISMATCH');
  let cursor=12,inflatedBytes=0,objectBytes=0;const rows=[],byOffset=new Map(),objects=new Map();
  const byte=()=>{if(cursor>=end)fail('SOURCE_BATCH_PACK_TRUNCATED');return pack[cursor++];};
  const admit=(row,type,body,depth)=>{
    check();if(body.length>bound.objectBytes||objectBytes+body.length>bound.bytes)fail('SOURCE_BATCH_PACK_OBJECT_BYTES_EXHAUSTED');
    if(depth>bound.deltaDepth)fail('SOURCE_BATCH_PACK_DELTA_DEPTH_EXHAUSTED');
    const sha=gitObjectId(type,body);if(objects.has(sha))fail('SOURCE_BATCH_PACK_DUPLICATE_OBJECT');
    objectBytes+=body.length;row.object={type,bytes:body,depth};objects.set(sha,row.object);
  };
  for(let index=0;index<count;index++) {
    check();const offset=cursor;let head=byte(),type=(head>>4)&7,size=head&15,weight=16;
    while(head&128){head=byte();size+=(head&127)*weight;weight*=128;if(!Number.isSafeInteger(size)||!Number.isSafeInteger(weight))fail('SOURCE_BATCH_PACK_SIZE_INVALID');}
    if(![1,2,3,4,6,7].includes(type))fail('SOURCE_BATCH_PACK_TYPE_INVALID');
    if(size>bound.objectBytes||inflatedBytes+size>bound.inflatedBytes)fail('SOURCE_BATCH_PACK_INFLATE_BUDGET_EXHAUSTED');
    const row={offset,type};
    if(type===6){let b=byte(),distance=b&127;while(b&128){b=byte();distance=(distance+1)*128+(b&127);if(!Number.isSafeInteger(distance))fail('SOURCE_BATCH_PACK_OFFSET_INVALID');}
      row.baseOffset=offset-distance;if(distance<1||!byOffset.has(row.baseOffset))fail('SOURCE_BATCH_PACK_OFFSET_INVALID');}
    if(type===7){if(cursor+20>end)fail('SOURCE_BATCH_PACK_TRUNCATED');row.baseSha=pack.subarray(cursor,cursor+20).toString('hex');cursor+=20;}
    let decoded;try{decoded=inflateSync(pack.subarray(cursor,end),{info:true,maxOutputLength:Math.max(1,size)});}catch{fail('SOURCE_BATCH_PACK_INFLATE_INVALID');}
    check();const consumed=decoded.engine.bytesWritten;
    if(!Number.isSafeInteger(consumed)||consumed<1||cursor+consumed>end||decoded.buffer.length!==size)fail('SOURCE_BATCH_PACK_SIZE_INVALID');
    cursor+=consumed;inflatedBytes+=size;row.body=decoded.buffer;rows.push(row);byOffset.set(offset,row);
    if(TYPES[type])admit(row,TYPES[type],row.body,0);
  }
  if(cursor!==end)fail('SOURCE_BATCH_PACK_TRAILING_BYTES');
  const apply=(row,base)=>{
    const data=row.body;let pos=0;
    const take=()=>{if(pos>=data.length)fail('SOURCE_BATCH_PACK_DELTA_INVALID');return data[pos++];};
    const integer=()=>{let value=0,weight=1,b;do{b=take();value+=(b&127)*weight;weight*=128;if(!Number.isSafeInteger(value)||!Number.isSafeInteger(weight))fail('SOURCE_BATCH_PACK_DELTA_INVALID');}while(b&128);return value;};
    const sourceSize=integer(),size=integer();
    if(sourceSize!==base.bytes.length)fail('SOURCE_BATCH_PACK_DELTA_BASE_SIZE_INVALID');
    if(size>bound.objectBytes||objectBytes+size>bound.bytes)fail('SOURCE_BATCH_PACK_OBJECT_BYTES_EXHAUSTED');
    if(base.depth+1>bound.deltaDepth)fail('SOURCE_BATCH_PACK_DELTA_DEPTH_EXHAUSTED');
    const output=Buffer.alloc(size);let written=0;
    while(pos<data.length){check();const opcode=take();let offset=0,length=0;
      if(opcode&128){for(let i=0;i<4;i++)if(opcode&(1<<i))offset+=take()*2**(8*i);
        for(let i=0;i<3;i++)if(opcode&(1<<(4+i)))length+=take()*2**(8*i);if(!length)length=65536;
        if(offset+length>base.bytes.length||written+length>size)fail('SOURCE_BATCH_PACK_DELTA_COPY_INVALID');
        base.bytes.copy(output,written,offset,offset+length);
      }else{length=opcode;if(!length||pos+length>data.length||written+length>size)fail('SOURCE_BATCH_PACK_DELTA_INSERT_INVALID');data.copy(output,written,pos,pos+length);pos+=length;}
      written+=length;
    }
    if(written!==size)fail('SOURCE_BATCH_PACK_DELTA_SIZE_INVALID');admit(row,base.type,output,base.depth+1);
  };
  let pending=rows.filter(row=>!row.object);
  while(pending.length){check();let progress=0;const next=[];
    for(const row of pending){const base=row.type===6?byOffset.get(row.baseOffset)?.object:objects.get(row.baseSha);
      if(base){apply(row,base);progress++;}else next.push(row);}
    if(!progress)fail('SOURCE_BATCH_PACK_EXTERNAL_OR_CYCLIC_DELTA');pending=next;
  }
  const receipt=Object.freeze({scope:'LOCAL_VERIFIED_PACK_NOT_NATIVE_TRANSPORT',pack_bytes:pack.length,
    pack_sha256:'sha256:'+createHash('sha256').update(pack).digest('hex'),objects:count,
    inflated_bytes:inflatedBytes,object_bytes:objectBytes,elapsed_milliseconds:last-started,
    limits:Object.freeze({...bound}),authorization_created:false,transport_verified:false});
  return Object.freeze({readObject:async sha=>{const object=objects.get(sha);if(!object)fail('SOURCE_BATCH_OBJECT_MISSING');return {type:object.type,bytes:Buffer.from(object.bytes)};},receipt:()=>receipt});
}
