import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {spawnSync} from "node:child_process";
const fail=c=>{throw new Error(c)};
const receiptPath=process.env.DELEGATED_AUTHORITY_RECEIPT_PATH;
const ledgerRoot=process.env.DELEGATED_AUTHORITY_LEDGER_ROOT;
if(!receiptPath)fail("RECEIPT_PATH_REQUIRED"); if(!ledgerRoot)fail("LEDGER_ROOT_REQUIRED");
const validator=path.join(process.cwd(),"scripts/governance/validate-delegated-autonomous-internal-authority-v1.mjs");
const checked=spawnSync(process.execPath,[validator,"--receipt="+receiptPath],{cwd:process.cwd(),encoding:"utf8",env:process.env});
if(checked.status!==0)fail("AUTHORITY_VALIDATION_FAILED");
const receipt=JSON.parse(fs.readFileSync(receiptPath,"utf8"));
for(const [env,key] of [["EXPECTED_REPOSITORY","repository"],["EXPECTED_BASE_SHA","base_sha"],["EXPECTED_HEAD_SHA","head_sha"],["EXPECTED_HEAD_TREE_SHA","head_tree_sha"],["EXPECTED_SCOPE_DIGEST","scope_digest"],["EXPECTED_NONCE_DIGEST","nonce_digest"]]) if(!process.env[env]||process.env[env]!==receipt[key])fail(env+"_REQUIRED_OR_MISMATCH");
fs.mkdirSync(ledgerRoot,{recursive:true,mode:0o700});
const key=crypto.createHash("sha256").update([receipt.authorization_id,receipt.repository,receipt.base_sha,receipt.head_sha,receipt.head_tree_sha,receipt.scope_digest,receipt.nonce_digest].join("\n")).digest("hex");
const marker=path.join(ledgerRoot,key+".json");
const out={id:"kidults-delegated-autonomous-authority-consumption-v1",state:"CONSUMED",authorization_id:receipt.authorization_id,repository:receipt.repository,base_sha:receipt.base_sha,head_sha:receipt.head_sha,head_tree_sha:receipt.head_tree_sha,scope_digest:receipt.scope_digest,action:receipt.action,consumed_at:new Date().toISOString(),production:"HOLD",public:"HOLD",g5:"HOLD"};
let fd; try{fd=fs.openSync(marker,"wx",0o600)}catch(e){if(e.code==="EEXIST")fail("AUTHORITY_REPLAY_REJECTED");throw e}
try{fs.writeFileSync(fd,JSON.stringify(out,null,2)+"\n")}finally{fs.closeSync(fd)}
console.log(JSON.stringify({...out,marker}));
