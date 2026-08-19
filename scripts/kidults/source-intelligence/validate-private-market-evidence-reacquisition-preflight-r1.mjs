import fs from 'node:fs/promises';
const p=process.argv[2]||'coordination/kidults/source-intelligence/private-market-evidence-reacquisition-preflight-r1.json';
const x=JSON.parse(await fs.readFile(p,'utf8'));
if(x.scope_boundary!=='COLLECTIBLES_ONLY') throw new Error('SCOPE_BOUNDARY_INVALID');
if(x.production!=='HOLD'||x.public_release!=='HOLD') throw new Error('RELEASE_BOUNDARY_INVALID');
if(x.active_market_claim!=='NONE') throw new Error('ACTIVE_MARKET_CLAIM_MUST_REMAIN_NONE');
if(x.provider_payload_in_repo_or_public_ci!==false) throw new Error('PUBLIC_PROVIDER_PAYLOAD_PROHIBITED');
for(const k of ['EXPLICIT_FIELD_BY_PURPOSE_RIGHTS_ALLOW','PRIVATE_CONTROLLED_STORE','OPAQUE_EVIDENCE_RECEIPT','PAYLOAD_SHA256_DIGEST','RETENTION_AND_TTL_POLICY','PRIVATE_TAMPER_VERIFICATION','HISTORICAL_CLEANUP_REVIEWED']) {
  if(!(x.required_before_private_reacquisition||[]).includes(k)) throw new Error(`PRECONDITION_MISSING_${k}`);
}
for(const f of ['raw_provider_payload','provider_token','provider_secret','raw_private_store_locator']) {
  if(!(x.opaque_receipt_schema?.forbidden_fields||[]).includes(f)) throw new Error(`RECEIPT_FORBIDDEN_FIELD_MISSING_${f}`);
}
if(x.field_purpose_rights_manifest?.unknown_or_denied!=='HOLD') throw new Error('UNKNOWN_RIGHTS_MUST_HOLD');
if(x.historical_cleanup?.state!=='PENDING_OWNER_ADMIN_ACTION') throw new Error('HISTORICAL_CLEANUP_TRUTH_DRIFT');
if(x.reactivation_gate?.state!=='BLOCKED'||x.reactivation_gate?.may_activate_dated_sold_claim_before_gate!==false) throw new Error('REACTIVATION_MUST_FAIL_CLOSED');
if(x.reactivation_gate?.may_activate_current_price_or_liquidity!==false) throw new Error('STRONG_MARKET_CLAIMS_MUST_REMAIN_BLOCKED');
console.log(JSON.stringify({status:'PASS_FAIL_CLOSED_STRUCTURE_ONLY',active_market_claim:'NONE',provider_payload_present:false,production:'HOLD'},null,2));
