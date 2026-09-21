import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
const root=process.cwd(), validator=path.join(root,"scripts/governance/validate-delegated-autonomous-internal-authority-v1.mjs");
function fixture(){
 const issued=new Date(Date.now()-1000).toISOString(), approved=new Date().toISOString(), expires=new Date(Date.now()+600000).toISOString();
 return {id:"kidults-delegated-autonomous-authority-receipt-v1",version:"1.0.0",state:"AUTHORIZED",authorization_id:"DAIA-2283-"+"b".repeat(12),repository:"johnkim9524-collab/kaios_enterprise_repo",base_sha:"a".repeat(40),head_sha:"b".repeat(40),head_tree_sha:"c".repeat(40),scope_digest:"sha256:"+"d".repeat(64),action:"BUG_FIX",track_approval:{agent_id:"TRACK-A-01",role:"ACCOUNTABLE_TRACK_AGENT",decision:"APPROVE",approved_at:approved},kpmo_approval:{agent_id:"KPMO-01",role:"KPMO",decision:"APPROVE",approved_at:approved},tests:["regression","negative"],rollback:{strategy:"revert exact head",verified:true},issued_at:issued,expires_at:expires,nonce_digest:"sha256:"+"e".repeat(64),production:"HOLD",public:"HOLD",g5:"HOLD"};
}
function run(mutator,env={}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),"ai020-")),r=fixture();if(mutator)mutator(r);const file=path.join(dir,"receipt.json");fs.writeFileSync(file,JSON.stringify(r));return spawnSync(process.execPath,[validator,"--receipt="+file],{cwd:root,encoding:"utf8",env:{...process.env,...env}})}
test("valid distinct Track and KPMO approval passes",()=>assert.equal(run().status,0));
for(const [name,mutate] of [
 ["same identity",r=>r.kpmo_approval.agent_id=r.track_approval.agent_id],
 ["owner reserved",r=>r.action="PRODUCTION"],
 ["production hold weakened",r=>r.production="GO"],
 ["missing tests",r=>r.tests=[]],
 ["rollback unverified",r=>r.rollback.verified=false],
 ["stale expiry",r=>r.expires_at="2000-01-01T00:00:00Z"],
 ["overlong ttl",r=>r.expires_at=new Date(Date.parse(r.issued_at)+901000).toISOString()],
 ["scope digest malformed",r=>r.scope_digest="sha256:bad"],
 ["raw nonce field",r=>r.nonce="secret-should-never-be-stored"],
 ["stale head binding",r=>r.head_sha="f".repeat(40)]
]) test("rejects "+name,()=>assert.notEqual(run(mutate,name==="stale head binding"?{EXPECTED_HEAD_SHA:"b".repeat(40)}:{}).status,0));

test("consumption is exact-bound and replay-safe",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"ai020-consume-")),receipt=fixture(),file=path.join(dir,"receipt.json"),ledger=path.join(dir,"ledger");
 fs.writeFileSync(file,JSON.stringify(receipt));
 const env={...process.env,DELEGATED_AUTHORITY_RECEIPT_PATH:file,DELEGATED_AUTHORITY_LEDGER_ROOT:ledger,EXPECTED_REPOSITORY:receipt.repository,EXPECTED_BASE_SHA:receipt.base_sha,EXPECTED_HEAD_SHA:receipt.head_sha,EXPECTED_HEAD_TREE_SHA:receipt.head_tree_sha,EXPECTED_SCOPE_DIGEST:receipt.scope_digest,EXPECTED_NONCE_DIGEST:receipt.nonce_digest};
 const consume=path.join(root,"scripts/governance/consume-delegated-autonomous-internal-authority-v1.mjs");
 assert.equal(spawnSync(process.execPath,[consume],{cwd:root,encoding:"utf8",env}).status,0);
 assert.notEqual(spawnSync(process.execPath,[consume],{cwd:root,encoding:"utf8",env}).status,0);
});
test("consumption rejects missing exact binding",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"ai020-bind-")),receipt=fixture(),file=path.join(dir,"receipt.json");fs.writeFileSync(file,JSON.stringify(receipt));
 const consume=path.join(root,"scripts/governance/consume-delegated-autonomous-internal-authority-v1.mjs");
 const env={...process.env,DELEGATED_AUTHORITY_RECEIPT_PATH:file,DELEGATED_AUTHORITY_LEDGER_ROOT:path.join(dir,"ledger")};
 assert.notEqual(spawnSync(process.execPath,[consume],{cwd:root,encoding:"utf8",env}).status,0);
});
