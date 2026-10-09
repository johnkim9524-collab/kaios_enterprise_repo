import {classifyPurposeRights,RIGHTS_CLEAR} from '../source-intelligence/lib/source-purpose-rights-gate-v1.mjs';
import {buildAtomicCurrentSoldBatchBundle} from '../market/current-sold-atomic-batch-v1.mjs';
import {canonicalJsonDigest} from '../market/current-sold-batch-v1.mjs';

const fail=code=>{throw new Error(`BUSINESS_INPUT_STAGE_${code}`);};
// This is an input-processing stage, not a native domain certificate or acquisition authority.
// Protected native acquisition and registry authority must be authenticated separately.
export function executeBusinessInputStage({envelope,receiptRegistry,purposeRights,expectedRegistryDigest,sourceSha,runId,now=new Date()}){
  if(!/^[a-f0-9]{40}$/.test(sourceSha||'')||envelope?.source_sha!==sourceSha
    ||typeof runId!=='string'||envelope?.canonical_run_id!==runId)fail('SOURCE_RUN_BINDING');
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))fail('TIME');
  if(!Array.isArray(envelope.observations)||!envelope.observations.length||envelope.observations.length>100)fail('BOUNDED_INPUT');
  if(!Array.isArray(purposeRights)||purposeRights.length>100)fail('PURPOSE_RIGHTS');
  const sources=[...new Set(envelope.observations.map(r=>r.source_id))].sort();
  if(new Set(purposeRights.map(r=>r.source_id)).size!==purposeRights.length)fail('DUPLICATE_RIGHTS');
  const decisions=sources.map(source_id=>{
    const row=purposeRights.find(r=>r.source_id===source_id);
    if(!row)fail('MISSING_SOURCE_RIGHTS');
    const decision=classifyPurposeRights(row,'CURRENT_SOLD_TRANSACTION',now);
    if(decision.decision!==RIGHTS_CLEAR)fail(`RIGHTS_HOLD:${source_id}`);
    return {source_id,...decision};
  });
  const bundle=buildAtomicCurrentSoldBatchBundle(envelope,receiptRegistry,{now,expectedReceiptRegistryDigest:expectedRegistryDigest});
  if(bundle.receipt.status!=='PASS'||bundle.receipt.counts.admitted<1
    ||bundle.receipt.counts.rejected!==0||bundle.receipt.counts.quarantined!==0
    ||bundle.evidence.length!==bundle.receipt.counts.admitted)fail('ATOMIC_ADMISSION');
  const lineage={source_sha:sourceSha,canonical_run_id:runId,
    input_digest:canonicalJsonDigest(envelope),registry_digest:canonicalJsonDigest(receiptRegistry),
    purpose_rights_digest:canonicalJsonDigest(purposeRights),
    event_versions_digest:bundle.receipt.event_versions_digest,evidence_digest:bundle.receipt.evidence_digest,
    acquisition_receipt_ids:[...new Set(envelope.observations.map(r=>r.acquisition_receipt_id))].sort(),
    rights_receipt_ids:[...new Set(envelope.observations.map(r=>r.rights_receipt_id))].sort()};
  const result={id:'kidults-business-input-stage-v1',state:'INPUT_PROCESSING_VERIFIED',
    evidence_scope:'CONTENT_VALIDATION_ONLY_NOT_AUTHENTICATED_NATIVE_RUNTIME',
    source_sha:sourceSha,canonical_run_id:runId,rights_decisions:decisions,lineage,
    bundle,native_domain_state:'HOLD',native_domain_receipt_emitted:false,
    empirical_inputs_authenticated:false,acquisition_authorized:false,ledger_write_authorized:false,
    immutable_candidate_created:false,track_b_started:false,promotion_authority:false,
    remaining_requirements:['AUTHENTICATED_NATIVE_ACQUISITION','PROTECTED_REGISTRY_AUTHORITY','IMMUTABLE_STORAGE_AND_READBACK','EXACT_PAIR_TRACK_B_ASSESSMENT'],
    production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
  return {...result,content_digest:canonicalJsonDigest(result)};
}
