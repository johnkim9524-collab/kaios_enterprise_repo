import crypto from 'node:crypto';

const fields=['repository','root_mission_id','stage_id','operation_kind','exact_target','payload_sha256'];
const fail=code=>{throw new Error(code)};
const canonical=value=>{
  if(value===null || ['string','boolean'].includes(typeof value)) return JSON.stringify(value);
  if(typeof value==='number' && Number.isFinite(value)) return JSON.stringify(value);
  if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if(value && Object.getPrototypeOf(value)===Object.prototype) return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  fail('OPERATION_NONCANONICAL_VALUE');
};
export function operationKey(binding){
  if(!binding || Object.keys(binding).sort().join(',')!==[...fields].sort().join(',')) fail('OPERATION_BINDING_FIELDS');
  for(const key of fields) if(typeof binding[key]!=='string'||!binding[key].trim()) fail('OPERATION_BINDING_VALUE');
  if(!/^sha256:[a-f0-9]{64}$/.test(binding.payload_sha256)) fail('OPERATION_PAYLOAD_DIGEST');
  return `sha256:${crypto.createHash('sha256').update(canonical(binding)).digest('hex')}`;
}

// Callbacks are protected adapters, never caller-supplied success assertions.
// A transport error leaves UNKNOWN. No lease timeout authorizes a retry.
export async function resumeOperation({binding,ledger,readExternal,verifyReceipt,authorize,execute,owner,trackMutationPhase=false}){
  const key=operationKey(binding);
  if(typeof owner!=='string'||!owner) fail('OPERATION_OWNER_REQUIRED');
  const observed=await readExternal(binding);
  if(observed?.state==='SUCCESS'){
    if(await verifyReceipt(observed.receipt,binding)!==true) fail('OPERATION_REMOTE_RECEIPT_INVALID');
    await ledger.reconcileSuccess(key,binding,observed.receipt);
    return {state:'REUSED_SUCCESS',key,receipt:observed.receipt};
  }
  if(observed?.state!=='ABSENT') return {state:'HOLD_RECONCILE',key};
  const record=await ledger.claim(key,binding,owner,{trackMutationPhase});
  if(!record?.claimed){
    if(record?.state==='SUCCESS'){
      if(await verifyReceipt(record.receipt,binding)!==true) fail('OPERATION_LEDGER_RECEIPT_INVALID');
      return {state:'REUSED_SUCCESS',key,receipt:record.receipt};
    }
    return {state:'OBSERVE_EXISTING',key};
  }
  let executionStarted=false;
  try{
    if(await authorize(binding)!==true) fail('OPERATION_AUTHORITY_DENIED');
    const fresh=await readExternal(binding);
    if(fresh?.state==='SUCCESS'){
      if(await verifyReceipt(fresh.receipt,binding)!==true) fail('OPERATION_REMOTE_RECEIPT_INVALID');
      await ledger.finish(key,owner,'SUCCESS',fresh.receipt);
      return {state:'REUSED_SUCCESS',key,receipt:fresh.receipt};
    }
    if(fresh?.state!=='ABSENT') fail('OPERATION_REMOTE_AMBIGUOUS');
    // Ownership must be durably checked immediately before the side effect.
    await ledger.assertOwner(key,owner);
    if(trackMutationPhase) await ledger.markMutationStarted(key,owner);
    executionStarted=true;
    const receipt=await execute({binding,key});
    if(await verifyReceipt(receipt,binding)!==true) fail('OPERATION_RESULT_RECEIPT_INVALID');
    await ledger.finish(key,owner,'SUCCESS',receipt);
    return {state:'EXECUTED_VERIFIED',key,receipt};
  }catch(error){
    try {
      if(trackMutationPhase&&!executionStarted) await ledger.finishPreMutationFailure(key,owner,{
        error_code:/^[A-Z0-9_:]{1,160}$/.test(String(error.message))?String(error.message):'PRE_MUTATION_FAILURE',
        mutation_attempted:false,phase:'PRE_MUTATION'});
      else await ledger.finish(key,owner,'UNKNOWN',{error_code:String(error.message)});
    }
    catch(ledgerError){
      throw new AggregateError([error,ledgerError],'OPERATION_OUTCOME_AND_LEDGER_UNCERTAIN',{cause:error});
    }
    throw error;
  }
}

export const OPERATION_LEDGER_DDL=`CREATE TABLE IF NOT EXISTS kidults_resume_operation (
  operation_key text PRIMARY KEY,
  binding jsonb NOT NULL,
  owner text NOT NULL,
  state text NOT NULL CHECK (state IN ('IN_FLIGHT','SUCCESS','UNKNOWN')),
  receipt jsonb,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);`;

// query must use the protected ledger connection. This adapter deliberately
// has no reclaim/delete API: a missing response must be reconciled separately.
export class PostgresOperationLedger{
  constructor(query){this.query=query;}
  async reconcileSuccess(key,binding,receipt){
    if(operationKey(binding)!==key) fail('OPERATION_KEY_MISMATCH');
    // A valid protected remote receipt closes an uncertain result without
    // changing the original writer or issuing the side effect again.
    const r=await this.query(`UPDATE kidults_resume_operation SET state='SUCCESS',receipt=$3::jsonb
WHERE operation_key=$1 AND binding=$2::jsonb AND state IN ('IN_FLIGHT','UNKNOWN') RETURNING operation_key`,[key,JSON.stringify(binding),JSON.stringify(receipt)]);
    if(r.rows.length===1) return;
    const existing=await this.query('SELECT binding,state FROM kidults_resume_operation WHERE operation_key=$1',[key]);
    if(existing.rows.length===0) return;
    const row=existing.rows[0];
    if(row.state!=='SUCCESS'||canonical(row.binding)!==canonical(binding)) fail('OPERATION_RECONCILIATION_CONFLICT');
  }
  async claim(key,binding,owner){
    if(operationKey(binding)!==key) fail('OPERATION_KEY_MISMATCH');
    const r=await this.query(`INSERT INTO kidults_resume_operation (operation_key,binding,owner,state)
VALUES ($1,$2::jsonb,$3,'IN_FLIGHT') ON CONFLICT (operation_key) DO NOTHING RETURNING operation_key`,[key,JSON.stringify(binding),owner]);
    if(r.rows.length===1) return {claimed:true,state:'IN_FLIGHT'};
    const existing=await this.query('SELECT binding,state,receipt FROM kidults_resume_operation WHERE operation_key=$1',[key]);
    const row=existing.rows[0];
    if(!row||canonical(row.binding)!==canonical(binding)) fail('OPERATION_LEDGER_BINDING_MISMATCH');
    return {claimed:false,state:row.state,receipt:row.receipt};
  }
  async assertOwner(key,owner){
    const r=await this.query("SELECT operation_key FROM kidults_resume_operation WHERE operation_key=$1 AND owner=$2 AND state='IN_FLIGHT'",[key,owner]);
    if(r.rows.length!==1) fail('OPERATION_WRITER_FENCED');
  }
  async finish(key,owner,state,receipt){
    if(!['SUCCESS','UNKNOWN'].includes(state)) fail('OPERATION_TERMINAL_STATE');
    const r=await this.query(`UPDATE kidults_resume_operation SET state=$3,receipt=$4::jsonb
WHERE operation_key=$1 AND owner=$2 AND state='IN_FLIGHT' RETURNING operation_key`,[key,owner,state,JSON.stringify(receipt)]);
    if(r.rows.length!==1) fail('OPERATION_WRITER_FENCED');
  }
}
