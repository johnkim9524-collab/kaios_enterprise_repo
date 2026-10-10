import crypto from 'node:crypto';
import {canonicalJson,sha256} from '../../kpmo/lib/canonical-json-v1.mjs';
import {operationKey,resumeOperation} from './resume-operation-v1.mjs';
import {DynamoDBOperationLedger} from './dynamodb-operation-ledger-v1.mjs';

const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const fail=code=>{throw new Error(`RESUME_LIFECYCLE_DENIED:${code}`);};
const profiles={STALE_BASE_CONVERGENCE:'AUTONOMOUS_STALE_BASE_CONVERGENCE',REDUNDANT_PR_HYGIENE:'AUTONOMOUS_REDUNDANT_PR_HYGIENE'};

export async function observeLifecycleCutover({config,ledgerRequest,now=()=>Date.now()}) {
  if(!config.operationTable)fail('CUTOVER_TABLE');
  const cutoverKey={pk:'RESUME_TUPLE_V1#LIFECYCLE_CUTOVER_V1',sk:'OPERATION'};
  let cutover=(await ledgerRequest('Get',{TableName:config.operationTable,Key:cutoverKey,ConsistentRead:true})).Item;
  if(!cutover){
    const installed=now();
    try{await ledgerRequest('Put',{TableName:config.operationTable,Item:{...cutoverKey,installed_at:installed,not_before:installed+3840000},
      ConditionExpression:'attribute_not_exists(pk) AND attribute_not_exists(sk)'});}
    catch(error){if(error?.name!=='ConditionalCheckFailedException')throw error;}
    cutover=(await ledgerRequest('Get',{TableName:config.operationTable,Key:cutoverKey,ConsistentRead:true})).Item;
  }
  if(!Number.isSafeInteger(cutover?.installed_at)||cutover.installed_at<1||!Number.isSafeInteger(cutover.not_before)
    ||cutover.not_before-cutover.installed_at!==3840000||now()<cutover.installed_at)fail('CUTOVER_RECORD');
  if(now()<cutover.not_before)return {ok:false,state:'HOLD_RECONCILE',reason:'LEGACY_TOKEN_DRAIN_WINDOW',not_before:new Date(cutover.not_before).toISOString(),mutation_attempted:false};
  return {ok:true,state:'CUTOVER_READY',mutation_attempted:false};
}

// The deployed broker's bounded timeout is 180 seconds. Before creating any
// new phase-fenced family, drain older invocations for that bound plus 60s.
// This is version quiescence, never evidence that a legacy operation succeeded
// or performed no mutation. Its original unresolved records remain fenced.
async function observeFamilyPhaseCutover({config,ledgerRequest,now}) {
  const Key={pk:'RESUME_TUPLE_V1#FAMILY_PHASE_CUTOVER_V1',sk:'OPERATION'};
  let row=(await ledgerRequest('Get',{TableName:config.operationTable,Key,ConsistentRead:true})).Item;
  if(!row) {
    const installed_at=now();
    try {await ledgerRequest('Put',{TableName:config.operationTable,Item:{...Key,installed_at,not_before:installed_at+240000},
      ConditionExpression:'attribute_not_exists(pk) AND attribute_not_exists(sk)'});}
    catch(error) {if(error?.name!=='ConditionalCheckFailedException')throw error;}
    row=(await ledgerRequest('Get',{TableName:config.operationTable,Key,ConsistentRead:true})).Item;
  }
  if(!Number.isSafeInteger(row?.installed_at)||row.installed_at<1||!Number.isSafeInteger(row.not_before)||
    row.not_before-row.installed_at!==240000||now()<row.installed_at)fail('FAMILY_PHASE_CUTOVER_RECORD');
  if(now()<row.not_before)return {ok:false,state:'HOLD_RECONCILE',reason:'FAMILY_PHASE_INVOCATION_DRAIN_WINDOW',
    not_before:new Date(row.not_before).toISOString(),mutation_attempted:false};
  return {ok:true};
}

