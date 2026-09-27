import crypto from 'node:crypto';

const hash=value=>`sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const deny=(code,detail='')=>{const error=new Error(detail?`${code}:${detail}`:code);error.code=code;throw error};
const governed=(name,policy)=>(policy.delegated_internal_path_prefixes||[]).some(prefix=>name.startsWith(prefix))||(policy.delegated_internal_exact_path_exceptions||[]).includes(name);
const securityLine=/\b(on|workflow_dispatch|repository_dispatch|schedule|push|pull_request_target|permissions|environment|if|secrets|vars|id-token|contents|pull-requests|actions|checks|statuses|deployments|packages|issues|repository-projects|security-events|curl|wget|gh api|aws |gcloud |terraform|kubectl|https?:\/\/|force:|fail|throw|assert|deny|forbid|hold|required|quarantine|owner[_-]?reserved|authorization|credential|production|public|g5)\b/i;
const normalize=source=>source.split('\n').map(line=>line.replace(/\s+#.*$/,'').trim()).filter(Boolean);
const stopAction=/\b(throw|fail|deny|assert|forbid|quarantine)\b/;
const ignoredIdentifiers=new Set(['if','else','throw','new','return','const','let','var','function','true','false','null','undefined','await','async','typeof','instanceof','in','of','this']);
const normalizedScript=value=>String(value).replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'').replace(/\s+/g,' ').trim();

// Independent structural recomputation. Unlike the primary token graph, this
// walks balanced source spans and reconstructs predicate bindings directly
// from immutable source text. Unsupported or ambiguous balance fails closed.
const balancedEnd=(source,start,open,close,filename)=>{
  let depth=0,quote='',escaped=false,lineComment=false,blockComment=false;
  for(let index=start;index<source.length;index+=1){
    const char=source[index],next=source[index+1];
    if(lineComment){if(char==='\n')lineComment=false;continue}
    if(blockComment){if(char==='*'&&next==='/'){blockComment=false;index+=1}continue}
    if(quote){if(escaped){escaped=false;continue}if(char==='\\'){escaped=true;continue}if(char===quote)quote='';continue}
    if(char==='/'&&next==='/'){lineComment=true;index+=1;continue}
    if(char==='/'&&next==='*'){blockComment=true;index+=1;continue}
    if(char==='"'||char==="'"||char==='`'){quote=char;continue}
    if(char===open)depth+=1;else if(char===close&&--depth===0)return index;
  }
  deny('INDEPENDENT_SCRIPT_PARSE_FAILED',filename);
};
const statementEnd=(source,start,filename)=>{
  let round=0,square=0,curly=0,quote='',escaped=false;
  for(let index=start;index<source.length;index+=1){
    const char=source[index];
    if(quote){if(escaped){escaped=false;continue}if(char==='\\'){escaped=true;continue}if(char===quote)quote='';continue}
    if(char==='"'||char==="'"||char==='`'){quote=char;continue}
    if(char==='(')round+=1;else if(char===')')round-=1;else if(char==='[')square+=1;else if(char===']')square-=1;else if(char==='{')curly+=1;else if(char==='}')curly-=1;
    if(char===';'&&round===0&&square===0&&curly===0)return index;
  }
  return source.length-1;
};
const namesIn=value=>[...new Set((String(value).match(/\b[A-Za-z_$][\w$]*\b/g)||[]).filter(name=>!ignoredIdentifiers.has(name)))];
const escapedName=name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const sourceDefinitions=(source,name,filename)=>{
  const escaped=escapedName(name);const found=[];
  for(const pattern of [new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\s*=`, 'g'),new RegExp(`(?<![.\\w$])${escaped}\\s*=`, 'g')]){
    let match;while((match=pattern.exec(source))){const end=statementEnd(source,match.index,filename);found.push(source.slice(match.index,end+1));pattern.lastIndex=Math.max(pattern.lastIndex,end+1)}
  }
  const functionPattern=new RegExp(`\\bfunction\\s+${escaped}\\s*\\(`,'g');let functionMatch;
  while((functionMatch=functionPattern.exec(source))){const brace=source.indexOf('{',functionMatch.index);if(brace<0)deny('INDEPENDENT_SCRIPT_PARSE_FAILED',`${filename}:${name}`);const end=balancedEnd(source,brace,'{','}',filename);found.push(source.slice(functionMatch.index,end+1));functionPattern.lastIndex=end+1}
  return [...new Set(found.map(normalizedScript))].sort();
};
const independentGuardGraph=(source,filename)=>{
  const guards=[];const ifPattern=/\bif\s*\(/g;let match;
  while((match=ifPattern.exec(source))){
    const open=source.indexOf('(',match.index);const conditionEnd=balancedEnd(source,open,'(',')',filename);const condition=source.slice(open+1,conditionEnd);
    let actionStart=conditionEnd+1;while(/\s/.test(source[actionStart]||''))actionStart+=1;
    const actionEnd=source[actionStart]==='{'?balancedEnd(source,actionStart,'{','}',filename):statementEnd(source,actionStart,filename);
    const action=source.slice(actionStart,actionEnd+1);if(!stopAction.test(normalizedScript(action))){ifPattern.lastIndex=conditionEnd+1;continue}
    const visited=new Set(),dependency=[];
    const visit=name=>{if(visited.has(name))return;visited.add(name);const definitions=sourceDefinitions(source,name,filename);dependency.push([name,definitions]);for(const definition of definitions)for(const nested of namesIn(definition))if(nested!==name)visit(nested)};
    namesIn(condition).forEach(visit);
    guards.push({condition:normalizedScript(condition),action:normalizedScript(action),dependency:dependency.sort(([a],[b])=>a.localeCompare(b))});ifPattern.lastIndex=conditionEnd+1;
  }
  return guards.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
};
const verifyGuardDependencies=(before,after,filename)=>{
  if(JSON.stringify(independentGuardGraph(before,filename))!==JSON.stringify(independentGuardGraph(after,filename)))deny('INDEPENDENT_GUARD_DEPENDENCY_CHANGED',filename);
};

// Deliberately separate from the primary classifier: this verifier derives a
// conservative immutable-line capability inventory and requires security lines
// to be byte-stable while allowing only non-capability monotonic additions.
export const independentlyVerifyCapabilityDelta=({files,policy})=>{
  if(!Array.isArray(files)||!policy) deny('INDEPENDENT_CAPABILITY_INPUT_INVALID');
  const receipts=[];
  for(const file of files) {
    if(!governed(file?.filename||'',policy)) continue;
    if(typeof file.base_content!=='string'||typeof file.head_content!=='string') deny('INDEPENDENT_IMMUTABLE_BLOBS_REQUIRED',file?.filename);
    if(!file.filename.endsWith('.json')&&!file.filename.endsWith('.yml')&&!file.filename.endsWith('.yaml')) verifyGuardDependencies(file.base_content,file.head_content,file.filename);
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
