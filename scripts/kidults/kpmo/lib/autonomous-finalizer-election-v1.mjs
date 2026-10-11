import {AutonomousLandingError} from './autonomous-internal-landing-v1.mjs';

export const FINALIZER_WORKFLOWS=Object.freeze([
  'KIDULTS Autonomous Track Authorization V1',
  'KIDULTS Autonomous KPMO Authorization V1',
  'KIDULTS Autonomous Independent Verification V1',
]);
const fail=code=>{throw new AutonomousLandingError(code);};

// Workload registry validation and three-role quorum verification precede this
// decision. The existing conditional reservation, not arrival order or a role's
// self-assertion, elects the only writer. No new identity or generation is minted.
export function assertFinalizerElection({policy,workflow}) {
  const rule=policy?.bounded_recovery?.normal_ops_finalizer;
  if(rule?.election_mode!=='ORIGINAL_RESERVATION_CAS_AFTER_THREE_ROLE_QUORUM'
    ||rule.requires_three_role_quorum!==true||rule.requires_exact_head!==true
    ||JSON.stringify(rule.allowed_workflows)!==JSON.stringify(FINALIZER_WORKFLOWS)
    ||!FINALIZER_WORKFLOWS.includes(workflow))fail('AUTONOMOUS_FINALIZER_ELECTION_INVALID');
  return {state:'RESERVATION_ELECTION_REQUIRED',authority_created:false};
}

export function validateReservationConsumption({response,envelope,runId,mergeSha,terminal}) {
  const expected={contract_version:terminal?'3.0.0':'2.0.0',action:'CONSUME_RESERVATION',
    authorization_generation:envelope.authorization_generation,nonce_digest:envelope.nonce_digest,
    run_id:String(runId),head_sha:envelope.head_sha,merge_sha:mergeSha,
    state:'CONSUMED',conditional_write:true};
  if(response?.ok!==true||Object.entries(expected).some(([key,value])=>response[key]!==value)
    ||response.pk!==`RESERVE#${expected.authorization_generation}`
    ||response.sk!==`NONCE#${expected.nonce_digest}`)fail('AUTONOMOUS_CONSUMPTION_REMOTE_BINDING_INVALID');
  if(terminal&&response.terminal_digest!==terminal.receipt_digest)fail('AUTONOMOUS_CONSUMPTION_TERMINAL_BINDING_INVALID');
  return {state:'CONSUMED',conditional_write:true,backend:'AWS_DYNAMODB',
    remote_binding:expected,ledger_key:{pk:response.pk,sk:response.sk}};
}
