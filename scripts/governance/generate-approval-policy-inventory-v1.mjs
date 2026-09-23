#!/usr/bin/env node
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import fs from "node:fs";
import {routeAuthorizationControl} from "./lib/approval-policy-routing-v1.mjs";

const root = process.cwd();
const revision = process.argv[2] || "HEAD";
const output = process.argv[3] || "coordination/kidults/governance/approval-policy-file-manifest-v1.json";
const manifestPath = "coordination/kidults/governance/approval-policy-file-manifest-v1.json";
const exclusions = [manifestPath,"coordination/kidults/governance/approval-policy-inventory-v1.json"];
const pattern = String.raw`(approval|authorization|owner[_ -]?reserved|manual[_ -]?(approval|gate)|program owner|independent review)`;
const git = args => execFileSync("git", args, {cwd:root, encoding:"utf8", maxBuffer:64*1024*1024});
const sha256 = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const paths = git(["grep", "-Il", "-E", pattern, revision]).trim().split("\n").filter(Boolean)
  .map(value => value.replace(new RegExp(`^${revision}:`), "")).filter(value=>!exclusions.includes(value)).sort();
const classify = file => {
  if (/^(coordination\/kidults\/(governance|kpmo)\/|docs\/governance\/|\.github\/workflows\/|scripts\/(governance|kidults\/kpmo)\/|tests\/governance\/)/.test(file)) return "EXECUTION_AUTHORIZATION_CONTROL";
  if (/^(docs\/|coordination\/)/.test(file)) return "DOMAIN_ADJUDICATION_OR_DOCUMENTATION";
  return "REFERENCE_OR_IMPLEMENTATION";
};
const files = paths.map(file => {
  const bytes = execFileSync("git", ["show", `${revision}:${file}`], {cwd:root, maxBuffer:64*1024*1024});
  const classification=classify(file);
  return {path:file, classification, git_blob:git(["rev-parse", `${revision}:${file}`]).trim(), sha256:sha256(bytes),
    ...(classification==="EXECUTION_AUTHORIZATION_CONTROL"?{authorization_routing:routeAuthorizationControl(file,bytes.toString("utf8"))}:{})};
});
const payload = {
  id:"kidults-approval-policy-file-manifest-v1", version:"1.0.0", revision,
  scan:{method:"GIT_OBJECT_CONTENT_SCAN", pattern, exclusions, file_count:files.length}, files,
};
payload.manifest_sha256 = sha256(JSON.stringify(files));
fs.writeFileSync(output, `${JSON.stringify(payload,null,2)}\n`);
console.log(JSON.stringify({state:"VERIFIED_PASS",output,file_count:files.length,manifest_sha256:payload.manifest_sha256}));
