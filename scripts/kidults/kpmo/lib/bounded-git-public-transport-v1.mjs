import {createHash} from 'node:crypto';
import {decodeBoundedGitPack} from './bounded-git-pack-decoder-v1.mjs';

// Anonymous read-only preparation transport. No credential fallback, retry,
// redirect, checkout, external pack URI, process, or policy authorization.
// Native Dispatcher activation and shared request accounting are separate.
const REPOSITORY='johnkim9524-collab/kaios_enterprise_repo';
const MAX=Object.freeze({sources:209,responseBytes:64*1024*1024,advertisementBytes:65536,chunks:65536,milliseconds:60000});
export function gitPacketLine(value){const body=Buffer.from(value);if(body.length+4>65520)throw Error('SOURCE_BATCH_PACKET_TOO_LARGE');return Buffer.concat([Buffer.from((body.length+4).toString(16).padStart(4,'0')),body]);}
function packets(body,fail,check){const out=[];let offset=0;while(offset<body.length){check();if(out.length>=100000)fail('SOURCE_BATCH_TRANSPORT_PACKET_BUDGET_EXHAUSTED');if(offset+4>body.length)fail('SOURCE_BATCH_TRANSPORT_PACKET_TRUNCATED');const header=body.subarray(offset,offset+4).toString();if(!/^[0-9a-f]{4}$/.test(header))fail('SOURCE_BATCH_TRANSPORT_PACKET_INVALID');const length=parseInt(header,16);offset+=4;
  if(length<=2){out.push({control:length});continue;}if(length<4||length>65520||offset+length-4>body.length)fail('SOURCE_BATCH_TRANSPORT_PACKET_INVALID');out.push({data:body.subarray(offset,offset+length-4)});offset+=length-4;}return out;}
