import {createHash} from 'node:crypto';

const SHA=/^[a-f0-9]{40}$/;
const DIGEST=/^sha256:[a-f0-9]{64}$/;
const REPOSITORY='johnkim9524-collab/kaios_enterprise_repo';
const fail=code=>{throw new Error(`DRAFT_PROPOSAL_RESUME_${code}`);};
const hash=value=>`sha256:${createHash('sha256').update(value).digest('hex')}`;
const canonical=value=>JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))));
const fields=(value,expected)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join(',')===[...expected].sort().join(',');
const branch=value=>typeof value==='string'&&value.startsWith('codex/')
  &&!/[\s~^:?*\[\\]/.test(value)&&!value.includes('..')&&!value.includes('//')&&!value.includes('@{')
  &&!value.endsWith('/')&&!value.endsWith('.')&&!value.endsWith('.lock');
const intentFields=['id','version','repository','root_mission_id','operation','base_branch','base_sha',
  'head_branch','source_head_sha','source_head_tree_sha','payload_digest','scope','authority_granted'];

export function canonicalDraftProposalPayload(payload){
  if(!fields(payload,['repository','base','head','draft','title','body'])
    ||payload.repository!==REPOSITORY||payload.base!=='main'||!branch(payload.head)||payload.draft!==true
    ||typeof payload.title!=='string'||!payload.title.trim()||payload.title.length>256
    ||typeof payload.body!=='string'||!payload.body.trim()||payload.body.length>65536)fail('PAYLOAD');
  return canonical(payload);
}
function validateIntent(intent){
  if(!fields(intent,intentFields)||intent.id!=='kidults-development-draft-proposal-intent-v1'||intent.version!=='1.0.0'
    ||intent.repository!==REPOSITORY||typeof intent.root_mission_id!=='string'||!intent.root_mission_id.trim()
    ||intent.operation!=='CREATE_DRAFT_PR'||intent.base_branch!=='main'||!branch(intent.head_branch)
    ||!SHA.test(intent.base_sha)||!SHA.test(intent.source_head_sha)||!SHA.test(intent.source_head_tree_sha)
    ||!DIGEST.test(intent.payload_digest)||intent.scope!=='AUTHORIZED_REVERSIBLE_DEVELOPMENT_PROPOSAL'
    ||intent.authority_granted!==false)fail('INTENT');
}
export function draftProposalOperationKey(intent){
  validateIntent(intent);
  // Stable across retries/sessions and derived metadata descendants.
  return hash(canonical(intent));
}
const policyFields={scope:'AUTHORIZED_REVERSIBLE_DEVELOPMENT_PROPOSAL',allowed_operation:'CREATE_DRAFT_PR',
  protected_operation_ledger_required:false,fresh_exact_head_bootstrap_required:true,immutable_git_intent_required:true,
  intent_source_ancestor_required:true,descendant_changes:'DERIVED_METADATA_ONLY',
  live_base_head_and_all_pr_states_reconciliation_required:true,complete_pr_index_required:true,
  same_writer_control_context_required:true,github_duplicate_constraint_required:true,
  exact_canonical_payload_digest_required:true,matching_existing_open_draft:'REUSE_NO_WRITE',
  closed_merged_or_conflicting_proposal:'HOLD_NO_REISSUE',maximum_create_attempts:1,
  ambiguous_or_rejected_write:'RECONCILE_NO_BLIND_RETRY',exact_draft_readback_required:true,
  ready_review_approval_merge_dispatch_deploy_generation_reservation_promotion_allowed:false,
  cross_system_exactly_once_claimed:false,grants_new_authority:false};
const boundary={protected_landing_authority:false,ready_allowed:false,approval_allowed:false,dispatch_allowed:false,
  production:'HOLD',public:'HOLD',g5:'HOLD',cross_system_exactly_once_claimed:false};
function matches(pr,binding){
  return Number.isSafeInteger(pr?.number)&&pr.number>0&&pr.state==='open'&&pr.draft===true&&pr.merged===false
    &&pr.repository===binding.repository&&pr.base_repository===binding.repository&&pr.head_repository===binding.repository
    &&pr.base_branch===binding.base_branch&&pr.head_branch===binding.head_branch&&pr.base_sha===binding.base_sha
    &&pr.head_sha===binding.head_sha&&pr.title===binding.title&&pr.body===binding.body;
}

// Pure preflight: callers must obtain these bindings from authenticated GitHub
// reads and committed Git blobs. This function never reads credentials or writes.
export function validateDevelopmentDraftProposalResume(input){
  const {policy,authorized,bootstrapVerified,bootstrapSha,intent,intentDigest,intentCommitSha,intentSourceTreeSha,
    intentSourceIsAncestor,onlyDerivedMetadataSinceIntent,payload,payloadDigest,expectedHeadSha,
    liveRepository,liveBaseSha,liveHeadSha,liveHeadTreeSha,existingPullRequests,pullRequestIndexComplete,
    sameWriterControlContextVerified,githubDuplicateConstraintAvailable,attempt=1,outcome='NOT_ATTEMPTED',operation='CREATE_DRAFT_PR'}=input;
  const route=policy?.draft_proposal_resume;
  if(!route||!fields(route,Object.keys(policyFields))||Object.entries(policyFields).some(([k,v])=>route[k]!==v))fail('POLICY');
  if(authorized!==true||bootstrapVerified!==true||bootstrapSha!==expectedHeadSha)fail('AUTHORITY_OR_BOOTSTRAP');
  if(operation!=='CREATE_DRAFT_PR'||attempt!==1||!['NOT_ATTEMPTED','UNKNOWN','REJECTED','CREATED'].includes(outcome))fail('OPERATION_OR_ATTEMPT');
  validateIntent(intent);
  if(!SHA.test(intentCommitSha)||intentDigest!==hash(canonical(intent))||intentSourceTreeSha!==intent.source_head_tree_sha
    ||intentSourceIsAncestor!==true||onlyDerivedMetadataSinceIntent!==true)fail('IMMUTABLE_INTENT_BINDING');
  const bytes=canonicalDraftProposalPayload(payload);
  if(payloadDigest!==hash(bytes)||payloadDigest!==intent.payload_digest||payload.repository!==intent.repository
    ||payload.base!==intent.base_branch||payload.head!==intent.head_branch)fail('PAYLOAD_BINDING');
  if(liveRepository!==intent.repository||liveBaseSha!==intent.base_sha||!SHA.test(expectedHeadSha)
    ||liveHeadSha!==expectedHeadSha||!SHA.test(liveHeadTreeSha))fail('LIVE_REF_DRIFT');
  if(pullRequestIndexComplete!==true||sameWriterControlContextVerified!==true||githubDuplicateConstraintAvailable!==true
    ||!Array.isArray(existingPullRequests)||existingPullRequests.length>1000
    ||existingPullRequests.some(p=>!Number.isSafeInteger(p?.number)||p.number<1
      ||!['open','closed'].includes(p.state)||typeof p.base_branch!=='string'||typeof p.head_branch!=='string'
      ||typeof p.repository!=='string'||typeof p.base_repository!=='string'||typeof p.head_repository!=='string'
      ||typeof p.draft!=='boolean'||typeof p.merged!=='boolean')
    ||new Set(existingPullRequests.map(p=>p.number)).size!==existingPullRequests.length)fail('RECONCILIATION_REQUIRED');
  const binding={repository:intent.repository,base_branch:intent.base_branch,head_branch:intent.head_branch,
    base_sha:intent.base_sha,head_sha:liveHeadSha,head_tree_sha:liveHeadTreeSha,title:payload.title,body:payload.body,
    payload_digest:payloadDigest,intent_digest:intentDigest,intent_commit_sha:intentCommitSha,
    operation_key:draftProposalOperationKey(intent)};
  const candidates=existingPullRequests.filter(p=>p.base_branch===binding.base_branch&&p.head_branch===binding.head_branch);
  if(candidates.length===1&&matches(candidates[0],binding))return {state:'REUSED_EXISTING_DRAFT',create_allowed:false,pull_request_number:candidates[0].number,binding,...boundary};
  if(candidates.length)return {state:'HOLD_EXISTING_PROPOSAL',create_allowed:false,binding,...boundary};
  if(outcome!=='NOT_ATTEMPTED')return {state:'HOLD_RECONCILE_NO_REISSUE',create_allowed:false,binding,...boundary};
  return {state:'DRAFT_PROPOSAL_PRECONDITIONS_VERIFIED',create_allowed:true,binding,...boundary};
}
export function verifyDevelopmentDraftProposalReadback({preflight,pullRequest}){
  if(!['DRAFT_PROPOSAL_PRECONDITIONS_VERIFIED','REUSED_EXISTING_DRAFT'].includes(preflight?.state)
    ||preflight?.protected_landing_authority!==false||!matches(pullRequest,preflight.binding))fail('READBACK_BINDING');
  return {state:'DRAFT_PROPOSAL_READBACK_VERIFIED',pull_request_number:pullRequest.number,
    binding:preflight.binding,...boundary};
}
