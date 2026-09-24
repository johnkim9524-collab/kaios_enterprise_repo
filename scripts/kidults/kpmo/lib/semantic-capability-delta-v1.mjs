import crypto from 'node:crypto';

export class CapabilityDeltaError extends Error {
  constructor(code, detail='') { super(detail ? `${code}:${detail}` : code); this.code=code; }
}
const fail=(code,detail='')=>{throw new CapabilityDeltaError(code,detail)};
const digest=value=>`sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const isComment=line=>/^\s*(#|\/\/|\/\*|\*|<!--)/.test(line);
const riskyValue=/\b(secrets\.|vars\.|id-token|curl\b|wget\b|gh\s+api\b|aws\s|gcloud\s|az\s|terraform\b|kubectl\b|https?:\/\/|configure-aws-credentials|--admin-bypass|force\s*:\s*true)\b/i;
const writeKey=/^(contents|pull-requests|actions|checks|statuses|deployments|packages|issues|repository-projects|security-events)$/;

const flattenJson=(value,path='',out=new Map())=>{
  if(value===null||typeof value!=='object') { out.set(path,JSON.stringify(value)); return out; }
  if(Array.isArray(value)) { value.forEach((item,index)=>flattenJson(item,`${path}[${index}]`,out)); return out; }
  for(const key of Object.keys(value).sort()) flattenJson(value[key],path?`${path}.${key}`:key,out);
  return out;
};

const yamlModel=source=>{
  if(typeof source!=='string') fail('CAPABILITY_SOURCE_MISSING');
  if(/\t/.test(source)||/(^|\s)[&*!][A-Za-z0-9_-]+|<<\s*:|:\s*[>|]\s*$/m.test(source)) fail('CAPABILITY_YAML_UNSUPPORTED_SYNTAX');
  const stack=[]; const values=new Map();
  for(const [index,raw] of source.split('\n').entries()) {
    if(!raw.trim()||isComment(raw)||raw.trim()==='---') continue;
    const match=raw.match(/^( *)(?:- )?([^:#][^:]*):(?:\s*(.*))?$/);
    if(!match) {
      if(/^\s*-\s+[^:]+$/.test(raw)) { values.set(`list:${index}`,raw.trim()); continue; }
      fail('CAPABILITY_YAML_UNCLASSIFIED',String(index+1));
    }
    const indent=match[1].length; if(indent%2) fail('CAPABILITY_YAML_INDENT_UNKNOWN',String(index+1));
    const key=match[2].trim().replace(/^['"]|['"]$/g,''); const value=(match[3]??'').trim();
    while(stack.length&&stack.at(-1).indent>=indent) stack.pop();
    const path=[...stack.map(x=>x.key),key].join('.'); values.set(path,value||'{}');
    if(!value) stack.push({indent,key});
  }
  return values;
};

const assertJsonMonotonic=(before,after,filename)=>{
  let left,right; try { left=flattenJson(JSON.parse(before||'{}')); right=flattenJson(JSON.parse(after||'{}')); }
  catch { fail('CAPABILITY_JSON_PARSE_FAILED',filename); }
  for(const [path,value] of left) {
    if(!right.has(path)) fail('CAPABILITY_GUARD_REMOVED',`${filename}:${path}`);
    if(right.get(path)!==value) fail('CAPABILITY_EXISTING_VALUE_CHANGED',`${filename}:${path}`);
  }
  for(const [path,value] of right) if(!left.has(path)&&riskyValue.test(`${path}:${value}`)) fail('CAPABILITY_EXPANSION',`${filename}:${path}`);
};

const assertWorkflowDelta=(before,after,filename)=>{
  const left=yamlModel(before||''); const right=yamlModel(after||'');
  for(const [path,value] of left) {
    const sensitive=/^(on|permissions|jobs\.[^.]+\.(if|environment|permissions|secrets)|jobs\.[^.]+\.steps\.)/.test(path)||riskyValue.test(`${path}:${value}`);
    if(sensitive&&(!right.has(path)||right.get(path)!==value)) fail('CAPABILITY_GUARD_WEAKENED',`${filename}:${path}`);
  }
  for(const [path,value] of right) {
    if(left.has(path)&&left.get(path)===value) continue;
    if(/^on(?:\.|$)/.test(path)||/\.environment$/.test(path)||/\.secrets(?:\.|$)/.test(path)||riskyValue.test(`${path}:${value}`)) fail('CAPABILITY_EXPANSION',`${filename}:${path}`);
    const permission=path.match(/(?:^|\.)permissions\.([^.]+)$/);
    if(permission&&writeKey.test(permission[1])&&/^write$/i.test(value)) fail('CAPABILITY_PERMISSION_EXPANSION',`${filename}:${path}`);
  }
};

export const evaluateSemanticCapabilityDelta=({files,policy})=>{
  if(!Array.isArray(files)||!policy) fail('CAPABILITY_INPUT_INVALID');
  const exceptions=new Set(policy.delegated_internal_exact_path_exceptions||[]);
  const prefixes=policy.delegated_internal_path_prefixes||[];
  const evidence=[];
  for(const file of files) {
    const filename=file?.filename;
    if(typeof filename!=='string'||!filename) fail('CAPABILITY_PATH_INVALID');
    if(!prefixes.some(prefix=>filename.startsWith(prefix))&&!exceptions.has(filename)) continue;
    if(typeof file.base_content!=='string'||typeof file.head_content!=='string') fail('CAPABILITY_IMMUTABLE_BLOBS_REQUIRED',filename);
    if(filename.endsWith('.yml')||filename.endsWith('.yaml')) assertWorkflowDelta(file.base_content,file.head_content,filename);
    else if(filename.endsWith('.json')) assertJsonMonotonic(file.base_content,file.head_content,filename);
    else {
      const before=file.base_content.split('\n').filter(line=>line.trim()&&!isComment(line));
      const after=new Set(file.head_content.split('\n').filter(line=>line.trim()&&!isComment(line)));
      const removed=before.find(line=>!after.has(line)); if(removed) fail('CAPABILITY_GUARD_REMOVED',filename);
      if(riskyValue.test(file.head_content)&&!riskyValue.test(file.base_content)) fail('CAPABILITY_EXPANSION',filename);
    }
    evidence.push({filename,base_digest:digest(file.base_content),head_digest:digest(file.head_content)});
  }
  return {state:'SEMANTIC_CAPABILITY_DELTA_PASS',evidence};
};
