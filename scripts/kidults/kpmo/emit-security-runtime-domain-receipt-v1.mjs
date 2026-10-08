import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {canonicalJson} from './lib/canonical-json-v1.mjs';
import {buildSecurityRuntimeDomainReceipt,verifyRawPythonAudit} from './lib/security-runtime-domain-producer-v1.mjs';
const [root]=process.argv.slice(2);
if(!root)throw new Error('SECURITY_RUNTIME_PRODUCER_INPUT_DIRECTORY');
if(process.env.GITHUB_ACTIONS!=='true'
  ||process.env.GITHUB_WORKFLOW_REF!=='johnkim9524-collab/kaios_enterprise_repo/.github/workflows/kidults-security-assurance-empirical-r1.yml@refs/heads/main'){
  throw new Error('SECURITY_RUNTIME_PRODUCER_NATIVE_WORKFLOW_REQUIRED');
}
const hash=bytes=>`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const names=['security-assurance-report.json','source-integrity.sha256','dependency-inputs.sha256',
  'secret-scan.json','npm-audit-summary.json','pip-audit-summary.json','pip-audit-bootstrap.json'];
const evidence=names.map(name=>{const filename=path.join(root,name),stat=fs.lstatSync(filename);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>8*1024*1024)throw new Error('SECURITY_RUNTIME_PRODUCER_FILE');
  return {name,digest:hash(fs.readFileSync(filename))};});
const report=JSON.parse(fs.readFileSync(path.join(root,'security-assurance-report.json'),'utf8'));
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
for(const [key,name] of [['secret_scan','secret-scan.json'],['npm_audit','npm-audit-summary.json'],
  ['pip_audit','pip-audit-summary.json'],['pip_audit_bootstrap','pip-audit-bootstrap.json']]){
  if(canonicalJson(report[key])!==canonicalJson(read(name)))throw new Error('SECURITY_RUNTIME_PRODUCER_REPORT_READBACK');
}
const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean).sort();
const integrity=fs.readFileSync(path.join(root,'source-integrity.sha256'),'utf8').trimEnd().split('\n');
const entries=integrity.map(line=>{const m=/^([a-f0-9]{64})  (.+)$/.exec(line);
  if(!m)throw new Error('SECURITY_RUNTIME_PRODUCER_MANIFEST');return {digest:`sha256:${m[1]}`,name:m[2]};});
if(canonicalJson(entries.map(e=>e.name).sort())!==canonicalJson(tracked)
  ||entries.length!==report.dependency_inventory?.tracked_file_count)throw new Error('SECURITY_RUNTIME_PRODUCER_SOURCE_COVERAGE');
for(const entry of entries){const stat=fs.lstatSync(entry.name);
  if(!stat.isFile()||stat.isSymbolicLink()||hash(fs.readFileSync(entry.name))!==entry.digest)throw new Error('SECURITY_RUNTIME_PRODUCER_SOURCE_READBACK');}
const audits=fs.readdirSync(path.join(root,'npm-audit')).filter(n=>n.endsWith('.json'));
if(audits.length!==report.npm_audit?.expected_lockfile_count)throw new Error('SECURITY_RUNTIME_PRODUCER_RAW_NODE_COVERAGE');
for(const name of audits){const a=read(`npm-audit/${name}`),v=a?.metadata?.vulnerabilities;
  if(a.error||!v||v.high!==0||v.critical!==0)throw new Error('SECURITY_RUNTIME_PRODUCER_RAW_NODE_AUDIT');}
const pythonAudits=fs.readdirSync(path.join(root,'pip-audit')).filter(n=>n.endsWith('.json'));
if(pythonAudits.length!==report.pip_audit?.requirements_file_count)throw new Error('SECURITY_RUNTIME_PRODUCER_RAW_PYTHON_COVERAGE');
for(const name of pythonAudits)verifyRawPythonAudit(read(`pip-audit/${name}`));
const context={repository:process.env.GITHUB_REPOSITORY,ref:process.env.GITHUB_REF,event:process.env.GITHUB_EVENT_NAME,
  source_sha:process.env.GITHUB_SHA,actual_sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  run_id:Number(process.env.GITHUB_RUN_ID),run_attempt:Number(process.env.GITHUB_RUN_ATTEMPT),
  workflow_path:'.github/workflows/kidults-security-assurance-empirical-r1.yml'};
const receipt=buildSecurityRuntimeDomainReceipt({context,report,evidence});
fs.writeFileSync(path.join(root,'runtime-domain-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({state:receipt.state,domain_id:receipt.domain_id,empirical_scope:receipt.empirical_scope}));
