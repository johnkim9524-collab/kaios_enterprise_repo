// Optimization only. Callers retain fresh metadata and reparse/reverify every use.
import {createHash} from 'node:crypto';
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
export function createInvocationArchiveByteCache({download}){
  const entries=new Map();let retained=0;
  return async({repository,artifact,sourceSha,runAttempt,token})=>{
    artifact=structuredClone(artifact);
    if(artifact.workflow_run)Object.freeze(artifact.workflow_run);
    Object.freeze(artifact);
    const key=JSON.stringify([repository,sourceSha,artifact.workflow_run?.id,runAttempt,artifact.id,artifact.digest,artifact.size_in_bytes??null]);
    let entry=entries.get(key);
    if(!entry){
      if(entries.size>=4096)throw Error('INVOCATION_ARCHIVE_CACHE_KEY_BUDGET');
      entry={state:'pending',size:0};entries.set(key,entry);
      entry.promise=(async()=>{
        try{
          const bytes=await download(repository,artifact,token);
          if(!Buffer.isBuffer(bytes))throw Error('INVOCATION_ARCHIVE_BYTES');
          const privateBytes=Buffer.from(bytes);
          if(hash(privateBytes)!==artifact.digest)throw Error('INVOCATION_ARCHIVE_DIGEST');
          if(!Number.isSafeInteger(artifact.size_in_bytes)||artifact.size_in_bytes!==privateBytes.length
            ||privateBytes.length>8*1024*1024)throw Error('INVOCATION_ARCHIVE_SIZE');
          entry.state='verified';entry.size=privateBytes.length;retained+=entry.size;
          for(const [oldKey,old] of entries){
            if(retained<=64*1024*1024&&[...entries.values()].filter(e=>e.state==='verified').length<=128)break;
            if(old.state==='verified'){retained-=old.size;entries.delete(oldKey);}
          }
          return privateBytes;
        }catch(error){entry.state='failed';throw error;}
      })();
    }
    return Buffer.from(await entry.promise);
  };
}