// The protected Lambda owns mint, readback and the one mutation. Neither a
// write token nor a caller-supplied success assertion crosses this boundary.
// UNKNOWN is never reclaimed: GitHub provides no cross-system atomic CAS for
// close, so an interrupted close cannot be asserted exactly-once or retried.
export async function brokerResumeLifecycle({event,config,request,ledgerRequest,getPrivateKey,mint,owner,now=()=>Date.now()}) {
  if(event?.action!=='RESUME_LIFECYCLE_OPERATION'||Object.keys(event).sort().join(',')!=='action,binding,operation,repository,repository_id,run_attempt,run_id'
    ||event.repository!==config.repository||String(event.repository_id)!==String(config.repositoryId)
    ||!Object.hasOwn(profiles,event.operation)||event.run_attempt!==1
    ||! /^[1-9][0-9]{0,19}$/.test(String(event.run_id))||! /^[1-9][0-9]{0,19}$/.test(String(config.activationRunFloor))
    ||BigInt(event.run_id)<=BigInt(config.activationRunFloor)||!config.operationTable||!owner)fail('INPUT_OR_CUTOVER');
  const b=event.binding;
  if(!b||!Number.isSafeInteger(b.pull_request)||b.pull_request<1||!sha(b.old_base_sha)||!sha(b.expected_head_sha)||!sha(b.current_main_sha)
    ||!Array.isArray(b.changed_paths)||b.changed_paths.length>100||new Set(b.changed_paths).size!==b.changed_paths.length
    ||b.changed_paths.some(p=>typeof p!=='string'||!p||p.length>512||p.startsWith('/')||p.split('/').some(x=>!x||x==='.'||x==='..'))
    ||(event.operation==='STALE_BASE_CONVERGENCE'&&(b.old_base_sha===b.current_main_sha||!b.changed_paths.length)))fail('BINDING');
  // Previously exposed installation tokens cannot be remotely fenced by this
  // new ledger. Start one durable drain window after this broker is active:
  // one-hour token TTL plus old in-flight invocation/clock margin. Until then
  // preserve HOLD without claiming or attempting a lifecycle mutation.
  const cutover=await observeLifecycleCutover({config,ledgerRequest,now});
  if(!cutover.ok)return cutover;
  const phaseCutover=await observeFamilyPhaseCutover({config,ledgerRequest,now});
  if(!phaseCutover.ok)return phaseCutover;
  const stable={pull_request:b.pull_request,old_base_sha:b.old_base_sha,expected_head_sha:b.expected_head_sha,
    current_main_sha:b.current_main_sha,changed_paths:[...b.changed_paths].sort()};
  const binding={repository:config.repository,root_mission_id:'KIDULTS-AUTONOMOUS-LIFECYCLE',stage_id:`lifecycle:${b.pull_request}`,
    operation_kind:event.operation,exact_target:`${b.pull_request}:${b.old_base_sha}:${b.expected_head_sha}:${b.current_main_sha}`,
    payload_sha256:sha256(canonicalJson(event.operation==='REDUNDANT_PR_HYGIENE'?{method:'PATCH',body:{state:'closed'}}:
      {method:'PUT',body:{expected_head_sha:b.expected_head_sha}}))};
  const key=operationKey(binding),ledger=new DynamoDBOperationLedger({request:ledgerRequest,table:config.operationTable,repository:config.repository});
  // Main can advance while an interrupted operation still owns this PR head.
  // Fence that operation family before the exact-main/payload operation key.
  // A changed target never bypasses the original unresolved writer.
  const family=sha256(canonicalJson({repository:config.repository,pull_request:b.pull_request,
    expected_head_sha:b.expected_head_sha}));
  const familyKey={pk:`RESUME_TUPLE_V1#${family}`,sk:'OPERATION'};
  let privateKey,publicKey;
  const prepareKey=async()=>{if(!privateKey){privateKey=await getPrivateKey();publicKey=crypto.createPublicKey(privateKey);}};
  let familyRow=(await ledgerRequest('Get',{TableName:config.operationTable,Key:familyKey,ConsistentRead:true})).Item;
  if(!familyRow){
    await prepareKey();
    try{await ledgerRequest('Put',{TableName:config.operationTable,Item:{...familyKey,operation_key:key,owner,state:'IN_FLIGHT',
      schema:'LIFECYCLE_PHASE_FENCE_V1',binding,phase:'PRE_MUTATION'},
      ConditionExpression:'attribute_not_exists(pk) AND attribute_not_exists(sk)'});}
    catch(error){
      if(error?.name!=='ConditionalCheckFailedException')throw error;
      familyRow=(await ledgerRequest('Get',{TableName:config.operationTable,Key:familyKey,ConsistentRead:true})).Item;
      if(!familyRow)fail('FAMILY_FENCE_MISSING');
    }
  }
  if(familyRow){
    if(!/^sha256:[a-f0-9]{64}$/.test(familyRow.operation_key||''))fail('FAMILY_FENCE_INVALID');
    if(familyRow.operation_key!==key){
      const originalFamilyOwner=familyRow.owner;
      let original=await ledger.read(familyRow.operation_key);
      // A complete new-schema family can fence a paused writer before its
      // operation claim exists. Absence alone is never mutation evidence.
      const familyBinding=familyRow.binding;
      let familyBindingVerified=false;
      try {familyBindingVerified=familyRow.schema==='LIFECYCLE_PHASE_FENCE_V1' &&
        operationKey(familyBinding)===familyRow.operation_key && typeof familyRow.owner==='string' && !!familyRow.owner &&
        familyBinding.repository===binding.repository && familyBinding.root_mission_id===binding.root_mission_id &&
        familyBinding.stage_id===binding.stage_id && familyBinding.operation_kind===binding.operation_kind &&
        familyBinding.payload_sha256===binding.payload_sha256 &&
        familyBinding.exact_target.split(':').slice(0,3).join(':')===binding.exact_target.split(':').slice(0,3).join(':') &&
        familyBinding.exact_target.split(':').length===4 && sha(familyBinding.exact_target.split(':')[3]);
      } catch {}
      const validOriginal=original && original.owner===familyRow.owner &&
        canonicalJson(original.binding)===canonicalJson(familyBinding) && original.phase==='PRE_MUTATION' &&
        (original.state==='IN_FLIGHT' || (original.state==='NO_MUTATION' &&
          original.receipt?.mutation_attempted===false && original.receipt?.phase==='PRE_MUTATION'));
      if(familyBindingVerified && familyRow.phase==='PRE_MUTATION' &&
        ['IN_FLIGHT','NO_MUTATION'].includes(familyRow.state) && (!original || validOriginal)) {
        if(familyRow.state==='IN_FLIGHT') {
          try {await ledgerRequest('Update',{TableName:config.operationTable,Key:familyKey,
            UpdateExpression:'SET #state = :none',
            ConditionExpression:'operation_key = :original AND #owner = :originalOwner AND #state = :flight AND phase = :pre AND #schema = :schema',
            ExpressionAttributeNames:{'#owner':'owner','#state':'state','#schema':'schema'},
            ExpressionAttributeValues:{':original':familyRow.operation_key,':originalOwner':familyRow.owner,
              ':flight':'IN_FLIGHT',':pre':'PRE_MUTATION',':none':'NO_MUTATION',':schema':'LIFECYCLE_PHASE_FENCE_V1'}});}
          catch(error) {if(error?.name!=='ConditionalCheckFailedException')throw error;}
          familyRow=(await ledgerRequest('Get',{TableName:config.operationTable,Key:familyKey,ConsistentRead:true})).Item;
        }
        if(familyRow?.operation_key===operationKey(familyBinding) && familyRow.owner===originalFamilyOwner &&
          familyRow.schema==='LIFECYCLE_PHASE_FENCE_V1' && familyRow.phase==='PRE_MUTATION' && familyRow.state==='NO_MUTATION' &&
          canonicalJson(familyRow.binding)===canonicalJson(familyBinding)) {
          const receipt={error_code:'ORIGINAL_WRITER_PRE_MUTATION_FENCED',mutation_attempted:false,phase:'PRE_MUTATION'};
          if(!original) {
            try {await ledgerRequest('Put',{TableName:config.operationTable,Item:{...ledger.key(familyRow.operation_key),
              binding:familyBinding,owner:familyRow.owner,state:'NO_MUTATION',phase:'PRE_MUTATION',receipt},
              ConditionExpression:'attribute_not_exists(pk) AND attribute_not_exists(sk)'});}
            catch(error) {if(error?.name!=='ConditionalCheckFailedException')throw error;}
          } else if(original.state==='IN_FLIGHT') {
            try {await ledger.finishPreMutationFailure(familyRow.operation_key,familyRow.owner,receipt);}
            catch(error) {if(error?.name!=='ConditionalCheckFailedException')throw error;}
          }
          original=await ledger.read(familyRow.operation_key);
        }
      }
      const target=original?.binding?.exact_target?.split(':');
      const originalBinding=original?.binding;
      let bindingVerified=false;
      try {bindingVerified=operationKey(originalBinding)===familyRow.operation_key &&
        originalBinding.repository===config.repository && originalBinding.root_mission_id===binding.root_mission_id &&
        originalBinding.stage_id===binding.stage_id && originalBinding.operation_kind===event.operation &&
        target?.length===4 && target[0]===String(b.pull_request) && target[1]===b.old_base_sha &&
        target[2]===b.expected_head_sha && sha(target[3]) && originalBinding.payload_sha256===binding.payload_sha256;
      } catch {}
      const diagnostic={original_operation_key:familyRow.operation_key,
        original_operation_state:['IN_FLIGHT','SUCCESS','UNKNOWN','NO_MUTATION'].includes(original?.state)?original.state:'UNAVAILABLE',
        original_operation_phase:['PRE_MUTATION','WRITE_STARTED'].includes(original?.phase)?original.phase:'UNAVAILABLE',
        original_binding_verified:bindingVerified,
        ...(bindingVerified?{original_exact_target:originalBinding.exact_target}:{})};
      if(!bindingVerified || original.owner!==familyRow.owner || original.state!=='NO_MUTATION' ||
        original.phase!=='PRE_MUTATION' || original.receipt?.mutation_attempted!==false ||
        original.receipt?.phase!=='PRE_MUTATION' || !['IN_FLIGHT','NO_MUTATION'].includes(familyRow.state) ||
        (familyRow.schema && (!familyBindingVerified || familyRow.phase!=='PRE_MUTATION' || familyRow.state!=='NO_MUTATION')))
        return {ok:false,state:'HOLD_RECONCILE',reason:'ORIGINAL_LIFECYCLE_TARGET_REQUIRES_RECONCILIATION',...diagnostic};
      // NO_MUTATION is a protected owner/phase CAS terminal, never an inferred
      // absence or a timeout. Keep its immutable operation row; fence the old
      // writer and conditionally move only this PR/head family to the new key.
      await prepareKey();
      try {await ledgerRequest('Update',{TableName:config.operationTable,Key:familyKey,
        UpdateExpression:'SET operation_key = :next, #owner = :owner, #state = :flight, #schema = :schema, binding = :binding, phase = :pre',
        ConditionExpression:'operation_key = :original AND #owner = :originalOwner AND #state = :priorState',
        ExpressionAttributeNames:{'#owner':'owner','#state':'state','#schema':'schema'},
        ExpressionAttributeValues:{':next':key,':owner':owner,':original':familyRow.operation_key,
          ':originalOwner':familyRow.owner,':priorState':familyRow.state,':flight':'IN_FLIGHT',
          ':schema':'LIFECYCLE_PHASE_FENCE_V1',':binding':binding,':pre':'PRE_MUTATION'}});}
      catch(error){if(error?.name!=='ConditionalCheckFailedException')throw error;
        return {ok:false,state:'HOLD_RECONCILE',reason:'ORIGINAL_LIFECYCLE_RECONCILIATION_CONCURRENT_WRITER',...diagnostic};}
    }
  }
  await prepareKey();
  const familyPhase=async(next)=>ledgerRequest('Update',{TableName:config.operationTable,Key:familyKey,
    UpdateExpression:next==='WRITE_STARTED'?'SET phase = :next':'SET #state = :next',
    ConditionExpression:'operation_key = :key AND #owner = :owner AND #state = :flight AND phase = :pre AND #schema = :schema',
    ExpressionAttributeNames:{'#owner':'owner','#state':'state','#schema':'schema'},
    ExpressionAttributeValues:{':key':key,':owner':owner,':flight':'IN_FLIGHT',':pre':'PRE_MUTATION',
      ':schema':'LIFECYCLE_PHASE_FENCE_V1',':next':next}});
  const operationPhase=ledger.markMutationStarted.bind(ledger),operationFailure=ledger.finishPreMutationFailure.bind(ledger);
  ledger.markMutationStarted=async(operationKey,writer)=>{
    await familyPhase('WRITE_STARTED');
    await operationPhase(operationKey,writer);
  };
  ledger.finishPreMutationFailure=async(operationKey,writer,receipt)=>{
    await familyPhase('NO_MUTATION');
    await operationFailure(operationKey,writer,receipt);
  };
  const fingerprint=sha256(publicKey.export({type:'spki',format:'der'}).toString('base64'));
  const verify=async receipt=>{
    if(receipt?.id!=='kidults-broker-lifecycle-receipt-v1'||receipt.key!==key||receipt.state!=='VERIFIED_PASS'
      ||receipt.key_fingerprint!==fingerprint||canonicalJson(receipt.binding)!==canonicalJson(binding)
      ||receipt.production!=='HOLD'||receipt.public!=='HOLD'||receipt.g5!=='HOLD')return false;
    const {signature,...signed}=receipt;
    return typeof signature==='string'&&crypto.verify('RSA-SHA256',Buffer.from(canonicalJson(signed)),publicKey,Buffer.from(signature,'base64'));
  };
  // Read the protected terminal record before any token mint. A later run's
  // generation/session cannot manufacture a different key for this tuple.
  const readExternal=async()=>{
    const row=await ledger.read(key);
    if(!row) {
      // A same-key follower must never claim the orphan under a new owner.
      // The original family remains authoritative even before operation Put.
      const family=(await ledgerRequest('Get',{TableName:config.operationTable,Key:familyKey,ConsistentRead:true})).Item;
      if(family?.operation_key!==key||family.owner!==owner||family.state!=='IN_FLIGHT'||
        family.schema!=='LIFECYCLE_PHASE_FENCE_V1'||family.phase!=='PRE_MUTATION'||
        canonicalJson(family.binding)!==canonicalJson(binding))return {state:'UNKNOWN'};
      return {state:'ABSENT'};
    }
    if(canonicalJson(row.binding)!==canonicalJson(binding))fail('LEDGER_BINDING');
    if(row.state==='SUCCESS')return {state:'SUCCESS',receipt:row.receipt};
    if(row.state==='IN_FLIGHT'&&row.owner===owner)return {state:'ABSENT'};
    return {state:'UNKNOWN'};
  };
  let token,writeToken,readToken,reads=0;
  const api=async(route,{method='GET',body}={})=>{
    if(++reads>256)fail('REQUEST_BUDGET');
    const response=await request(`https://api.github.com/repos/${config.repository}${route}`,{method,redirect:'error',signal:AbortSignal.timeout(10000),
      headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28',
        'User-Agent':'kidults-protected-lifecycle-v1',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok)fail(method==='GET'?'READ_FAILED':'MUTATION_OUTCOME_UNKNOWN');
    return {status:response.status,value:await response.json()};
  };
  const liveTuple=async()=>{
    const {value:pr}=await api(`/pulls/${b.pull_request}`),{value:main}=await api('/branches/main');
    if(pr.number!==b.pull_request||pr.state!=='open'||pr.merged===true||pr.head?.sha!==b.expected_head_sha||pr.base?.sha!==b.old_base_sha
      ||pr.base?.ref!=='main'||pr.head?.repo?.full_name!==config.repository||pr.base?.repo?.full_name!==config.repository||main.commit?.sha!==b.current_main_sha)fail('LIVE_TUPLE');
    return pr;
  };
  const result=await resumeOperation({binding,ledger,owner,readExternal,verifyReceipt:verify,trackMutationPhase:true,
    authorize:async()=>{
      const minted=await mint({action:'MINT_INSTALLATION_TOKEN',repository:config.repository,repository_id:String(config.repositoryId),
        pull_request:b.pull_request,base_sha:b.old_base_sha,head_sha:b.expected_head_sha,current_main_sha:b.current_main_sha,
        authorization_generation:`lifecycle-${key.slice(7,39)}`,permission_profile:profiles[event.operation]});
      if(minted.ok!==true||typeof minted.token!=='string')fail('TOKEN_DENIED');
      writeToken=minted.token;readToken=minted.read_token;
      if(typeof readToken!=='string')fail('READ_TOKEN_DENIED');
      token=readToken;
      await liveTuple();
      if(event.operation==='REDUNDANT_PR_HYGIENE') {
        if(b.changed_paths.length===0){
          const {value:head}=await api(`/git/commits/${b.expected_head_sha}`),{value:main}=await api(`/git/commits/${b.current_main_sha}`);
          if(head.sha!==b.expected_head_sha||main.sha!==b.current_main_sha||!sha(head.tree?.sha)||head.tree.sha!==main.tree?.sha)fail('HYGIENE_TREE');
        }else{
          // Recompute the complete changed-file inventory and equality against
          // immutable main. Deletions/renames remain ineligible.
          const files=[];for(let page=1;page<=2;page++){
            const {value:rows}=await api(`/pulls/${b.pull_request}/files?per_page=100&page=${page}`);
            if(!Array.isArray(rows)||rows.length>100)fail('FILES_INDEX');files.push(...rows);
            if(rows.length<100)break;
          }
          if(files.length>100||canonicalJson(files.map(x=>x.filename).sort())!==canonicalJson(stable.changed_paths)
            ||files.some(x=>['removed','renamed'].includes(x.status)))fail('FILES_SCOPE');
          for(const file of files){
            const route=`/contents/${file.filename.split('/').map(encodeURIComponent).join('/')}`;
            const {value:head}=await api(`${route}?ref=${b.expected_head_sha}`),{value:main}=await api(`${route}?ref=${b.current_main_sha}`);
            if(head.type!=='file'||main.type!=='file'||!sha(head.sha)||head.sha!==main.sha)fail('HYGIENE_BLOB');
          }
        }
      }
      await liveTuple();return true;
    },execute:async()=>{
      let outcome;
      if(event.operation==='REDUNDANT_PR_HYGIENE'){
        token=writeToken;
        const {value:closed}=await api(`/pulls/${b.pull_request}`,{method:'PATCH',body:{state:'closed'}});
        token=readToken;
        const {value:after}=await api(`/pulls/${b.pull_request}`);
        if(closed.state!=='closed'||after.state!=='closed'||after.merged===true||after.head?.sha!==b.expected_head_sha||after.base?.sha!==b.old_base_sha)fail('CLOSE_READBACK_AMBIGUOUS');
        outcome={state:'STALE_REDUNDANT_CLOSED',head_sha:after.head.sha,reopen_is_reversible:true};
      }else{
        token=writeToken;
        const {status}=await api(`/pulls/${b.pull_request}/update-branch`,{method:'PUT',body:{expected_head_sha:b.expected_head_sha}});
        token=readToken;
        if(status!==202)fail('UPDATE_OUTCOME_UNKNOWN');
        let after;
        // Only readback is polled. The accepted PUT is never repeated.
        for(let attempt=0;attempt<24;attempt++){
          ({value:after}=await api(`/pulls/${b.pull_request}`));
          if(after.head?.sha!==b.expected_head_sha)break;
          if(attempt<23)await new Promise(resolve=>setTimeout(resolve,5000));
        }
        if(after.head?.sha===b.expected_head_sha)fail('UPDATE_READBACK_PENDING');
        const {value:commit}=await api(`/git/commits/${after.head?.sha}`);
        if(after.state!=='open'||after.base?.sha!==b.current_main_sha||commit.sha!==after.head.sha||canonicalJson(commit.parents?.map(x=>x.sha))!==canonicalJson([b.expected_head_sha,b.current_main_sha]))fail('UPDATE_READBACK_AMBIGUOUS');
        outcome={state:'STALE_BASE_CONVERGED',new_head_sha:after.head.sha,ordered_parent_set_verified:true,fresh_ci_required:true,fresh_authorization_generation_required:true};
      }
      const signed={id:'kidults-broker-lifecycle-receipt-v1',state:'VERIFIED_PASS',key,binding,outcome,key_fingerprint:fingerprint,
        observed_at:new Date(now()).toISOString(),production:'HOLD',public:'HOLD',g5:'HOLD'};
      return {...signed,signature:crypto.sign('RSA-SHA256',Buffer.from(canonicalJson(signed)),privateKey).toString('base64')};
    }});
  token=undefined;writeToken=undefined;readToken=undefined;
  return {ok:['EXECUTED_VERIFIED','REUSED_SUCCESS'].includes(result.state),...result};
}

// Finalizer tokens retain their existing permissions, but the token handoff
// shares the PR/head family fence with update and close. A reservation follower
// must exit before calling this adapter. Issued tokens are not stored/replayed.
export async function brokerMintFinalizer({event,config,ledgerRequest,getPrivateKey,mint,owner,now=()=>Date.now()}){
  if(event?.action!=='MINT_INSTALLATION_TOKEN'||event.repository!==config.repository||String(event.repository_id)!==String(config.repositoryId)
    ||!Number.isSafeInteger(Number(event.pull_request))||Number(event.pull_request)<1||!sha(event.base_sha)||!sha(event.head_sha)
    ||event.base_sha===event.head_sha||!config.operationTable||!owner
    ||(event.permission_profile&&event.permission_profile!=='AUTONOMOUS_EVENT_DISPATCH'))fail('FINALIZER_INPUT');
  const cutover=await observeLifecycleCutover({config,ledgerRequest,now});
  if(!cutover.ok)return cutover;
  const binding={repository:config.repository,root_mission_id:'KIDULTS-AUTONOMOUS-LIFECYCLE',stage_id:`finalizer-token:${event.pull_request}`,
    operation_kind:'FINALIZER_TOKEN_HANDOFF',exact_target:`${event.pull_request}:${event.base_sha}:${event.head_sha}`,
    payload_sha256:sha256(canonicalJson({permission_profile:'AUTONOMOUS_EVENT_DISPATCH',permissions:['contents:write','pull_requests:write']}))};
  const key=operationKey(binding),family=sha256(canonicalJson({repository:config.repository,pull_request:Number(event.pull_request),expected_head_sha:event.head_sha}));
  const familyKey={pk:`RESUME_TUPLE_V1#${family}`,sk:'OPERATION'};
  const ledger=new DynamoDBOperationLedger({request:ledgerRequest,table:config.operationTable,repository:config.repository});
  const current=(await ledgerRequest('Get',{TableName:config.operationTable,Key:familyKey,ConsistentRead:true})).Item;
  if(current)return {ok:false,state:'HOLD_RECONCILE',reason:'PR_HEAD_ALREADY_OWNED',key:current.operation_key};
  try{await ledgerRequest('Put',{TableName:config.operationTable,Item:{...familyKey,operation_key:key,owner,state:'IN_FLIGHT'},ConditionExpression:'attribute_not_exists(pk) AND attribute_not_exists(sk)'});}
  catch(error){if(error?.name!=='ConditionalCheckFailedException')throw error;return {ok:false,state:'HOLD_RECONCILE',reason:'PR_HEAD_CONCURRENT_WRITER'};}
  const privateKey=await getPrivateKey(),publicKey=crypto.createPublicKey(privateKey);
  const fingerprint=sha256(publicKey.export({type:'spki',format:'der'}).toString('base64'));
  const verify=async receipt=>{
    if(receipt?.id!=='kidults-broker-finalizer-token-handoff-v1'||receipt.key!==key||receipt.state!=='TOKEN_ISSUED_NOT_LANDING_SUCCESS'
      ||receipt.key_fingerprint!==fingerprint||canonicalJson(receipt.binding)!==canonicalJson(binding))return false;
    const {signature,...signed}=receipt;
    return typeof signature==='string'&&crypto.verify('RSA-SHA256',Buffer.from(canonicalJson(signed)),publicKey,Buffer.from(signature,'base64'));
  };
  let minted;
  const result=await resumeOperation({binding,ledger,owner,readExternal:async()=>{
    const row=await ledger.read(key);if(!row||row.state==='IN_FLIGHT'&&row.owner===owner)return {state:'ABSENT'};
    return row.state==='SUCCESS'?{state:'SUCCESS',receipt:row.receipt}:{state:'UNKNOWN'};
  },verifyReceipt:verify,authorize:async()=>true,execute:async()=>{
    minted=await mint(event);
    if(minted.ok!==true||typeof minted.token!=='string')fail('FINALIZER_TOKEN_DENIED');
    const signed={id:'kidults-broker-finalizer-token-handoff-v1',state:'TOKEN_ISSUED_NOT_LANDING_SUCCESS',key,binding,key_fingerprint:fingerprint,
      observed_at:new Date(now()).toISOString(),production:'HOLD',public:'HOLD',g5:'HOLD'};
    return {...signed,signature:crypto.sign('RSA-SHA256',Buffer.from(canonicalJson(signed)),privateKey).toString('base64')};
  }});
  if(result.state!=='EXECUTED_VERIFIED')return {ok:false,state:'HOLD_RECONCILE',reason:'TOKEN_HANDOFF_NOT_REISSUED'};
  return {...minted,protected_handoff:result.receipt};
}
