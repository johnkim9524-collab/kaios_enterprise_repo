import fs from 'node:fs';
import path from 'node:path';

// Fixed protected source inventory. No PR payload participates in bundling.
const files=[
  'scripts/kidults/kpmo/lib/canonical-json-v1.mjs',
  'scripts/kidults/kpmo/lib/autonomous-dispatch-fanout-v1.mjs',
  'scripts/kidults/staging-operations/lib/resume-operation-v1.mjs',
  'scripts/kidults/staging-operations/lib/dynamodb-operation-ledger-v1.mjs',
  'scripts/kidults/staging-operations/lib/broker-resume-dispatch-v1.mjs',
  'scripts/kidults/staging-operations/lib/broker-resume-lifecycle-v1.mjs',
  'scripts/kidults/staging-operations/lib/broker-caller-identity-v1.mjs',
];
export function buildBrokerCode() {
  const factories=files.map(file=>{
    let source=fs.readFileSync(file,'utf8');
    source=source.replace(/^import (.+?) from '([^']+)';$/gm,(_,spec,target)=>{
      if(target.startsWith('node:')) return `const ${spec}=require(${JSON.stringify(target)});`;
      const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),target));
      if(!files.includes(resolved)) throw new Error(`UNREGISTERED_BUNDLE_IMPORT:${resolved}`);
      return `const ${spec}=await __resumeLoad(${JSON.stringify(resolved)});`;
    });
    const names=[...source.matchAll(/^export (?:async )?(?:function|class|const) ([A-Za-z0-9_]+)/gm)].map(x=>x[1]);
    source=source.replace(/^export /gm,'');
    if(/^import |^export /m.test(source)||!names.length) throw new Error(`UNSUPPORTED_BUNDLE_SOURCE:${file}`);
    return `${JSON.stringify(file)}:async()=>{\n${source}\nreturn {${names.join(',')}};\n}`;
  });
  return `'use strict';\nconst __resumeFactories={${factories.join(',\n')}};\nconst __resumeCache=new Map();\nfunction __resumeLoad(name){if(!__resumeFactories[name])throw Error('UNREGISTERED_RESUME_MODULE');if(!__resumeCache.has(name))__resumeCache.set(name,__resumeFactories[name]());return __resumeCache.get(name);}\n`+
    fs.readFileSync('infrastructure/aws/staging/autonomous-event-token-broker-v1.cjs','utf8');
}
export function buildTemplates() {
  const p='infrastructure/aws/staging/autonomous-event-token-broker-v1.json';
  const original=JSON.parse(fs.readFileSync(p,'utf8'));
  original.Resources.BrokerFunction.Properties.Code.ZipFile=buildBrokerCode();
  original.Resources.BrokerFunction.Properties.Timeout=180;
  const desired=structuredClone(original);
  desired.Description='STAGING protected broker with isolated durable RESUME dispatch ledger; exact Owner-authorized bootstrap required.';
  desired.Parameters.ResumeActivationRunFloor={Type:'String',Default:'0',AllowedPattern:'^(0|[1-9][0-9]{0,19})$'};
  desired.Resources.ResumeOperationTable={Type:'AWS::DynamoDB::Table',DeletionPolicy:'Retain',UpdateReplacePolicy:'Retain',Properties:{
    TableName:'kidults-autonomous-resume-staging-ledger',BillingMode:'PAY_PER_REQUEST',
    AttributeDefinitions:[{AttributeName:'pk',AttributeType:'S'},{AttributeName:'sk',AttributeType:'S'}],
    KeySchema:[{AttributeName:'pk',KeyType:'HASH'},{AttributeName:'sk',KeyType:'RANGE'}],
    PointInTimeRecoverySpecification:{PointInTimeRecoveryEnabled:true},SSESpecification:{SSEEnabled:true}}};
  desired.Resources.BrokerRole.Properties.Policies.push({PolicyName:'resume-exact-namespace',PolicyDocument:{Version:'2012-10-17',Statement:[{
    Effect:'Allow',Action:['dynamodb:GetItem','dynamodb:PutItem','dynamodb:UpdateItem'],
    Resource:{'Fn::GetAtt':['ResumeOperationTable','Arn']},Condition:{'ForAllValues:StringLike':{'dynamodb:LeadingKeys':['RESUME_OPERATION_V1#*','RESUME_TUPLE_V1#*']},Null:{'dynamodb:LeadingKeys':'false'}}}]}});
  Object.assign(desired.Resources.BrokerFunction.Properties.Environment.Variables,{
    RESUME_OPERATION_TABLE:{Ref:'ResumeOperationTable'},RESUME_ACTIVATION_RUN_FLOOR:{Ref:'ResumeActivationRunFloor'}});
  desired.Outputs.ResumeOperationTableName={Value:{Ref:'ResumeOperationTable'}};
  return {original,desired};
}
if(process.argv[1]?.endsWith('/build-resume-broker-template-v1.mjs')) {
  const {original,desired}=buildTemplates();
  for(const [file,value] of [['autonomous-event-token-broker-v1.json',original],['autonomous-event-token-broker-resume-v1.json',desired]])
    fs.writeFileSync(`infrastructure/aws/staging/${file}`,JSON.stringify(value,null,2)+'\n');
  console.log(JSON.stringify({state:'IMPLEMENTED_NOT_VERIFIED',normal_authority_unchanged:true,resume_bootstrap_owner_required:true}));
}
