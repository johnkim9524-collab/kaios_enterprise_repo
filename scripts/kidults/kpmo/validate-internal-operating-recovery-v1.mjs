import fs from 'node:fs';
import {verifyInternalOperatingRecovery,observeInternalOperatingRecovery} from './lib/internal-operating-recovery-v1.mjs';
const [input,output,mode]=process.argv.slice(2);
if(!input||!output)throw new Error('INTERNAL_OPERATING_RECOVERY_ARGUMENTS');
if(mode!==undefined&&mode!=='--observe')throw new Error('INTERNAL_OPERATING_RECOVERY_MODE');
const evaluate=mode==='--observe'?observeInternalOperatingRecovery:verifyInternalOperatingRecovery;
const receipt=evaluate(JSON.parse(fs.readFileSync(input,'utf8')),process.env.KPMO_SOURCE_SHA);
fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({state:receipt.state,scope:receipt.scope,promotion_authority:false}));
