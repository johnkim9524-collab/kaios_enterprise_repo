import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
const root=process.cwd();
const policy=JSON.parse(fs.readFileSync(path.join(root,"coordination/kidults/governance/delegated-autonomous-internal-authority-policy-v1.json"),"utf8"));
const approvalPolicy=JSON.parse(fs.readFileSync(path.join(root,"coordination/kidults/governance/autonomous-approval-policy-envelope-v1.json"),"utf8"));
const schema=JSON.parse(fs.readFileSync(path.join(root,"coordination/kidults/governance/delegated-autonomous-authority-receipt-schema-v1.json"),"utf8"));
const fail=(c)=>{throw new Error(c)};
for(const v of ["PRODUCTION","PUBLIC","G5","EXTERNAL_COMMUNICATION","EXTERNAL_SPEND","CONTRACTUAL_COMMITMENT","IRREVERSIBLE_SECURITY_CHANGE","CREDENTIAL_OR_PERMISSION_EXPANSION","DESTRUCTIVE_DATA_OPERATION"]) if(!policy.owner_reserved_actions.includes(v)) fail("OWNER_RESERVED_ACTION_MISSING:"+v);
if(policy.id!=="AI-020"||policy.accountability_transfer!==false) fail("POLICY_ID_OR_ACCOUNTABILITY_INVALID");
if(policy.approval_quorum.minimum!==1||JSON.stringify(policy.approval_quorum.roles)!==JSON.stringify(["KPMO"])||!policy.approval_quorum.distinct_identities_required||!policy.approval_quorum.self_approval_forbidden) fail("QUORUM_INVALID");
if(Object.values(policy.holds).some(v=>v!=="HOLD")) fail("HOLD_WEAKENED");
if(!policy.delegated_actions.includes("INTERNAL_REVERSIBLE_LANDING")) fail("LANDING_DELEGATION_MISSING");
if(policy.normal_activation.manual_owner_orchestration_for_eligible_work!=="FORBIDDEN") fail("ROUTINE_OWNER_ORCHESTRATION_NOT_FORBIDDEN");
if(policy.normal_activation.manual_independent_review_required!==false) fail("MANUAL_INDEPENDENT_REVIEW_NOT_DISABLED");
if(policy.normal_activation.automated_machine_verification_required!==true) fail("MACHINE_VERIFICATION_NOT_REQUIRED");
const recovery=policy.classification_recovery;
const unknown=approvalPolicy.classes?.UNKNOWN;
if(recovery?.unknown_classification!=="BOUNDED_READ_ONLY_RECLASSIFICATION_THEN_OWNER_IF_UNRESOLVED"
 ||recovery.maximum_reclassification_attempts!==2
 ||recovery.repository_mutation_during_reclassification!==false
 ||recovery.conflicting_authority!=="HOLD_UNTIL_FRESH_MACHINE_CLASSIFICATION"
 ||recovery.stale_replayed_or_scope_drifted_authority!=="HOLD_REQUIRE_FRESH_EXACT_BINDING"
 ||recovery.owner_escalation_for_unknown_only_after_unresolved_reclassification!==true
 ||unknown?.decision!=="QUARANTINE_RECLASSIFY_THEN_OWNER_IF_UNRESOLVED"
 ||unknown.automatic_reclassification_max_attempts!==recovery.maximum_reclassification_attempts
 ||unknown.repository_mutation_during_reclassification!==recovery.repository_mutation_during_reclassification
 ||unknown.owner_escalation_only_after_unresolved_reclassification!==recovery.owner_escalation_for_unknown_only_after_unresolved_reclassification
 ||unknown.final_unresolved_decision!=="FAIL_CLOSED_OWNER_REQUIRED") fail("CLASSIFICATION_RECOVERY_POLICY_MISMATCH");
const arg=process.argv.find(v=>v.startsWith("--receipt="));
if(arg){
 const r=JSON.parse(fs.readFileSync(path.resolve(arg.slice(10)),"utf8"));
 const ajv=new Ajv2020({allErrors:true,strict:true}); addFormats(ajv);
 if(!ajv.compile(schema)(r)) fail("RECEIPT_SCHEMA_INVALID");
 if(r.kpmo_approval.role!=="KPMO") fail("APPROVAL_ROLE_INVALID");
 if(!policy.delegated_actions.includes(r.action)||policy.owner_reserved_actions.includes(r.action)) fail("ACTION_NOT_DELEGATED");
 const issued=Date.parse(r.issued_at), expires=Date.parse(r.expires_at);
 if(expires<=Date.now()) fail("AUTHORITY_EXPIRED");
 if(expires<=issued||expires-issued>900000) fail("AUTHORITY_TTL_INVALID");
 if(r.kpmo_approval.approved_at<r.issued_at) fail("APPROVAL_TIME_INVALID");
 for(const [env,key] of [["EXPECTED_BASE_SHA","base_sha"],["EXPECTED_HEAD_SHA","head_sha"],["EXPECTED_HEAD_TREE_SHA","head_tree_sha"],["EXPECTED_SCOPE_DIGEST","scope_digest"],["EXPECTED_NONCE_DIGEST","nonce_digest"]]) if(process.env[env]&&process.env[env]!==r[key]) fail(env+"_MISMATCH");
}
console.log(JSON.stringify({id:"kidults-delegated-autonomous-internal-authority-validation-v1",state:"VERIFIED_PASS",policy:policy.id,production:"HOLD",public:"HOLD",g5:"HOLD"}));
