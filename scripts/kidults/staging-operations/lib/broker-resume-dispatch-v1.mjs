import crypto from 'node:crypto';
import {canonicalJson,sha256} from '../../kpmo/lib/canonical-json-v1.mjs';
import {buildDispatchRequest,transitionDispatchReceipt} from '../../kpmo/lib/autonomous-dispatch-fanout-v1.mjs';
import {operationKey,resumeOperation} from './resume-operation-v1.mjs';
import {DynamoDBOperationLedger} from './dynamodb-operation-ledger-v1.mjs';

const fail = code => {throw new Error(`RESUME_DISPATCH_DENIED:${code}`)};
const ROOT = 'KIDULTS-AUTONOMOUS-AUTHORIZATION';
const bindingFor = stable => ({repository:stable.repository,root_mission_id:ROOT,
  stage_id:`authorization-fanout:${stable.pull_request}`,operation_kind:'WORKFLOW_DISPATCH',
  exact_target:`${stable.base_sha}:${stable.head_sha}:${stable.head_tree_sha}`,
  payload_sha256:sha256(canonicalJson({event_type:'kidults.authorization.generation.v1',binding:stable}))});

// Only the authenticated Lambda boundary supplies configuration, ledger RPC,
// private-key access and mint. No caller callback or caller-selected table/key.
export async function brokerResumeDispatch({event,config,request,ledgerRequest,getPrivateKey,mint,owner,now=()=>Date.now()}) {
  if(event?.action!=='RESUME_AUTHORIZATION_DISPATCH' || Object.keys(event).sort().join(',')!=='action,envelope,run_attempt,run_id'
    || event.envelope?.repository!==config.repository || String(event.envelope?.repository_id)!==String(config.repositoryId)
    || !config.operationTable || !config.activationRunFloor || !/^[1-9][0-9]*$/.test(String(config.activationRunFloor))
    || !/^[1-9][0-9]*$/.test(String(event.run_id)) || BigInt(event.run_id)<=BigInt(config.activationRunFloor)
    || event.run_attempt!==1) fail('INPUT_OR_CUTOVER');
  const envelope=event.envelope;
  if(envelope.production!=='HOLD'||envelope.public!=='HOLD'||envelope.g5!=='HOLD') fail('HOLD_BOUNDARY');
  const built=buildDispatchRequest({envelope,runId:event.run_id,runAttempt:event.run_attempt,now:new Date(now()).toISOString()});
  const binding=bindingFor(built.receipt.binding),key=operationKey(binding);
  const ledger=new DynamoDBOperationLedger({request:ledgerRequest,table:config.operationTable,repository:config.repository});
  const privateKey=await getPrivateKey();
  const publicKey=crypto.createPublicKey(privateKey);
  const fingerprint=sha256(publicKey.export({type:'spki',format:'der'}).toString('base64'));
  const verify=async sealed=>{
    if(sealed?.key!==key || sealed.key_fingerprint!==fingerprint || canonicalJson(sealed.binding)!==canonicalJson(binding)) return false;
    const receipt=sealed.receipt;
    if(receipt?.state!=='DISPATCH_ACCEPTED' || canonicalJson(receipt.binding)!==canonicalJson(built.receipt.binding)) return false;
    const {receipt_digest,...core}=receipt;
    if(receipt_digest!==sha256(canonicalJson(core))) return false;
    const {signature,...signed}=sealed;
    return typeof signature==='string' && crypto.verify('RSA-SHA256',Buffer.from(canonicalJson(signed)),publicKey,Buffer.from(signature,'base64'));
  };
  const readExternal=async()=>{
    const row=await ledger.read(key);
    if(!row) return {state:'ABSENT'};
    if(canonicalJson(row.binding)!==canonicalJson(binding)) fail('LEDGER_BINDING');
    // This protected table is the acknowledgement source. An absent row cannot
    // prove that GitHub received no event; cutover excludes all legacy run IDs.
    if(row.state==='SUCCESS') return {state:'SUCCESS',receipt:row.receipt};
    if(row.state==='IN_FLIGHT' && row.owner===owner) return {state:'ABSENT'};
    return {state:'UNKNOWN'};
  };
  let token;
  const result=await resumeOperation({binding,ledger,owner,readExternal,verifyReceipt:verify,
    authorize:async()=>{
      const issued=Date.parse(envelope.issued_at),expires=Date.parse(envelope.expires_at);
      if(!Number.isFinite(issued)||!Number.isFinite(expires)||issued>now()||expires<=now()||expires-issued>7200000) fail('AUTHORITY_TIME');
      // Keep the existing broker's exact live-main/same-repository PR gate.
      const minted=await mint({action:'MINT_INSTALLATION_TOKEN',repository:envelope.repository,
        repository_id:envelope.repository_id,pull_request:envelope.pull_request,base_sha:envelope.base_sha,
        head_sha:envelope.head_sha,authorization_generation:envelope.authorization_generation});
      token=minted.token;
      return minted.ok===true;
    },
    execute:async()=>{
      // Separate tuple fence prevents a new clock run/generation from sending
      // the same exact candidate again. Unknown outcomes are never reclaimed.
      const tuple=sha256(canonicalJson({repository:binding.repository,pull_request:envelope.pull_request,
        exact_target:binding.exact_target,scope_digest:envelope.scope_digest}));
      try {
        await ledgerRequest('Put',{TableName:config.operationTable,
          Item:{pk:`RESUME_TUPLE_V1#${tuple}`,sk:'OPERATION',operation_key:key,owner,state:'IN_FLIGHT'},
          ConditionExpression:'attribute_not_exists(pk) AND attribute_not_exists(sk)'});
      } catch(error) {
        if(error?.name==='ConditionalCheckFailedException') fail('EXACT_TUPLE_ALREADY_CLAIMED');
        throw error;
      }
      const response=await request(`https://api.github.com/repos/${config.repository}/dispatches`,{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'application/vnd.github+json',
          Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'kidults-resume-dispatch-v1',
          'Content-Type':'application/json'},body:JSON.stringify(built.request)});
      if(response.status!==204) fail('DISPATCH_OUTCOME_UNKNOWN');
      const receipt=transitionDispatchReceipt(built.receipt,{state:'DISPATCH_ACCEPTED',now:new Date(now()).toISOString()});
      const signed={id:'kidults-broker-resume-receipt-v1',key,binding,receipt,key_fingerprint:fingerprint};
      return {...signed,signature:crypto.sign('RSA-SHA256',Buffer.from(canonicalJson(signed)),privateKey).toString('base64')};
    }});
  token=undefined;
  return {ok:['EXECUTED_VERIFIED','REUSED_SUCCESS'].includes(result.state),...result};
}