export async function fetchBoundedPublicGitPack({repository=REPOSITORY,sourceShas,request=fetch,limits={},clock=()=>performance.now()}) {
  let terminal=null,requests=0,acceptedBytes=0,receivedChunks=0;const controller=new AbortController();
  const fail=code=>{terminal??=Object.assign(new Error(code),{code,global:true});controller.abort();throw terminal;};
  const bound={...MAX,...limits};
  if(repository!==REPOSITORY||!Array.isArray(sourceShas)||!sourceShas.length||sourceShas.some(x=>!/^[0-9a-f]{40}$/.test(x))||new Set(sourceShas).size!==sourceShas.length
    ||typeof request!=='function'||typeof clock!=='function'||Object.keys(limits).some(k=>!Object.hasOwn(MAX,k))||Object.keys(MAX).some(k=>!Number.isSafeInteger(bound[k])||bound[k]<1||bound[k]>MAX[k])||sourceShas.length>bound.sources)fail('SOURCE_BATCH_TRANSPORT_CONFIGURATION_INVALID');
  const started=clock();let last=started;if(!Number.isFinite(started))fail('SOURCE_BATCH_TRANSPORT_CONFIGURATION_INVALID');
  const check=()=>{if(terminal)throw terminal;const now=clock();if(!Number.isFinite(now)||now<last||now-started>bound.milliseconds)fail('SOURCE_BATCH_TRANSPORT_TIME_EXHAUSTED');last=now;};
  const timer=setTimeout(()=>{terminal??=Object.assign(new Error('SOURCE_BATCH_TRANSPORT_TIME_EXHAUSTED'),{code:'SOURCE_BATCH_TRANSPORT_TIME_EXHAUSTED',global:true});controller.abort();},bound.milliseconds);
  const abortable=async promise=>{let listener;const aborted=new Promise((_,reject)=>{listener=()=>reject(terminal??Object.assign(new Error('SOURCE_BATCH_TRANSPORT_ABORTED'),{code:'SOURCE_BATCH_TRANSPORT_ABORTED',global:true}));if(controller.signal.aborted)listener();else controller.signal.addEventListener('abort',listener,{once:true});});try{return await Promise.race([promise,aborted]);}finally{controller.signal.removeEventListener('abort',listener);}};
  const url='https://github.com/'+REPOSITORY+'.git';
  const read=async(suffix,method,type,maxBytes,body)=>{
    check();if(++requests>2)fail('SOURCE_BATCH_TRANSPORT_REQUEST_BUDGET_EXHAUSTED');
    let response;try{response=await abortable(request(url+suffix,{method,redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal,headers:{'Git-Protocol':'version=2',Accept:type,...(body?{'Content-Type':'application/x-git-upload-pack-request'}:{})},...(body?{body}:{})}));}catch(error){if(terminal)throw terminal;if(error?.global===true){terminal=error;controller.abort();throw terminal;}fail('SOURCE_BATCH_TRANSPORT_REQUEST_FAILED');}
    check();if(!response?.ok||response.redirected||response.status!==200||response.headers?.get('content-type')?.split(';')[0]!==type)fail('SOURCE_BATCH_TRANSPORT_RESPONSE_INVALID');
    const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>maxBytes))fail('SOURCE_BATCH_TRANSPORT_RESPONSE_BYTES_EXHAUSTED');
    if(!response.body?.getReader)fail('SOURCE_BATCH_TRANSPORT_STREAM_REQUIRED');
    const stream=response.body.getReader(),chunks=[];let total=0;
    try{while(true){check();let next;try{next=await abortable(stream.read());}catch{if(terminal)throw terminal;fail('SOURCE_BATCH_TRANSPORT_STREAM_FAILED');}check();if(next.done)break;
        if(++receivedChunks>bound.chunks)fail('SOURCE_BATCH_TRANSPORT_CHUNK_BUDGET_EXHAUSTED');
        if(!(next.value instanceof Uint8Array)||!next.value.byteLength)fail('SOURCE_BATCH_TRANSPORT_EMPTY_CHUNK_INVALID');
        if(total+next.value.byteLength>maxBytes||acceptedBytes+next.value.byteLength>bound.responseBytes+bound.advertisementBytes)fail('SOURCE_BATCH_TRANSPORT_RESPONSE_BYTES_EXHAUSTED');
        total+=next.value.byteLength;acceptedBytes+=next.value.byteLength;chunks.push(Buffer.from(next.value));}
    }finally{try{await abortable(stream.cancel());}catch{}try{stream.releaseLock();}catch{}}
    return Buffer.concat(chunks,total);
  };
  try {
    const advertisement=await read('/info/refs?service=git-upload-pack','GET','application/x-git-upload-pack-advertisement',bound.advertisementBytes);
    let frames=packets(advertisement,fail,check);
    // GitHub wraps the v2 advertisement in the smart-HTTP service preamble.
    // Accept only this exact read-only service followed by its flush packet.
    if(frames[0]?.data?.toString()==='# service=git-upload-pack\n'&&frames[1]?.control===0)frames=frames.slice(2);
    if(frames[0]?.data?.toString()!=='version 2\n'||frames.at(-1)?.control!==0||frames.slice(0,-1).some(x=>!x.data))fail('SOURCE_BATCH_TRANSPORT_PROTOCOL_INVALID');
    const caps=frames.slice(1,-1).map(x=>x.data.toString());const fetchCaps=caps.filter(x=>x.startsWith('fetch='));
    if(fetchCaps.length!==1||!fetchCaps[0].trim().split(/[ =]+/).includes('shallow')||caps.some(x=>x.startsWith('object-format=')&&x!=='object-format=sha1\n'))fail('SOURCE_BATCH_TRANSPORT_CAPABILITY_INVALID');
    const wants=[...sourceShas].sort();const command=Buffer.concat([gitPacketLine('command=fetch\n'),Buffer.from('0001'),gitPacketLine('no-progress\n'),gitPacketLine('ofs-delta\n'),gitPacketLine('deepen 1\n'),...wants.map(x=>gitPacketLine('want '+x+'\n')),gitPacketLine('done\n'),Buffer.from('0000')]);
    const response=await read('/git-upload-pack','POST','application/x-git-upload-pack-result',bound.responseBytes,command);
    const parts=packets(response,fail,check),packChunks=[],boundaries=new Set();let state='SECTION',shallow=false,packStarted=false,finished=false;
    for(let index=0;index<parts.length;index++) {check();const part=parts[index];
      if(finished){if(part.control===2&&index===parts.length-1)continue;fail('SOURCE_BATCH_TRANSPORT_TRAILING_PACKETS');}
      if(part.control!==undefined){if(part.control===1&&state==='SHALLOW'){state='SECTION';continue;}if(part.control===0&&state==='PACK'){finished=true;continue;}fail('SOURCE_BATCH_TRANSPORT_SECTION_INVALID');}
      if(state==='SECTION'){const header=part.data.toString();if(header==='shallow-info\n'&&!shallow){shallow=true;state='SHALLOW';continue;}if(header==='packfile\n'&&!packStarted){packStarted=true;state='PACK';continue;}fail('SOURCE_BATCH_TRANSPORT_SECTION_INVALID');}
      if(state==='SHALLOW'){const text=part.data.toString();const boundary=/^shallow ([0-9a-f]{40})\n?$/.exec(text);if(!boundary||boundaries.size>=10000||boundaries.has(boundary[1]))fail('SOURCE_BATCH_TRANSPORT_SHALLOW_INVALID');boundaries.add(boundary[1]);continue;}
      const channel=part.data[0];if(channel===1)packChunks.push(part.data.subarray(1));else if(channel===3)fail('SOURCE_BATCH_TRANSPORT_REMOTE_ABORT');else if(channel!==2)fail('SOURCE_BATCH_TRANSPORT_CHANNEL_INVALID');
    }
    if(!packStarted||!finished)fail('SOURCE_BATCH_TRANSPORT_PACK_INCOMPLETE');check();
    const pack=Buffer.concat(packChunks),remaining=Math.floor(bound.milliseconds-(last-started));if(remaining<1)fail('SOURCE_BATCH_TRANSPORT_TIME_EXHAUSTED');
    const producer=decodeBoundedGitPack(pack,{clock,limits:{packBytes:bound.responseBytes,milliseconds:remaining}});
    // Boundary metadata never registers sources or alters the immutable graph.
    // Bind each reported boundary to a verified commit in this bounded pack.
    for(const sha of boundaries){check();if((await producer.readObject(sha)).type!=='commit')fail('SOURCE_BATCH_TRANSPORT_SHALLOW_INVALID');}
    for(const sha of wants){check();if((await producer.readObject(sha)).type!=='commit')fail('SOURCE_BATCH_TRANSPORT_SOURCE_TYPE_INVALID');}check();
    const receipt=Object.freeze({scope:'ANONYMOUS_PUBLIC_SOURCE_READ_NOT_DISPATCHER_ACTIVATION',repository,
      source_count:wants.length,source_sha256:'sha256:'+createHash('sha256').update(wants.join('\n')).digest('hex'),requests,received_chunks:receivedChunks,accepted_response_bytes:acceptedBytes,
      elapsed_milliseconds:last-started,pack:producer.receipt(),authorization_created:false,
      shared_dispatcher_request_accounting_verified:false,native_generation_success:false});
    return Object.freeze({readObject:producer.readObject,receipt:()=>receipt});
  } finally{clearTimeout(timer);controller.abort();}
}
