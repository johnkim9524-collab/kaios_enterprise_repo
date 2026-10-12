// Cross-runner store on the protected ledger table. IAM narrows these calls to
// GITHUB_READ_BUDGET#* rows; the caller also binds one exact quota owner.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const check=(ok,code)=>{if(!ok)throw Error('SHARED_GITHUB_READ_DDB_'+code);};
const repo='johnkim9524-collab/kaios_enterprise_repo';
const canonical=x=>Array.isArray(x)?`[${x.map(canonical).join(',')}]`:x&&typeof x==='object'?`{${Object.keys(x).sort().map(k=>`${JSON.stringify(k)}:${canonical(x[k])}`).join(',')}}`:JSON.stringify(x);
const digest=x=>createHash('sha256').update(canonical(x)).digest('hex');
const table='kidults-autonomous-landing-staging-ledger';
const region='ap-northeast-2';
const callerRolePattern=/^arn:aws:sts::528314240275:assumed-role\/(?:kidults-autonomous-(?:track|kpmo|verifier)-staging-role|kidults-github-read-resume-staging-role)\/[^/]+$/;
export function createProtectedDynamoDbGithubReadBudgetStore({scope,aws=execFileSync,identity}={}){
  check(scope?.repository===repo&&scope.resource==='core'&&/^[A-Za-z0-9_-]{1,80}$/.test(scope.quota_owner_id||''),'SCOPE');
  const caller=identity??JSON.parse(aws('aws',['sts','get-caller-identity','--region',region,'--output','json'],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}));
  check(caller?.Account==='528314240275'&&callerRolePattern.test(caller.Arn||''),'IDENTITY');
  const key=`GITHUB_READ_BUDGET#${digest(scope)}`,ddbKey=JSON.stringify({pk:{S:key},sk:{S:'V1'}});
  const call=(args)=>JSON.parse(aws('aws',[...args,'--region',region,'--output','json','--cli-connect-timeout','5','--cli-read-timeout','10'],
    {encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe'],env:{...process.env,AWS_MAX_ATTEMPTS:'1',AWS_RETRY_MODE:'standard'}}));
  return Object.freeze({authority:'PROTECTED_ATOMIC_CAS',key,
    read:async requested=>{
      check(requested===key,'KEY');
      const result=call(['dynamodb','get-item','--table-name',table,'--consistent-read','--key',ddbKey]);
      if(!result.Item)return null;
      check(result.Item.sk?.S==='V1'&&result.Item.pk?.S===key&&typeof result.Item.budget_json?.S==='string','ROW');
      const row=JSON.parse(result.Item.budget_json.S);
      check(Number(result.Item.budget_version?.N)===row.version,'VERSION');return row;
    },
    compareAndSwap:async(requested,expectedVersion,next)=>{
      check(requested===key&&Number.isSafeInteger(expectedVersion)&&expectedVersion>=0,'CAS_BINDING');
      const item={pk:{S:key},sk:{S:'V1'},budget_version:{N:String(next.version)},budget_json:{S:canonical(next)}};
      try{
        if(expectedVersion===0)call(['dynamodb','put-item','--table-name',table,'--item',JSON.stringify(item),
          '--condition-expression','attribute_not_exists(pk) AND attribute_not_exists(sk)']);
        else call(['dynamodb','update-item','--table-name',table,'--key',ddbKey,
          '--update-expression','SET budget_version=:next, budget_json=:body','--condition-expression','budget_version=:expected',
          '--expression-attribute-values',JSON.stringify({':next':{N:String(next.version)},':body':{S:canonical(next)},':expected':{N:String(expectedVersion)}})]);
        return 'COMMITTED';
      }catch(error){
        const detail=String(error?.stderr??'');
        if(/ConditionalCheckFailedException/.test(detail))return 'CONFLICT';
        return 'UNKNOWN';
      }
    }});
}
