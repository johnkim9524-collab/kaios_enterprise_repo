#!/usr/bin/env node
import {execFileSync,spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import fs from "node:fs";
import {EXPLICIT_EXECUTION_CONTROLS,routeAuthorizationControl} from "./lib/approval-policy-routing-v1.mjs";

const root = process.cwd();
const revision = process.argv[2] || "HEAD";
const output = process.argv[3] || "coordination/kidults/governance/approval-policy-file-manifest-v1.json";
const manifestPath = "coordination/kidults/governance/approval-policy-file-manifest-v1.json";
const inventoryPath = "coordination/kidults/governance/approval-policy-inventory-v1.json";
const exclusions = [manifestPath,inventoryPath];
const pattern = String.raw`(approval|authorization|owner[_ -]?reserved|manual[_ -]?(approval|gate)|program owner|independent review)`;
const git = args => execFileSync("git", args, {cwd:root, encoding:"utf8", maxBuffer:64*1024*1024});
const sha256 = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const scannedPaths = git(["grep", "-Il", "-E", pattern, revision]).trim().split("\n").filter(Boolean)
  .map(value => value.replace(new RegExp(`^${revision}:`), "")).filter(value=>!exclusions.includes(value));
const paths = [...new Set([...scannedPaths, ...EXPLICIT_EXECUTION_CONTROLS])].sort();
const classify = file => {
  if (EXPLICIT_EXECUTION_CONTROLS.includes(file) || /^(coordination\/kidults\/(governance|kpmo)\/|docs\/governance\/|\.github\/workflows\/|scripts\/(governance|kidults\/kpmo)\/|tests\/governance\/)/.test(file)) return "EXECUTION_AUTHORIZATION_CONTROL";
  if (/^(docs\/|coordination\/)/.test(file)) return "DOMAIN_ADJUDICATION_OR_DOCUMENTATION";
  return "REFERENCE_OR_IMPLEMENTATION";
};
const tree = new Map(git(["ls-tree","-r",revision]).trim().split("\n").filter(Boolean).map(line=>{
  const [meta,file]=line.split("\t"); return [file,meta.split(" ")[2]];
}));
const blobShas = paths.map(file=>{ const blob=tree.get(file); if(!blob) throw new Error(`MISSING_GIT_BLOB:${file}`); return blob; });
const batch = spawnSync("git",["cat-file","--batch"],{cwd:root,input:`${blobShas.join("\n")}\n`,maxBuffer:256*1024*1024});
if(batch.status!==0) throw new Error(`GIT_CAT_FILE_BATCH_FAILED:${batch.stderr?.toString("utf8")||batch.status}`);
let cursor=0; const blobBytes=new Map();
for(const expected of blobShas){
  const nl=batch.stdout.indexOf(10,cursor); if(nl<0) throw new Error("GIT_CAT_FILE_BATCH_HEADER_MISSING");
  const [sha,type,sizeText]=batch.stdout.subarray(cursor,nl).toString("utf8").split(" ");
  const size=Number(sizeText); if(sha!==expected||type!=="blob"||!Number.isSafeInteger(size)) throw new Error(`GIT_CAT_FILE_BATCH_HEADER_INVALID:${expected}`);
  const start=nl+1,end=start+size; blobBytes.set(sha,batch.stdout.subarray(start,end)); cursor=end+1;
}
const files = paths.map((file,index) => {
  const git_blob=blobShas[index], bytes=blobBytes.get(git_blob), classification=classify(file);
  return {path:file, classification, git_blob, sha256:sha256(bytes),
    ...(classification==="EXECUTION_AUTHORIZATION_CONTROL"?{authorization_routing:routeAuthorizationControl(file,bytes.toString("utf8"))}:{})};
});
const payload = {
  id:"kidults-approval-policy-file-manifest-v1", version:"1.0.0", revision,
  scan:{method:"GIT_OBJECT_CONTENT_SCAN", pattern, exclusions, file_count:files.length}, files,
};
payload.manifest_sha256 = sha256(JSON.stringify(files));
fs.writeFileSync(output, `${JSON.stringify(payload,null,2)}\n`);
if (output === manifestPath && fs.existsSync(inventoryPath)) {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
  inventory.audit.baseline_sha = revision;
  inventory.audit.approval_related_files_reviewed = files.length;
  inventory.audit.manifest_sha256 = payload.manifest_sha256;
  inventory.manifest_sha256 = payload.manifest_sha256;
  const routeCounts = files.reduce((counts, file) => {
    const route = file.authorization_routing?.route;
    if (route) counts[route] = (counts[route] || 0) + 1;
    return counts;
  }, {});
  const controls = files.filter(file => file.classification === "EXECUTION_AUTHORIZATION_CONTROL");
  inventory.audit.canonical_execution_authorization_policies = inventory.policies.length;
  inventory.audit.routing_coverage.execution_authorization_controls = controls.length;
  inventory.audit.routing_coverage.consumers = routeCounts.CANONICAL_ENVELOPE || 0;
  inventory.audit.routing_coverage.exemptions = controls.length - (routeCounts.CANONICAL_ENVELOPE || 0);
  inventory.audit.routing_coverage.route_counts = Object.fromEntries(Object.entries(routeCounts).sort());
  fs.writeFileSync(inventoryPath, `${JSON.stringify(inventory,null,2)}\n`);
}
console.log(JSON.stringify({state:"VERIFIED_PASS",output,file_count:files.length,manifest_sha256:payload.manifest_sha256}));
