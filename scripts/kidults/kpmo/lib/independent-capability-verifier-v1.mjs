import crypto from 'node:crypto';

const hash=value=>`sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const deny=(code,detail='')=>{const error=new Error(detail?`${code}:${detail}`:code);error.code=code;throw error};
const governed=(name,policy)=>(policy.delegated_internal_path_prefixes||[]).some(prefix=>name.startsWith(prefix))||(policy.delegated_internal_exact_path_exceptions||[]).includes(name);
const securityLine=/\b(on|workflow_dispatch|repository_dispatch|schedule|push|pull_request_target|permissions|environment|if|secrets|vars|id-token|contents|pull-requests|actions|checks|statuses|deployments|packages|issues|repository-projects|security-events|curl|wget|gh api|aws |gcloud |terraform|kubectl|https?:\/\/|force:|fail|throw|assert|deny|forbid|hold|required|quarantine|owner[_-]?reserved|authorization|credential|production|public|g5)\b/i;
const normalize=source=>source.split('\n').map(line=>line.replace(/\s+#.*$/,'').trim()).filter(Boolean);

// Deliberately separate from the primary classifier: this verifier derives a
// conservative immutable-line capability inventory and requires security lines
// to be byte-stable while allowing only non-capability monotonic additions.
export const independentlyVerifyCapabilityDelta=({files,policy})=>{
  if(!Array.isArray(files)||!policy) deny('INDEPENDENT_CAPABILITY_INPUT_INVALID');
  const receipts=[];
  for(const file of files) {
    if(!governed(file?.filename||'',policy)) continue;
    if(typeof file.base_content!=='string'||typeof file.head_content!=='string') deny('INDEPENDENT_IMMUTABLE_BLOBS_REQUIRED',file?.filename);
    const before=normalize(file.base_content); const after=normalize(file.head_content); const afterSet=new Set(after);
    for(const line of before) if(securityLine.test(line)&&!afterSet.has(line)) deny('INDEPENDENT_SECURITY_CAPABILITY_CHANGED',file.filename);
    for(const line of after) if(securityLine.test(line)&&!before.includes(line)) deny('INDEPENDENT_SECURITY_CAPABILITY_ADDED',file.filename);
    if(file.filename.endsWith('.json')) {
      let a,b; try {a=JSON.parse(file.base_content||'{}');b=JSON.parse(file.head_content||'{}')} catch {deny('INDEPENDENT_JSON_PARSE_FAILED',file.filename)}
      const walk=(left,right,path='')=>{if(left&&typeof left==='object'){for(const key of Object.keys(left)){if(!(key in (right||{})))deny('INDEPENDENT_POLICY_KEY_REMOVED',`${file.filename}:${path}${key}`);walk(left[key],right[key],`${path}${key}.`)}}else if(JSON.stringify(left)!==JSON.stringify(right))deny('INDEPENDENT_POLICY_VALUE_CHANGED',`${file.filename}:${path}`)};
      walk(a,b);
    }
    receipts.push({filename:file.filename,base_digest:hash(file.base_content),head_digest:hash(file.head_content)});
  }
  return {state:'INDEPENDENT_CAPABILITY_VERIFIED',receipts,digest:hash(JSON.stringify(receipts))};
};
