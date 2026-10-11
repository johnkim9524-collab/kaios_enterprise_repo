import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluateSemanticCapabilityDelta} from '../../../scripts/kidults/kpmo/lib/semantic-capability-delta-v1.mjs';
import {independentlyVerifyCapabilityDelta} from '../../../scripts/kidults/kpmo/lib/independent-capability-verifier-v1.mjs';
const policy=JSON.parse(fs.readFileSync('coordination/kidults/governance/autonomous-internal-landing-policy-v1.json'));
const filename='scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs';
for(const [name,verify]of [['primary',evaluateSemanticCapabilityDelta],['independent',independentlyVerifyCapabilityDelta]]){
 for(const params of ['{bound=true}={}','{bound=(()=>true)()}={}']){
  const before=`function predicate(${params}){return bound===true;}\nif(!predicate())throw new Error('DENIED');\n`;
  test(name+' accepts stable destructured/default function body '+params,()=>verify({policy,files:[{filename,status:'modified',base_content:before,head_content:before+'// documentation\n'}]}));
  test(name+' rejects mutation hidden behind destructured params '+params,()=>assert.throws(()=>verify({policy,files:[{filename,status:'modified',base_content:before,head_content:before.replace('return bound===true','return true')}]})));
 }
 test(name+' evaluates complete current dispatcher instead of truncated parameter object',()=>{
  const before=fs.readFileSync(filename,'utf8');verify({policy,files:[{filename,status:'modified',base_content:before,head_content:before+'\n// bounded documentation\n'}]});
 });
}
