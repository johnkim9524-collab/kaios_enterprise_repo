import fs from 'node:fs';
import {verifyInternalOperatingRecovery} from './lib/internal-operating-recovery-v1.mjs';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw new Error('INTERNAL_OPERATING_RECOVERY_ARGUMENTS');
const receipt=verifyInternalOperatingRecovery(JSON.parse(fs.readFileSync(input,'utf8')),process.env.KPMO_SOURCE_SHA);
fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({state:receipt.state,scope:receipt.scope,promotion_authority:false}));
