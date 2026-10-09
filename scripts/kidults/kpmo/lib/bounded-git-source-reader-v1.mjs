import {createHash} from 'node:crypto';

// Preparation component only. No network, checkout, policy activation, or
// authorization. A separately governed producer must supply exact raw objects.
const SHA = /^[0-9a-f]{40}$/;
const MAX = Object.freeze({sources:209,objects:10000,bytes:128*1024*1024,
  objectBytes:16*1024*1024,milliseconds:60000,treeEntries:100000});
const utf8 = bytes => new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
export function gitObjectId(type,bytes) {
  return createHash('sha1').update(`${type} ${bytes.length}\0`).update(bytes).digest('hex');
}
export function createBoundedGitSourceReader({sourceShas,readObject,limits={},clock=()=>performance.now()}) {
  let terminal=null;
  const fail=code=>{terminal??=Object.assign(new Error(code),{code,global:true});throw terminal;};
  if(!Array.isArray(sourceShas)||!sourceShas.length||sourceShas.some(s=>!SHA.test(s))
    ||new Set(sourceShas).size!==sourceShas.length||typeof readObject!=='function'||typeof clock!=='function')fail('SOURCE_BATCH_CONFIGURATION_INVALID');
  if(Object.keys(limits).some(k=>!Object.hasOwn(MAX,k)))fail('SOURCE_BATCH_LIMIT_INVALID');
  const bound={...MAX,...limits};
  if(Object.keys(MAX).some(k=>!Number.isSafeInteger(bound[k])||bound[k]<1||bound[k]>MAX[k])
    ||sourceShas.length>bound.sources)fail('SOURCE_BATCH_LIMIT_INVALID');
  const allowed=new Set(sourceShas),cache=new Map(),trees=new Map();
  const started=clock();let last=started,reads=0,bytes=0,entries=0;
  if(!Number.isFinite(started))fail('SOURCE_BATCH_CONFIGURATION_INVALID');
  const check=()=>{
    if(terminal)throw terminal;
    const now=clock();if(!Number.isFinite(now)||now<last||now-started>bound.milliseconds)fail('SOURCE_BATCH_TIME_EXHAUSTED');last=now;
  };
  const object=async(sha,type)=>{
    check();if(!SHA.test(sha))fail('SOURCE_BATCH_OBJECT_BINDING_INVALID');
    if(cache.has(sha)) {const value=await cache.get(sha);check();if(value.type!==type)fail('SOURCE_BATCH_OBJECT_TYPE_INVALID');return value.bytes;}
    if(++reads>bound.objects)fail('SOURCE_BATCH_OBJECT_BUDGET_EXHAUSTED');
    const promise=(async()=>{
      let value;try{value=await readObject(sha,type);}catch{fail('SOURCE_BATCH_OBJECT_MISSING');}
      check();
      if(!value||value.type!==type||!Buffer.isBuffer(value.bytes))fail('SOURCE_BATCH_OBJECT_TYPE_INVALID');
      if(value.bytes.length>bound.objectBytes||bytes+value.bytes.length>bound.bytes)fail('SOURCE_BATCH_BYTE_BUDGET_EXHAUSTED');
      // Copy the bytes once; the producer cannot mutate the accepted snapshot.
      const body=Buffer.from(value.bytes);
      bytes+=body.length;
      if(gitObjectId(type,body)!==sha)fail('SOURCE_BATCH_OBJECT_DIGEST_MISMATCH');
      return {type,bytes:body};
    })();cache.set(sha,promise);const value=await promise;check();return value.bytes;
  };
  const commit=async ref=>{
    check();if(!allowed.has(ref))fail('SOURCE_BATCH_SOURCE_NOT_REGISTERED');
    let text;try{text=utf8(await object(ref,'commit'));}catch(error){if(terminal)throw terminal;fail('SOURCE_BATCH_COMMIT_INVALID');}
    const match=/^tree ([0-9a-f]{40})\n/.exec(text);if(!match)fail('SOURCE_BATCH_COMMIT_INVALID');
    return {sha:ref,tree:{sha:match[1]}};
  };
  const tree=async sha=>{
    const body=await object(sha,'tree');if(trees.has(sha))return trees.get(sha);
    const rows=new Map();let offset=0;
    while(offset<body.length) {
      const space=body.indexOf(32,offset),zero=body.indexOf(0,space+1);
      if(space<offset||zero<space||zero+21>body.length)fail('SOURCE_BATCH_TREE_INVALID');
      let name;try{name=utf8(body.subarray(space+1,zero));}catch{fail('SOURCE_BATCH_TREE_INVALID');}
      const mode=body.subarray(offset,space).toString('ascii');
      if(!['40000','100644','100755','120000','160000'].includes(mode)||!name||name==='.'||name==='..'
        ||/[\/\\\x00-\x1f\x7f]/.test(name)||rows.has(name))fail('SOURCE_BATCH_TREE_INVALID');
      if(++entries>bound.treeEntries)fail('SOURCE_BATCH_TREE_BUDGET_EXHAUSTED');
      rows.set(name,{mode,sha:body.subarray(zero+1,zero+21).toString('hex')});offset=zero+21;
    }
    trees.set(sha,rows);return rows;
  };
  const file=async(ref,path)=>{
    check();if(typeof path!=='string'||!path||path.startsWith('/')||/[\\\x00-\x1f\x7f]/.test(path)
      ||path.split('/').some(x=>!x||x==='.'||x==='..'))fail('SOURCE_BATCH_PATH_INVALID');
    let sha=(await commit(ref)).tree.sha;const parts=path.split('/');
    for(let index=0;index<parts.length;index++) {
      const row=(await tree(sha)).get(parts[index]);
      if(!row)fail('SOURCE_BATCH_FILE_MISSING');
      if(['120000','160000'].includes(row.mode))fail('SOURCE_BATCH_SPECIAL_FILE_FORBIDDEN');
      if(index<parts.length-1) {if(row.mode!=='40000')fail('SOURCE_BATCH_PATH_INVALID');sha=row.sha;continue;}
      if(!['100644','100755'].includes(row.mode))fail('SOURCE_BATCH_PATH_INVALID');
      const body=await object(row.sha,'blob');let text;try{text=utf8(body);}catch{fail('SOURCE_BATCH_TEXT_INVALID');}
      check();return {sha:row.sha,content:text,bytes:body.length};
    }
  };
  return Object.freeze({commit,file,receipt:()=>({scope:'LOCAL_VERIFIED_OBJECTS_NOT_NATIVE_TRANSPORT',
    source_count:allowed.size,object_reads:reads,object_bytes:bytes,tree_entries:entries,
    elapsed_milliseconds:last-started,limits:{...bound},state:terminal?'GLOBAL_ABORT':'SOURCE_READER_OPEN',
    authorization_created:false,transport_verified:false,production:'HOLD',public:'HOLD',g5:'HOLD'})});
}
