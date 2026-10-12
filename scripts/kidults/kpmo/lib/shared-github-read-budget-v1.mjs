// Cross-runner protocol. Requires a protected consistent-read + atomic-CAS store;
// local files/Actions artifacts cannot bind this protocol in production.
import {createHash} from 'node:crypto';
const canonical=x=>Array.isArray(x)?`[${x.map(canonical).join(',')}]`:x&&typeof x==='object'?`{${Object.keys(x).sort().map(k=>`${JSON.stringify(k)}:${canonical(x[k])}`).join(',')}}`:JSON.stringify(x);
const digest=x=>createHash('sha256').update(canonical(x)).digest('hex');
const check=(ok,code)=>{if(!ok)throw Error('SHARED_GITHUB_READ_'+code);};
export function createSharedGithubReadBudget({store,scope,capacity=480,windowMs=3600000,maxConcurrent=2,leaseMs=30000,now=()=>Date.now()}){
  check(store?.authority==='PROTECTED_ATOMIC_CAS'&&typeof store.read==='function'&&typeof store.compareAndSwap==='function','STORE_AUTHORITY_REQUIRED');
  check(scope?.repository==='johnkim9524-collab/kaios_enterprise_repo'&&scope.resource==='core'
    &&typeof scope.quota_owner_id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(scope.quota_owner_id),'QUOTA_OWNER');
  check(Number.isSafeInteger(capacity)&&capacity>0&&capacity<=600&&Number.isSafeInteger(maxConcurrent)&&maxConcurrent>=1&&maxConcurrent<=4
    &&Number.isSafeInteger(windowMs)&&windowMs>=60000&&windowMs<=3600000&&Number.isSafeInteger(leaseMs)&&leaseMs>=1000&&leaseMs<=60000,'CONFIG');
  scope=Object.freeze(structuredClone(scope));
  const configuration={scope,capacity,windowMs,maxConcurrent,leaseMs};
  const configDigest=digest(configuration),key='GITHUB_READ_BUDGET#'+digest(scope);
  let localBlockedUntil=0;
  async function transition(work){
    for(let count=0;count<4;count++){
      const time=now();check(Number.isSafeInteger(time)&&time>=0,'CLOCK');
      const current=await store.read(key),version=current?.version??0;
      check(!current||(current.scope_digest===digest(scope)&&current.config_digest===configDigest
        &&Number.isSafeInteger(current.version)&&current.version>0&&Number.isSafeInteger(current.spent)&&current.spent>=0&&current.spent<=capacity
        &&Number.isSafeInteger(current.window_start)&&Number.isSafeInteger(current.blocked_until)&&Number.isSafeInteger(current.observed_at)
        &&current.operations&&typeof current.operations==='object'&&!Array.isArray(current.operations)
        &&Object.entries(current.operations).every(([id,o])=>/^[a-f0-9]{64}$/.test(id)&&o&&typeof o==='object'
          &&Object.keys(o).sort().join(',')==='binding,expires_at,fence,state'&&/^[a-f0-9]{64}$/.test(o.binding)
          &&['ACTIVE','COMPLETED'].includes(o.state)&&Number.isSafeInteger(o.fence)&&o.fence>0&&o.fence<=current.version
          &&Number.isSafeInteger(o.expires_at)&&o.expires_at>=0)),'SCOPE');
      check(!current||time>=current.observed_at,'CLOCK_ROLLBACK');
      let next=current?structuredClone(current):{version:0,scope_digest:digest(scope),config_digest:configDigest,window_start:time,spent:0,blocked_until:0,operations:{},observed_at:time};
      if(time>=next.window_start+windowMs){
        next.window_start=time;next.spent=0;
        // Requests are server-expiry bounded. Pruning old permits cannot admit
        // their stale original issued_at binding as a new read.
        next.operations=Object.fromEntries(Object.entries(next.operations).filter(([,o])=>o.expires_at+windowMs>time));
      }
      const result=work(next,time);
      if(result.unchanged)return result.value;
      next.version=version+1;next.observed_at=time;
      const outcome=await store.compareAndSwap(key,version,next);
      if(outcome==='COMMITTED')return result.value;
      if(outcome==='CONFLICT')continue;
      // An ambiguous CAS may have committed. No blind replay is allowed.
      throw Error('SHARED_GITHUB_READ_CAS_UNKNOWN_RECONCILE_REQUIRED');
    }
    throw Error('SHARED_GITHUB_READ_CAS_CONTENTION_DEFERRED');
  }
  const bound=b=>{check(b&&typeof b.operation_id==='string'&&/^[a-f0-9]{64}$/.test(b.operation_id)
    &&/^[1-9][0-9]{0,15}$/.test(String(b.run_id))&&Number.isSafeInteger(b.run_attempt)&&b.run_attempt>=1&&b.run_attempt<=100
    &&/^[a-f0-9]{40}$/.test(b.source_sha)
    &&typeof b.route==='string'&&b.route.startsWith('/repos/'+scope.repository+'/')&&b.method==='GET'&&Number.isSafeInteger(b.issued_at)&&b.issued_at>=0,'BINDING');return digest(b);};
  const api={
    scope:{...scope,coverage:'REGISTERED_PARTICIPANTS_ONLY'},
    acquire:async b=>{const binding=bound(b);return transition((row,time)=>{
      const old=row.operations[b.operation_id];
      if(old){check(old.binding===binding,'OPERATION_REBIND');return {unchanged:true,value:{state:old.state==='ACTIVE'&&old.expires_at>time?'IN_FLIGHT_NO_REISSUE':'EXISTING_PERMIT_NO_REISSUE',fetch_allowed:false,permit:structuredClone(old)}};}
      check(b.issued_at<=time&&time-b.issued_at<900000,'REQUEST_EXPIRED');
      const active=Object.values(row.operations).filter(o=>o.state==='ACTIVE'&&o.expires_at>time);
      const resumeAt=Math.max(row.blocked_until,row.spent>=capacity?row.window_start+windowMs:time,
        active.length>=maxConcurrent?Math.min(...active.map(o=>o.expires_at)):time);
      if(resumeAt>time)return {unchanged:true,value:{state:'READ_BUDGET_DEFERRED',fetch_allowed:false,resume_at:new Date(resumeAt).toISOString()}};
      // Fail closed rather than discard idempotency history to make space.
      check(Object.keys(row.operations).length<1000,'OPERATION_RETENTION_CAP');
      const permit={binding,state:'ACTIVE',fence:row.version+1,expires_at:time+leaseMs};
      row.operations[b.operation_id]=permit;row.spent++;
      return {value:{state:'READ_PERMIT_GRANTED',fetch_allowed:true,operation_id:b.operation_id,permit:structuredClone(permit),fence:permit.fence}};
    });},
    finish:async(b,fence)=>{const binding=bound(b);return transition(row=>{
      const old=row.operations[b.operation_id];check(old&&old.binding===binding&&old.fence===fence,'FINISH_FENCE');
      if(old.state==='COMPLETED')return {unchanged:true,value:{state:'READ_PERMIT_COMPLETED',fetch_allowed:false}};
      old.state='COMPLETED';return {value:{state:'READ_PERMIT_COMPLETED',fetch_allowed:false}};
    });},
    pauseUntil:async at=>transition((row,time)=>{
      check(Number.isSafeInteger(at)&&at>time&&at-time<=86400000,'RESET');
      row.blocked_until=Math.max(row.blocked_until,at);return {value:{state:'READ_RATE_WAIT',resume_at:new Date(row.blocked_until).toISOString(),actual_authority_granted:false}};
    })
  };
  api.acquireLease=async(input={})=>{
    const deadline=input?.binding?input.deadline??Number.MAX_SAFE_INTEGER:Number.MAX_SAFE_INTEGER;
    const binding=input?.binding??input;
    check(binding&&now()<deadline,'DEADLINE');
    const request={...binding,issued_at:binding.issued_at??now()};
    const permit=await api.acquire(request);
    if(!permit.fetch_allowed){
      if(permit.state==='EXISTING_PERMIT_NO_REISSUE'||permit.state==='IN_FLIGHT_NO_REISSUE')
        throw Error('SHARED_GITHUB_READ_DUPLICATE_OPERATION_NO_REPLAY');
      const error=Error('SHARED_GITHUB_READ_BUDGET_DEFERRED');error.resume_at=Date.parse(permit.resume_at);throw error;
    }
    const release=()=>{};let finished=false;
    release.finish=async()=>{if(finished)return;await api.finish(request,permit.fence);finished=true;};
    return release;
  };
  api.blockUntil=at=>{localBlockedUntil=Math.max(localBlockedUntil,at);};
  api.blockedUntil=()=>localBlockedUntil;
  return api;
}
