import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID} from 'node:crypto';
import {open,realpath,stat,unlink,lstat,readdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,sep} from 'node:path';
const fail=code=>{throw new Error(`QUARANTINE_STORE_${code}`);};
const hash=bytes=>`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const metadata=r=>JSON.stringify({id:r.id,expires_at:r.expires_at,payload_digest:r.payload_digest});
// A concrete file backend, usable on a private runtime volume. Host/mount/secret
// authority and remote execution proof remain deployment responsibilities.
export async function createProviderQuarantineFileStore({rootDir,forbiddenRoot,key,ttlDays=1,maxBytes=1048576,now=()=>new Date()}){
  if(!Buffer.isBuffer(key)||key.length!==32)fail('KEY');
  if(!Number.isInteger(ttlDays)||ttlDays<1||ttlDays>30||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>1048576)fail('BOUNDS');
  if(typeof rootDir!=='string'||typeof forbiddenRoot!=='string'||typeof now!=='function')fail('CONFIG');
  const root=await realpath(rootDir),forbidden=await realpath(forbiddenRoot);
  if(root===forbidden||root.startsWith(forbidden+sep)||forbidden.startsWith(root+sep))fail('ROOT_OVERLAP');
  const info=await stat(root);if(!info.isDirectory()||(info.mode&0o777)!==0o700)fail('PRIVATE_ROOT_MODE');
  const cipherKey=Buffer.from(key);
  const clock=()=>{const date=now();if(!(date instanceof Date)||!Number.isFinite(date.getTime()))fail('CLOCK');return date;};
  const audit=async(operation,ref,extra={})=>{
    const file=await open(join(root,'audit.jsonl'),constants.O_WRONLY|constants.O_APPEND|constants.O_CREAT|constants.O_NOFOLLOW,0o600);
    try{const info=await file.stat();if(!info.isFile()||(info.mode&0o777)!==0o600)fail('AUDIT_MODE');
      await file.writeFile(JSON.stringify({operation,at:clock().toISOString(),artifact_reference_digest:ref?hash(ref):null,...extra})+'\n');await file.sync();
    }finally{await file.close();}
  };
  const resolveRef=ref=>{if(typeof ref!=='string'||!/^artifact:quarantine:[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(ref))fail('REFERENCE');return join(root,ref.slice('artifact:quarantine:'.length)+'.json');};
  const load=async ref=>{
    const path=resolveRef(ref),file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
    try{const s=await file.stat();if(!s.isFile()||(s.mode&0o777)!==0o600||s.size>maxBytes*2+2048)fail('RECORD_BOUNDS');
      const r=JSON.parse(await file.readFile('utf8'));if(r.id!==ref||!Number.isFinite(Date.parse(r.expires_at)))fail('RECORD_BINDING');return r;
    }finally{await file.close();}
  };
  const decrypt=r=>{
    const decipher=createDecipheriv('aes-256-gcm',cipherKey,Buffer.from(r.iv,'hex'));
    decipher.setAAD(Buffer.from(metadata(r)));decipher.setAuthTag(Buffer.from(r.tag,'hex'));
    const bytes=Buffer.concat([decipher.update(Buffer.from(r.ciphertext,'base64')),decipher.final()]);
    if(bytes.length>maxBytes||hash(bytes)!==r.payload_digest)fail('READBACK_DIGEST');return bytes;
  };
  return {
    storageBoundaryId:'REAL_QUARANTINE',writerCapability:'WRITE_REAL_QUARANTINE',
    async write({bytes,kmsContext,dbNamespace,queueId}){
      if(kmsContext!=='kidults:data-class=REAL'||dbNamespace!=='provider_real'||queueId!=='provider-real-ingress')fail('SCOPE');
      if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>maxBytes)fail('PAYLOAD_BOUNDS');
      const id='artifact:quarantine:'+randomUUID(),expires_at=new Date(clock().getTime()+ttlDays*86400000).toISOString();
      const record={id,expires_at,payload_digest:hash(bytes)},iv=randomBytes(12);
      const cipher=createCipheriv('aes-256-gcm',cipherKey,iv);cipher.setAAD(Buffer.from(metadata(record)));
      const encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]);
      const file=await open(resolveRef(id),'wx',0o600);
      try{await file.writeFile(JSON.stringify({...record,iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),ciphertext:encrypted.toString('base64')}));await file.sync();}
      finally{await file.close();}
      await audit('WRITE',id,{payload_digest:record.payload_digest,expires_at});
      return id;
    },
    async read(ref){const record=await load(ref);if(clock().getTime()>=Date.parse(record.expires_at))fail('EXPIRED');const bytes=decrypt(record);await audit('READ',ref);return bytes;},
    async listExpired(){
      const instant=clock().getTime(),refs=[];
      for(const entry of await readdir(root,{withFileTypes:true})){
        if(entry.name==='audit.jsonl')continue;
        if(!entry.isFile()||!/^([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})\.json$/.test(entry.name))fail('UNEXPECTED_ENTRY');
        const ref='artifact:quarantine:'+entry.name.slice(0,-5),record=await load(ref);decrypt(record);
        if(Date.parse(record.expires_at)<=instant)refs.push(ref);
      }
      await audit('LIST_EXPIRED',null,{count:refs.length});return refs.sort();
    },
    async deleteExpired(ref){
      const record=await load(ref);decrypt(record);
      if(clock().getTime()<Date.parse(record.expires_at))fail('NOT_EXPIRED');
      await unlink(resolveRef(ref));
      try{await lstat(resolveRef(ref));fail('DELETE_NOT_VERIFIED');}catch(error){if(error.code!=='ENOENT')throw error;}
      await audit('DELETE',ref,{deletion_verified:true});
      return {state:'DELETION_VERIFIED',artifact_reference_digest:hash(ref),raw_payload_retained:false,promotion_eligible:false};
    }
  };
}
